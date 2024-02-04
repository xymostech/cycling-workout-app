const FLAGS = [
  { value: 0b0000000000000001, name: "Pedal Power Balance Present", size: 1 },
  { value: 0b0000000000000010, name: "Pedal Power Balance Reference", size: 0 },
  { value: 0b0000000000000100, name: "Accumulated Torque Present", size: 2 },
  { value: 0b0000000000001000, name: "Accumulated Torque Source", size: 0 },
  { value: 0b0000000000010000, name: "Wheel Revolution Data Present", size: 4 },
  { value: 0b0000000000100000, name: "Crank Revolution Data Present", size: 4 },
];

type CrankRevolutionData = {
  revolutions: number;
  lastEventTime: number;
};
export type PowerEvent = {
  power: number;
  crankRevolutionData?: CrankRevolutionData | null;
};
export type PowerCallback = (data: PowerEvent) => void;

export interface PowerProducer {
  onPowerEvent: (cb: PowerCallback) => void;
  setPower: (power: number) => void;
}

interface BluetoothCharacteristicValueChangeEventTarget extends EventTarget {
  value: DataView;
}
interface BluetoothCharacteristicValueChangeEvent extends Event {
  target: BluetoothCharacteristicValueChangeEventTarget;
}

export default class BluetoothPowerProducer implements PowerProducer {
  _callbacks: Array<PowerCallback>;
  subsecondEventTime: boolean;
  previousLastEventTimeRaw: number | null;
  powerDevice: BluetoothDevice;
  powerGATT: BluetoothRemoteGATTServer | null;
  powerService: BluetoothRemoteGATTService | null;
  powerCharacteristic: BluetoothRemoteGATTCharacteristic | null;
  controlService: BluetoothRemoteGATTService | null;
  controlPointCharacteristic: BluetoothRemoteGATTCharacteristic | null;

  constructor(powerDevice: BluetoothDevice) {
    this._callbacks = [];
    this.subsecondEventTime = true;
    this.previousLastEventTimeRaw = null;
    this.powerDevice = powerDevice;
    this.powerGATT = null;
    this.powerService = null;
    this.powerCharacteristic = null;
    this.controlService = null;
    this.controlPointCharacteristic = null;

    this._setup();
  }

  async _setup() {
    this.powerGATT = (await this.powerDevice?.gatt?.connect()) ?? null;
    this.powerService =
      (await this.powerGATT?.getPrimaryService("cycling_power")) ?? null;
    this.powerCharacteristic =
      (await this.powerService?.getCharacteristic(
        "cycling_power_measurement",
      )) ?? null;
    await this.powerCharacteristic?.startNotifications();
    this.powerCharacteristic?.addEventListener(
      "characteristicvaluechanged",
      this._handlePowerEvent,
    );

    try {
      this.controlService =
        (await this.powerGATT?.getPrimaryService("fitness_machine")) ?? null;
      this.controlPointCharacteristic =
        (await this.controlService?.getCharacteristic(
          "fitness_machine_control_point",
        )) ?? null;
      await this.controlPointCharacteristic?.startNotifications();
      this.controlPointCharacteristic?.addEventListener(
        "characteristicvaluechanged",
        this._handleControlPointEvent,
      );

      // Try to take control of the power device
      await this.controlPointCharacteristic?.writeValueWithResponse(
        Uint8Array.from([0]).buffer,
      );
    } catch (e) {
      console.error("No fitness machine available:", e);
      // No fitness machine on this device
    }
  }

  _handlePowerEvent = (e: Event) => {
    const event = e as BluetoothCharacteristicValueChangeEvent;

    const flags = event.target.value.getUint16(0, true);
    const power = event.target.value.getUint16(2, true);

    let index = 4;

    let crankRevolutionData = null;
    for (const flag of FLAGS) {
      if ((flags & flag.value) === flag.value) {
        if (flag.name === "Crank Revolution Data Present") {
          const lastEventTimeRaw = event.target.value.getUint16(
            index + 2,
            true,
          );
          const lastEventTime: number = this.subsecondEventTime
            ? lastEventTimeRaw / 1024
            : lastEventTimeRaw;
          if (this.previousLastEventTimeRaw != null) {
            if (lastEventTimeRaw - this.previousLastEventTimeRaw === 1) {
              this.subsecondEventTime = false;
            }
          }
          this.previousLastEventTimeRaw = lastEventTimeRaw;

          crankRevolutionData = {
            revolutions: event.target.value.getUint16(index, true) as number,
            lastEventTime,
          };
        }

        index += flag.size;
      }
    }

    const data = {
      power,
      crankRevolutionData,
    };

    for (const cb of this._callbacks) {
      cb(data);
    }
  };

  _handleControlPointEvent = (e: Event) => {
    const event = e as BluetoothCharacteristicValueChangeEvent;

    const responseCode = event.target.value.getUint8(0);

    if (responseCode === 0x80) {
      const messageSent = event.target.value.getUint8(1);
      const success = event.target.value.getUint8(2);

      if (success !== 0x01) {
        console.error(
          `Error sending message of type: ${messageSent}, error: ${success}`,
        );
      }
    }
  };

  onPowerEvent(cb: PowerCallback) {
    this._callbacks.push(cb);
  }

  async setPower(power: number) {
    if (this.controlPointCharacteristic) {
      const buffer = new ArrayBuffer(3);
      const dataView = new DataView(buffer);
      dataView.setUint8(0, 0x05);
      dataView.setInt16(1, power, true);

      await this.controlPointCharacteristic.writeValueWithResponse(buffer);
    }
  }
}

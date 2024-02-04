import { useEffect, useState, useRef } from "react";
import { setInterval } from "timers";

type ReturnValue = {
  isInProgressChoosingDevice: boolean;
  maybeBluetoothDevice: BluetoothDevice | null;
  chooseNewDevice: () => void;
};

export default function useBluetoothDevice(preselectDeviceId: string | null, useFakeData: boolean): ReturnValue {
  const [isInProgressChoosingDevice, setIsInProgressChoosingDevice] = useState<boolean>(false);
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null);
  const abortController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortController.current = controller;
    let advertisementTimeout: NodeJS.Timeout | null = null;

    async function onAdvertisementReceived(e: BluetoothAdvertisingEvent) {
      const device = e.target as BluetoothDevice;
      controller.abort();

      try {
        console.log(`advertisement found for device: "${device.name}", attempting to connect to gatt...`);
        await device.gatt?.connect();
        console.log(`gatt connected for device: "${device.name}"`);

        setIsInProgressChoosingDevice(false);
        setBluetoothDevice(device);
      } catch (e) {
        console.error(e);
        setIsInProgressChoosingDevice(false);
      }
    }

    function onNoAdvertisementReceived() {
      console.log("No advertisements found for device in time.")
      controller.abort();
      setIsInProgressChoosingDevice(false);
    }

    async function findDevice(deviceId: string): Promise<BluetoothDevice | null> {
      if (navigator.bluetooth.getDevices != null) {
        const existingDevices = await navigator.bluetooth.getDevices();
        for (const device of existingDevices) {
          if (device.id === deviceId) {
            return device;
          }
        }
      }
      return null;
    }

    async function scanForDevices() {
      if (!useFakeData && preselectDeviceId) {
        setIsInProgressChoosingDevice(true);
        console.log(`looking for existing device with id=${preselectDeviceId}`);
        const device = await findDevice(preselectDeviceId);
        if (device) {
          try {
            console.log(`found existing device: "${device.name}", checking for advertisements`);

            if (!controller.signal.aborted) {
              advertisementTimeout = setTimeout(onNoAdvertisementReceived, 5000);
              controller.signal.addEventListener("abort", () => {
                if (advertisementTimeout) {
                  clearTimeout(advertisementTimeout);
                }
              });
            }

            await device.watchAdvertisements({ signal: controller.signal });
            // @ts-ignore for some reason, only the useCapture version of the argument is allowed here
            device.addEventListener("advertisementreceived", onAdvertisementReceived, { signal: controller.signal });
          } catch (e) {
            if (!controller.signal.aborted) {
              console.error(e);
              setIsInProgressChoosingDevice(false);
              controller.abort();
            }
          }
        }
      }
    }
    scanForDevices();

    return () => {
      controller.abort();
    };
    // We really only want this to run at the beginning of the app, not when the args change
    // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, []); 

  async function chooseNewDevice() {
    abortController.current?.abort();

    setIsInProgressChoosingDevice(true);

    try {
      const powerDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: ["cycling_power"] }],
        optionalServices: ["fitness_machine"],
      });
      setIsInProgressChoosingDevice(false);
      setBluetoothDevice(powerDevice);
    } catch (e) {
      setIsInProgressChoosingDevice(false);
    }
  }

  if (useFakeData) {
    return {
      isInProgressChoosingDevice: false,
      maybeBluetoothDevice: { name: "FakeBluetooth" } as BluetoothDevice,
      chooseNewDevice: () => {},
    };
  }

  return {
    isInProgressChoosingDevice,
    maybeBluetoothDevice: bluetoothDevice,
    chooseNewDevice,
  }
}
import { PowerCallback, PowerProducer } from "./BluetoothPowerProducer";

function random(low: number, high: number) {
  return low + Math.random() * (high - low);
}

export default class FakePowerProducer implements PowerProducer {
  _callbacks: Array<PowerCallback>;
  _lastPower: number;

  constructor() {
    this._callbacks = [];
    setInterval(this._handleInterval, 200);
    this._lastPower = Math.round(random(100, 300));
  }

  _handleInterval = () => {
    const power = Math.min(350, Math.max(10, this._lastPower + Math.round(random(-20, 20))));
    this._lastPower = power;

    for (const cb of this._callbacks) {
      cb({
        power,
      });
    }
  };

  onPowerEvent(cb: PowerCallback) {
    this._callbacks.push(cb);
  }

  setPower(power: number) {
    // Does nothing
  }
}

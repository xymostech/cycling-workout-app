import { Interval } from "./intervals";

const DEFAULT_FTP = 220;

const DEFAULT_INTERVALS: Interval[] = [
  { type: "STEADY", power: 140, duration: 5 * 60 },
  {
    type: "INTERVALS",
    highPower: 200,
    lowPower: 120,
    highDuration: 40,
    lowDuration: 20,
    number: 10,
  },
  { type: "STEADY", power: 120, duration: 5 * 60 },
  {
    type: "INTERVALS",
    highPower: 200,
    lowPower: 120,
    highDuration: 40,
    lowDuration: 20,
    number: 10,
  },
  { type: "STEADY", power: 120, duration: 5 * 60 },
];

const STORAGE_KEYS = {
  FTP: "ftp",
  INTERVALS: "intervals",
  LAST_DEVICE: "lastdevice",
};

function getKey<T>(key: string, def: T) {
  if (typeof localStorage !== "undefined") {
    const value = localStorage.getItem(key);
    return value != null ? JSON.parse(value) : def;
  }
}

function setKey<T>(key: string, value: T) {
  if (typeof localStorage !== "undefined") {
    return localStorage.setItem(key, JSON.stringify(value));
  }
}

const Storage = {
  getFTP: () => getKey(STORAGE_KEYS.FTP, DEFAULT_FTP),
  setFTP: (ftp: number) => setKey(STORAGE_KEYS.FTP, ftp),

  getIntervals: () => getKey(STORAGE_KEYS.INTERVALS, DEFAULT_INTERVALS),
  setIntervals: (intervals: Interval[]) => setKey(STORAGE_KEYS.INTERVALS, intervals),

  getLastDeviceId: () => getKey(STORAGE_KEYS.LAST_DEVICE, null),
  setLastDeviceID: (deviceId: string) => setKey(STORAGE_KEYS.LAST_DEVICE, deviceId),
};

export default Storage;
"use client";

import React, { useState, useRef, useReducer, useEffect, Suspense } from "react";
import { useSearchParams } from 'next/navigation';
import classNames from "classnames";

import BluetoothPowerProducer, {
  PowerEvent,
  PowerProducer,
} from "./BluetoothPowerProducer";
import FakePowerProducer from "./FakePowerProducer";
import PowerGraph from "./PowerGraph";
import useBluetoothDevice from "./useBluetoothDevice";
import Button from "./Button";

import { formatDuration, formatDurationForInterval } from "./formatting";
import {
  parseInterval,
  formatInterval,
  findInterval,
  getIntervalTotalDuration,
  getNormalizedPower,
  Interval,
  IntervalInfo,
} from "./intervals";
import Storage from "./Storage";

const sum = (elems: number[]) => elems.reduce((acc, x) => acc + x, 0);

function Preferences({ onClose }: { onClose: () => void }) {
  const [ftp, setFtp] = useState(`${Storage.getFTP()}`);
  const [formattedIntervals, setFormattedIntervals] = useState(
    Storage.getIntervals()
      .map(formatInterval)
      .join("\n"),
  );
  const [lastGoodIntervals, setLastGoodIntervals] = useState(
    Storage.getIntervals(),
  );
  const [intervalsGood, setIntervalsGood] = useState(true);

  function parseIntervalChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (e.target) {
      const newIntervals = e.target.value;

      setFormattedIntervals(newIntervals);

      try {
        const parsedIntervals = newIntervals
          .trim()
          .split("\n")
          .filter((x) => x.length > 0)
          .map(parseInterval);

        setLastGoodIntervals(parsedIntervals);
        setIntervalsGood(true);
      } catch (e) {
        setIntervalsGood(false);
      }
    }
  }

  function savePreferences() {
    Storage.setFTP(parseInt(ftp));
    Storage.setIntervals(lastGoodIntervals);
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-[500px] h-[400px] bg-white p-10 border-2 border-black rounded-md">
        <h2 className="mb-5 text-xl">Preferences</h2>
        <label>
          FTP:{" "}
          <input
            className="outline outline-1"
            type="number"
            value={ftp}
            onChange={(e) => setFtp(e.target.value)}
          />
        </label>
        <label>
          <div>Intervals:</div>
          <textarea
            className="w-full h-[200px] font-mono outline outline-1 "
            value={formattedIntervals}
            onChange={parseIntervalChange}
          ></textarea>
        </label>
        <Button
          onClick={savePreferences}
          disabled={!intervalsGood}
        >
          Save
        </Button>{" "}
        <Button onClick={onClose}>
          Close
        </Button>{" "}
        <span>
          Total duration:{" "}
          <span>
            {formatDuration(
              sum(
                lastGoodIntervals.map((int: Interval) =>
                  getIntervalTotalDuration(int),
                ),
              ),
            )}
          </span>
        </span>{" "}
        <span>
          Est. NP:{" "}
          <span>{getNormalizedPower(lastGoodIntervals)}</span>
        </span>
      </div>
    </div>
  );
}

const RANK_TO_CLASS = {
  "high": "text-indigo-600",
  "low": "text-rose-600",
  "ontarget": "text-green-600",
};

type PastInterval = {
  name: string;
  powerClass: "low" | "high" | "ontarget";
  text: string;
};

type PowerState = {
  lastCrankRevolutionData: {
    revolutions: number;
    lastEventTime: number;
  } | null;
  rpm: number;
  powerHistory: number[];
  time: number;
  totalPower: number;
  interval: IntervalInfo | null;
  intervalTotalPower: number;
  intervalHistory: PastInterval[];
};

function handlePowerEvent(
  state: PowerState,
  powerEvent: PowerEvent,
): PowerState {
  let {
    lastCrankRevolutionData,
    rpm,
    powerHistory,
    time,
    totalPower,
    interval: lastInterval,
    intervalTotalPower,
    intervalHistory,
  } = state;

  const { power, crankRevolutionData } = powerEvent;

  if (power === 0) {
    return {
      lastCrankRevolutionData,
      rpm,
      powerHistory,
      time,
      totalPower,
      interval: lastInterval,
      intervalTotalPower,
      intervalHistory,
    };
  }

  time++;

  totalPower += power;
  powerHistory = [...powerHistory, power].slice(-1 * (10 * 60 + 1));

  if (crankRevolutionData != null) {
    if (lastCrankRevolutionData != null) {
      if (
        crankRevolutionData.revolutions > lastCrankRevolutionData.revolutions &&
        crankRevolutionData.lastEventTime !==
          lastCrankRevolutionData.lastEventTime
      ) {
        const lastEventTime =
          lastCrankRevolutionData.lastEventTime >
          crankRevolutionData.lastEventTime
            ? crankRevolutionData.lastEventTime + 65536
            : crankRevolutionData.lastEventTime;

        rpm =
          ((crankRevolutionData.revolutions -
            lastCrankRevolutionData.revolutions) /
            (lastEventTime - lastCrankRevolutionData.lastEventTime)) *
          60;
      }
    }
    lastCrankRevolutionData = crankRevolutionData;
  }

  const interval = findInterval(
    time,
    Storage.getIntervals()
  );

  if (interval !== "done") {
    if (
      lastInterval == null ||
      lastInterval === "done" ||
      interval.intervalKey !== lastInterval.intervalKey
    ) {
      if (lastInterval != null && lastInterval !== "done") {
        const intervalAverage = Math.round(
          intervalTotalPower / (lastInterval.elapsed + 1),
        );

        let marker: "low" | "high" | "ontarget";
        if (intervalAverage < 0.95 * lastInterval.goal) {
          marker = "low";
        } else if (intervalAverage > 1.05 * lastInterval.goal) {
          marker = "high";
        } else {
          marker = "ontarget";
        }

        intervalHistory = [
          ...intervalHistory,
          {
            name: lastInterval.intervalName,
            powerClass: marker,
            text: `${intervalAverage}W (vs ${lastInterval.goal}W)`,
          },
        ];
      }
      intervalTotalPower = power;
    } else {
      intervalTotalPower += power;
    }
  }

  return {
    lastCrankRevolutionData,
    rpm,
    powerHistory,
    time,
    totalPower,
    interval,
    intervalTotalPower,
    intervalHistory,
  };
}

function MainPage() {
  const useFakeProducer = useSearchParams().has("fake");

  const [started, setStarted] = useState(false);
  const [preferencesShown, setPreferencesShown] = useState(false);
  const {
    isInProgressChoosingDevice,
    maybeBluetoothDevice,
    chooseNewDevice,
  } = useBluetoothDevice(Storage.getLastDeviceId(), useFakeProducer);

  useEffect(() => {
    if (!isInProgressChoosingDevice && maybeBluetoothDevice && maybeBluetoothDevice.id) {
      Storage.setLastDeviceID(maybeBluetoothDevice.id);
    }
  }, [maybeBluetoothDevice, isInProgressChoosingDevice])

  const [
    {
      lastCrankRevolutionData,
      rpm,
      powerHistory,
      time,
      totalPower,
      interval,
      intervalTotalPower,
      intervalHistory,
    },
    dispatch,
  ] = useReducer(handlePowerEvent, {
    lastCrankRevolutionData: null,
    rpm: 0,
    powerHistory: [],
    time: 0,
    totalPower: 0,
    interval: null,
    intervalTotalPower: 0,
    intervalHistory: [],
  });

  function nSecondPower(seconds: number) {
    if (powerHistory.length === 0) {
      return 0;
    }

    const lastNPower = powerHistory.slice(-1 * seconds);
    const nSecondPower = Math.round(sum(lastNPower) / lastNPower.length);
    return nSecondPower;
  }

  const producerRef = useRef<PowerProducer | null>(null);
  function start() {
    if (isInProgressChoosingDevice || !maybeBluetoothDevice) {
      return;
    }

    setStarted(true);

    producerRef.current = useFakeProducer
      ? new FakePowerProducer()
      : new BluetoothPowerProducer(maybeBluetoothDevice);
    producerRef.current.onPowerEvent(dispatch);
  }

  useEffect(() => {
    if (producerRef.current) {
      if (interval && interval !== "done") {
        producerRef.current.setPower(interval.goal);
      } else {
        producerRef.current.setPower(0);
      }
    }
  }, [interval]);

  if (!started) {
    return (
      <div>
        <div className="absolute w-screen h-screen flex justify-center items-center">
          <Button
            disabled={isInProgressChoosingDevice || !maybeBluetoothDevice}
            onClick={start}
            big
          >
            <div className="min-w-52 flex flex-col items-center">
              <div className="text-3xl">Start!</div>
              <div>
                {isInProgressChoosingDevice && "Searching for device..."}
                {!isInProgressChoosingDevice && !maybeBluetoothDevice && "No device selected"}
                {!isInProgressChoosingDevice && maybeBluetoothDevice && `Device: ${maybeBluetoothDevice.name || "Unnamed device"}`}
              </div>
            </div>
          </Button>
          <Button big className="text-3xl ml-4" onClick={chooseNewDevice}>Find device</Button>
        </div>
        <Button
          big
          onClick={() => setPreferencesShown(true)}
          className="absolute right-8 top-8"
        >
          Preferences
        </Button>

        {preferencesShown && (
          <Preferences onClose={() => setPreferencesShown(false)} />
        )}
      </div>
    );
  }

  let intervalInfo;
  if (interval === "done") {
    intervalInfo = (
      <>
        <div className="text-center text-3xl mt-2.5">Done!</div>
        <div className="text-center text-3xl mt-2.5">
          {Math.round(totalPower / time)}W (workout avg)
        </div>
      </>
    );
  } else if (interval != null) {
    const intervalPower = Math.round(
      intervalTotalPower / (interval.elapsed + 1),
    );

    let goalClass;
    if (intervalPower < interval.goal * 0.95) {
      goalClass = RANK_TO_CLASS["low"];
    } else if (intervalPower > interval.goal * 1.05) {
      goalClass = RANK_TO_CLASS["high"];
    } else {
      goalClass = RANK_TO_CLASS["ontarget"];
    }

    let elapsed;
    if (interval.interval.type === "STEADY") {
      elapsed = interval.interval.duration - interval.remaining;
    } else {
      elapsed =
        (interval.high
          ? interval.interval.highDuration
          : interval.interval.lowDuration) - interval.remaining;
    }

    intervalInfo = (
      <>
        <div className="text-center text-3xl mt-2.5">
          <span>
            {interval.interval.type === "STEADY" &&
              `${interval.interval.power}W for ${formatDuration(interval.remaining)}`}
            {interval.interval.type === "INTERVALS" &&
              `${interval.high ? interval.interval.highPower : interval.interval.lowPower}W for ${formatDuration(interval.remaining)} (${interval.intervalNum} / ${interval.interval.number})`}
          </span>
        </div>
        <div className={classNames("text-center text-3xl mt-2.5", goalClass)}>
          {intervalPower}W (avg)
        </div>
      </>
    );
  }

  return (
    <div>
      <div className="text-center text-6xl mt-24">{nSecondPower(3)}W (3s)</div>
      {intervalInfo}
      <div className="absolute bottom-0 w-full">
        <PowerGraph
          powerHistory={powerHistory}
          ftp={Storage.getFTP()}
          graphWidth={window.innerWidth}
          graphHeight={75}
        />
      </div>
      <div className="inline-grid grid-cols-[auto_auto] absolute left-3 top-5 gap-x-3 gap-y-1">
        {intervalHistory.map((pastInterval: PastInterval, i: number) => (
          <React.Fragment key={i}>
            <span>{pastInterval.name}</span>
            <span className={RANK_TO_CLASS[pastInterval.powerClass]}>{pastInterval.text}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default function MainPageWrapper() {
  return (
    <Suspense>
      <MainPage />
    </Suspense>
  );
}
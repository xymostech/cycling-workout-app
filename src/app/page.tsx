"use client";

import React, { useState, useRef, useReducer, useEffect, Suspense } from "react";
import { useSearchParams } from 'next/navigation';

import BluetoothPowerProducer, {
  PowerEvent,
  PowerProducer,
} from "./BluetoothPowerProducer";
import FakePowerProducer from "./FakePowerProducer";
import PowerGraph from "./PowerGraph";
import useBluetoothDevice from "./useBluetoothDevice";

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
    <div id="preferences">
      <h2>Preferences</h2>
      <label>
        FTP:{" "}
        <input
          id="ftp"
          className="outline outline-1"
          type="number"
          value={ftp}
          onChange={(e) => setFtp(e.target.value)}
        />
      </label>
      <label>
        <div>Intervals:</div>
        <textarea
          id="intervals"
          className="font-mono outline outline-1 "
          value={formattedIntervals}
          onChange={parseIntervalChange}
        ></textarea>
      </label>
      <button
        className="button px-1"
        style={{ backgroundColor: intervalsGood ? undefined : "#777777" }}
        onClick={savePreferences}
        disabled={!intervalsGood}
      >
        Save
      </button>{" "}
      <button className="button px-1" onClick={onClose}>
        Close
      </button>{" "}
      <span>
        Total duration:{" "}
        <span id="pref-total-duration">
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
        <span id="pref-est-np">{getNormalizedPower(lastGoodIntervals)}</span>
      </span>
    </div>
  );
}

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
    if (!isInProgressChoosingDevice && maybeBluetoothDevice) {
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
          <button
            disabled={isInProgressChoosingDevice || !maybeBluetoothDevice}
            className={`p-2 min-w-52 button flex flex-col items-center ${(isInProgressChoosingDevice || !maybeBluetoothDevice) && "disabled"}`}
            onClick={start}
          >
            <div className="text-3xl">Start!</div>
            <div>
              {isInProgressChoosingDevice && "Searching for device..."}
              {!isInProgressChoosingDevice && !maybeBluetoothDevice && "No device selected"}
              {!isInProgressChoosingDevice && maybeBluetoothDevice && `Device: ${maybeBluetoothDevice.name || "Unnamed device"}`}</div>
          </button>
          <button className="text-3xl ml-4 p-2 button" onClick={chooseNewDevice}>Find device</button>
        </div>
        <button
          id="open-preferences"
          className="button"
          onClick={() => setPreferencesShown(true)}
        >
          Preferences
        </button>

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
        <div id="interval">Done!</div>
        <div id="average-power">
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
      goalClass = "low";
    } else if (intervalPower > interval.goal * 1.05) {
      goalClass = "high";
    } else {
      goalClass = "ontarget";
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
        <div id="interval">
          <div id="interval-inner">
            <span id="interval-text">
              {interval.interval.type === "STEADY" &&
                `${interval.interval.power}W for ${formatDuration(interval.remaining)}`}
              {interval.interval.type === "INTERVALS" &&
                `${interval.high ? interval.interval.highPower : interval.interval.lowPower}W for ${formatDuration(interval.remaining)} (${interval.intervalNum} / ${interval.interval.number})`}
            </span>
          </div>
        </div>
        <div className={goalClass} id="average-power">
          {intervalPower}W (avg)
        </div>
      </>
    );
  }

  return (
    <div>
      <div id="power">{nSecondPower(3)}W (3s)</div>
      {intervalInfo}
      <div id="power-graph">
        <PowerGraph
          powerHistory={powerHistory}
          ftp={Storage.getFTP()}
          graphWidth={window.innerWidth}
          graphHeight={75}
        />
      </div>
      <div id="interval-history">
        {intervalHistory.map((pastInterval: PastInterval, i: number) => (
          <React.Fragment key={i}>
            <span>{pastInterval.name}</span>
            <span className={pastInterval.powerClass}>{pastInterval.text}</span>
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
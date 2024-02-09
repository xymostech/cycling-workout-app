"use client";

import React, {
  useState,
  useRef,
  useReducer,
  useEffect,
  Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
import classNames from "classnames";

import BluetoothPowerProducer, {
  PowerEvent,
  PowerProducer,
} from "./BluetoothPowerProducer";
import FakePowerProducer from "./FakePowerProducer";
import PowerGraph from "./PowerGraph";
import useBluetoothDevice from "./useBluetoothDevice";
import Button from "./Button";
import Preferences from "./Preferences";

import { formatDuration } from "./formatting";
import { findSegment, SegmentInfo } from "./segments";
import Storage from "./Storage";
import sum from "./sum";

const RANK_TO_CLASS = {
  high: "text-indigo-600",
  low: "text-rose-600",
  ontarget: "text-green-600",
};

type PastSegment = {
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
  segment: SegmentInfo | null;
  segmentTotalPower: number;
  segmentHistory: PastSegment[];
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
    segment: lastSegment,
    segmentTotalPower,
    segmentHistory,
  } = state;

  const { power, crankRevolutionData } = powerEvent;

  if (power === 0) {
    return {
      lastCrankRevolutionData,
      rpm,
      powerHistory,
      time,
      totalPower,
      segment: lastSegment,
      segmentTotalPower,
      segmentHistory,
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

  const segment = findSegment(time, Storage.getSegments());

  if (segment !== "done") {
    if (
      lastSegment == null ||
      lastSegment === "done" ||
      segment.segmentKey !== lastSegment.segmentKey
    ) {
      if (lastSegment != null && lastSegment !== "done") {
        const segmentAverage = Math.round(
          segmentTotalPower / (lastSegment.elapsed + 1),
        );

        let marker: "low" | "high" | "ontarget";
        if (segmentAverage < 0.95 * lastSegment.overallGoal) {
          marker = "low";
        } else if (segmentAverage > 1.05 * lastSegment.overallGoal) {
          marker = "high";
        } else {
          marker = "ontarget";
        }

        segmentHistory = [
          ...segmentHistory,
          {
            name: lastSegment.segmentName,
            powerClass: marker,
            text: `${segmentAverage}W (vs ${lastSegment.overallGoal}W)`,
          },
        ];
      }
      segmentTotalPower = power;
    } else {
      segmentTotalPower += power;
    }
  }

  return {
    lastCrankRevolutionData,
    rpm,
    powerHistory,
    time,
    totalPower,
    segment,
    segmentTotalPower,
    segmentHistory,
  };
}

function MainPage() {
  const useFakeProducer = useSearchParams().has("fake");

  const [started, setStarted] = useState(false);
  const [preferencesShown, setPreferencesShown] = useState(false);
  const { isInProgressChoosingDevice, maybeBluetoothDevice, chooseNewDevice } =
    useBluetoothDevice(Storage.getLastDeviceId(), useFakeProducer);

  useEffect(() => {
    if (
      !isInProgressChoosingDevice &&
      maybeBluetoothDevice &&
      maybeBluetoothDevice.id
    ) {
      Storage.setLastDeviceID(maybeBluetoothDevice.id);
    }
  }, [maybeBluetoothDevice, isInProgressChoosingDevice]);

  const [
    {
      lastCrankRevolutionData,
      rpm,
      powerHistory,
      time,
      totalPower,
      segment,
      segmentTotalPower,
      segmentHistory,
    },
    dispatch,
  ] = useReducer(handlePowerEvent, {
    lastCrankRevolutionData: null,
    rpm: 0,
    powerHistory: [],
    time: 0,
    totalPower: 0,
    segment: null,
    segmentTotalPower: 0,
    segmentHistory: [],
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
      if (segment && segment !== "done") {
        producerRef.current.setPower(segment.currentGoal);
      } else {
        producerRef.current.setPower(0);
      }
    }
  }, [segment]);

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
                {!isInProgressChoosingDevice &&
                  !maybeBluetoothDevice &&
                  "No device selected"}
                {!isInProgressChoosingDevice &&
                  maybeBluetoothDevice &&
                  `Device: ${maybeBluetoothDevice.name || "Unnamed device"}`}
              </div>
            </div>
          </Button>
          <Button big className="text-3xl ml-4" onClick={chooseNewDevice}>
            Find device
          </Button>
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

  let segmentInfo;
  if (segment === "done") {
    segmentInfo = (
      <>
        <div className="text-center text-3xl mt-2.5">Done!</div>
        <div className="text-center text-3xl mt-2.5">
          {Math.round(totalPower / time)}W (workout avg)
        </div>
      </>
    );
  } else if (segment != null) {
    const segmentPower = Math.round(segmentTotalPower / (segment.elapsed + 1));

    let goalClass;
    if (segmentPower < segment.currentElapsedGoal * 0.95) {
      goalClass = RANK_TO_CLASS["low"];
    } else if (segmentPower > segment.currentElapsedGoal * 1.05) {
      goalClass = RANK_TO_CLASS["high"];
    } else {
      goalClass = RANK_TO_CLASS["ontarget"];
    }

    segmentInfo = (
      <>
        <div className="text-center text-3xl mt-2.5">
          <span>
            {segment.segment.type === "STEADY" &&
              `${segment.segment.power}W for ${formatDuration(segment.remaining)}`}
            {segment.segment.type === "INTERVALS" &&
              `${segment.high ? segment.segment.highPower : segment.segment.lowPower}W for ${formatDuration(segment.remaining)} (${segment.segmentNum} / ${segment.segment.number})`}
            {segment.segment.type === "RAMP" &&
              `${Math.round(segment.currentGoal)}W for ${formatDuration(segment.remaining)} (${segment.segment.startPower}W→${segment.segment.endPower}W)`}
          </span>
        </div>
        <div className={classNames("text-center text-3xl mt-2.5", goalClass)}>
          {segmentPower}W (avg)
        </div>
      </>
    );
  }

  return (
    <div>
      <div className="text-center text-6xl mt-24">{nSecondPower(3)}W (3s)</div>
      {segmentInfo}
      <div className="absolute bottom-0 w-full">
        <PowerGraph
          powerHistory={powerHistory}
          ftp={Storage.getFTP()}
          graphWidth={window.innerWidth}
          graphHeight={75}
        />
      </div>
      <div className="inline-grid grid-cols-[auto_auto] absolute left-3 top-5 gap-x-3 gap-y-1">
        {segmentHistory.map((pastSegment: PastSegment, i: number) => (
          <React.Fragment key={i}>
            <span>{pastSegment.name}</span>
            <span className={RANK_TO_CLASS[pastSegment.powerClass]}>
              {pastSegment.text}
            </span>
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

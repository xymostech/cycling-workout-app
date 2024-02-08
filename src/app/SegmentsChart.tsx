import { useState, ReactNode, FunctionComponent } from "react";
import Tippy from "@tippyjs/react";
import "tippy.js/dist/tippy.css";

import {
  Segment,
  SteadySegment,
  IntervalsSegment,
  getSegmentTotalDuration,
  getSegmentMaxPower,
} from "./segments";
import sum from "./sum";
import { ZONE_TO_COLOR, powerToZone } from "./zones";
import { formatDurationForSegment, formatDuration } from "./formatting";

const CHART_HEIGHT = 180;
const CHART_WIDTH = 560;

function SteadySegmentChart({
  segment,
  totalDuration,
  maxPower,
  ftp,
}: {
  segment: SteadySegment;
  totalDuration: number;
  maxPower: number;
  ftp: number;
}) {
  const segmentWidth = (CHART_WIDTH / totalDuration) * segment.duration;
  const segmentHeight = (CHART_HEIGHT / maxPower) * segment.power;

  return (
    <Tippy
      content={`Steady segment: ${segment.power}W for ${formatDurationForSegment(segment.duration)}`}
    >
      <div
        style={{
          width: segmentWidth,
          height: segmentHeight,
          backgroundColor: ZONE_TO_COLOR[powerToZone(ftp, segment.power)],
        }}
      />
    </Tippy>
  );
}

function IntervalsSegmentChart({
  segment,
  totalDuration,
  maxPower,
  ftp,
}: {
  segment: IntervalsSegment;
  totalDuration: number;
  maxPower: number;
  ftp: number;
}) {
  const intervals = [];

  const highWidth = (CHART_WIDTH / totalDuration) * segment.highDuration;
  const highHeight = (CHART_HEIGHT / maxPower) * segment.highPower;
  const highColor = ZONE_TO_COLOR[powerToZone(ftp, segment.highPower)];
  const lowWidth = (CHART_WIDTH / totalDuration) * segment.lowDuration;
  const lowHeight = (CHART_HEIGHT / maxPower) * segment.lowPower;
  const lowColor = ZONE_TO_COLOR[powerToZone(ftp, segment.lowPower)];

  for (let i = 0; i < segment.number; i++) {
    intervals.push(
      <Tippy
        key={`high${i}`}
        content={`High segment ${i + 1}/${segment.number}, ${segment.highPower}W for ${formatDurationForSegment(segment.highDuration)}`}
      >
        <div
          style={{
            width: highWidth,
            height: highHeight,
            backgroundColor: highColor,
          }}
        />
      </Tippy>,
    );
    if (i < segment.number - 1) {
      intervals.push(
        <Tippy
          key={`low${i}`}
          content={`Low segment ${i + 1}/${segment.number - 1}, ${segment.lowPower}W for ${formatDurationForSegment(segment.lowDuration)}`}
        >
          <div
            style={{
              width: lowWidth,
              height: lowHeight,
              backgroundColor: lowColor,
            }}
          />
        </Tippy>,
      );
    }
  }

  return <div className="flex flex-row items-end">{intervals}</div>;
}

function SegmentChart({
  segment,
  totalDuration,
  maxPower,
  ftp,
}: {
  segment: Segment;
  totalDuration: number;
  maxPower: number;
  ftp: number;
}) {
  if (segment.type === "STEADY") {
    return (
      <SteadySegmentChart
        segment={segment}
        totalDuration={totalDuration}
        maxPower={maxPower}
        ftp={ftp}
      />
    );
  } else {
    return (
      <IntervalsSegmentChart
        segment={segment}
        totalDuration={totalDuration}
        maxPower={maxPower}
        ftp={ftp}
      />
    );
  }
}

function findSteps(
  maxValue: number,
  minSteps: number,
  maxSteps: number,
  tolerance: number,
): { stepSize: number; numSteps: number } {
  for (let stepSize = 5; stepSize <= maxValue / 2; stepSize += 5) {
    for (let numSteps = minSteps; numSteps <= maxSteps; numSteps++) {
      if (
        maxValue * (1 - tolerance) <= stepSize * numSteps &&
        stepSize * numSteps <= maxValue * (1 + tolerance)
      ) {
        return { stepSize, numSteps };
      }
    }
  }

  return {
    stepSize: maxValue / minSteps,
    numSteps: minSteps,
  };
}

function PowerAxis({
  maxPower,
  numSteps,
  stepSize,
}: {
  maxPower: number;
  numSteps: number;
  stepSize: number;
}) {
  const steps = [];
  for (let i = 0; i <= numSteps; i++) {
    const value = i * stepSize;

    steps.push(
      <div
        key={i}
        className="absolute h-0 right-0 flex flex-row items-center"
        style={{ bottom: (CHART_HEIGHT / maxPower) * value }}
      >
        <div>{Math.round(value)}W</div>
        <div className="h-[2px] ml-1 w-1 bg-black" />
      </div>,
    );
  }

  return (
    <div className="flex flex-row">
      <div className="relative">
        {/* invisible spacer */}
        <div className="invisible flex flex-row">
          <div>{Math.round(numSteps * stepSize)}W</div>
          <div className="h-[2px] ml-1 w-1 bg-black" />
        </div>
        {steps}
      </div>
      <div className="mr-1 w-[2px] bg-black self-stretch" />
    </div>
  );
}

function DurationAxis({
  totalDuration,
  numSteps,
  stepSize,
}: {
  totalDuration: number;
  numSteps: number;
  stepSize: number;
}) {
  const steps = [];
  for (let i = 0; i <= numSteps; i++) {
    const value = Math.round((i * stepSize) / 5) * 5;

    steps.push(
      <div
        key={i}
        className="absolute w-0 top-0 flex flex-col items-center"
        style={{ left: (CHART_WIDTH / totalDuration) * value }}
      >
        <div className="w-[2px] mb-1 h-1 bg-black" />
        <div>{formatDuration(Math.round(value))}</div>
      </div>,
    );
  }

  return (
    <div className="flex flex-col" style={{ width: CHART_WIDTH }}>
      <div className="mt-1 h-[2px] bg-black self-stretch" />
      <div className="relative">
        {/* invisible spacer */}
        <div className="invisible flex flex-col">
          <div className="w-[2px] mb-1 h-1 bg-black" />
          <div>{formatDuration(Math.round(numSteps * stepSize))}</div>
        </div>
        {steps}
      </div>
    </div>
  );
}

export default function SegmentsChart({
  segments,
  ftp,
}: {
  segments: Segment[];
  ftp: number;
}) {
  const totalDuration = sum(segments.map(getSegmentTotalDuration));
  const maxPower = Math.max(...segments.map(getSegmentMaxPower));

  const powerSteps = findSteps(maxPower, 3, 4, 0.05);
  const durationSteps = findSteps(Math.floor(totalDuration / 30), 4, 6, 0.08);

  const chartMaxPower = Math.max(
    maxPower,
    powerSteps.numSteps * powerSteps.stepSize,
  );
  const chartTotalDuration = Math.max(
    totalDuration,
    durationSteps.numSteps * durationSteps.stepSize * 30,
  );

  return (
    <div className="flex flex-col items-end">
      <div className="flex flex-row">
        <PowerAxis
          maxPower={chartMaxPower}
          numSteps={powerSteps.numSteps}
          stepSize={powerSteps.stepSize}
        />
        <div
          className="flex flex-row items-end"
          style={{ height: CHART_HEIGHT, width: CHART_WIDTH }}
        >
          {segments.map((segment, i) => (
            <SegmentChart
              key={i}
              segment={segment}
              totalDuration={chartTotalDuration}
              maxPower={chartMaxPower}
              ftp={ftp}
            />
          ))}
        </div>
      </div>
      <DurationAxis
        totalDuration={chartTotalDuration}
        numSteps={durationSteps.numSteps}
        stepSize={durationSteps.stepSize * 30}
      />
    </div>
  );
}

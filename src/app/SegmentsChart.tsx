import { useState, ReactNode, FunctionComponent } from "react";
import Tippy from "@tippyjs/react";
import "tippy.js/dist/tippy.css";
import zip from "lodash/zip";

import {
  Segment,
  SteadySegment,
  IntervalsSegment,
  RampSegment,
  getSegmentTotalDuration,
  getSegmentMaxPower,
} from "./segments";
import sum from "./sum";
import { ZONE_TO_COLOR, powerToZone, zoneCutoffs } from "./zones";
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
      content={`Steady ${segment.power}W for ${formatDurationForSegment(segment.duration)}`}
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

function RampSegmentChart({
  segment,
  totalDuration,
  maxPower,
  ftp,
}: {
  segment: RampSegment;
  totalDuration: number;
  maxPower: number;
  ftp: number;
}) {
  const timeToWidth = (time: number) => (CHART_WIDTH / totalDuration) * time;
  const powerToHeight = (power: number) => (CHART_HEIGHT / maxPower) * power;

  const segmentWidth = timeToWidth(segment.duration);
  const startHeight = powerToHeight(segment.startPower);
  const endHeight = powerToHeight(segment.endPower);

  const minSegmentPower = Math.min(segment.startPower, segment.endPower);
  const maxSegmentPower = Math.max(segment.startPower, segment.endPower);

  const maxHeight = Math.max(startHeight, endHeight);
  const avgHeight = (startHeight + endHeight) / 2;

  const ftpCutoffs = zoneCutoffs(ftp);
  const ftpZones = zip(ftpCutoffs.slice(0, -1), ftpCutoffs.slice(1));

  return (
    <Tippy
      content={`Ramp from ${segment.startPower} to ${segment.endPower} over ${formatDurationForSegment(segment.duration)}`}
    >
      <div style={{ width: segmentWidth, height: avgHeight }}>
        <svg
          style={{
            marginTop: avgHeight - maxHeight,
          }}
          width={segmentWidth}
          height={maxHeight}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Generate a right trapezoid for each of the zones that the ramp passes through */}
          {ftpZones.map(([zoneLow, zoneHigh], i) => {
            if (zoneLow == null || zoneHigh == null) {
              return null;
            }
            if (zoneHigh <= minSegmentPower || maxSegmentPower <= zoneLow) {
              return null;
            }

            const zoneStartPower = Math.max(zoneLow, minSegmentPower);
            const zoneEndPower = Math.min(zoneHigh, maxSegmentPower);

            const zoneStartTime =
              (segment.duration / (segment.endPower - segment.startPower)) *
              (zoneStartPower - segment.startPower);
            const zoneEndTime =
              (segment.duration / (segment.endPower - segment.startPower)) *
              (zoneEndPower - segment.startPower);

            return (
              <path
                key={i}
                fill={ZONE_TO_COLOR[powerToZone(ftp, (zoneHigh + zoneLow) / 2)]}
                d={[
                  `M ${timeToWidth(zoneStartTime)} ${maxHeight}`,
                  `L ${timeToWidth(zoneStartTime)} ${maxHeight - powerToHeight(zoneStartPower)}`,
                  `L ${timeToWidth(zoneEndTime)} ${maxHeight - powerToHeight(zoneEndPower)}`,
                  `L ${timeToWidth(zoneEndTime)} ${maxHeight}`,
                  "Z",
                ].join(" ")}
              />
            );
          })}
        </svg>
      </div>
    </Tippy>
  );
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
  switch (segment.type) {
    case "STEADY":
      return (
        <SteadySegmentChart
          segment={segment}
          totalDuration={totalDuration}
          maxPower={maxPower}
          ftp={ftp}
        />
      );
    case "INTERVALS":
      return (
        <IntervalsSegmentChart
          segment={segment}
          totalDuration={totalDuration}
          maxPower={maxPower}
          ftp={ftp}
        />
      );
    case "RAMP":
      return (
        <RampSegmentChart
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

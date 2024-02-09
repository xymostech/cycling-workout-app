import { formatDurationForSegment } from "./formatting";
import sum from "./sum";

export interface SteadySegment {
  type: "STEADY";
  power: number;
  duration: number;
}

export interface IntervalsSegment {
  type: "INTERVALS";
  number: number;
  highPower: number;
  highDuration: number;
  lowPower: number;
  lowDuration: number;
}

export interface RampSegment {
  type: "RAMP";
  startPower: number;
  endPower: number;
  duration: number;
}

export type Segment = SteadySegment | IntervalsSegment | RampSegment;

export function formatSegment(segment: Segment): string {
  switch (segment.type) {
    case "STEADY":
      return `STEADY ${segment.power}W ${formatDurationForSegment(segment.duration)}`;
    case "INTERVALS":
      return `INTERVALS ${segment.highPower}W ${formatDurationForSegment(segment.highDuration)} ${segment.lowPower}W ${formatDurationForSegment(segment.lowDuration)} x${segment.number}`;
    case "RAMP":
      return `RAMP ${segment.startPower}W ${segment.endPower}W ${formatDurationForSegment(segment.duration)}`;
  }
}

const unitToMultiplier = {
  s: 1,
  m: 60,
  h: 3600,
};

function parseTime(str: string): number {
  const match = str.match(/([0-9]+)(s|m|h)/);
  if (match) {
    const [, t, u] = match;
    return parseInt(t) * unitToMultiplier[u as "s" | "m" | "h"];
  } else {
    throw new Error("Error parsing time");
  }
}

export function parseSegment(str: string): Segment {
  let match;
  if ((match = str.match(/^STEADY ([0-9]+)W ([0-9]+(?:s|m|h))$/))) {
    return {
      type: "STEADY",
      power: parseInt(match[1]),
      duration: parseTime(match[2]),
    };
  } else if (
    (match = str.match(
      /^INTERVALS ([0-9]+)W ([0-9]+(?:s|m|h)) ([0-9]+W) ([0-9]+(?:s|m|h)) x([0-9]+)$/,
    ))
  ) {
    return {
      type: "INTERVALS",
      highPower: parseInt(match[1]),
      highDuration: parseTime(match[2]),
      lowPower: parseInt(match[3]),
      lowDuration: parseTime(match[4]),
      number: parseInt(match[5]),
    };
  } else if (
    (match = str.match(/^RAMP ([0-9]+W) ([0-9]+W) ([0-9]+(?:s|m|h))$/))
  ) {
    return {
      type: "RAMP",
      startPower: parseInt(match[1]),
      endPower: parseInt(match[2]),
      duration: parseTime(match[3]),
    };
  } else {
    throw new Error(`Invalid segment format: ${str}`);
  }
}

export function getSegmentTotalDuration(segment: Segment): number {
  switch (segment.type) {
    case "STEADY":
      return segment.duration;
    case "INTERVALS":
      return (
        segment.highDuration * segment.number +
        segment.lowDuration * (segment.number - 1)
      );
    case "RAMP":
      return segment.duration;
  }
}

export function getSegmentMaxPower(segment: Segment): number {
  switch (segment.type) {
    case "STEADY":
      return segment.power;
    case "INTERVALS":
      return Math.max(segment.highPower, segment.lowPower);
    case "RAMP":
      return Math.max(segment.startPower, segment.endPower);
  }
}

function enumerate<T>(iterable: T[]): [number, T][] {
  const result: [number, T][] = [];
  let i = 0;

  for (const x of iterable) {
    result.push([i, x]);
    i++;
  }

  return result;
}

export type SegmentInfo =
  | {
      segment: Segment;
      segmentKey: string;
      segmentName: string;
      segmentNum?: number;
      high?: boolean;
      // Current power expected to be putting out
      currentGoal: number;
      // Expected cumulative average power over the segment
      currentElapsedGoal: number;
      // Final expected cumulative average power over the segment
      overallGoal: number;
      elapsed: number;
      remaining: number;
    }
  | "done";

export function findSegment(time: number, segments: Segment[]): SegmentInfo {
  let remainingTime = time;

  for (const [i, segment] of enumerate(segments)) {
    switch (segment.type) {
      case "STEADY":
        if (remainingTime < segment.duration) {
          return {
            segment,
            segmentKey: `${i}`,
            segmentName: "Steady",
            currentGoal: segment.power,
            currentElapsedGoal: segment.power,
            overallGoal: segment.power,
            elapsed: remainingTime,
            remaining: segment.duration - remainingTime,
          };
        } else {
          remainingTime -= segment.duration;
        }
        break;
      case "INTERVALS":
        const totalDuration = getSegmentTotalDuration(segment);
        if (remainingTime < totalDuration) {
          let segmentNum = 1;
          while (remainingTime >= segment.highDuration + segment.lowDuration) {
            remainingTime -= segment.highDuration + segment.lowDuration;
            segmentNum += 1;
          }

          let high = true;
          let remaining = segment.highDuration - remainingTime;
          if (remainingTime >= segment.highDuration) {
            remainingTime -= segment.highDuration;
            remaining = segment.lowDuration - remainingTime;
            high = false;
          }

          const goal = high ? segment.highPower : segment.lowPower;

          return {
            segment,
            segmentKey: `${i}:${segmentNum}:${high ? "high" : "low"}`,
            segmentName: `Segment ${segmentNum}/${segment.number} (${high ? "hard" : "easy"})`,
            segmentNum,
            currentGoal: goal,
            currentElapsedGoal: goal,
            overallGoal: goal,
            high,
            elapsed: remainingTime,
            remaining,
          };
        } else {
          remainingTime -= totalDuration;
        }
        break;
      case "RAMP":
        if (remainingTime < segment.duration) {
          const currentGoal =
            segment.startPower +
            ((segment.endPower - segment.startPower) / segment.duration) *
              remainingTime;

          return {
            segment,
            segmentKey: `${i}`,
            segmentName: "Ramp",
            currentGoal,
            currentElapsedGoal: (segment.startPower + currentGoal) / 2,
            overallGoal: (segment.endPower + segment.startPower) / 2,
            elapsed: remainingTime,
            remaining: segment.duration - remainingTime,
          };
        }
        break;
    }
  }

  return "done";
}

export function getNormalizedPower(segments: Segment[]): number {
  let prevPowers: number[] = [];
  let totalQuartedPower = 0;
  let totalDuration = 0;

  function pushPower(power: number) {
    prevPowers.push(power);
    prevPowers = prevPowers.slice(-30);

    if (prevPowers.length === 30) {
      totalQuartedPower += Math.pow(sum(prevPowers) / 30, 4);
      totalDuration += 1;
    }
  }

  function pushPowers(power: number, duration: number) {
    for (let i = 0; i < duration; i++) {
      pushPower(power);
    }
  }

  for (const segment of segments) {
    switch (segment.type) {
      case "STEADY":
        pushPowers(segment.power, segment.duration);
        break;
      case "INTERVALS":
        pushPowers(segment.highPower, segment.highDuration);
        for (let i = 0; i < segment.number - 1; i++) {
          pushPowers(segment.lowPower, segment.lowDuration);
          pushPowers(segment.highPower, segment.highDuration);
        }
        break;
      case "RAMP":
        pushPowers(
          (segment.startPower + segment.endPower) / 2,
          segment.duration,
        );
        break;
    }
  }

  return Math.round(Math.pow(totalQuartedPower / totalDuration, 0.25));
}

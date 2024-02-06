import { formatDurationForSegment } from "./formatting";

const sum = (elems: number[]) => elems.reduce((acc, x) => acc + x, 0);

interface SteadySegment {
  type: "STEADY";
  power: number;
  duration: number;
}

interface IntervalsSegment {
  type: "INTERVALS";
  number: number;
  highPower: number;
  highDuration: number;
  lowPower: number;
  lowDuration: number;
}

export type Segment = SteadySegment | IntervalsSegment;

export function formatSegment(segment: Segment) {
  if (segment.type === "STEADY") {
    return `STEADY ${segment.power}W ${formatDurationForSegment(segment.duration)}`;
  } else if (segment.type === "INTERVALS") {
    return `INTERVALS ${segment.highPower}W ${formatDurationForSegment(segment.highDuration)} ${segment.lowPower}W ${formatDurationForSegment(segment.lowDuration)} x${segment.number}`;
  }
}

const unitToMultiplier = {
  s: 1,
  m: 60,
  h: 3600,
};

function parseTime(str: string) {
  const match = str.match(/([0-9]+)(s|m|h)/);
  if (match) {
    const [, t, u] = match;
    return parseInt(t) * unitToMultiplier[u as "s" | "m" | "h"];
  } else {
    throw new Error("Error parsing time");
  }
}

export function parseSegment(str: string) {
  let match;
  if ((match = str.match(/STEADY ([0-9]+)W ([0-9]+(?:s|m|h))/))) {
    return {
      type: "STEADY",
      power: parseInt(match[1]),
      duration: parseTime(match[2]),
    };
  } else if (
    (match = str.match(
      /INTERVALS ([0-9]+)W ([0-9]+(?:s|m|h)) ([0-9]+W) ([0-9]+(?:s|m|h)) x([0-9]+)/,
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
  } else {
    throw new Error(`Invalid segment format: ${str}`);
  }
}

export function getSegmentTotalDuration(segment: Segment) {
  if (segment.type === "STEADY") {
    return segment.duration;
  } else if (segment.type === "INTERVALS") {
    return (
      segment.highDuration * segment.number +
      segment.lowDuration * (segment.number - 1)
    );
  } else {
    throw new Error("Invalid segment type");
  }
}

function enumerate<T>(iterable: T[]) {
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
      goal: number;
      elapsed: number;
      remaining: number;
    }
  | "done";

export function findSegment(
  time: number,
  segments: Segment[],
): SegmentInfo {
  let remainingTime = time;

  for (const [i, segment] of enumerate(segments)) {
    if (segment.type === "STEADY") {
      if (remainingTime < segment.duration) {
        return {
          segment,
          segmentKey: `${i}`,
          segmentName: "Steady",
          goal: segment.power,
          elapsed: remainingTime,
          remaining: segment.duration - remainingTime,
        };
      } else {
        remainingTime -= segment.duration;
      }
    } else if (segment.type === "INTERVALS") {
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

        return {
          segment,
          segmentKey: `${i}:${segmentNum}:${high ? "high" : "low"}`,
          segmentName: `Segment ${segmentNum}/${segment.number} (${high ? "hard" : "easy"})`,
          segmentNum,
          goal: high ? segment.highPower : segment.lowPower,
          high,
          elapsed: remainingTime,
          remaining,
        };
      } else {
        remainingTime -= totalDuration;
      }
    }
  }

  return "done";
}

export function getNormalizedPower(segments: Segment[]) {
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
    if (segment.type === "STEADY") {
      pushPowers(segment.power, segment.duration);
    } else if (segment.type === "INTERVALS") {
      pushPowers(segment.highPower, segment.highDuration);
      for (let i = 0; i < segment.number - 1; i++) {
        pushPowers(segment.lowPower, segment.lowDuration);
        pushPowers(segment.highPower, segment.highDuration);
      }
    } else {
      throw new Error("Invalid segment type");
    }
  }

  return Math.round(Math.pow(totalQuartedPower / totalDuration, 0.25));
}

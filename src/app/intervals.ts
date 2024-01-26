import { formatDurationForInterval } from "./formatting";

const sum = (elems: number[]) => elems.reduce((acc, x) => acc + x, 0);

interface SteadyInterval {
  type: "STEADY";
  power: number;
  duration: number;
}

interface IntervalsInterval {
  type: "INTERVALS";
  number: number;
  highPower: number;
  highDuration: number;
  lowPower: number;
  lowDuration: number;
}

export type Interval = SteadyInterval | IntervalsInterval;

export function formatInterval(interval: Interval) {
  if (interval.type === "STEADY") {
    return `STEADY ${interval.power}W ${formatDurationForInterval(interval.duration)}`;
  } else if (interval.type === "INTERVALS") {
    return `INTERVALS ${interval.highPower}W ${formatDurationForInterval(interval.highDuration)} ${interval.lowPower}W ${formatDurationForInterval(interval.lowDuration)} x${interval.number}`;
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

export function parseInterval(str: string) {
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
    throw new Error(`Invalid interval format: ${str}`);
  }
}

export function getIntervalTotalDuration(interval: Interval) {
  if (interval.type === "STEADY") {
    return interval.duration;
  } else if (interval.type === "INTERVALS") {
    return (
      interval.highDuration * interval.number +
      interval.lowDuration * (interval.number - 1)
    );
  } else {
    throw new Error("Invalid interval type");
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

export type IntervalInfo =
  | {
      interval: Interval;
      intervalKey: string;
      intervalName: string;
      intervalNum?: number;
      high?: boolean;
      goal: number;
      elapsed: number;
      remaining: number;
    }
  | "done";

export function findInterval(
  time: number,
  intervals: Interval[],
): IntervalInfo {
  let remainingTime = time;

  for (const [i, interval] of enumerate(intervals)) {
    if (interval.type === "STEADY") {
      if (remainingTime < interval.duration) {
        return {
          interval,
          intervalKey: `${i}`,
          intervalName: "Steady",
          goal: interval.power,
          elapsed: remainingTime,
          remaining: interval.duration - remainingTime,
        };
      } else {
        remainingTime -= interval.duration;
      }
    } else if (interval.type === "INTERVALS") {
      const totalDuration = getIntervalTotalDuration(interval);
      if (remainingTime < totalDuration) {
        let intervalNum = 1;
        while (remainingTime >= interval.highDuration + interval.lowDuration) {
          remainingTime -= interval.highDuration + interval.lowDuration;
          intervalNum += 1;
        }

        let high = true;
        let remaining = interval.highDuration - remainingTime;
        if (remainingTime >= interval.highDuration) {
          remainingTime -= interval.highDuration;
          remaining = interval.lowDuration - remainingTime;
          high = false;
        }

        return {
          interval,
          intervalKey: `${i}:${intervalNum}:${high ? "high" : "low"}`,
          intervalName: `Interval ${intervalNum}/${interval.number} (${high ? "hard" : "easy"})`,
          intervalNum,
          goal: high ? interval.highPower : interval.lowPower,
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

export function getNormalizedPower(intervals: Interval[]) {
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

  for (const interval of intervals) {
    if (interval.type === "STEADY") {
      pushPowers(interval.power, interval.duration);
    } else if (interval.type === "INTERVALS") {
      pushPowers(interval.highPower, interval.highDuration);
      for (let i = 0; i < interval.number - 1; i++) {
        pushPowers(interval.lowPower, interval.lowDuration);
        pushPowers(interval.highPower, interval.highDuration);
      }
    } else {
      throw new Error("Invalid interval type");
    }
  }

  return Math.round(Math.pow(totalQuartedPower / totalDuration, 0.25));
}

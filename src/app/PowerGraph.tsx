import { ZONE_TO_COLOR, powerToZone } from "./zones";

type PowerGroup = {
  powers: number[];
  startIndex: number;
  nextPowerStart: number;
};

function splitByZones(powerHistory: number[], ftp: number) {
  if (powerHistory.length === 0) {
    return [];
  }

  const groups: PowerGroup[] = [];
  let currGroup: number[] = [];

  for (let i = 0; i < powerHistory.length; i++) {
    const power = powerHistory[i];
    if (i === 0) {
      currGroup.push(power);
    } else {
      const prevPower = powerHistory[i - 1];
      const zone = powerToZone(ftp, power);
      const prevZone = powerToZone(ftp, prevPower);

      if (zone !== prevZone) {
        groups.push({
          powers: currGroup,
          startIndex: i - currGroup.length,
          nextPowerStart: power,
        });
        currGroup = [power];
      } else {
        currGroup.push(power);
      }
    }
  }

  groups.push({
    powers: currGroup,
    startIndex: powerHistory.length - currGroup.length,
    nextPowerStart: 0,
  });
  return groups;
}

export default function PowerGraph({
  powerHistory,
  ftp,
  graphHeight,
  graphWidth,
}: {
  powerHistory: number[];
  ftp: number;
  graphHeight: number;
  graphWidth: number;
}) {
  const maxPower = Math.max(...powerHistory);

  const indexToX = (i: number) => (i / 10 / 60) * graphWidth;
  const powerToY = (power: number) => graphHeight * (1 - power / maxPower);

  const groups = splitByZones(powerHistory, ftp);

  function renderGroup(
    { powers, startIndex, nextPowerStart }: PowerGroup,
    groupIndex: number,
  ) {
    const zone = powerToZone(ftp, powers[0]);

    return (
      <path
        key={groupIndex}
        fill={ZONE_TO_COLOR[zone]}
        d={[
          `M ${indexToX(startIndex)} ${powerToY(0)}`,
          ...powers.map(
            (power, i) => `L ${indexToX(startIndex + i)} ${powerToY(power)}`,
          ),
          `L ${indexToX(startIndex + powers.length)} ${powerToY(nextPowerStart)}`,
          `L ${indexToX(startIndex + powers.length)} ${powerToY(0)}`,
          "Z",
        ].join(" ")}
      />
    );
  }

  return (
    <svg
      width={graphWidth}
      height={graphHeight}
      xmlns="http://www.w3.org/2000/svg"
    >
      {groups.map(renderGroup)}
    </svg>
  );
}

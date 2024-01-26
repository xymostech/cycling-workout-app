const ZONE_TO_COLOR = {
  1: "#3a60d5",
  2: "#25bece",
  3: "#52ce25",
  4: "#dbd026",
  5: "#d76e2f",
  6: "#dc3545",
};

function powerToZone(ftp: number, power: number) {
  if (power < ftp * 0.55) {
    return 1;
  } else if (power < ftp * 0.75) {
    return 2;
  } else if (power < ftp * 0.9) {
    return 3;
  } else if (power < ftp * 1.05) {
    return 4;
  } else if (power < ftp * 1.2) {
    return 5;
  } else {
    return 6;
  }
}

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

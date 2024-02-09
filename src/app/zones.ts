export const ZONE_TO_COLOR = {
  1: "#3a60d5",
  2: "#25bece",
  3: "#52ce25",
  4: "#dbd026",
  5: "#d76e2f",
  6: "#dc3545",
};

export function powerToZone(ftp: number, power: number) {
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

export function zoneCutoffs(ftp: number): number[] {
  return [0, ftp * 0.55, ftp * 0.75, ftp * 0.9, ftp * 1.05, ftp * 1.2, 1 / 0];
}

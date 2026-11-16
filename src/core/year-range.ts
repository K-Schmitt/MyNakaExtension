// The years a title can have, one range for the whole extension: the adapters and the SensCritique
// readers keep only these; the message and storage parsers, and the finish event check, refuse a year
// outside them.

export const MIN_YEAR = 1800;
export const MAX_YEAR = 2100;

export function isYearInRange(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= MIN_YEAR &&
    (value as number) <= MAX_YEAR
  );
}

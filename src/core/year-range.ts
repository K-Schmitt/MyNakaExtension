// The years a title can have: the adapters keep only these, and a finish event outside them is refused.

export const MIN_YEAR = 1800;
export const MAX_YEAR = 2100;

export function isYearInRange(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= MIN_YEAR &&
    (value as number) <= MAX_YEAR
  );
}

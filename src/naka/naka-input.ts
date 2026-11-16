// Runtime guards on what the caller hands to the Naka client, run before any token read and any request.

export function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function checkContentId(value: number): void {
  if (!isPositiveId(value)) {
    throw new RangeError("contentId must be a positive safe integer");
  }
}

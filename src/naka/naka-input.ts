// Runtime guards on what the caller hands to the Naka client, run before any token read and any request.

const MAX_QUERY = 200;

export function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function checkContentId(value: number): void {
  if (!isPositiveId(value)) {
    throw new RangeError("contentId must be a positive safe integer");
  }
}

// Returns the trimmed query, ready for encodeURIComponent.
export function checkQuery(value: string): string {
  if (typeof value !== "string") throw new RangeError("query must be a string");
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_QUERY) {
    throw new RangeError("query must be 1 to 200 characters");
  }
  try {
    encodeURIComponent(trimmed);
  } catch {
    throw new RangeError("query must be well-formed text");
  }
  return trimmed;
}

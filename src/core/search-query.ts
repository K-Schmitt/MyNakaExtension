// The guard on a search text, shared by both site clients, the messages that carry one and the status
// page: run before any request. Returns the trimmed query, ready for encodeURIComponent.

const MAX_QUERY = 200;

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

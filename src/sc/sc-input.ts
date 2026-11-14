// Runtime guards on what the caller hands to the client, run before any session read and any request.
// The types are not enough at runtime: a bad id ends up in a request body, a bad date in a mutation.

import { isIsoDate } from "../core/iso-date";

export function checkProductId(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("id must be a positive safe integer");
  }
}

export function checkSeason(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("season must be a non-negative safe integer");
  }
}

export function checkRating(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new RangeError("rating must be an integer from 1 to 10");
  }
}

// YYYY-MM-DD and a real calendar day: 2026-02-30 does not round-trip.
export function checkIsoDate(value: string): void {
  if (!isIsoDate(value)) {
    throw new RangeError("date must look like YYYY-MM-DD");
  }
  const [year, month, day] = value.split("-").map(Number);
  const time = Date.UTC(year as number, (month as number) - 1, day as number);
  if (new Date(time).toISOString().slice(0, 10) !== value) {
    throw new RangeError("date must be a real calendar day");
  }
}

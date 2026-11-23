// Runtime guards on what the caller hands to the Naka client, run before any token read and any request.

import type { ContentIds } from "../core/finish-event";

export function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function checkContentId(value: number): void {
  if (!isPositiveId(value)) {
    throw new RangeError("contentId must be a positive safe integer");
  }
}

/** The ids of a « vu » write: a content id, and a season and an episode that come together or not at all. */
export function checkWatchedIds({
  contentId,
  season,
  episode,
}: ContentIds): void {
  checkContentId(contentId);
  if (season === undefined && episode === undefined) return;
  if (!isPositiveId(season) || !isPositiveId(episode)) {
    throw new RangeError("season and episode must come together");
  }
}

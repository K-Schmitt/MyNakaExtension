// Re-validation of what a Naka tab sent back. The tab is another context: every value is untrusted, so each
// reader rebuilds a fresh value from known fields or throws. Nothing is repaired and nothing is passed through.

import { NakaUnavailableError } from "../naka/naka-errors";
import { isPositiveId } from "../naka/naka-input";
import { type NakaItem, toItem } from "../naka/naka-items";
import { isRecord } from "../naka/naka-transport";

const ACCOUNT_ID = /^[1-9]\d*$/;

export function unexpected(): never {
  throw new NakaUnavailableError("Naka tab: unexpected reply");
}

// `Array.from` visits the holes of a sparse array, which `every` and `map` skip.
function toList(value: unknown): unknown[] {
  return Array.isArray(value) ? Array.from(value as unknown[]) : unexpected();
}

export function asIdList(value: unknown): number[] {
  const ids = toList(value);
  if (!ids.every(isPositiveId)) return unexpected();
  return [...new Set(ids as number[])];
}

// The same rules as the Plan 2 client: the required fields must be valid. The key is `contentId` here, `id` there.
export function asItem(value: unknown): NakaItem {
  if (!isRecord(value)) return unexpected();
  const item = toItem({
    id: value.contentId,
    tmdbId: value.tmdbId,
    mediaType: value.mediaType,
    title: value.title,
    originalTitle: value.originalTitle,
    releaseDate: value.releaseDate,
    numberOfSeasons: value.numberOfSeasons,
  });
  return item ?? unexpected();
}

// One doubtful entry fails the whole list: an honest tab never sends one.
export function asItems(value: unknown): NakaItem[] {
  return toList(value).map(asItem);
}

export function asAccount(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !ACCOUNT_ID.test(value)) return unexpected();
  return isPositiveId(Number(value)) ? value : unexpected();
}

export function asNothing(value: unknown): void {
  if (value !== undefined) unexpected();
}

// Mapping of Naka catalogue entries and of the playlist id list. Both fail closed or drop what they cannot trust.

import { NakaUnavailableError } from "./naka-errors";
import { isPositiveId } from "./naka-input";
import { isRecord } from "./naka-transport";

export type NakaItem = {
  contentId: number;
  tmdbId: number;
  mediaType: "tv" | "movie";
  title: string;
  originalTitle?: string;
  releaseDate?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

// undefined when the entry lacks something the type requires.
export function toItem(entry: unknown): NakaItem | undefined {
  if (!isRecord(entry)) return undefined;
  const { id, tmdbId, mediaType, title, originalTitle, releaseDate } = entry;
  if (!isPositiveId(id) || !isPositiveId(tmdbId) || !nonEmpty(title)) {
    return undefined;
  }
  if (mediaType !== "tv" && mediaType !== "movie") return undefined;
  const item: NakaItem = { contentId: id, tmdbId, mediaType, title };
  if (nonEmpty(originalTitle)) item.originalTitle = originalTitle;
  if (typeof releaseDate === "string" && ISO_DATE.test(releaseDate)) {
    item.releaseDate = releaseDate;
  }
  return item;
}

export function toItems(json: unknown): NakaItem[] {
  if (!isRecord(json) || !Array.isArray(json.data)) {
    throw new NakaUnavailableError("Naka search: unexpected response");
  }
  return json.data.flatMap((entry) => toItem(entry) ?? []);
}

// A shorter list would make the sync believe the owner removed titles: anything doubtful is an error.
export function toPlaylistIds(json: unknown): number[] {
  if (!isRecord(json) || !Array.isArray(json.contentIds)) {
    throw new NakaUnavailableError("Naka playlist: unexpected response");
  }
  const ids: unknown[] = json.contentIds;
  if (!ids.every(isPositiveId)) {
    throw new NakaUnavailableError("Naka playlist: unexpected response");
  }
  if (mayBeTruncated(json, ids.length)) {
    throw new NakaUnavailableError("Naka playlist: list may be truncated");
  }
  return [...new Set(ids as number[])];
}

// A null value counts as an absent field.
function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

// The length is the RAW one, before the dedupe. A page limit is required: without it nothing proves the list is whole.
// A present `total` must equal the length and a present `hasMore` must be false: any other value fails closed.
function mayBeTruncated(json: Record<string, unknown>, length: number) {
  const { limit, total, hasMore } = json;
  if (!isPositiveId(limit) || length >= limit) return true;
  if (isPresent(total) && total !== length) return true;
  if (isPresent(hasMore) && hasMore !== false) return true;
  return Object.keys(json).some((key) => key.startsWith("next"));
}

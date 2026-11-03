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
  if (typeof json.limit === "number" && ids.length >= json.limit) {
    throw new NakaUnavailableError("Naka playlist: list may be truncated");
  }
  return [...new Set(ids as number[])];
}

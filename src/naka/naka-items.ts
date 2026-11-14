// Mapping of Naka catalogue entries and of the playlist id list. Both fail closed or drop what they cannot trust.

import { imageOf, type TitleImage } from "../core/title-image";
import { isIsoDate } from "../ext/field-checks";
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
  /** The seasons Naka lists for a series: a positive safe integer, else absent. */
  numberOfSeasons?: number;
  /** The episodes Naka announces for a series, unreleased ones included: a positive safe integer, else absent. */
  numberOfEpisodes?: number;
  /** Poster and backdrop paths when Naka gives valid ones. */
  image?: TitleImage;
};

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

// undefined when the entry lacks something the type requires.
export function toItem(entry: unknown): NakaItem | undefined {
  if (!isRecord(entry)) return undefined;
  const { id, tmdbId, mediaType, title, originalTitle, releaseDate } = entry;
  const { numberOfSeasons, numberOfEpisodes } = entry;
  if (!isPositiveId(id) || !isPositiveId(tmdbId) || !nonEmpty(title)) {
    return undefined;
  }
  if (mediaType !== "tv" && mediaType !== "movie") return undefined;
  const item: NakaItem = { contentId: id, tmdbId, mediaType, title };
  if (nonEmpty(originalTitle)) item.originalTitle = originalTitle;
  if (typeof releaseDate === "string" && isIsoDate(releaseDate)) {
    item.releaseDate = releaseDate;
  }
  if (isPositiveId(numberOfSeasons)) item.numberOfSeasons = numberOfSeasons;
  if (isPositiveId(numberOfEpisodes)) item.numberOfEpisodes = numberOfEpisodes;
  const image = imageOf({
    posterPath: entry.posterPath,
    backdropPath: entry.backdropPath,
  });
  if (image) item.image = image;
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

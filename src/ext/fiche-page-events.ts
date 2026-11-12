// The page events of a Naka title page: the content the page loaded (`fiche`) and the season it opens
// (`season`). The page is untrusted: ids are positive safe integers, texts are capped, and any other key
// refuses the event. The channel is the caller's, to avoid an import cycle with messages.ts.

import {
  asId,
  asInt,
  asOneOf,
  asString,
  fail,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";

export type FicheEvent<C extends string> = {
  channel: C;
  kind: "fiche";
  contentId: number;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle?: string;
  year?: number;
};

export type SeasonEvent<C extends string> = {
  channel: C;
  kind: "season";
  contentId: number;
  season: number;
};

const FICHE_KEYS = valuesOf<keyof FicheEvent<string>>({
  channel: true,
  kind: true,
  contentId: true,
  tmdbId: true,
  mediaType: true,
  title: true,
  originalTitle: true,
  year: true,
});
const SEASON_KEYS = valuesOf<keyof SeasonEvent<string>>({
  channel: true,
  kind: true,
  contentId: true,
  season: true,
});
const MEDIA_TYPES = valuesOf<FicheEvent<string>["mediaType"]>({
  movie: true,
  tv: true,
});
const MAX_TEXT = 200;
export const MIN_YEAR = 1800;
export const MAX_YEAR = 2100;

function asText(raw: unknown, path: string): string {
  const text = asString(raw, path);
  return text.length >= 1 && text.length <= MAX_TEXT ? text : fail(path);
}

function asYear(raw: unknown): number {
  const year = asInt(raw, MIN_YEAR, "year");
  return year <= MAX_YEAR ? year : fail("year");
}

export function ficheEvent<C extends string>(
  channel: C,
  record: Record<string, unknown>,
): FicheEvent<C> {
  onlyKeys(record, FICHE_KEYS, "event");
  const event: FicheEvent<C> = {
    channel,
    kind: "fiche",
    contentId: asId(record.contentId, "contentId"),
    tmdbId: asId(record.tmdbId, "tmdbId"),
    mediaType: asOneOf(record.mediaType, MEDIA_TYPES, "mediaType"),
    title: asText(record.title, "title"),
  };
  const originalTitle = whenPresent(record.originalTitle, (v) =>
    asText(v, "originalTitle"),
  );
  const year = whenPresent(record.year, asYear);
  if (originalTitle !== undefined) event.originalTitle = originalTitle;
  if (year !== undefined) event.year = year;
  return event;
}

export function seasonEvent<C extends string>(
  channel: C,
  record: Record<string, unknown>,
): SeasonEvent<C> {
  onlyKeys(record, SEASON_KEYS, "event");
  return {
    channel,
    kind: "season",
    contentId: asId(record.contentId, "contentId"),
    season: asId(record.season, "season"),
  };
}

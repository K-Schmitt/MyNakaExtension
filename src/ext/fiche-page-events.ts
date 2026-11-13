// The page events of a Naka title page: the content the page loaded (`fiche`) and the season it opens
// (`season`). The page is untrusted: ids are positive safe integers, texts are capped, and any other key
// refuses the event. A bad title, original title or year costs only that field: the worker reads them
// from Naka's own item, never from the event. The channel is the caller's, to avoid an import cycle with
// messages.ts.

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
  title?: string;
  originalTitle?: string;
  year?: number;
  /** Naka's season count of a series (absent for a film): an unreadable one is left out, not refused. */
  numberOfSeasons?: number;
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
  numberOfSeasons: true,
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
export const MAX_TEXT = 200;
export const MIN_YEAR = 1800;
export const MAX_YEAR = 2100;
export const MAX_SEASON_COUNT = 100;

export function asText(raw: unknown, path: string): string {
  const text = asString(raw, path);
  return text.length >= 1 && text.length <= MAX_TEXT ? text : fail(path);
}

export function asYear(raw: unknown): number {
  const year = asInt(raw, MIN_YEAR, "year");
  return year <= MAX_YEAR ? year : fail("year");
}

// A field the event can do without: absent or unreadable, it is left out.
function leftOutWhenBad<T>(
  raw: unknown,
  parse: (value: unknown) => T,
): T | undefined {
  try {
    return whenPresent(raw, parse);
  } catch {
    return undefined;
  }
}

const asTitleField = (path: string) => (raw: unknown) => asText(raw, path);

function seasonCountOf(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return undefined;
  return raw >= 1 && raw <= MAX_SEASON_COUNT ? raw : undefined;
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
  };
  const title = leftOutWhenBad(record.title, asTitleField("title"));
  const originalTitle = leftOutWhenBad(
    record.originalTitle,
    asTitleField("originalTitle"),
  );
  const year = leftOutWhenBad(record.year, asYear);
  const numberOfSeasons = seasonCountOf(record.numberOfSeasons);
  if (title !== undefined) event.title = title;
  if (originalTitle !== undefined) event.originalTitle = originalTitle;
  if (year !== undefined) event.year = year;
  if (numberOfSeasons !== undefined) event.numberOfSeasons = numberOfSeasons;
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

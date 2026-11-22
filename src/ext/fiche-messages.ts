// The title page messages a Naka tab sends the worker. The tab is a page the owner does not control: ids
// are positive safe integers, texts are capped, a rating is 1 to 10, and any other key refuses the message.
// The worker still writes only a product it issued to this tab (fiche-registry), after a trusted click.

import { asText, asYear, MAX_SEASON_COUNT } from "./fiche-page-events";
import { parseRemove, parseUndo } from "./fiche-undo-messages";
import {
  asBoolean,
  asId,
  asOneOf,
  asString,
  fail,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";
import type { SenderRole } from "./messages";
import { asRating } from "./rating-schema";

export type FicheTarget = "film" | "série" | "épisode";

export type FicheMessage =
  | {
      type: "fiche-info";
      contentId: number;
      /** From the tab's address (/content/{movie|tv}/{tmdbId}): the worker checks it against Naka's item. */
      tmdbId: number;
      mediaType: "movie" | "tv";
      /** The page's words, unread by the worker: absent when the page's was unreadable. */
      title?: string;
      originalTitle?: string;
      year?: number;
    }
  | { type: "fiche-season"; contentId: number; season: number }
  | { type: "fiche-mine"; contentId: number; productId: number }
  | {
      type: "fiche-rate";
      contentId: number;
      target: FicheTarget;
      productId: number;
      rating: number;
      season?: number;
      episode?: number;
      /** A film's only: Naka's « Ma liste » button was active (read by the tab), for the undo record. */
      inMaListe?: boolean;
      /** A film's only: Naka's « Déjà vu » button was lit before the rating (read by the tab), for the undo record. */
      dejaVuOn?: boolean;
      /** A film's only: the button is on screen, so the tab clicks it itself (`maListe: "tab"`). */
      listByTab?: boolean;
      /** A film's or an episode's: Naka's « Déjà vu » / « Vu » button is on screen: the tab clicks it if it is still off (`dejaVu: "tab"`). */
      vuByTab?: boolean;
    }
  | { type: "fiche-link"; contentId: number; productId: number }
  | {
      type: "fiche-undo";
      contentId: number;
      productId: number;
      /** Naka's « Ma liste » button is on screen: the tab clicks it itself (`maListe: "tab"`). */
      listByTab?: boolean;
    }
  | { type: "fiche-remove"; contentId: number; productId: number }
  /** « Chercher » on the title page: the owner's own words, trimmed, a search query (isSearchQuery). */
  | { type: "fiche-search"; contentId: number; query: string };

export type FicheType = FicheMessage["type"];
export type FicheInfoMessage = Extract<FicheMessage, { type: "fiche-info" }>;
export type FicheSeasonMessage = Extract<
  FicheMessage,
  { type: "fiche-season" }
>;
export type FicheMineMessage = Extract<FicheMessage, { type: "fiche-mine" }>;
export type FicheRateMessage = Extract<FicheMessage, { type: "fiche-rate" }>;
export type FicheLinkMessage = Extract<FicheMessage, { type: "fiche-link" }>;
export type FicheUndoMessage = Extract<FicheMessage, { type: "fiche-undo" }>;
export type FicheRemoveMessage = Extract<
  FicheMessage,
  { type: "fiche-remove" }
>;
export type FicheSearchMessage = Extract<
  FicheMessage,
  { type: "fiche-search" }
>;

export const MAX_SEARCH_QUERY = 100;

/** A trimmed query either side sends or reads: 1 to MAX_SEARCH_QUERY characters, with no lone surrogate. */
export function isSearchQuery(query: string): boolean {
  const sized = query.length >= 1 && query.length <= MAX_SEARCH_QUERY;
  return sized && query.isWellFormed();
}

/** Spread into the worker's type list (messages.ts). */
export const FICHE_TYPE_FLAGS: Record<FicheType, true> = {
  "fiche-info": true,
  "fiche-season": true,
  "fiche-mine": true,
  "fiche-rate": true,
  "fiche-link": true,
  "fiche-undo": true,
  "fiche-remove": true,
  "fiche-search": true,
};
const FICHE_TYPES = valuesOf<FicheType>(FICHE_TYPE_FLAGS);

export const FICHE_SENDERS: Record<FicheType, readonly SenderRole[]> = {
  "fiche-info": ["naka-tab"],
  "fiche-season": ["naka-tab"],
  "fiche-mine": ["naka-tab"],
  "fiche-rate": ["naka-tab"],
  "fiche-link": ["naka-tab"],
  "fiche-undo": ["naka-tab"],
  "fiche-remove": ["naka-tab"],
  "fiche-search": ["naka-tab"],
};

const TARGETS = valuesOf<FicheTarget>({
  film: true,
  série: true,
  épisode: true,
});
const MEDIA_TYPES = valuesOf<FicheInfoMessage["mediaType"]>({
  movie: true,
  tv: true,
});
const INFO_KEYS = valuesOf<keyof FicheInfoMessage>({
  type: true,
  contentId: true,
  tmdbId: true,
  mediaType: true,
  title: true,
  originalTitle: true,
  year: true,
});
const SEASON_KEYS = valuesOf<keyof FicheSeasonMessage>({
  type: true,
  contentId: true,
  season: true,
});
const PRODUCT_KEYS = valuesOf<keyof FicheMineMessage>({
  type: true,
  contentId: true,
  productId: true,
});
const RATE_KEYS = valuesOf<keyof FicheRateMessage>({
  type: true,
  contentId: true,
  target: true,
  productId: true,
  rating: true,
  season: true,
  episode: true,
  inMaListe: true,
  dejaVuOn: true,
  listByTab: true,
  vuByTab: true,
});
const SEARCH_KEYS = valuesOf<keyof FicheSearchMessage>({
  type: true,
  contentId: true,
  query: true,
});
/** The rating's fields of Naka's « Ma liste » button and the state of its « Déjà vu »: a film's only. */
type FilmOnlyKey = Extract<
  keyof FicheRateMessage,
  "inMaListe" | "listByTab" | "dejaVuOn"
>;
const FILM_ONLY = valuesOf<FilmOnlyKey>({
  inMaListe: true,
  listByTab: true,
  dejaVuOn: true,
});
/** The rating's field of Naka's « Déjà vu » button: any target but a series. */
type NotSeriesKey = Extract<keyof FicheRateMessage, "vuByTab">;
const NOT_SERIES = valuesOf<NotSeriesKey>({ vuByTab: true });

export function isFicheType(type: string): type is FicheType {
  return FICHE_TYPES.some((known) => known === type);
}

function parseInfo(record: Record<string, unknown>): FicheInfoMessage {
  onlyKeys(record, INFO_KEYS, "message");
  const message: FicheInfoMessage = {
    type: "fiche-info",
    contentId: asId(record.contentId, "contentId"),
    tmdbId: asId(record.tmdbId, "tmdbId"),
    mediaType: asOneOf(record.mediaType, MEDIA_TYPES, "mediaType"),
  };
  const title = whenPresent(record.title, (v) => asText(v, "title"));
  const originalTitle = whenPresent(record.originalTitle, (v) =>
    asText(v, "originalTitle"),
  );
  const year = whenPresent(record.year, asYear);
  if (title !== undefined) message.title = title;
  if (originalTitle !== undefined) message.originalTitle = originalTitle;
  if (year !== undefined) message.year = year;
  return message;
}

// « Ma liste » is a film's: present on another target, a field of it refuses the message.
function withMaListe(
  message: FicheRateMessage,
  record: Record<string, unknown>,
): FicheRateMessage {
  let read = message;
  for (const key of FILM_ONLY) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (message.target !== "film") return fail(key);
    read = { ...read, [key]: asBoolean(raw, key) };
  }
  return read;
}

// « Déjà vu » is a film's or an episode's: present on a series, the field refuses the message.
function withDejaVu(
  message: FicheRateMessage,
  record: Record<string, unknown>,
): FicheRateMessage {
  let read = message;
  for (const key of NOT_SERIES) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (message.target === "série") return fail(key);
    read = { ...read, [key]: asBoolean(raw, key) };
  }
  return read;
}

function parseRate(record: Record<string, unknown>): FicheRateMessage {
  onlyKeys(record, RATE_KEYS, "message");
  const target = asOneOf(record.target, TARGETS, "target");
  const base = {
    type: "fiche-rate" as const,
    contentId: asId(record.contentId, "contentId"),
    target,
    productId: asId(record.productId, "productId"),
    rating: asRating(record.rating, "rating"),
  };
  const place = target === "épisode";
  const hasPlace = record.season !== undefined || record.episode !== undefined;
  if (!place) {
    return hasPlace
      ? fail("season")
      : withDejaVu(withMaListe(base, record), record);
  }
  return withDejaVu(
    withMaListe(
      {
        ...base,
        season: asId(record.season, "season"),
        episode: asId(record.episode, "episode"),
      },
      record,
    ),
    record,
  );
}

function parseProduct(
  type: "fiche-mine" | "fiche-link",
  record: Record<string, unknown>,
): FicheMineMessage | FicheLinkMessage {
  onlyKeys(record, PRODUCT_KEYS, "message");
  return {
    type,
    contentId: asId(record.contentId, "contentId"),
    productId: asId(record.productId, "productId"),
  };
}

// A season a title can have, 1 to MAX_SEASON_COUNT: each season is one SensCritique read.
function asSeason(raw: unknown): number {
  const season = asId(raw, "season");
  return season <= MAX_SEASON_COUNT ? season : fail("season");
}

// The query trimmed, then a search query (isSearchQuery): a broken one costs no SensCritique slot.
function asQuery(raw: unknown): string {
  const query = asString(raw, "query").trim();
  return isSearchQuery(query) ? query : fail("query");
}

function parseSearch(record: Record<string, unknown>): FicheSearchMessage {
  onlyKeys(record, SEARCH_KEYS, "message");
  return {
    type: "fiche-search",
    contentId: asId(record.contentId, "contentId"),
    query: asQuery(record.query),
  };
}

export function parseFicheMessage(
  type: FicheType,
  record: Record<string, unknown>,
): FicheMessage {
  switch (type) {
    case "fiche-info":
      return parseInfo(record);
    case "fiche-season":
      onlyKeys(record, SEASON_KEYS, "message");
      return {
        type,
        contentId: asId(record.contentId, "contentId"),
        season: asSeason(record.season),
      };
    case "fiche-rate":
      return parseRate(record);
    case "fiche-undo":
      return parseUndo(record);
    case "fiche-remove":
      return parseRemove(record);
    case "fiche-search":
      return parseSearch(record);
    default:
      return parseProduct(type, record);
  }
}

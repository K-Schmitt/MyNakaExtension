// Reads which title page is open from Naka's own requests: the content the page loads
// (GET /api/v1/browse/by-tmdb/{movie|tv}/{n}, read from its answer, with a series' season count) and the season it opens
// (GET /api/v1/browse/{id}/season/{n}, read from the url alone). Pure: it reads a method, a url and an
// already-parsed JSON value, and touches no `fetch`, no `chrome.*` and no DOM. Anything it cannot read is
// "no event"; the bounds are the parser's.

import { MAX_YEAR, MIN_YEAR } from "../core/year-range";
import { PAGE_CHANNEL, type PageEvent, parsePageEvent } from "../ext/messages";

const NAKA_ORIGIN = "https://naka.cx";
const FICHE_PATH = /^\/api\/v1\/browse\/by-tmdb\/(?:movie|tv)\/[1-9][0-9]*$/;
const SEASON_PATH = /^\/api\/v1\/browse\/([1-9][0-9]*)\/season\/([1-9][0-9]*)$/;
const YEAR_PREFIX = /^(\d{4})-/;

// A GET on naka.cx: its path, or undefined.
function nakaGetPath(method: string, url: string): string | undefined {
  if (method.toUpperCase() !== "GET") return undefined;
  try {
    const target = new URL(url, NAKA_ORIGIN);
    return target.origin === NAKA_ORIGIN ? target.pathname : undefined;
  } catch {
    return undefined;
  }
}

/** A GET of exactly /api/v1/browse/by-tmdb/{movie|tv}/{n} on naka.cx. */
export function ficheRequest(method: string, url: string): boolean {
  const path = nakaGetPath(method, url);
  return path !== undefined && FICHE_PATH.test(path);
}

// The season event of a GET of exactly /api/v1/browse/{id}/season/{n}; the parser refuses unsafe ids.
export function seasonRequest(
  method: string,
  url: string,
): PageEvent | undefined {
  const path = nakaGetPath(method, url);
  const found = path === undefined ? null : SEASON_PATH.exec(path);
  if (found === null) return undefined;
  return parsePageEvent({
    channel: PAGE_CHANNEL,
    kind: "season",
    contentId: Number(found[1]),
    season: Number(found[2]),
  });
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// An absent or empty original title is left out; a present one goes to the parser as it is.
function originalTitleOf(raw: unknown): unknown {
  return raw === null || raw === "" ? undefined : raw;
}

// The year of an ISO release date inside the parser's bounds; anything else is left out.
function yearOf(releaseDate: unknown): number | undefined {
  if (typeof releaseDate !== "string") return undefined;
  const found = YEAR_PREFIX.exec(releaseDate);
  const year = found === null ? Number.NaN : Number(found[1]);
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : undefined;
}

function readFiche(answer: unknown): PageEvent | undefined {
  const content = asObject(answer);
  if (content === undefined) return undefined;
  return parsePageEvent({
    channel: PAGE_CHANNEL,
    kind: "fiche",
    contentId: content.id,
    tmdbId: content.tmdbId,
    mediaType: content.mediaType,
    title: content.title,
    originalTitle: originalTitleOf(content.originalTitle),
    year: yearOf(content.releaseDate),
    numberOfSeasons: content.numberOfSeasons,
  });
}

// The answer is the page's: a getter on it may throw, and that is "no event".
export function ficheEvent(answer: unknown): PageEvent | undefined {
  try {
    return readFiche(answer);
  } catch {
    return undefined;
  }
}

// Reads where the credits start from Naka's own skip-segments request and its answer. Pure: it reads a
// method, a url and an already-parsed JSON value, and touches no `fetch`, no `chrome.*` and no DOM.
// From the url it reads `type`, `season` and `episode`, never `tmdbId`. Anything it cannot read is "no event".

import { PAGE_CHANNEL, type PageEvent, parsePageEvent } from "../ext/messages";

const NAKA_ORIGIN = "https://naka.cx";
const SEGMENTS_PATH = "/api/v1/skip-segments";
const READ_PARAMS = ["type", "season", "episode"];
const POSITIVE_INT = /^[1-9][0-9]*$/;

/** The episode a skip-segments request asks about; empty for a film. */
export type CreditsQuery = { season?: number; episode?: number };

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url, NAKA_ORIGIN);
  } catch {
    return undefined;
  }
}

function positiveInt(raw: string | null): number | undefined {
  if (raw === null || !POSITIVE_INT.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

// A parameter we read that appears twice is ambiguous: the request is not read.
function hasRepeatedParam(params: URLSearchParams): boolean {
  return READ_PARAMS.some((name) => params.getAll(name).length > 1);
}

function episodeOf(params: URLSearchParams): CreditsQuery | undefined {
  const season = positiveInt(params.get("season"));
  const episode = positiveInt(params.get("episode"));
  if (season === undefined || episode === undefined) return undefined;
  return { season, episode };
}

function queryOf(params: URLSearchParams): CreditsQuery | undefined {
  if (hasRepeatedParam(params)) return undefined;
  const type = params.get("type");
  if (type === "movie") return {};
  return type === "tv" ? episodeOf(params) : undefined;
}

// A GET of exactly /api/v1/skip-segments on naka.cx: the content it asks about, or undefined.
export function creditsRequest(
  method: string,
  url: string,
): CreditsQuery | undefined {
  const target = parseUrl(url);
  if (target === undefined || target.origin !== NAKA_ORIGIN) return undefined;
  if (method.toUpperCase() !== "GET") return undefined;
  if (target.pathname !== SEGMENTS_PATH) return undefined;
  return queryOf(target.searchParams);
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// `segments.credits[0].startMs` of an answer that found data (`hit: true`).
function creditsStart(answer: unknown): unknown {
  const record = asObject(answer);
  if (record?.hit !== true) return undefined;
  const credits = asObject(record.segments)?.credits;
  if (!Array.isArray(credits)) return undefined;
  return asObject(credits[0])?.startMs;
}

// The answer is the page's: a getter on it may throw, and that is "no event". The parser checks the bounds.
export function creditsEvent(
  query: CreditsQuery,
  answer: unknown,
): PageEvent | undefined {
  try {
    return parsePageEvent({
      channel: PAGE_CHANNEL,
      kind: "credits",
      startMs: creditsStart(answer),
      ...query,
    });
  } catch {
    return undefined;
  }
}

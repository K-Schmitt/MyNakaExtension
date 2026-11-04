// What the isolated script trusts from the Naka page: the events the MAIN world posts, and the player
// URL that says what is playing. Pure: no `chrome.*`, no DOM; the caller passes its own window as `self`.

import { type PageEvent, parsePageEvent } from "../ext/messages";

const NAKA_ORIGIN = "https://naka.cx";
const PLAYER_PATH = "/player";
const POSITIVE_INT = /^[1-9][0-9]*$/;

export type PlayerContext = {
  contentId: number;
  mediaType: "movie" | "tv";
  season?: number;
  episode?: number;
};

// A message from this window, from naka.cx, on our channel and of a known shape. A missing `self` never
// matches a missing `source`.
export function acceptPageEvent(
  ev: { source: unknown; origin: string; data: unknown },
  self: unknown,
): PageEvent | undefined {
  if (self === undefined || self === null || ev.source !== self) {
    return undefined;
  }
  if (ev.origin !== NAKA_ORIGIN) return undefined;
  return parsePageEvent(ev.data);
}

function positiveInt(raw: string | null): number | undefined {
  if (raw === null || !POSITIVE_INT.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

function parseHref(href: string): URL | undefined {
  try {
    return new URL(href);
  } catch {
    return undefined;
  }
}

function episodeOf(
  params: URLSearchParams,
  contentId: number,
): PlayerContext | undefined {
  const season = positiveInt(params.get("season"));
  const episode = positiveInt(params.get("episode"));
  if (season === undefined || episode === undefined) return undefined;
  return { contentId, mediaType: "tv", season, episode };
}

// `id` is the Naka contentId. A /content/... page carries a TMDB id and is never read here.
export function parsePlayerUrl(href: string): PlayerContext | undefined {
  const url = parseHref(href);
  if (url === undefined || url.origin !== NAKA_ORIGIN) return undefined;
  if (url.pathname !== PLAYER_PATH) return undefined;
  const contentId = positiveInt(url.searchParams.get("id"));
  if (contentId === undefined) return undefined;
  const type = url.searchParams.get("type");
  if (type === "movie") return { contentId, mediaType: "movie" };
  return type === "tv" ? episodeOf(url.searchParams, contentId) : undefined;
}

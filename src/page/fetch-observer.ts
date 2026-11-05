// Classifies one request of the Naka page into a PageEvent. Pure: it reads a method, a url and a body,
// and touches no `fetch`, no `chrome.*` and no DOM. Anything it cannot read is "no event".

import { PAGE_CHANNEL, type PageEvent, parsePageEvent } from "../ext/messages";

const NAKA_ORIGIN = "https://naka.cx";
const PLAYLIST_PATH = "/api/v1/playlist";
const PLAYLIST_ITEM = /^\/api\/v1\/playlist\/([^/]+)$/;
const CONTENT_ID = /^[1-9][0-9]*$/;
const WATCHED_PATH = "/api/v1/history/watched";

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url, NAKA_ORIGIN);
  } catch {
    return undefined;
  }
}

// The body is a JSON string, an already-parsed object, or absent.
function bodyRecord(body: unknown): Record<string, unknown> | undefined {
  let value = body;
  if (typeof body === "string") {
    try {
      value = JSON.parse(body);
    } catch {
      return undefined;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function isPlaylistChange(method: string, path: string): boolean {
  if (method === "POST") return path === PLAYLIST_PATH;
  return method === "DELETE" && PLAYLIST_ITEM.test(path);
}

// The id of a title removed from « Ma liste »: the last segment of DELETE /playlist/<contentId>, when it is
// a plain positive integer. Any other segment is a playlist change with no id.
function removedId(path: string): number | undefined {
  const segment = PLAYLIST_ITEM.exec(path)?.[1];
  if (segment === undefined || !CONTENT_ID.test(segment)) return undefined;
  const id = Number(segment);
  return Number.isSafeInteger(id) ? id : undefined;
}

function playlistEvent(method: string, path: string): PageEvent {
  const removed = method === "DELETE" ? removedId(path) : undefined;
  return {
    channel: PAGE_CHANNEL,
    kind: "playlist",
    ...(removed === undefined ? {} : { removed }),
  };
}

// A null season or episode is an absent one.
function orAbsent(value: unknown): unknown {
  return value === null ? undefined : value;
}

// Ticking and unticking « vu » are the same call: `watched` is true or false, nothing else counts.
function readWatched(body: unknown): PageEvent | undefined {
  const record = bodyRecord(body);
  if (record === undefined) return undefined;
  if (record.watched !== true && record.watched !== false) return undefined;
  return parsePageEvent({
    channel: PAGE_CHANNEL,
    kind: record.watched ? "watched" : "unwatched",
    contentId: record.contentId,
    season: orAbsent(record.seasonNumber),
    episode: orAbsent(record.episodeNumber),
  });
}

// The body belongs to the page: a getter or a proxy on it may throw, and that is "no event".
function classifyWatched(body: unknown): PageEvent | undefined {
  try {
    return readWatched(body);
  } catch {
    return undefined;
  }
}

export function classifyRequest(
  method: string,
  url: string,
  body: unknown,
): PageEvent | undefined {
  const target = parseUrl(url);
  if (target === undefined || target.origin !== NAKA_ORIGIN) return undefined;
  const verb = method.toUpperCase();
  if (isPlaylistChange(verb, target.pathname)) {
    return playlistEvent(verb, target.pathname);
  }
  if (verb === "PUT" && target.pathname === WATCHED_PATH) {
    return classifyWatched(body);
  }
  return undefined;
}

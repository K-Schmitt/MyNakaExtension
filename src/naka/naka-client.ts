// Client for the Naka API (https://naka.cx/api/v1): the owner's playlist and the catalogue.
//
// deps.token() is called once per public call, after the input guards, never at construction and never
// cached. The token lives in a local variable of that call and goes only to naka-transport's `send`, in the
// `authorization` header. See naka-transport.ts for the rules on the wire and in error messages.

import { checkQuery } from "../core/search-query";
import { NakaUnavailableError } from "./naka-errors";
import { checkContentId } from "./naka-input";
import { type NakaItem, toItem, toItems, toPlaylistIds } from "./naka-items";
import { type NakaSeasons, toSeasons } from "./naka-seasons";
import {
  isRecord,
  type NakaDeps,
  parseJson,
  type Request,
  readToken,
  send,
} from "./naka-transport";

export type { Fetch } from "../core/fetch-type";
export { NakaUnavailableError } from "./naka-errors";
export type { NakaItem } from "./naka-items";
export type { NakaSeasons } from "./naka-seasons";

export type NakaClient = {
  playlistIds(): Promise<number[]>;
  addToPlaylist(contentId: number): Promise<void>;
  removeFromPlaylist(contentId: number): Promise<void>;
  search(query: string): Promise<NakaItem[]>;
  contentById(contentId: number): Promise<NakaItem | undefined>;
  availableSeasons(contentId: number): Promise<NakaSeasons | undefined>;
};

async function run(deps: NakaDeps, request: Request): Promise<string> {
  return send(deps.fetch, readToken(deps), request);
}

async function playlistIds(deps: NakaDeps): Promise<number[]> {
  const text = await run(deps, {
    method: "GET",
    path: "/playlist/ids",
    label: "playlist",
  });
  return toPlaylistIds(parseJson(text, "playlist"));
}

async function addToPlaylist(deps: NakaDeps, contentId: number) {
  checkContentId(contentId);
  await run(deps, {
    method: "POST",
    path: "/playlist",
    label: "add to playlist",
    body: { contentId },
  });
}

async function removeFromPlaylist(deps: NakaDeps, contentId: number) {
  checkContentId(contentId);
  await run(deps, {
    method: "DELETE",
    path: `/playlist/${contentId}`,
    label: "remove from playlist",
  });
}

async function search(deps: NakaDeps, query: string): Promise<NakaItem[]> {
  const trimmed = checkQuery(query);
  const text = await run(deps, {
    method: "GET",
    path: `/browse/search?q=${encodeURIComponent(trimmed)}`,
    label: "search",
  });
  return toItems(parseJson(text, "search"));
}

// 404 means "not in the catalogue". The body is the bare entry or wrapped in `data`.
async function contentById(
  deps: NakaDeps,
  contentId: number,
): Promise<NakaItem | undefined> {
  checkContentId(contentId);
  let text: string;
  try {
    text = await run(deps, {
      method: "GET",
      path: `/browse/${contentId}`,
      label: "content",
    });
  } catch (error) {
    if (error instanceof NakaUnavailableError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
  // A 200 that holds no entry is unreadable, not « not in the catalogue » (that is the 404 above).
  const entry = unwrap(parseJson(text, "content"));
  if (!isRecord(entry)) {
    throw new NakaUnavailableError("Naka content: unexpected response");
  }
  const item = toItem(entry);
  if (item !== undefined && item.contentId !== contentId) {
    throw new NakaUnavailableError("Naka content: unexpected item");
  }
  return item;
}

// 404 and an answer that does not parse both mean "no season list": the caller keeps its fallback.
async function availableSeasons(
  deps: NakaDeps,
  contentId: number,
): Promise<NakaSeasons | undefined> {
  checkContentId(contentId);
  let text: string;
  try {
    text = await run(deps, {
      method: "GET",
      path: `/browse/${contentId}/available-seasons`,
      label: "seasons",
    });
  } catch (error) {
    if (error instanceof NakaUnavailableError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
  return toSeasons(parseJson(text, "seasons"));
}

// The entry is the bare object, or the `data` object of a wrapper that has no `id` of its own.
function unwrap(json: unknown): unknown {
  if (isRecord(json) && !("id" in json)) {
    return json.data;
  }
  return json;
}

export function createNakaClient(deps: NakaDeps): NakaClient {
  return {
    playlistIds: () => playlistIds(deps),
    addToPlaylist: (contentId) => addToPlaylist(deps, contentId),
    removeFromPlaylist: (contentId) => removeFromPlaylist(deps, contentId),
    search: (query) => search(deps, query),
    contentById: (contentId) => contentById(deps, contentId),
    availableSeasons: (contentId) => availableSeasons(deps, contentId),
  };
}

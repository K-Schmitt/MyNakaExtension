// Test-only fakes for the worker suites: SensCritique and Naka clients that log every call, a limiter that
// logs every slot, and a store over an in-memory storage area (the REAL store and its validation).
import type { RateLimiter } from "../src/core/rate-limiter";
import { createStore, type StorageArea } from "../src/ext/store";
import type { NakaClient, NakaItem } from "../src/naka/naka-client";
import type { ScClient } from "../src/sc/sc-client";
import type { ScWishItem } from "../src/sc/wishlist-page";

export function countingLimiter(calls: string[], name: string): RateLimiter {
  return {
    run: async (task) => {
      calls.push(`limit:${name}`);
      return task();
    },
  };
}

export const filmItem = (id: number, year = 2001): ScWishItem => ({
  productId: id,
  title: `Film ${id}`,
  url: `/film/x/${id}`,
  universe: 1,
  year,
});

export const seriesItem = (id: number): ScWishItem => ({
  productId: id,
  title: `Serie ${id}`,
  url: `/serie/x/${id}`,
  universe: 4,
});

export const nakaItem = (
  id: number,
  mediaType: "movie" | "tv" = "movie",
): NakaItem => ({
  contentId: id,
  tmdbId: 9000 + id,
  mediaType,
  title: `Titre ${id}`,
  originalTitle: `Original ${id}`,
  releaseDate: "2004-06-01",
});

export function fakeSc(over: Partial<ScClient> = {}) {
  const calls: string[] = [];
  const base: ScClient = {
    wish: async () => undefined,
    unwish: async () => undefined,
    markDone: async () => undefined,
    unmarkDone: async () => undefined,
    rate: async () => undefined,
    productState: async () => ({
      isDone: false,
      isWished: false,
      universe: 1,
      rating: null,
    }),
    readWishlist: async () => [],
    search: async () => [],
    seasonInfo: async () => ({ episodes: [] }),
    ...over,
  };
  const client: ScClient = {
    wish: (id) => {
      calls.push(`wish:${id}`);
      return base.wish(id);
    },
    unwish: (id) => {
      calls.push(`unwish:${id}`);
      return base.unwish(id);
    },
    markDone: (id, date) => {
      calls.push(`markDone:${id}:${date}`);
      return base.markDone(id, date);
    },
    unmarkDone: (id) => {
      calls.push(`unmarkDone:${id}`);
      return base.unmarkDone(id);
    },
    rate: (id, rating) => {
      calls.push(`rate:${id}:${rating}`);
      return base.rate(id, rating);
    },
    productState: (id) => {
      calls.push(`productState:${id}`);
      return base.productState(id);
    },
    readWishlist: (universe) => {
      calls.push(`readWishlist:${universe}`);
      return base.readWishlist(universe);
    },
    search: (q, universe) => {
      calls.push(`search:${universe}:${q}`);
      return base.search(q, universe);
    },
    seasonInfo: (id, season) => {
      calls.push(`seasonInfo:${id}:${season}`);
      return base.seasonInfo(id, season);
    },
  };
  return { client, calls };
}

export function fakeNaka(over: Partial<NakaClient> = {}) {
  const calls: string[] = [];
  const base: NakaClient = {
    playlistIds: async () => [],
    addToPlaylist: async () => undefined,
    removeFromPlaylist: async () => undefined,
    search: async () => [],
    contentById: async () => undefined,
    availableSeasons: async () => undefined,
    ...over,
  };
  const client: NakaClient = {
    playlistIds: () => {
      calls.push("playlistIds");
      return base.playlistIds();
    },
    addToPlaylist: (id) => {
      calls.push(`addToPlaylist:${id}`);
      return base.addToPlaylist(id);
    },
    removeFromPlaylist: (id) => {
      calls.push(`removeFromPlaylist:${id}`);
      return base.removeFromPlaylist(id);
    },
    search: (q) => {
      calls.push(`search:${q}`);
      return base.search(q);
    },
    contentById: (id) => {
      calls.push(`contentById:${id}`);
      return base.contentById(id);
    },
    availableSeasons: (id) => {
      calls.push(`availableSeasons:${id}`);
      return base.availableSeasons(id);
    },
  };
  return { client, calls };
}

// chrome.storage.local in memory: values are copied in and out, as structured clone does. Every read key
// and every write is logged, in order.
export function memoryArea(): StorageArea & {
  data: Map<string, unknown>;
  sets: Record<string, unknown>[];
  ops: string[];
} {
  const data = new Map<string, unknown>();
  const sets: Record<string, unknown>[] = [];
  const ops: string[] = [];
  return {
    data,
    sets,
    ops,
    get: async (key) => {
      ops.push(`get:${key}`);
      return data.has(key) ? { [key]: structuredClone(data.get(key)) } : {};
    },
    set: async (items) => {
      ops.push(`set:${Object.keys(items).join(",")}`);
      sets.push(structuredClone(items));
      for (const [key, value] of Object.entries(items)) {
        data.set(key, structuredClone(value));
      }
    },
  };
}

export function memoryStore() {
  const area = memoryArea();
  return { area, store: createStore(area) };
}

export async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected the call to reject with an Error");
}

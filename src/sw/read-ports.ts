// The reads a job makes on both sites, as the core's sync ports expect them. Searches and Naka content reads
// take a slot of their site's limiter (shared by every job); the wishlist and the playlist do not.

import {
  nakaToCandidate,
  nakaToTitled,
  scToCandidate,
  scToTitled,
} from "../core/adapt-titles";
import type { RateLimiter } from "../core/rate-limiter";
import type { Candidate, Titled } from "../core/title-match";
import type { NakaClient, NakaItem } from "../naka/naka-client";
import type { ScClient } from "../sc/sc-client";
import type { ScWishItem } from "../sc/wishlist-page";

export type SiteLimiters = { naka: RateLimiter; sc: RateLimiter };

// The port carries no type, so it searches both universes, one slot each; matchTitle filters by type.
export async function searchScBoth(
  sc: ScClient,
  limiter: RateLimiter,
  q: string,
): Promise<Candidate[]> {
  const films = await limiter.run(() => sc.search(q, "movie"));
  const series = await limiter.run(() => sc.search(q, "tvShow"));
  return [...films, ...series].flatMap((item) => scToCandidate(item) ?? []);
}

export async function searchNakaCandidates(
  naka: NakaClient,
  limiter: RateLimiter,
  q: string,
): Promise<Candidate[]> {
  const items = await limiter.run(() => naka.search(q));
  return items.map(nakaToCandidate);
}

export function readNakaItem(
  naka: NakaClient,
  limiter: RateLimiter,
  id: number,
): Promise<NakaItem | undefined> {
  return limiter.run(() => naka.contentById(id));
}

export async function readNakaTitle(
  naka: NakaClient,
  limiter: RateLimiter,
  id: number,
): Promise<Titled | undefined> {
  const item = await readNakaItem(naka, limiter, id);
  return item === undefined ? undefined : nakaToTitled(item);
}

// What each id gave during the job, so that no title is read twice. A failure is not kept.
export function remembered<R>(
  read: (id: number) => Promise<R>,
): (id: number) => Promise<R> {
  const seen = new Map<number, R>();
  return async (id) => {
    if (seen.has(id)) return seen.get(id) as R;
    const value = await read(id);
    seen.set(id, value);
    return value;
  };
}

export type Wishlist = {
  ids(): Promise<number[]>;
  describe(id: number): Titled | undefined;
};

// The owner's whole wishlist, films and series, or a rejection: half a list would read as removals. Its
// items describe the SensCritique ids for the rest of the job.
export function createWishlist(sc: ScClient): Wishlist {
  const items = new Map<number, ScWishItem>();
  return {
    async ids() {
      const films = await sc.readWishlist("movie");
      const series = await sc.readWishlist("tvShow");
      const all = [...films, ...series];
      for (const item of all) items.set(item.productId, item);
      return [...new Set(all.map((item) => item.productId))];
    },
    describe(id) {
      const item = items.get(id);
      return item === undefined ? undefined : scToTitled(item);
    },
  };
}

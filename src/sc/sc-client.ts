// Client for SensCritique: GraphQL calls on apollo.senscritique.com and the season page on www.senscritique.com.
//
// getSession() is called once per public call, never at construction and never cached. The auth token lives
// in a local variable of that call and goes only to sc-transport's `post` (Apollo POSTs); it is never sent to
// www.senscritique.com. See sc-transport.ts for the rules on the wire and in error messages.

import { ScUnauthenticatedError } from "./sc-errors";
import type { GQL } from "./sc-queries";
import {
  JSON_TYPE,
  post,
  type ScDeps,
  type ScSession,
  type Step,
  send,
  tokenOf,
} from "./sc-transport";
import { readWishlist, type WishUniverse } from "./sc-wishlist";
import {
  parseSeasonEpisodes,
  parseSeasonProductId,
  type ScEpisode,
  seasonUrl,
} from "./season-episodes";
import type { ScWishItem } from "./wishlist-page";

export { ScUnauthenticatedError, ScUnavailableError } from "./sc-errors";
export type { Fetch, ScDeps, ScSession } from "./sc-transport";

export type ScClient = {
  wish(productId: number): Promise<void>;
  unwish(productId: number): Promise<void>;
  markDone(productId: number, isoDate: string): Promise<void>;
  unmarkDone(productId: number): Promise<void>;
  rate(productId: number, rating: number): Promise<void>;
  readWishlist(universe: WishUniverse): Promise<ScWishItem[]>;
  seasonInfo(
    seriesProductId: number,
    season: number,
  ): Promise<{ seasonProductId?: number; episodes: ScEpisode[] }>;
};

type Operation = keyof typeof GQL;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireToken(session: ScSession): string {
  const token = tokenOf(session);
  if (token === undefined) throw new ScUnauthenticatedError();
  return token;
}

// A write needs a token. The steps run in order under one session read; the first failure stops them.
async function mutate(deps: ScDeps, steps: Step[]): Promise<void> {
  const token = requireToken(await deps.getSession());
  for (const step of steps) await post(deps.fetch, step, token);
}

function oneStep(deps: ScDeps, operationName: Operation, productId: number) {
  return mutate(deps, [{ operationName, variables: { productId } }]);
}

async function markDone(deps: ScDeps, productId: number, isoDate: string) {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError("date must look like YYYY-MM-DD");
  }
  await mutate(deps, [
    { operationName: "ProductDone", variables: { productId } },
    {
      operationName: "SetProductDateDone",
      variables: { productId, date: isoDate },
    },
  ]);
}

async function rate(deps: ScDeps, productId: number, rating: number) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    throw new RangeError("rating must be an integer from 1 to 10");
  }
  await mutate(deps, [
    { operationName: "ProductRate", variables: { productId, rating } },
  ]);
}

// The season page needs no token. The session is still read once, like for every public call.
async function seasonInfo(
  deps: ScDeps,
  seriesProductId: number,
  season: number,
) {
  await deps.getSession();
  const html = await send(
    deps.fetch,
    seasonUrl(seriesProductId, season),
    {
      method: "GET",
      headers: { "content-type": JSON_TYPE },
      credentials: "include",
    },
    "season page",
  );
  return {
    seasonProductId: parseSeasonProductId(html, seriesProductId, season),
    episodes: parseSeasonEpisodes(html, seriesProductId, season),
  };
}

export function createScClient(deps: ScDeps): ScClient {
  return {
    wish: (productId) => oneStep(deps, "ProductWish", productId),
    unwish: (productId) => oneStep(deps, "ProductUnwish", productId),
    markDone: (productId, isoDate) => markDone(deps, productId, isoDate),
    unmarkDone: (productId) => oneStep(deps, "ProductUndone", productId),
    rate: (productId, rating) => rate(deps, productId, rating),
    readWishlist: (universe) => readWishlist(deps, universe),
    seasonInfo: (seriesProductId, season) =>
      seasonInfo(deps, seriesProductId, season),
  };
}

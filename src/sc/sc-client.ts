// Client for SensCritique: GraphQL calls on apollo.senscritique.com and the season page on www.senscritique.com.
//
// getSession() is called once per public call that needs a session (seasonInfo reads none; search reads it
// only to send a token when there is one), never at
// construction and never cached. The auth token lives in a local variable of that call and goes only to
// sc-transport's `post` (Apollo POSTs); it is never sent to www.senscritique.com. See sc-transport.ts for the
// rules on the wire and in error messages.

import { ScUnauthenticatedError } from "./sc-errors";
import {
  checkIsoDate,
  checkProductId,
  checkRating,
  checkSeason,
} from "./sc-input";
import { type ProductState, readProductState } from "./sc-product-state";
import type { GQL } from "./sc-queries";
import { searchProducts } from "./sc-search";
import {
  post,
  readSession,
  type ScDeps,
  type ScSession,
  type Step,
  send,
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
export type { ProductState } from "./sc-product-state";
export type { Fetch, ScDeps, ScSession } from "./sc-transport";

export type ScClient = {
  wish(productId: number): Promise<void>;
  unwish(productId: number): Promise<void>;
  markDone(productId: number, isoDate: string): Promise<void>;
  unmarkDone(productId: number): Promise<void>;
  rate(productId: number, rating: number): Promise<void>;
  productState(productId: number): Promise<ProductState>;
  readWishlist(universe: WishUniverse): Promise<ScWishItem[]>;
  search(query: string, universe: WishUniverse): Promise<ScWishItem[]>;
  seasonInfo(
    seriesProductId: number,
    season: number,
  ): Promise<{ seasonProductId?: number; episodes: ScEpisode[] }>;
};

type Operation = keyof typeof GQL;

function requireToken(session: ScSession): string {
  if (session.token === undefined) throw new ScUnauthenticatedError();
  return session.token;
}

// A write needs a token. The steps run in order under one session read; the first failure stops them.
async function mutate(deps: ScDeps, steps: Step[]): Promise<void> {
  const token = requireToken(await readSession(deps));
  for (const step of steps) await post(deps.fetch, step, token);
}

async function oneStep(
  deps: ScDeps,
  operationName: Operation,
  productId: number,
) {
  checkProductId(productId);
  await mutate(deps, [{ operationName, variables: { productId } }]);
}

async function markDone(deps: ScDeps, productId: number, isoDate: string) {
  checkProductId(productId);
  checkIsoDate(isoDate);
  await mutate(deps, [
    { operationName: "ProductDone", variables: { productId } },
    {
      operationName: "SetProductDateDone",
      variables: { productId, date: isoDate },
    },
  ]);
}

async function rate(deps: ScDeps, productId: number, rating: number) {
  checkProductId(productId);
  checkRating(rating);
  await mutate(deps, [
    { operationName: "ProductRate", variables: { productId, rating } },
  ]);
}

// A read of the owner's own state on a product: it needs the token, under the same rules as a write.
async function productState(deps: ScDeps, productId: number) {
  checkProductId(productId);
  const token = requireToken(await readSession(deps));
  const envelope = await post(
    deps.fetch,
    { operationName: "ProductCurrentUserInfos", variables: { id: productId } },
    token,
  );
  return readProductState(envelope, productId);
}

// The season page is public: no session, no cookie, no header; a slug change may redirect.
async function seasonInfo(
  deps: ScDeps,
  seriesProductId: number,
  season: number,
) {
  checkProductId(seriesProductId);
  checkSeason(season);
  const html = await send(
    deps.fetch,
    seasonUrl(seriesProductId, season),
    {
      method: "GET",
      headers: {},
      credentials: "omit",
      redirect: "follow",
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
    productState: (productId) => productState(deps, productId),
    readWishlist: (universe) => readWishlist(deps, universe),
    search: (query, universe) => searchProducts(deps, query, universe),
    seasonInfo: (seriesProductId, season) =>
      seasonInfo(deps, seriesProductId, season),
  };
}

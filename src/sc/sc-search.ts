// Searches SensCritique products by title. Search is public (spec §5, probe 3: it answers without a token,
// with currentUserInfos null), so it reads no session and sends no authorization (Ruling 20): a sync of
// many titles makes no home-page read for its searches. Only the first page (16 results, by relevance) is
// read.

import { checkQuery } from "../core/search-query";
import { ScUnavailableError } from "./sc-errors";
import { UNIVERSE } from "./sc-queries";
import {
  type Envelope,
  type Fetch,
  isRecord,
  post,
  type Step,
} from "./sc-transport";
import type { WishUniverse } from "./sc-wishlist";
import { parseWishItem, type ScWishItem } from "./wishlist-page";

const PAGE_SIZE = 16;

// The Product.universe a result must have, whatever the filter did: games, seasons and episodes never pass.
const PRODUCT_UNIVERSE: Record<WishUniverse, number> = {
  movie: UNIVERSE.film,
  tvShow: UNIVERSE.serie,
};

function checkUniverse(value: WishUniverse): void {
  if (!Object.hasOwn(PRODUCT_UNIVERSE, value)) {
    throw new RangeError("universe must be movie or tvShow");
  }
}

function searchStep(query: string, universe: WishUniverse): Step {
  return {
    operationName: "SearchProductExplorer",
    variables: {
      query,
      filters: [{ identifier: "universe", termValues: [universe] }],
      sortBy: "RELEVANCE",
      limit: PAGE_SIZE,
      offset: 0,
    },
  };
}

function unreadable(what: string): ScUnavailableError {
  return new ScUnavailableError(`SensCritique SearchProductExplorer: ${what}`);
}

function entriesOf({ data }: Envelope): unknown[] {
  const result = data.searchProductExplorer;
  if (!isRecord(result) || !Array.isArray(result.items)) {
    throw unreadable("unreadable answer");
  }
  return result.items;
}

// Every entry must become an item before the filter runs: an unreadable entry means the answer cannot be trusted.
function parseAll(entries: unknown[]): ScWishItem[] {
  return entries.map((entry) => {
    const item = parseWishItem(entry);
    if (item === undefined) throw unreadable("unreadable item");
    return item;
  });
}

export async function searchProducts(
  fetch: Fetch,
  query: string,
  universe: WishUniverse,
): Promise<ScWishItem[]> {
  const trimmed = checkQuery(query);
  checkUniverse(universe);
  const envelope = await post(fetch, searchStep(trimmed, universe), undefined);
  const wanted = PRODUCT_UNIVERSE[universe];
  return parseAll(entriesOf(envelope)).filter((i) => i.universe === wanted);
}

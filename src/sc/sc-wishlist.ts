// Reads the owner's whole wishlist, page by page. A read is complete or it fails:
// a shorter list would make the sync believe the owner removed titles.

import { ScUnauthenticatedError, ScUnavailableError } from "./sc-errors";
import type { WISH_UNIVERSE } from "./sc-queries";
import {
  type Envelope,
  isRecord,
  post,
  readSession,
  type ScDeps,
  type Step,
} from "./sc-transport";
import {
  nextOffset,
  parseWishlistPage,
  type ScWishItem,
} from "./wishlist-page";

export type WishUniverse = (typeof WISH_UNIVERSE)[keyof typeof WISH_UNIVERSE];

type WishRead = {
  universe: WishUniverse;
  username: string;
  token: string | undefined;
};

const PAGE_SIZE = 18;
const MAX_PAGES = 500;

function wishlistStep({ universe, username }: WishRead, offset: number): Step {
  return {
    operationName: "UserCollection",
    variables: {
      action: "WISH",
      categoryId: null,
      gameSystemId: null,
      genreId: null,
      keywords: "",
      limit: PAGE_SIZE,
      offset,
      order: "LAST_ACTION_DESC",
      universe,
      username,
      yearDateDone: null,
      isCollection: true,
    },
  };
}

// The number of entries the page holds, or undefined for an unreadable page: an unreadable page is not
// an empty one, and the parser alone cannot tell them apart.
function entryCount({ data }: Envelope): number | undefined {
  if (!isRecord(data.user) || !isRecord(data.user.collection)) return undefined;
  const { products, total } = data.user.collection;
  const readable =
    Array.isArray(products) &&
    typeof total === "number" &&
    Number.isInteger(total) &&
    total >= 0;
  return readable ? products.length : undefined;
}

// Every entry of the page must become an item: a dropped entry (no positive id, title or url) would
// shorten the list.
async function readPage(
  deps: ScDeps,
  read: WishRead,
  offset: number,
): Promise<{ items: ScWishItem[]; total: number }> {
  const envelope = await post(
    deps.fetch,
    wishlistStep(read, offset),
    read.token,
  );
  const entries = entryCount(envelope);
  if (entries === undefined) {
    throw new ScUnavailableError(
      "SensCritique UserCollection: unreadable page",
    );
  }
  const page = parseWishlistPage(envelope);
  if (page.items.length !== entries) {
    throw new ScUnavailableError(
      "SensCritique UserCollection: unreadable entry",
    );
  }
  return page;
}

function checkComplete(items: readonly ScWishItem[], total: number): void {
  if (items.length !== total) {
    throw new ScUnavailableError(
      "SensCritique UserCollection: item count differs from the total",
    );
  }
}

// A public profile can be read without a token, so the token is sent only when there is one.
// The total of the first page fixes the plan; a later page that disagrees means the list changed
// during the read, and a read whose items do not add up to that total is short or padded: both fail
// closed (the next run retries).
export async function readWishlist(
  deps: ScDeps,
  universe: WishUniverse,
): Promise<ScWishItem[]> {
  const session = await readSession(deps);
  if (!session.username) throw new ScUnauthenticatedError();
  const read = {
    universe,
    username: session.username,
    token: session.token,
  };
  const items: ScWishItem[] = [];
  let offset = 0;
  let total: number | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const got = await readPage(deps, read, offset);
    total ??= got.total;
    if (got.total !== total) {
      throw new ScUnavailableError(
        "SensCritique UserCollection: list changed during the read",
      );
    }
    const next = nextOffset(offset, PAGE_SIZE, total);
    if (got.items.length === 0 && next !== undefined) {
      throw new ScUnavailableError(
        "SensCritique UserCollection: incomplete read",
      );
    }
    for (const item of got.items) items.push(item);
    if (next === undefined) {
      checkComplete(items, total);
      return items;
    }
    offset = next;
  }
  throw new ScUnavailableError("SensCritique UserCollection: too many pages");
}

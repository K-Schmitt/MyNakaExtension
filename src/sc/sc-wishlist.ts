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

// An unreadable page is not an empty one: the parser alone cannot tell them apart.
function isReadablePage({ data }: Envelope): boolean {
  if (!isRecord(data.user) || !isRecord(data.user.collection)) return false;
  const { products, total } = data.user.collection;
  return (
    Array.isArray(products) &&
    typeof total === "number" &&
    Number.isInteger(total) &&
    total >= 0
  );
}

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
  if (!isReadablePage(envelope)) {
    throw new ScUnavailableError(
      "SensCritique UserCollection: unreadable page",
    );
  }
  return parseWishlistPage(envelope);
}

// A public profile can be read without a token, so the token is sent only when there is one.
// The total of the first page fixes the plan; a later page that disagrees means the list changed
// during the read, which fails closed (the next run retries).
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
    if (next === undefined) return items;
    offset = next;
  }
  throw new ScUnavailableError("SensCritique UserCollection: too many pages");
}

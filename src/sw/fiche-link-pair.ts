// The link a star click confirms (Q11): a title with no mapping pair is linked to the product it showed
// (upsertMapping), before the rating. A title already mapped to ANOTHER product (a sync changed it since
// the page was answered) is refused, with nothing saved: the star would rate what the page did not show.

import type { Pair } from "../core/list-diff";
import { upsertMapping } from "../core/state";
import type { Store } from "../ext/store";
import { NotIssuedError } from "./fiche-mine-job";

export async function linkForRating(
  store: Pick<Store, "loadState" | "saveState">,
  pair: Pair,
): Promise<void> {
  const state = await store.loadState();
  const mapped = state.mapping.find((known) => known.nakaId === pair.nakaId);
  if (mapped?.scId === pair.scId) return;
  if (mapped !== undefined) throw new NotIssuedError();
  await store.saveState(upsertMapping(state, pair));
}

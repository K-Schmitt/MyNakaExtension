// The link a star click confirms (Q11), checked like a link by hand before any request. Refused, with
// nothing saved, when the content is mapped to another product (a sync changed it since the page was
// answered), when the product is mapped to another content, or when a settled pair holds either side
// (heldBySettled: the sync would skip both pairs forever). A title already linked to that product is
// kept as it is. A title that is unlinked or has an open question takes linkByHand's transition (the
// entry goes, the question is resolved); any other gets the bare mapping pair. Like the status page's
// link (link-job.ts), it hands back the finish that waited on the resolved question, for the caller to run.

import type { FinishedMessage } from "../content/playback-tracker";
import type { Pair } from "../core/list-diff";
import { heldBySettled, linkByHand, openAmbiguity } from "../core/questions";
import { type SyncState, samePair, upsertMapping } from "../core/state";
import type { Store } from "../ext/store";
import { finishWaitingOn } from "./answer-jobs";

export class LinkRefusedError extends Error {
  constructor() {
    super("fiche: the link conflicts with a stored pair");
  }
}

function conflicts(state: SyncState, pair: Pair): boolean {
  const other = state.mapping.some(
    (known) =>
      (known.nakaId === pair.nakaId || known.scId === pair.scId) &&
      !samePair(known, pair),
  );
  return other || heldBySettled(state, pair);
}

function linked(state: SyncState, pair: Pair): SyncState {
  const byHand = linkByHand(state, "naka", pair.nakaId, pair.scId);
  return byHand ?? upsertMapping(state, pair);
}

export async function linkForRating(
  store: Pick<Store, "loadState" | "saveState">,
  pair: Pair,
): Promise<FinishedMessage | undefined> {
  const state = await store.loadState();
  if (conflicts(state, pair)) throw new LinkRefusedError();
  if (state.mapping.some((known) => samePair(known, pair))) return undefined;
  await store.saveState(linked(state, pair));
  return finishWaitingOn(openAmbiguity(state, "naka", pair.nakaId));
}

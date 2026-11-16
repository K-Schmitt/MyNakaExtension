import { closeRemoval } from "./questions";
import { type SyncState, samePair } from "./state";

type Lists = { naka: readonly number[]; sc: readonly number[] };

// A « retrait sans objet » (removal with no object left), extended to a title that came back: a removal whose
// pair is in both lists, or in neither, has nothing left to confirm. Only a pair still mapped as it is: a
// superseded or unmapped pair keeps its removal, the memory of the owner's removal.
export function closeMootRemovals(state: SyncState, lists: Lists): SyncState {
  const inNaka = new Set(lists.naka);
  const inSc = new Set(lists.sc);
  return state.pending.reduce((current, item) => {
    if (item.kind !== "removal") return current;
    if (!state.mapping.some((m) => samePair(m, item.pair))) return current;
    const moot = inNaka.has(item.pair.nakaId) === inSc.has(item.pair.scId);
    return moot ? closeRemoval(current, item.pair) : current;
  }, state);
}

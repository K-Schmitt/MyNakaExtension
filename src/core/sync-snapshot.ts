import type { Pair } from "./list-diff";
import { type SyncState, setSnapshot } from "./state";

export const pairKey = (pair: Pair): string => `${pair.nakaId}:${pair.scId}`;

export function pendingRemovalPairs(state: SyncState): Pair[] {
  return state.pending.flatMap((item) =>
    item.kind === "removal" ? [item.pair] : [],
  );
}

// A known pair (snapshotted, or seen together) the planner skipped (conflicted,
// settled) and that is still mapped and on one side must stay known: if it
// dropped out, it would be treated as an addition once the skip ends.
export function nextSnapshot(
  state: SyncState,
  known: readonly Pair[],
  lists: { naka: number[]; sc: number[] },
): SyncState {
  const inNaka = new Set(lists.naka);
  const inSc = new Set(lists.sc);
  const both = state.mapping.filter(
    (pair) => inNaka.has(pair.nakaId) && inSc.has(pair.scId),
  );
  const carried = known.filter(
    (pair) =>
      state.mapping.some((m) => pairKey(m) === pairKey(pair)) &&
      (inNaka.has(pair.nakaId) || inSc.has(pair.scId)),
  );
  return setSnapshot(state, [
    ...both,
    ...pendingRemovalPairs(state),
    ...carried,
  ]);
}

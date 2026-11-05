// Whether a mapped pair was listed on both sides at the last completed run: the condition under which
// the owner's removal on one side is a real removal and not an addition still waiting for the other.
// A mapped pair that waits for its Naka addition (a deferred write) is one-sided and never was in « Ma
// liste », so a removal of it is not one. Pure: it reads the presence and the snapshot as stored.

import type { Pair } from "./list-diff";
import type { PresenceEntry } from "./presence";
import { type SyncState, samePair } from "./state";

const listedAt = (entries: readonly PresenceEntry[], id: number, run: number) =>
  entries.some((entry) => entry.id === id && entry.to === run);

/**
 * SensCritique listed it at the last run, and Naka listed it too or the sync's own "both listed"
 * condition holds (the pair is in the snapshot, `nextSnapshot` of the sync).
 */
export function listedOnBothAtLastRun(state: SyncState, pair: Pair): boolean {
  const { run, presence } = state;
  if (run === 0 || !listedAt(presence.sc, pair.scId, run)) return false;
  return (
    listedAt(presence.naka, pair.nakaId, run) ||
    state.snapshot.some((known) => samePair(known, pair))
  );
}

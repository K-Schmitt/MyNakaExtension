// Whether a mapped pair was listed on both sides at the last completed run: the condition under which
// the owner's removal on one side is a real removal and not an addition still waiting for the other.
// A mapped pair that waits for its Naka addition (a deferred write) is one-sided and never was in « Ma
// liste », so a removal of it is not one. Pure: it reads the presence as stored. Every completed run
// records every id of both final lists, so a pair listed on both has both intervals ending at `run`. The
// snapshot is no evidence: it also carries pairs kept for a pending removal or a settled pair, which may be
// stale (a fuzz test found the case).

import type { Pair } from "./list-diff";
import type { PresenceEntry } from "./presence";
import type { SyncState } from "./state";

const listedAt = (entries: readonly PresenceEntry[], id: number, run: number) =>
  entries.some((entry) => entry.id === id && entry.to === run);

/** Both sides' presence intervals for the pair end at the last completed run. */
export function listedOnBothAtLastRun(state: SyncState, pair: Pair): boolean {
  const { run, presence } = state;
  if (run === 0) return false;
  return (
    listedAt(presence.sc, pair.scId, run) &&
    listedAt(presence.naka, pair.nakaId, run)
  );
}

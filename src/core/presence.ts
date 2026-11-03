// Where each id was in its list, run by run. For each side, an id keeps the latest contiguous interval of
// COMPLETED runs whose final list held it, mapped or not. Two ids "were together" when both were in their
// lists at the end of the same completed run, during the CURRENT period of each. A pair mapped only after
// such a run (the resolution cap, a failed search or an open question delayed it) is then known to the
// planner as if it had been snapshotted, so a later one-sided state is the owner removing one side: a
// question, never an addition. Pure: no port, no clock.

import type { Pair } from "./list-diff";

export type PresenceEntry = { id: number; from: number; to: number };
export type Presence = { naka: PresenceEntry[]; sc: PresenceEntry[] };

const pairKey = (pair: Pair): string => `${pair.nakaId}:${pair.scId}`;

// An id present at the end of `run` extends an interval that reached the previous run, else starts one.
function extend(entry: PresenceEntry, run: number): PresenceEntry {
  return entry.to === run - 1
    ? { id: entry.id, from: entry.from, to: run }
    : { id: entry.id, from: run, to: run };
}

// An absent id keeps its latest interval, mapped or not: the owner may later pair it with another title
// it was seen with.
function nextSide(
  entries: readonly PresenceEntry[],
  run: number,
  listed: readonly number[],
): PresenceEntry[] {
  const present = new Set(listed);
  const known = new Set(entries.map((entry) => entry.id));
  const kept = entries.map((entry) =>
    present.has(entry.id) ? extend(entry, run) : entry,
  );
  const fresh = [...present]
    .filter((id) => !known.has(id))
    .map((id) => ({ id, from: run, to: run }));
  return [...kept, ...fresh];
}

type Lists = { naka: readonly number[]; sc: readonly number[] };

// The presence after completed run number `run`, from that run's final lists.
export function nextPresence(
  presence: Presence,
  run: number,
  lists: Lists,
): Presence {
  return {
    naka: nextSide(presence.naka, run, lists.naka),
    sc: nextSide(presence.sc, run, lists.sc),
  };
}

function byId(entries: readonly PresenceEntry[]): Map<number, PresenceEntry> {
  const index = new Map<number, PresenceEntry>();
  for (const entry of entries) {
    if (!index.has(entry.id)) index.set(entry.id, entry);
  }
  return index;
}

// The interval an id counts with. An id present in this run's lists counts only through its current
// period, one that was still open at the end of the last completed run; one re-added after an absence
// has no interval yet (its stored one is a previous period). An absent id counts through its latest one.
function counted(
  entry: PresenceEntry | undefined,
  present: ReadonlySet<number>,
  lastRun: number,
): PresenceEntry | undefined {
  if (entry === undefined) return undefined;
  return present.has(entry.id) && entry.to !== lastRun ? undefined : entry;
}

function overlap(a: PresenceEntry | undefined, b: PresenceEntry | undefined) {
  if (a === undefined || b === undefined) return false;
  return Math.max(a.from, b.from) <= Math.min(a.to, b.to);
}

// The snapshot the planner reads: the stored one, then every mapped pair not in it whose two ids were
// seen together. `loaded` is the presence and run counter as LOADED (completed runs only); `lists` are
// this run's lists, read before any write.
export function withPairsSeenTogether(
  snapshot: readonly Pair[],
  mapping: readonly Pair[],
  loaded: { presence: Presence; run: number },
  lists: Lists,
): Pair[] {
  const stored = new Set(snapshot.map(pairKey));
  const naka = byId(loaded.presence.naka);
  const sc = byId(loaded.presence.sc);
  const inNaka = new Set(lists.naka);
  const inSc = new Set(lists.sc);
  const late = mapping.filter(
    (pair) =>
      !stored.has(pairKey(pair)) &&
      overlap(
        counted(naka.get(pair.nakaId), inNaka, loaded.run),
        counted(sc.get(pair.scId), inSc, loaded.run),
      ),
  );
  return [...snapshot, ...late];
}

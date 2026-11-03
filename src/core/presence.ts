// Where each id was in its list, run by run. For each side, an id keeps the latest contiguous interval of
// COMPLETED runs whose final list held it. Two ids "were together" when their intervals overlap: both were
// in their lists at the end of the same completed run. A pair mapped only after such a run (the resolution
// cap, a failed search or an open question delayed it) is then known to the planner as if it had been
// snapshotted, so a later one-sided state is the owner removing one side: a question, never an addition.
// Pure: no port, no clock.

import type { Pair } from "./list-diff";

export type PresenceEntry = { id: number; from: number; to: number };
export type Presence = { naka: PresenceEntry[]; sc: PresenceEntry[] };

type Side = keyof Presence;

const pairKey = (pair: Pair): string => `${pair.nakaId}:${pair.scId}`;

const ownId = (side: Side, pair: Pair): number =>
  side === "naka" ? pair.nakaId : pair.scId;

// An id present at the end of `run` extends an interval that reached the previous run, else starts one.
function extend(entry: PresenceEntry, run: number): PresenceEntry {
  return entry.to === run - 1
    ? { id: entry.id, from: entry.from, to: run }
    : { id: entry.id, from: run, to: run };
}

// An absent id keeps its interval, unless it is mapped on its own side: its pair is then covered by the
// snapshot rules (the runner carries a pair seen together into the snapshot before the id leaves here).
function nextSide(
  entries: readonly PresenceEntry[],
  run: number,
  listed: readonly number[],
  mapped: ReadonlySet<number>,
): PresenceEntry[] {
  const present = new Set(listed);
  const known = new Set(entries.map((entry) => entry.id));
  const kept = entries.flatMap((entry) => {
    if (present.has(entry.id)) return [extend(entry, run)];
    return mapped.has(entry.id) ? [] : [entry];
  });
  const fresh = [...present]
    .filter((id) => !known.has(id))
    .map((id) => ({ id, from: run, to: run }));
  return [...kept, ...fresh];
}

// The presence after completed run number `run`, from that run's final lists and mapping.
export function nextPresence(
  presence: Presence,
  run: number,
  lists: { naka: readonly number[]; sc: readonly number[] },
  mapping: readonly Pair[],
): Presence {
  const mappedOn = (side: Side) =>
    new Set(mapping.map((pair) => ownId(side, pair)));
  return {
    naka: nextSide(presence.naka, run, lists.naka, mappedOn("naka")),
    sc: nextSide(presence.sc, run, lists.sc, mappedOn("sc")),
  };
}

function byId(entries: readonly PresenceEntry[]): Map<number, PresenceEntry> {
  const index = new Map<number, PresenceEntry>();
  for (const entry of entries) {
    if (!index.has(entry.id)) index.set(entry.id, entry);
  }
  return index;
}

function overlap(a: PresenceEntry | undefined, b: PresenceEntry | undefined) {
  if (a === undefined || b === undefined) return false;
  return Math.max(a.from, b.from) <= Math.min(a.to, b.to);
}

// The snapshot the planner reads: the stored one, then every mapped pair not in it whose two ids were
// seen together. `presence` must be the LOADED one: it covers completed runs only.
export function withPairsSeenTogether(
  snapshot: readonly Pair[],
  mapping: readonly Pair[],
  presence: Presence,
): Pair[] {
  const stored = new Set(snapshot.map(pairKey));
  const naka = byId(presence.naka);
  const sc = byId(presence.sc);
  const late = mapping.filter(
    (pair) =>
      !stored.has(pairKey(pair)) &&
      overlap(naka.get(pair.nakaId), sc.get(pair.scId)),
  );
  return [...snapshot, ...late];
}

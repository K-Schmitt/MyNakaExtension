// Where each id was in its list, run by run. For each side, an id keeps EVERY contiguous interval of
// COMPLETED runs whose final list held it, mapped or not, never pruned. A pair mapped late (the resolution
// cap, a failed search or an open question delayed it) is given the snapshot it would have had if it had
// been mapped all along, under the snapshot rules of a mapped pair: it enters when both ids are listed,
// stays while at least one is, and leaves when neither is. A later one-sided state is then the owner
// removing one side: a question, never an addition. Pure: no port, no clock.

import { type Pair, pairKey } from "./list-diff";

export type PresenceEntry = { id: number; from: number; to: number };
export type Presence = { naka: PresenceEntry[]; sc: PresenceEntry[] };

// An id present at the end of `run` extends its interval that reached the previous run; otherwise it
// starts a new one. Every other interval is kept as it is.
function nextSide(
  entries: readonly PresenceEntry[],
  run: number,
  listed: readonly number[],
): PresenceEntry[] {
  const present = new Set(listed);
  const extended = new Set<number>();
  const kept = entries.map((entry) => {
    if (!present.has(entry.id) || entry.to !== run - 1) return entry;
    extended.add(entry.id);
    return { id: entry.id, from: entry.from, to: run };
  });
  const fresh = [...present]
    .filter((id) => !extended.has(id))
    .map((id) => ({ id, from: run, to: run }));
  return [...kept, ...fresh];
}

// The presence after completed run number `run`, from that run's final lists.
export function nextPresence(
  presence: Presence,
  run: number,
  lists: { naka: readonly number[]; sc: readonly number[] },
): Presence {
  return {
    naka: nextSide(presence.naka, run, lists.naka),
    sc: nextSide(presence.sc, run, lists.sc),
  };
}

// Each id's intervals, in run order: nextPresence appends an id's new interval after its older ones.
function intervalsById(
  entries: readonly PresenceEntry[],
): Map<number, PresenceEntry[]> {
  const index = new Map<number, PresenceEntry[]>();
  for (const entry of entries) {
    const list = index.get(entry.id);
    if (list) list.push(entry);
    else index.set(entry.id, [entry]);
  }
  return index;
}

// The intervals of both ids in run order, merged in one pass.
function merged(
  a: readonly PresenceEntry[],
  b: readonly PresenceEntry[],
): PresenceEntry[] {
  const out: PresenceEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const x = a[i];
    const y = b[j];
    if (y === undefined || (x !== undefined && x.from <= y.from)) {
      out.push(x as PresenceEntry);
      i += 1;
    } else {
      out.push(y);
      j += 1;
    }
  }
  return out;
}

// The last completed run in which both ids were listed, or undefined. One pass over both sorted lists.
function lastTogether(
  a: readonly PresenceEntry[],
  b: readonly PresenceEntry[],
): number | undefined {
  let last: number | undefined;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i] as PresenceEntry;
    const y = b[j] as PresenceEntry;
    const end = Math.min(x.to, y.to);
    if (Math.max(x.from, y.from) <= end) last = end;
    if (x.to < y.to) i += 1;
    else j += 1;
  }
  return last;
}

// Every run in (after, until] lists at least one of the ids: one pass over their intervals in run order.
function coveredAfter(
  intervals: readonly PresenceEntry[],
  after: number,
  until: number,
): boolean {
  let reached = after;
  for (const interval of intervals) {
    if (reached >= until) break;
    if (interval.to <= reached) continue;
    if (interval.from > reached + 1) return false;
    reached = interval.to;
  }
  return reached >= until;
}

// Mapped all along, the pair would be in the snapshot at the end of `lastRun`: it entered at the last run
// that listed both ids, and every run since listed at least one of them.
function snapshottedAllAlong(
  a: readonly PresenceEntry[],
  b: readonly PresenceEntry[],
  lastRun: number,
): boolean {
  const together = lastTogether(a, b);
  if (together === undefined) return false;
  return coveredAfter(merged(a, b), together, lastRun);
}

// The snapshot the planner reads: the stored one, then every mapped pair not in it that would be in it if
// it had been mapped all along. `loaded` is the presence and run counter as LOADED (completed runs only).
export function withPairsSeenTogether(
  snapshot: readonly Pair[],
  mapping: readonly Pair[],
  loaded: { presence: Presence; run: number },
): Pair[] {
  const stored = new Set(snapshot.map(pairKey));
  const naka = intervalsById(loaded.presence.naka);
  const sc = intervalsById(loaded.presence.sc);
  const late = mapping.filter(
    (pair) =>
      !stored.has(pairKey(pair)) &&
      snapshottedAllAlong(
        naka.get(pair.nakaId) ?? [],
        sc.get(pair.scId) ?? [],
        loaded.run,
      ),
  );
  return [...snapshot, ...late];
}

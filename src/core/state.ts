import type { Pair } from "./list-diff";
import { DEFAULT_THRESHOLD } from "./watch-trigger";

type Side = "naka" | "sc";

export type PendingItem =
  | { kind: "removal"; removeFrom: Side; pair: Pair; asked: boolean }
  | { kind: "ambiguity"; side: Side; id: number; candidateIds: number[] };

export type UnlinkedItem = {
  side: Side;
  id: number;
  title: string;
  reason: "no-match" | "not-in-catalogue";
};

export type SyncState = {
  version: 1;
  mapping: Pair[];
  snapshot: Pair[];
  settled: Pair[];
  pending: PendingItem[];
  handled: string[];
  unlinked: UnlinkedItem[];
  threshold: number;
};

const pairKey = (pair: Pair): string => `${pair.nakaId}:${pair.scId}`;

function samePair(a: Pair, b: Pair): boolean {
  return pairKey(a) === pairKey(b);
}

function samePending(a: PendingItem, b: PendingItem): boolean {
  if (a.kind === "removal" && b.kind === "removal") {
    return a.removeFrom === b.removeFrom && samePair(a.pair, b.pair);
  }
  if (a.kind === "ambiguity" && b.kind === "ambiguity") {
    return a.side === b.side && a.id === b.id;
  }
  return false;
}

function dedupePairs(pairs: readonly Pair[]): Pair[] {
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const key = pairKey(pair);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function emptyState(): SyncState {
  return {
    version: 1,
    mapping: [],
    snapshot: [],
    settled: [],
    pending: [],
    handled: [],
    unlinked: [],
    threshold: DEFAULT_THRESHOLD,
  };
}

export function upsertMapping(state: SyncState, pair: Pair): SyncState {
  const kept = state.mapping.filter(
    (p) => p.nakaId !== pair.nakaId && p.scId !== pair.scId,
  );
  return { ...state, mapping: [...kept, pair] };
}

export function settlePair(state: SyncState, pair: Pair): SyncState {
  if (state.settled.some((p) => samePair(p, pair))) return { ...state };
  return { ...state, settled: [...state.settled, pair] };
}

export function unsettlePair(state: SyncState, pair: Pair): SyncState {
  return { ...state, settled: state.settled.filter((p) => !samePair(p, pair)) };
}

export function setSnapshot(
  state: SyncState,
  pairs: readonly Pair[],
): SyncState {
  return { ...state, snapshot: dedupePairs(pairs) };
}

export function addPending(state: SyncState, item: PendingItem): SyncState {
  if (state.pending.some((p) => samePending(p, item))) return { ...state };
  return { ...state, pending: [...state.pending, item] };
}

export function resolvePending(state: SyncState, item: PendingItem): SyncState {
  return {
    ...state,
    pending: state.pending.filter((p) => !samePending(p, item)),
  };
}

export function markAsked(state: SyncState, pair: Pair): SyncState {
  const pending = state.pending.map((item) =>
    item.kind === "removal" && samePair(item.pair, pair)
      ? { ...item, asked: true }
      : item,
  );
  return { ...state, pending };
}

export function markHandled(state: SyncState, key: string): SyncState {
  if (state.handled.includes(key)) return { ...state };
  return { ...state, handled: [...state.handled, key] };
}

export function isHandled(state: SyncState, key: string): boolean {
  return state.handled.includes(key);
}

export function setUnlinked(
  state: SyncState,
  items: readonly UnlinkedItem[],
): SyncState {
  return { ...state, unlinked: [...items] };
}

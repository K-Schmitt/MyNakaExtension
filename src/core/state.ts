import type { Pair } from "./list-diff";
import type { Presence } from "./presence";
import type { MediaType } from "./title-match";
import { DEFAULT_THRESHOLD } from "./watch-trigger";

export type Side = "naka" | "sc";

/** One title the owner may choose for a question, as listed by the search that asked it. */
export type QuestionCandidate = {
  id: number;
  title: string;
  year?: number;
  type: MediaType;
};

export type PendingItem =
  | {
      kind: "removal";
      removeFrom: Side;
      pair: Pair;
      /** Dismissed from the home panel. */
      asked: boolean;
      title?: string;
    }
  | {
      kind: "ambiguity";
      side: Side;
      id: number;
      candidateIds: number[];
      /** Dismissed from the home panel (design §7). */
      asked?: true;
      /** The asked title, on its own side. */
      title?: string;
      /** Absent: a question saved before 4b ("legacy"). When present, its ids are `candidateIds`. */
      candidates?: QuestionCandidate[];
      /** Content key of the latest finish waiting on this question (a naka-side question only). */
      finish?: string;
    };

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
  /** The title of each handled key, written at finish time; absent for keys handled before B8b. */
  handledTitles?: Record<string, string>;
  unlinked: UnlinkedItem[];
  retryLast: Pair[];
  /** Completed sync runs, counted from 0. */
  run: number;
  /** Per side, the latest contiguous interval of completed runs whose final list held each id. */
  presence: Presence;
  /** Legacy: kept so stored states still parse; nothing reads it for a decision (see Settings.thresholds). */
  threshold: number;
};

const pairKey = (pair: Pair): string => `${pair.nakaId}:${pair.scId}`;

export function samePair(a: Pair, b: Pair): boolean {
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
    retryLast: [],
    run: 0,
    presence: { naka: [], sc: [] },
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

// The title, when known, is stored with the key; a key already handled keeps what it has.
export function markHandled(
  state: SyncState,
  key: string,
  title?: string,
): SyncState {
  if (state.handled.includes(key)) return { ...state };
  const handled = [...state.handled, key];
  if (title === undefined) return { ...state, handled };
  return {
    ...state,
    handled,
    handledTitles: { ...state.handledTitles, [key]: title },
  };
}

/** The title is no longer handled: its key and its stored title go, nothing else changes. */
export function forgetHandled(state: SyncState, key: string): SyncState {
  if (!isHandled(state, key)) return { ...state };
  const { handledTitles, ...rest } = state;
  const handled = state.handled.filter((k) => k !== key);
  if (handledTitles === undefined) return { ...rest, handled };
  const { [key]: _forgotten, ...titles } = handledTitles;
  return { ...rest, handled, handledTitles: titles };
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

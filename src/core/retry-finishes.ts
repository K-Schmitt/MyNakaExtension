import type { Pair } from "./list-diff";
import type { AmbiguityItem } from "./questions";
import { addPending, type SyncState, samePair } from "./state";

export const MAX_RETRY_FINISHES = 20;

export type WaitingQuestion = Omit<AmbiguityItem, "finish">;

/**
 * A finish that waits for a Naka tab. `key`: content key; `pair`: the link the answer made; `evicted`: the
 * mapping pairs the answer removed; `question`: the question as it was, without its finish; `at`: ms.
 */
export type RetryFinish = {
  key: string;
  pair: Pair;
  evicted: Pair[];
  question: WaitingQuestion;
  at: number;
};

export function retriesOf(state: SyncState): RetryFinish[] {
  return state.retryFinishes ?? [];
}

export function addRetry(state: SyncState, entry: RetryFinish): SyncState {
  const others = retriesOf(state).filter((e) => e.key !== entry.key);
  const retryFinishes = [...others, entry].slice(-MAX_RETRY_FINISHES);
  return { ...state, retryFinishes };
}

export function dropRetry(state: SyncState, key: string): SyncState {
  const kept = retriesOf(state).filter((e) => e.key !== key);
  if (kept.length === retriesOf(state).length) return state;
  return { ...state, retryFinishes: kept };
}

function withoutPair(pairs: readonly Pair[], pair: Pair): Pair[] {
  return pairs.filter((p) => !samePair(p, pair));
}

function clashes(mapping: readonly Pair[], pair: Pair): boolean {
  return mapping.some((p) => p.nakaId === pair.nakaId || p.scId === pair.scId);
}

// Evicted links come back unless a later link took their naka or sc id.
function restoreEvicted(mapping: Pair[], evicted: readonly Pair[]): Pair[] {
  const restored = [...mapping];
  for (const pair of evicted) {
    if (!clashes(restored, pair)) restored.push(pair);
  }
  return restored;
}

function undoLink(state: SyncState, entry: RetryFinish): SyncState {
  const mapping = withoutPair(state.mapping, entry.pair);
  const undone: SyncState = {
    ...state,
    mapping: restoreEvicted(mapping, entry.evicted),
    snapshot: withoutPair(state.snapshot, entry.pair),
    retryLast: withoutPair(state.retryLast, entry.pair),
  };
  return addPending(undone, entry.question);
}

/** Undoes the answer behind a waiting finish and asks the question again; undefined for an unknown key. */
export function cancelRetry(
  state: SyncState,
  key: string,
): SyncState | undefined {
  const entry = retriesOf(state).find((e) => e.key === key);
  if (entry === undefined) return undefined;
  const dropped = dropRetry(state, key);
  if (!state.mapping.some((p) => samePair(p, entry.pair))) return dropped;
  return undoLink(dropped, entry);
}

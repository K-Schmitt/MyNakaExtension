import type { Pair } from "./list-diff";
import type { AmbiguityItem } from "./questions";
import { addPending, type SyncState, samePair } from "./state";

export const MAX_RETRY_FINISHES = 20;

export type WaitingQuestion = Omit<AmbiguityItem, "finish">;

/**
 * A finish that waits for a Naka tab. `key`: content key; `pair`: the link the answer made; `evicted`: the
 * mapping pairs the answer removed; `question`: the question as it was, without its finish; `at`: ms;
 * `linkedBefore`: the pair was already linked when the answer came (a cross-question), so a cancel keeps it.
 */
export type RetryFinish = {
  key: string;
  pair: Pair;
  evicted: Pair[];
  question: WaitingQuestion;
  at: number;
  linkedBefore?: true;
};

export function retriesOf(state: SyncState): RetryFinish[] {
  return state.retryFinishes ?? [];
}

/** A finish waits for a Naka tab under this key. */
export function isWaiting(state: SyncState, key: string): boolean {
  return retriesOf(state).some((e) => e.key === key);
}

export function addRetry(state: SyncState, entry: RetryFinish): SyncState {
  const others = retriesOf(state).filter((e) => e.key !== entry.key);
  const retryFinishes = [...others, entry].slice(-MAX_RETRY_FINISHES);
  return { ...state, retryFinishes };
}

export function dropRetry(state: SyncState, key: string): SyncState {
  const kept = retriesOf(state).filter((e) => e.key !== key);
  if (kept.length === retriesOf(state).length) return state;
  if (kept.length > 0) return { ...state, retryFinishes: kept };
  // An empty list leaves the state, so an older build reads it again.
  const { retryFinishes: _gone, ...rest } = state;
  return rest;
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

// A « garder » given on the pair while the finish waited goes with the link: the question comes back open.
function undoLink(state: SyncState, entry: RetryFinish): SyncState {
  const mapping = withoutPair(state.mapping, entry.pair);
  const undone: SyncState = {
    ...state,
    mapping: restoreEvicted(mapping, entry.evicted),
    snapshot: withoutPair(state.snapshot, entry.pair),
    settled: withoutPair(state.settled, entry.pair),
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
  // Handled another way meanwhile, or the pair already gone: nothing to undo and nothing to ask.
  if (state.handled.includes(key)) return dropped;
  if (!state.mapping.some((p) => samePair(p, entry.pair))) return dropped;
  if (entry.linkedBefore) return addPending(dropped, entry.question);
  return undoLink(dropped, entry);
}

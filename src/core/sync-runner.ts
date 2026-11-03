import { type Pair, planListSync, type Removal } from "./list-diff";
import { nextPresence, withPairsSeenTogether } from "./presence";
import type { ResolverPorts } from "./resolver";
import { addPending, type SyncState, setSnapshot, settlePair } from "./state";
import {
  countWaiting,
  MAX_RESOLVE_PER_RUN,
  resolveUnlinked,
} from "./sync-resolve";
import {
  executeWrites,
  MAX_WRITES_PER_RUN,
  selectWrites,
  type WriteOutcome,
  type WritePorts,
} from "./sync-writes";

export { MAX_RESOLVE_PER_RUN, MAX_WRITES_PER_RUN };

export type SyncPorts = ResolverPorts &
  WritePorts & {
    nakaIds(): Promise<number[]>;
    scWishlistIds(): Promise<number[]>;
    load(): Promise<SyncState>;
    save(state: SyncState): Promise<void>;
  };

export type SyncReport = {
  added: Pair[];
  deferred: Pair[];
  failed: Pair[];
  /** Products already done on SensCritique: not wished, their pairs settled. */
  alreadyDone: Pair[];
  pendingRemovals: number;
  /** Ids still waiting for a search, counted per side (a title unmapped on both sides counts 2). */
  unresolved: number;
};

const pairKey = (pair: Pair): string => `${pair.nakaId}:${pair.scId}`;

function pendingRemovalPairs(state: SyncState): Pair[] {
  return state.pending.flatMap((item) =>
    item.kind === "removal" ? [item.pair] : [],
  );
}

function effectiveSettled(state: SyncState): Pair[] {
  const unique = new Map<string, Pair>();
  for (const pair of [...state.settled, ...pendingRemovalPairs(state)]) {
    unique.set(pairKey(pair), pair);
  }
  return [...unique.values()];
}

type Lists = { naka: number[]; sc: number[] };

// The stored snapshot plus the mapped pairs a completed run saw together, judged from the presence as
// loaded and this run's lists as read before any write.
function knownSnapshot(
  state: SyncState,
  loaded: SyncState,
  lists: Lists,
): Pair[] {
  return withPairsSeenTogether(state.snapshot, state.mapping, loaded, lists);
}

function planFor(state: SyncState, loaded: SyncState, lists: Lists) {
  return planListSync({
    naka: new Set(lists.naka),
    sc: new Set(lists.sc),
    snapshot: knownSnapshot(state, loaded, lists),
    mapping: state.mapping,
    settled: effectiveSettled(state),
  });
}

function queueRemovals(
  state: SyncState,
  removals: readonly Removal[],
): SyncState {
  return removals.reduce(
    (current, removal) =>
      addPending(current, { kind: "removal", ...removal, asked: false }),
    state,
  );
}

async function effectiveList(
  read: () => Promise<number[]>,
  original: number[],
  written: number[],
): Promise<number[]> {
  if (written.length === 0) return original;
  try {
    return [...original, ...(await read())];
  } catch {
    return original;
  }
}

// A known pair (snapshotted, or seen together) the planner skipped (conflicted,
// settled) and that is still mapped and on one side must stay known: if it
// dropped out, it would be treated as an addition once the skip ends.
function nextSnapshot(
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

// The run is complete: its final lists extend the presence intervals.
function completeRun(
  state: SyncState,
  lists: { naka: number[]; sc: number[] },
): SyncState {
  const run = state.run + 1;
  const presence = nextPresence(state.presence, run, lists);
  return { ...state, run, presence };
}

// What the owner did on SensCritique is never rewritten: a pair whose product is already done there is
// settled, so it never acts again.
function settleAlreadyDone(state: SyncState, outcome: WriteOutcome): SyncState {
  return outcome.alreadyDone.reduce(settlePair, state);
}

function nextRetryLast(state: SyncState, outcome: WriteOutcome): SyncState {
  const same = (a: Pair, b: Pair): boolean => pairKey(a) === pairKey(b);
  const settledNow = [
    ...outcome.added,
    ...outcome.failed,
    ...outcome.alreadyDone,
  ];
  const waiting = state.retryLast.filter(
    (pair) => !settledNow.some((done) => same(done, pair)),
  );
  const candidates = [...waiting, ...outcome.failed].filter((pair) =>
    state.mapping.some((mapped) => same(mapped, pair)),
  );
  const unique = new Map(candidates.map((pair) => [pairKey(pair), pair]));
  return { ...state, retryLast: [...unique.values()] };
}

export async function runSync(ports: SyncPorts): Promise<SyncReport> {
  const loaded = await ports.load();
  const lists = {
    naka: await ports.nakaIds(),
    sc: await ports.scWishlistIds(),
  };
  const first = planFor(loaded, loaded, lists);
  const resolved = await resolveUnlinked(loaded, first, ports);
  const plan = planFor(resolved, loaded, lists);
  const outcome = await executeWrites(
    selectWrites(plan, resolved.retryLast),
    ports,
  );
  const queued = settleAlreadyDone(
    queueRemovals(resolved, plan.confirmRemoval),
    outcome,
  );
  const final = {
    naka: await effectiveList(
      () => ports.nakaIds(),
      lists.naka,
      outcome.written.naka,
    ),
    sc: await effectiveList(
      () => ports.scWishlistIds(),
      lists.sc,
      outcome.written.sc,
    ),
  };
  const known = knownSnapshot(resolved, loaded, lists);
  const state = completeRun(
    nextRetryLast(nextSnapshot(queued, known, final), outcome),
    final,
  );
  await ports.save(state);
  return {
    added: outcome.added,
    deferred: outcome.deferred,
    failed: outcome.failed,
    alreadyDone: outcome.alreadyDone,
    pendingRemovals: state.pending.filter(
      (item) => item.kind === "removal" && !item.asked,
    ).length,
    unresolved: countWaiting(resolved, plan),
  };
}

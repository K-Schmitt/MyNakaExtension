import { type Pair, planListSync } from "./list-diff";
import { closeMootRemovals } from "./moot-removals";
import { nextPresence, withPairsSeenTogether } from "./presence";
import { type TitledRemoval, titleNewRemovals } from "./removal-titles";
import type { ResolverPorts } from "./resolver";
import { addPending, type SyncState, settlePair } from "./state";
import {
  countWaiting,
  MAX_RESOLVE_PER_RUN,
  resolveUnlinked,
} from "./sync-resolve";
import { nextSnapshot, pairKey, pendingRemovalPairs } from "./sync-snapshot";
import {
  executeWrites,
  MAX_WRITES_PER_RUN,
  selectWrites,
  type Write,
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
    /** Hears, once per run, the writes the run deferred to the next pass, in order. */
    deferred?(writes: readonly Write[]): void;
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

function effectiveSettled(state: SyncState): Pair[] {
  const unique = new Map<string, Pair>();
  for (const pair of [...state.settled, ...pendingRemovalPairs(state)]) {
    unique.set(pairKey(pair), pair);
  }
  return [...unique.values()];
}

type Lists = { naka: number[]; sc: number[] };

// The stored snapshot plus the mapped pairs that would be in it had they been mapped all along, judged
// from the presence as loaded.
function knownSnapshot(state: SyncState, loaded: SyncState): Pair[] {
  return withPairsSeenTogether(state.snapshot, state.mapping, loaded);
}

function planFor(state: SyncState, loaded: SyncState, lists: Lists) {
  return planListSync({
    naka: new Set(lists.naka),
    sc: new Set(lists.sc),
    snapshot: knownSnapshot(state, loaded),
    mapping: state.mapping,
    settled: effectiveSettled(state),
  });
}

function queueRemovals(
  state: SyncState,
  removals: readonly TitledRemoval[],
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
  ports.deferred?.(outcome.deferredWrites);
  const queued = settleAlreadyDone(
    queueRemovals(
      resolved,
      await titleNewRemovals(resolved, plan.confirmRemoval, ports),
    ),
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
  const known = knownSnapshot(resolved, loaded);
  const state = completeRun(
    nextRetryLast(
      nextSnapshot(closeMootRemovals(queued, final), known, final),
      outcome,
    ),
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

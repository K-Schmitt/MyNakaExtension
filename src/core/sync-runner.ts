import { type Pair, planListSync, type Removal } from "./list-diff";
import type { ResolverPorts } from "./resolver";
import { addPending, type SyncState, setSnapshot } from "./state";
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

function planFor(state: SyncState, naka: number[], sc: number[]) {
  return planListSync({
    naka: new Set(naka),
    sc: new Set(sc),
    snapshot: state.snapshot,
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

function nextSnapshot(
  state: SyncState,
  naka: number[],
  sc: number[],
): SyncState {
  const inNaka = new Set(naka);
  const inSc = new Set(sc);
  const both = state.mapping.filter(
    (pair) => inNaka.has(pair.nakaId) && inSc.has(pair.scId),
  );
  return setSnapshot(state, [...both, ...pendingRemovalPairs(state)]);
}

function nextRetryLast(state: SyncState, outcome: WriteOutcome): SyncState {
  const same = (a: Pair, b: Pair): boolean => pairKey(a) === pairKey(b);
  const settledNow = [...outcome.added, ...outcome.failed];
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
  const naka = await ports.nakaIds();
  const sc = await ports.scWishlistIds();
  const first = planFor(loaded, naka, sc);
  const resolved = await resolveUnlinked(loaded, first, ports);
  const plan = planFor(resolved, naka, sc);
  const outcome = await executeWrites(
    selectWrites(plan, resolved.retryLast),
    ports,
  );
  const queued = queueRemovals(resolved, plan.confirmRemoval);
  const finalNaka = await effectiveList(
    () => ports.nakaIds(),
    naka,
    outcome.written.naka,
  );
  const finalSc = await effectiveList(
    () => ports.scWishlistIds(),
    sc,
    outcome.written.sc,
  );
  const state = nextRetryLast(
    nextSnapshot(queued, finalNaka, finalSc),
    outcome,
  );
  await ports.save(state);
  return {
    added: outcome.added,
    deferred: outcome.deferred,
    failed: outcome.failed,
    pendingRemovals: state.pending.filter(
      (item) => item.kind === "removal" && !item.asked,
    ).length,
    unresolved: countWaiting(resolved, plan),
  };
}

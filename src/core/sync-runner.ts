import { type Pair, planListSync, type Removal } from "./list-diff";
import { type ResolverPorts, resolveNakaIds, resolveScIds } from "./resolver";
import { addPending, type SyncState, setSnapshot } from "./state";
import {
  executeWrites,
  MAX_WRITES_PER_RUN,
  selectWrites,
  type WritePorts,
} from "./sync-writes";

export { MAX_WRITES_PER_RUN };
export const MAX_RESOLVE_PER_RUN = 20;

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
  unresolved: number;
};

const pairKey = (pair: Pair): string => `${pair.nakaId}:${pair.scId}`;

function effectiveSettled(state: SyncState): Pair[] {
  const unique = new Map<string, Pair>();
  const pendingRemovals = state.pending.flatMap((item) =>
    item.kind === "removal" ? [item.pair] : [],
  );
  for (const pair of [...state.settled, ...pendingRemovals]) {
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

async function resolveUnlinked(
  state: SyncState,
  ids: { naka: number[]; sc: number[] },
  ports: SyncPorts,
): Promise<SyncState> {
  const withNaka = await resolveNakaIds(
    ids.naka.slice(0, MAX_RESOLVE_PER_RUN),
    state,
    ports,
  );
  return resolveScIds(ids.sc.slice(0, MAX_RESOLVE_PER_RUN), withNaka, ports);
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

async function currentList(
  read: () => Promise<number[]>,
  original: number[],
  wrote: boolean,
): Promise<number[]> {
  if (!wrote) return original;
  try {
    return await read();
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
  return setSnapshot(state, both);
}

export async function runSync(ports: SyncPorts): Promise<SyncReport> {
  const loaded = await ports.load();
  const naka = await ports.nakaIds();
  const sc = await ports.scWishlistIds();
  const first = planFor(loaded, naka, sc);
  const resolved = await resolveUnlinked(
    loaded,
    { naka: first.resolveNaka, sc: first.resolveSc },
    ports,
  );
  const plan = planFor(resolved, naka, sc);
  const outcome = await executeWrites(selectWrites(plan), ports);
  const queued = queueRemovals(resolved, plan.confirmRemoval);
  const finalNaka = await currentList(
    () => ports.nakaIds(),
    naka,
    outcome.succeeded.has("naka"),
  );
  const finalSc = await currentList(
    () => ports.scWishlistIds(),
    sc,
    outcome.succeeded.has("sc"),
  );
  const state = nextSnapshot(queued, finalNaka, finalSc);
  await ports.save(state);
  return {
    added: outcome.added,
    deferred: outcome.deferred,
    failed: outcome.failed,
    pendingRemovals: state.pending.filter(
      (item) => item.kind === "removal" && !item.asked,
    ).length,
    unresolved: plan.resolveNaka.length + plan.resolveSc.length,
  };
}

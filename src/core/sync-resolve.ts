import type { SyncPlan } from "./list-diff";
import { type ResolverPorts, resolveNakaIds, resolveScIds } from "./resolver";
import type { SyncState } from "./state";

export const MAX_RESOLVE_PER_RUN = 20;

type Side = "naka" | "sc";

function skippedByResolver(state: SyncState, side: Side, id: number): boolean {
  const own = (pair: { nakaId: number; scId: number }): number =>
    side === "naka" ? pair.nakaId : pair.scId;
  return (
    state.mapping.some((pair) => own(pair) === id) ||
    state.pending.some(
      (item) =>
        item.kind === "ambiguity" && item.side === side && item.id === id,
    ) ||
    state.unlinked.some((item) => item.side === side && item.id === id)
  );
}

export function waitingIds(
  state: SyncState,
  side: Side,
  ids: readonly number[],
): number[] {
  return ids.filter((id) => !skippedByResolver(state, side, id));
}

export function countWaiting(state: SyncState, plan: SyncPlan): number {
  return (
    waitingIds(state, "naka", plan.resolveNaka).length +
    waitingIds(state, "sc", plan.resolveSc).length
  );
}

export async function resolveUnlinked(
  state: SyncState,
  plan: SyncPlan,
  ports: ResolverPorts,
): Promise<SyncState> {
  const naka = waitingIds(state, "naka", plan.resolveNaka);
  const withNaka = await resolveNakaIds(
    naka.slice(0, MAX_RESOLVE_PER_RUN),
    state,
    ports,
  );
  const sc = waitingIds(withNaka, "sc", plan.resolveSc);
  return resolveScIds(sc.slice(0, MAX_RESOLVE_PER_RUN), withNaka, ports);
}

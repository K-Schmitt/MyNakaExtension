import type { Pair, SyncPlan } from "./list-diff";

export const MAX_WRITES_PER_RUN = 10;

export type Side = "naka" | "sc";

type Write = { side: Side; pair: Pair };

export type WritePorts = {
  addToNaka(nakaId: number): Promise<void>;
  addToSc(scId: number): Promise<void>;
};

export type WriteOutcome = {
  added: Pair[];
  deferred: Pair[];
  failed: Pair[];
  succeeded: Set<Side>;
};

export function selectWrites(plan: SyncPlan): Write[] {
  const toSc = plan.addToSc.map((pair) => ({ side: "sc" as const, pair }));
  const toNaka = plan.addToNaka.map((pair) => ({
    side: "naka" as const,
    pair,
  }));
  return [...toSc, ...toNaka];
}

async function attempt(write: Write, ports: WritePorts): Promise<boolean> {
  try {
    if (write.side === "sc") await ports.addToSc(write.pair.scId);
    else await ports.addToNaka(write.pair.nakaId);
    return true;
  } catch {
    return false;
  }
}

export async function executeWrites(
  writes: readonly Write[],
  ports: WritePorts,
): Promise<WriteOutcome> {
  const outcome: WriteOutcome = {
    added: [],
    deferred: [],
    failed: [],
    succeeded: new Set(),
  };
  const stopped = new Set<Side>();
  let attempts = 0;
  for (const write of writes) {
    if (attempts >= MAX_WRITES_PER_RUN || stopped.has(write.side)) {
      outcome.deferred.push(write.pair);
      continue;
    }
    attempts += 1;
    if (await attempt(write, ports)) {
      outcome.added.push(write.pair);
      outcome.succeeded.add(write.side);
    } else {
      outcome.failed.push(write.pair);
      stopped.add(write.side);
    }
  }
  return outcome;
}

import type { Pair, SyncPlan } from "./list-diff";

export const MAX_WRITES_PER_RUN = 10;
export const MAX_CONSECUTIVE_FAILURES = 2;

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
  written: { naka: number[]; sc: number[] };
};

const samePair = (a: Pair, b: Pair): boolean =>
  a.nakaId === b.nakaId && a.scId === b.scId;

function failedLast(
  pairs: readonly Pair[],
  retryLast: readonly Pair[],
): Pair[] {
  const isRetry = (pair: Pair): boolean =>
    retryLast.some((r) => samePair(r, pair));
  return [...pairs.filter((pair) => !isRetry(pair)), ...pairs.filter(isRetry)];
}

export function selectWrites(
  plan: SyncPlan,
  retryLast: readonly Pair[],
): Write[] {
  const toSc = failedLast(plan.addToSc, retryLast).map((pair) => ({
    side: "sc" as const,
    pair,
  }));
  const toNaka = failedLast(plan.addToNaka, retryLast).map((pair) => ({
    side: "naka" as const,
    pair,
  }));
  return [...toSc, ...toNaka];
}

function writtenId(write: Write): number {
  return write.side === "sc" ? write.pair.scId : write.pair.nakaId;
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
    written: { naka: [], sc: [] },
  };
  const streak = { naka: 0, sc: 0 };
  let attempts = 0;
  for (const write of writes) {
    if (
      attempts >= MAX_WRITES_PER_RUN ||
      streak[write.side] >= MAX_CONSECUTIVE_FAILURES
    ) {
      outcome.deferred.push(write.pair);
      continue;
    }
    attempts += 1;
    if (await attempt(write, ports)) {
      outcome.added.push(write.pair);
      streak[write.side] = 0;
      outcome.written[write.side].push(writtenId(write));
    } else {
      outcome.failed.push(write.pair);
      streak[write.side] += 1;
    }
  }
  return outcome;
}

import type { Pair, SyncPlan } from "./list-diff";

export const MAX_WRITES_PER_RUN = 10;
const MAX_CONSECUTIVE_FAILURES = 2;

export type Side = "naka" | "sc";

export type Write = { side: Side; pair: Pair };

export type WritePorts = {
  addToNaka(nakaId: number): Promise<void>;
  /** "already-done": the owner already saw the product on SensCritique, so it was not wished. */
  addToSc(scId: number): Promise<"added" | "already-done">;
};

export type WriteOutcome = {
  added: Pair[];
  deferred: Pair[];
  /** The same writes as `deferred`, with their side, in order (internal: not part of the stored report). */
  deferredWrites: Write[];
  failed: Pair[];
  /** Pairs whose SensCritique product is already done: attempted, not written. */
  alreadyDone: Pair[];
  written: { naka: number[]; sc: number[] };
};

type Result = "added" | "already-done" | "failed";

const samePair = (a: Pair, b: Pair): boolean =>
  a.nakaId === b.nakaId && a.scId === b.scId;

function failedLast(
  pairs: readonly Pair[],
  retryLast: readonly Pair[],
): Pair[] {
  const fresh = pairs.filter(
    (pair) => !retryLast.some((r) => samePair(r, pair)),
  );
  const queue = retryLast.filter(
    (r, i) => retryLast.findIndex((other) => samePair(other, r)) === i,
  );
  const demoted = queue.flatMap((r) =>
    pairs.filter((pair) => samePair(r, pair)),
  );
  return [...fresh, ...demoted];
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

// Any answer of addToSc other than the two known ones fails closed, as a failed write.
async function attempt(write: Write, ports: WritePorts): Promise<Result> {
  try {
    if (write.side === "naka") {
      await ports.addToNaka(write.pair.nakaId);
      return "added";
    }
    const result: unknown = await ports.addToSc(write.pair.scId);
    return result === "added" || result === "already-done" ? result : "failed";
  } catch {
    return "failed";
  }
}

function record(
  outcome: WriteOutcome,
  streak: Record<Side, number>,
  write: Write,
  result: Result,
): void {
  if (result === "failed") {
    outcome.failed.push(write.pair);
    streak[write.side] += 1;
    return;
  }
  streak[write.side] = 0;
  if (result === "already-done") {
    outcome.alreadyDone.push(write.pair);
    return;
  }
  outcome.added.push(write.pair);
  outcome.written[write.side].push(writtenId(write));
}

export async function executeWrites(
  writes: readonly Write[],
  ports: WritePorts,
): Promise<WriteOutcome> {
  const outcome: WriteOutcome = {
    added: [],
    deferred: [],
    deferredWrites: [],
    failed: [],
    alreadyDone: [],
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
      outcome.deferredWrites.push(write);
      continue;
    }
    attempts += 1;
    record(outcome, streak, write, await attempt(write, ports));
  }
  return outcome;
}

// I2: after a sync that ran and succeeded, the finishes that wait for a Naka tab are retried, one by one
// in stored order, each through the one finish job (pre-check, budget, binding). Only `state.retryFinishes`
// decides what is retried. A failure that keeps waiting stops the batch; any other end drops the entry.

import { idsOfKey } from "../core/finish-event";
import { dropRetry, type RetryFinish, retriesOf } from "../core/retry-finishes";
import { samePair } from "../core/state";
import { explicitFinish } from "./explicit-finish";
import { finishJob } from "./finish-job";
import type { JobDeps } from "./job-deps";
import { KEEPS_WAITING } from "./retry-rules";

async function syncedSince(deps: JobDeps, since: number): Promise<boolean> {
  const { lastRun } = await deps.store.loadSettings();
  return (
    lastRun?.outcome === "ok" &&
    lastRun.error === undefined &&
    lastRun.at >= since
  );
}

async function drop(deps: JobDeps, key: string): Promise<void> {
  const state = await deps.store.loadState();
  const dropped = dropRetry(state, key);
  if (dropped !== state) await deps.store.saveState(dropped);
}

// true when the entry is spent; false when it keeps waiting and the batch stops.
async function retryOne(deps: JobDeps, entry: RetryFinish): Promise<boolean> {
  const ids = idsOfKey(entry.key);
  const state = await deps.store.loadState();
  const linked = state.mapping.some((p) => samePair(p, entry.pair));
  if (ids === undefined || !linked) {
    await drop(deps, entry.key);
    return true;
  }
  const error = await finishJob(deps, explicitFinish(ids));
  if (error !== undefined && KEEPS_WAITING.includes(error)) return false;
  await drop(deps, entry.key);
  return true;
}

export async function retryFinishesJob(
  deps: JobDeps,
  since: number,
): Promise<void> {
  if (!(await syncedSince(deps, since))) return;
  const waiting = retriesOf(await deps.store.loadState());
  for (const entry of waiting) {
    const current = retriesOf(await deps.store.loadState());
    if (!current.some((e) => e.key === entry.key)) continue;
    if (!(await retryOne(deps, entry))) return;
  }
}

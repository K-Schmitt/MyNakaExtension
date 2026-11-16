// After a sync that ran and succeeded, the finishes that wait for a Naka tab are retried in stored
// order, each through the one finish job (pre-check, budget, binding). Only `state.retryFinishes` decides
// what is retried. A failure that keeps waiting stops the chain; any other end drops the entry. A content
// Naka no longer knows is recorded as the last finish, under the title the waiting list showed, before the
// entry goes.

import { idsOfKey } from "../core/finish-event";
import { waitingTitleOf } from "../core/handled-titles";
import type { RatingCard } from "../core/rating-cards";
import { dropRetry, type RetryFinish, retriesOf } from "../core/retry-finishes";
import { samePair } from "../core/state";
import { explicitFinish } from "./explicit-finish";
import { finishJob } from "./finish-job";
import type { JobDeps } from "./job-deps";
import { KEEPS_WAITING } from "./retry-rules";
import type { Replay } from "./unknown-content";

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

async function remaining(deps: JobDeps): Promise<boolean> {
  return retriesOf(await deps.store.loadState()).length > 0;
}

// The title the waiting list showed. The card only names the record: an unreadable card store leaves it
// without a title, and the replay goes on.
async function replayOf(deps: JobDeps, entry: RetryFinish): Promise<Replay> {
  const cards = await deps.store.loadRatings().catch((): RatingCard[] => []);
  return { title: waitingTitleOf(entry, cards) };
}

// true when the entry is spent; false when it keeps waiting.
async function retryOne(deps: JobDeps, entry: RetryFinish): Promise<boolean> {
  const ids = idsOfKey(entry.key);
  const state = await deps.store.loadState();
  const linked = state.mapping.some((p) => samePair(p, entry.pair));
  if (ids === undefined || !linked) return true;
  const replay = await replayOf(deps, entry);
  const error = await finishJob(deps, explicitFinish(ids), replay);
  return error === undefined || !KEEPS_WAITING.includes(error);
}

/** true when a step would try an entry: the sync succeeded since `since` and a finish waits. Read-only. */
export async function retryPendingJob(
  deps: JobDeps,
  since: number,
): Promise<boolean> {
  if (!(await syncedSince(deps, since))) return false;
  return retriesOf(await deps.store.loadState()).length > 0;
}

/**
 * One step of the retry: the first waiting finish only, so that each finish is its own queued job (one job,
 * one tab). Answers true when another step should be queued: this one dropped its entry and others remain.
 */
export async function retryNextJob(
  deps: JobDeps,
  since: number,
): Promise<boolean> {
  if (!(await syncedSince(deps, since))) return false;
  const [entry] = retriesOf(await deps.store.loadState());
  if (entry === undefined) return false;
  if (!(await retryOne(deps, entry))) return false;
  await drop(deps, entry.key);
  return remaining(deps);
}

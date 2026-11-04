// What the worker is doing now, for the status answer (Ruling 20): the job running, and the mode a queued
// set-mode will apply. In memory only: a worker restart loses it with the queue it describes.

import type { Mode } from "../ext/settings";

export type Running = { kind: "sync" | "finish"; since: number };
export type Activity = { running?: Running; pendingMode?: Mode };

export type ActivityTracker = {
  /** The job, marked running from its start to its end. */
  track(kind: Running["kind"], job: () => Promise<void>): () => Promise<void>;
  /** Marks the mode pending now; the job returned applies it, then clears the mark unless a newer one came. */
  queueMode(mode: Mode, apply: () => Promise<void>): () => Promise<void>;
  current(): Activity;
};

export function createActivity(now: () => number): ActivityTracker {
  let running: Running | undefined;
  let pending: { mode: Mode; ticket: number } | undefined;
  let tickets = 0;
  return {
    track: (kind, job) => async () => {
      running = { kind, since: now() };
      try {
        await job();
      } finally {
        running = undefined;
      }
    },
    queueMode(mode, apply) {
      tickets += 1;
      const ticket = tickets;
      pending = { mode, ticket };
      return async () => {
        try {
          await apply();
        } finally {
          if (pending?.ticket === ticket) pending = undefined;
        }
      };
    },
    current: () => ({
      ...(running === undefined ? {} : { running: { ...running } }),
      ...(pending === undefined ? {} : { pendingMode: pending.mode }),
    }),
  };
}

// A job seen at either end of the snapshot read is said running: a job that ended during the read may have
// saved after it, and the page then asks again.
export function overlapping(before: Activity, after: Activity): Activity {
  const running = after.running ?? before.running;
  const pendingMode = after.pendingMode ?? before.pendingMode;
  return {
    ...(running === undefined ? {} : { running }),
    ...(pendingMode === undefined ? {} : { pendingMode }),
  };
}

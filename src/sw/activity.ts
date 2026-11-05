// What the worker is doing now, for the status answer (Ruling 20): the job running, the mode a queued
// set-mode will apply, and whether a set-settings waits or runs. In memory only: a worker restart loses it with the queue it describes.

import type { Mode } from "../ext/settings";

/** The local actions of the status page: they touch storage only. */
export type LocalAction = "forget" | "reset";
const LOCAL_ACTIONS: readonly LocalAction[] = ["forget", "reset"];

export type Running = { kind: "sync" | "finish"; since: number };
export type Activity = {
  running?: Running;
  pendingMode?: Mode;
  pendingSettings?: true;
  /** The local actions waiting or running, in a fixed order. */
  pendingActions?: LocalAction[];
};

export type ActivityTracker = {
  /** The job, marked running from its start to its end. */
  track(kind: Running["kind"], job: () => Promise<void>): () => Promise<void>;
  /** Marks the mode pending now; the job returned applies it, then clears the mark unless a newer one came. */
  queueMode(mode: Mode, apply: () => Promise<void>): () => Promise<void>;
  /** Marks a settings change pending now; the job returned applies it, then releases the mark (even on a failure). */
  queueSettings(apply: () => Promise<void>): () => Promise<void>;
  /** Marks the action pending now; the job returned applies it, then releases the mark (even on a failure). */
  queueLocal(
    kind: LocalAction,
    apply: () => Promise<void>,
  ): () => Promise<void>;
  current(): Activity;
};

export function createActivity(now: () => number): ActivityTracker {
  let running: Running | undefined;
  let pending: { mode: Mode; ticket: number } | undefined;
  let tickets = 0;
  let settingsWaiting = 0;
  const actionsWaiting: Record<LocalAction, number> = { forget: 0, reset: 0 };
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
    queueSettings(apply) {
      settingsWaiting += 1;
      return async () => {
        try {
          await apply();
        } finally {
          settingsWaiting -= 1;
        }
      };
    },
    queueLocal(kind, apply) {
      actionsWaiting[kind] += 1;
      return async () => {
        try {
          await apply();
        } finally {
          actionsWaiting[kind] -= 1;
        }
      };
    },
    current: () => ({
      ...(running === undefined ? {} : { running: { ...running } }),
      ...(pending === undefined ? {} : { pendingMode: pending.mode }),
      ...(settingsWaiting > 0 ? { pendingSettings: true as const } : {}),
      ...pendingOf(LOCAL_ACTIONS.filter((kind) => actionsWaiting[kind] > 0)),
    }),
  };
}

function pendingOf(actions: LocalAction[]): Activity {
  return actions.length === 0 ? {} : { pendingActions: actions };
}

// A job seen at either end of the snapshot read is said running: a job that ended during the read may have
// saved after it, and the page then asks again.
export function overlapping(before: Activity, after: Activity): Activity {
  const running = after.running ?? before.running;
  const pendingMode = after.pendingMode ?? before.pendingMode;
  const pendingSettings = after.pendingSettings ?? before.pendingSettings;
  const actions = LOCAL_ACTIONS.filter(
    (kind) =>
      before.pendingActions?.includes(kind) ||
      after.pendingActions?.includes(kind),
  );
  return {
    ...(running === undefined ? {} : { running }),
    ...(pendingMode === undefined ? {} : { pendingMode }),
    ...(pendingSettings === undefined ? {} : { pendingSettings }),
    ...pendingOf(actions),
  };
}

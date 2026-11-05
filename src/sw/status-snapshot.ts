// What the status page shows: the mode, the last run and finish, the binding and the counts of what
// waits for the owner. Codes and stored records only: no token, no error text. It only reads (Ruling 20:
// it is answered outside the queue, while a job may run); the router adds what runs and what is pending.

import type { SyncState } from "../core/state";
import type { Thresholds } from "../core/watch-trigger";
import type { JobError } from "../ext/job-error";
import {
  type FinishRecord,
  type Mode,
  pauseFromOf,
  type RunRecord,
  type Settings,
  thresholdsOf,
} from "../ext/settings";
import type { Store } from "../ext/store";
import type { LocalAction, Running } from "./activity";
import type { Binding } from "./binding";
import { pageItems } from "./page-items";
import { toJobError } from "./to-job-error";

export type Counts = {
  pendingRemovals: number;
  openQuestions: number;
  unlinked: number;
};

export type StatusSnapshot = {
  /** Absent when the settings cannot be read. */
  mode?: Mode;
  binding?: Binding;
  lastRun?: RunRecord;
  lastFinish?: FinishRecord;
  /** Absent when the state cannot be read. */
  counts?: Counts;
  /** The end of a viewing per kind. Absent when the settings cannot be read. */
  thresholds?: Thresholds;
  /** The progress from which the pause block appears (0: at any time). Absent with the thresholds. */
  pauseFromPercent?: number;
  /** Why the settings or the state could not be read. */
  error?: JobError;
  /** The job running when the status was asked (in memory, from the router). */
  running?: Running;
  /** The mode a queued set-mode will apply (in memory, from the router). */
  pendingMode?: Mode;
  /** A set-settings waits or runs (in memory, from the router): the values above may be the old ones. */
  pendingSettings?: true;
  /** The local actions (forget, reset) waiting or running (in memory, from the router). */
  pendingActions?: LocalAction[];
};

/** The store as the status reads it: no save. */
export type StoreReader = Pick<Store, "loadSettings" | "loadState">;

// The same items as the page lists (pageItems), so that the count line never disagrees with the page.
function countsOf(state: SyncState): Counts {
  const { questions, unlinked } = pageItems(state);
  const kinds = questions.map((question) => question.kind);
  return {
    pendingRemovals: kinds.filter((kind) => kind === "removal").length,
    openQuestions: kinds.filter((kind) => kind !== "removal").length,
    unlinked: unlinked.length,
  };
}

function fromSettings(settings: Settings): StatusSnapshot {
  const snapshot: StatusSnapshot = {
    mode: settings.mode,
    thresholds: thresholdsOf(settings),
    pauseFromPercent: pauseFromOf(settings),
  };
  if (settings.binding) snapshot.binding = settings.binding;
  if (settings.lastRun) snapshot.lastRun = settings.lastRun;
  if (settings.lastFinish) snapshot.lastFinish = settings.lastFinish;
  return snapshot;
}

export async function statusSnapshot(
  store: StoreReader,
): Promise<StatusSnapshot> {
  let settings: Settings;
  try {
    settings = await store.loadSettings();
  } catch (error) {
    return { error: toJobError(error) };
  }
  const snapshot = fromSettings(settings);
  try {
    snapshot.counts = countsOf(await store.loadState());
  } catch (error) {
    snapshot.error = toJobError(error);
  }
  return snapshot;
}

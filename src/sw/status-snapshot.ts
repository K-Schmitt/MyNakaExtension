// What the status page shows: the mode, the last run and finish, the binding and the counts of what
// waits for the owner. Codes and stored records only: no token, no error text.

import type { SyncState } from "../core/state";
import type { JobError } from "../ext/job-error";
import type { FinishRecord, Mode, RunRecord, Settings } from "../ext/settings";
import type { Store } from "../ext/store";
import type { Binding } from "./binding";
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
  /** Why the settings or the state could not be read. */
  error?: JobError;
};

function countsOf(state: SyncState): Counts {
  const kinds = state.pending.map((item) => item.kind);
  return {
    pendingRemovals: kinds.filter((kind) => kind === "removal").length,
    openQuestions: kinds.filter((kind) => kind === "ambiguity").length,
    unlinked: state.unlinked.length,
  };
}

function fromSettings(settings: Settings): StatusSnapshot {
  const snapshot: StatusSnapshot = { mode: settings.mode };
  if (settings.binding) snapshot.binding = settings.binding;
  if (settings.lastRun) snapshot.lastRun = settings.lastRun;
  if (settings.lastFinish) snapshot.lastFinish = settings.lastFinish;
  return snapshot;
}

export async function statusSnapshot(store: Store): Promise<StatusSnapshot> {
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

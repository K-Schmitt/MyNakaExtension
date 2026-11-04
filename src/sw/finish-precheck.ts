// The finishes our own storage decides, at no cost (Ruling 18): a message that is not complete under the
// stored threshold, or whose content is already handled, needs no network call, no count and no record.
// Plan 2's own predicates decide, so the pre-check and the handler can never disagree. The state is only
// read here.

import type { FinishedMessage } from "../content/playback-tracker";
import { isComplete } from "../core/finish-handler";
import { isHandled } from "../core/state";
import type { JobError } from "../ext/job-error";
import type { Store } from "../ext/store";
import { toJobError } from "./to-job-error";

export type PreCheck = "free" | "go" | { error: JobError };

export async function preCheck(
  store: Store,
  msg: FinishedMessage,
  key: string,
): Promise<PreCheck> {
  try {
    const state = await store.loadState();
    return isComplete(msg, state) && !isHandled(state, key) ? "go" : "free";
  } catch (error) {
    return { error: toJobError(error) };
  }
}

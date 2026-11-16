// The finishes our own storage decides, at no cost: a message that is not complete under the settings'
// threshold for its kind, or whose content is already handled, needs no network call, no count and no record.
// The handler's own predicates decide, so the pre-check and the handler can never disagree. The state is only
// read here.

import type { FinishedMessage } from "../content/playback-tracker";
import { isComplete } from "../core/finish-handler";
import { isHandled } from "../core/state";
import type { Thresholds } from "../core/watch-trigger";
import type { JobError } from "../ext/job-error";
import type { Store } from "../ext/store";
import { toJobError } from "./to-job-error";

// A message carries no kind: it is an episode when both its season and its episode are present.
function kindOf(msg: FinishedMessage): "film" | "episode" {
  return msg.season !== undefined && msg.episode !== undefined
    ? "episode"
    : "film";
}

export type PreCheck = "free" | "go" | { error: JobError };

export async function preCheck(
  store: Store,
  msg: FinishedMessage,
  key: string,
  thresholds: Thresholds,
): Promise<PreCheck> {
  try {
    const state = await store.loadState();
    const complete = isComplete({ ...msg, kind: kindOf(msg) }, thresholds);
    return complete && !isHandled(state, key) ? "go" : "free";
  } catch (error) {
    return { error: toJobError(error) };
  }
}

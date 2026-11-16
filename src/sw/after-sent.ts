// A local save after a write that reached SensCritique: its failure never turns the write into a failure,
// and the write is never sent again. The save's fixed code is handed back so the answer can say it.

import type { JobError } from "../ext/job-error";
import { toJobError } from "./to-job-error";

/** Runs the save; its error code, or undefined when it held. */
export async function savedAfterSent(
  save: () => Promise<void>,
): Promise<JobError | undefined> {
  try {
    await save();
    return undefined;
  } catch (error) {
    return toJobError(error);
  }
}

// The first thing that stopped part of a run: an error that opened a breaker, or the loss of the job's
// Naka tab. The sync swallows those per id and per write and completes the run; the run record
// then says "ok" with this code, so the status can say why some titles were left for later.

import type { JobError } from "../ext/job-error";
import { toJobError } from "./to-job-error";

export type FirstStop = {
  note(error: Error): void;
  code(): JobError | undefined;
};

export function firstStop(): FirstStop {
  let first: Error | undefined;
  return {
    note(error) {
      first ??= error;
    },
    code: () => (first === undefined ? undefined : toJobError(first)),
  };
}

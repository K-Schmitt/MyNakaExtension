// The one code a failed job records: never the error's text, which may come from a site.

import { type JobError, JobRejected } from "../ext/job-error";
import { StoredStateError } from "../ext/stored-error";
import { ScUnauthenticatedError } from "../sc/sc-errors";

export function toJobError(error: unknown): JobError {
  if (error instanceof JobRejected) return error.code;
  if (error instanceof StoredStateError) return "stored-state";
  if (error instanceof ScUnauthenticatedError) return "sc-session";
  return "unavailable";
}

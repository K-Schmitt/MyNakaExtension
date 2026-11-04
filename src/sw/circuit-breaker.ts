// A port stops calling its site for the rest of a job after a rate-limit or a session error: every later
// call rejects at once with the error that opened it. Those errors carry fixed text only (an operation
// label and a status), so rethrowing one copies nothing of a token or a response.

import { JobRejected } from "../ext/job-error";
import { NakaUnavailableError } from "../naka/naka-errors";
import { ScUnauthenticatedError, ScUnavailableError } from "../sc/sc-errors";

const RATE_LIMITED = 429;
// sc-transport's `send` words every non-200 answer "SensCritique <label>: HTTP <status>".
const SC_RATE_LIMITED = "HTTP 429";

export function opensBreaker(error: unknown): boolean {
  if (error instanceof JobRejected) return error.code === "naka-session";
  if (error instanceof NakaUnavailableError) {
    return error.status === RATE_LIMITED;
  }
  if (error instanceof ScUnauthenticatedError) return true;
  return (
    error instanceof ScUnavailableError &&
    error.message.includes(SC_RATE_LIMITED)
  );
}

export function withBreaker<A extends unknown[], R>(
  call: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  let opened: Error | undefined;
  return async (...args) => {
    if (opened !== undefined) throw opened;
    try {
      return await call(...args);
    } catch (error) {
      if (error instanceof Error && opensBreaker(error)) opened = error;
      throw error;
    }
  };
}

export type JobError =
  | "no-naka-tab"
  | "naka-session"
  | "sc-session"
  | "other-account"
  | "stored-state"
  | "unavailable";

const MESSAGES: Record<JobError, string> = {
  "no-naka-tab": "no Naka tab",
  "naka-session": "Naka session missing",
  "sc-session": "SensCritique session missing",
  "other-account": "another account is bound",
  "stored-state": "stored state unreadable",
  unavailable: "service unavailable",
};

// A job refused before it ran. One fixed message per code: no value from the page or the account.
export class JobRejected extends Error {
  readonly code: JobError;

  constructor(code: JobError) {
    super(MESSAGES[code]);
    this.name = "JobRejected";
    this.code = code;
  }
}

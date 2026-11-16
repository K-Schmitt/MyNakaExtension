// Which failures of a finish leave it waiting for a Naka tab (retry-job). A first failure starts the wait; a
// retry that fails again for one of these keeps it.

import type { JobError } from "../ext/job-error";

export const STARTS_WAITING: readonly JobError[] = [
  "no-naka-tab",
  "naka-session",
];

export const KEEPS_WAITING: readonly JobError[] = [
  "no-naka-tab",
  "naka-session",
  "finish-limit",
  "naka-tab-changed",
];

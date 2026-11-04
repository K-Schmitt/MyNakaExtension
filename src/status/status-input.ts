// The worker's answer to `status`, checked before the page reads it. It comes from our own worker but is
// treated as untrusted: a fresh object holding the known keys only, or undefined. Never throws.

import {
  asInt,
  asOneOf,
  asRecord,
  asString,
  whenPresent,
} from "../ext/field-checks";
import { ERROR_CODES, MODES, parseRunRecord } from "../ext/run-record-schema";
import type { FinishRecord, Mode } from "../ext/settings";
import type { Counts, StatusSnapshot } from "../sw/status-snapshot";

const OUTCOMES: readonly FinishRecord["outcome"][] = [
  "ignored",
  "needs-choice",
  "not-found",
  "done",
  "failed",
];

function parseCounts(raw: unknown): Counts {
  const record = asRecord(raw, "counts");
  return {
    pendingRemovals: asInt(record.pendingRemovals, 0, "pendingRemovals"),
    openQuestions: asInt(record.openQuestions, 0, "openQuestions"),
    unlinked: asInt(record.unlinked, 0, "unlinked"),
  };
}

// An error is there if and only if the finish failed, as the worker stores it.
function parseFinish(raw: unknown): FinishRecord {
  const record = asRecord(raw, "lastFinish");
  const outcome = asOneOf(record.outcome, OUTCOMES, "outcome");
  const base = {
    at: asInt(record.at, 0, "at"),
    key: asString(record.key, "key"),
    outcome,
  };
  if (outcome !== "failed") {
    if (record.error !== undefined) throw new Error("error");
    return base;
  }
  return { ...base, error: asOneOf(record.error, ERROR_CODES, "error") };
}

function parseSnapshot(raw: unknown): StatusSnapshot {
  const record = asRecord(raw, "status");
  const mode = whenPresent(record.mode, (v) => asOneOf<Mode>(v, MODES, "mode"));
  const lastRun = whenPresent(record.lastRun, (v) =>
    parseRunRecord(v, "lastRun"),
  );
  const lastFinish = whenPresent(record.lastFinish, parseFinish);
  const counts = whenPresent(record.counts, parseCounts);
  const error = whenPresent(record.error, (v) =>
    asOneOf(v, ERROR_CODES, "error"),
  );
  return {
    ...(mode === undefined ? {} : { mode }),
    ...(lastRun === undefined ? {} : { lastRun }),
    ...(lastFinish === undefined ? {} : { lastFinish }),
    ...(counts === undefined ? {} : { counts }),
    ...(error === undefined ? {} : { error }),
  };
}

export function readSnapshot(raw: unknown): StatusSnapshot | undefined {
  try {
    return parseSnapshot(raw);
  } catch {
    return undefined;
  }
}

// The worker's answer to `status`, checked before the page reads it. It comes from our own worker but is
// treated as untrusted: a fresh object holding the known keys only, or undefined. Never throws. The binding
// and the last finish go through the very parsers the stored settings do.

import {
  asInt,
  asOneOf,
  asRecord,
  fail,
  valuesOf,
  whenPresent,
} from "../ext/field-checks";
import { ERROR_CODES, MODES, parseRunRecord } from "../ext/run-record-schema";
import { type Mode, parseBinding, parseFinish } from "../ext/settings";
import {
  parsePauseFromPercent,
  parseThresholds,
} from "../ext/thresholds-schema";
import type { LocalAction, Running } from "../sw/activity";
import type { Counts, StatusSnapshot } from "../sw/status-snapshot";

const LOCAL_ACTIONS = valuesOf<LocalAction>({ forget: true, reset: true });
const RUNNING_KINDS = valuesOf<Running["kind"]>({ sync: true, finish: true });

function parseRunning(raw: unknown): Running {
  const record = asRecord(raw, "running");
  return {
    kind: asOneOf(record.kind, RUNNING_KINDS, "kind"),
    since: asInt(record.since, 0, "since"),
  };
}

function parseCounts(raw: unknown): Counts {
  const record = asRecord(raw, "counts");
  return {
    pendingRemovals: asInt(record.pendingRemovals, 0, "pendingRemovals"),
    openQuestions: asInt(record.openQuestions, 0, "openQuestions"),
    unlinked: asInt(record.unlinked, 0, "unlinked"),
  };
}

// A marker is `true` or absent: `false`, null or anything else refuses the answer.
function parsePending(raw: unknown): true {
  return raw === true ? true : fail("marker");
}

// A non-empty list of known actions, each once: an empty or repeating list is refused.
function parseActions(raw: unknown): LocalAction[] {
  if (!Array.isArray(raw) || raw.length === 0) return fail("pendingActions");
  const actions = raw.map((v) => asOneOf(v, LOCAL_ACTIONS, "pendingActions"));
  return new Set(actions).size === actions.length
    ? actions
    : fail("pendingActions");
}

function parseSnapshot(raw: unknown): StatusSnapshot {
  const record = asRecord(raw, "status");
  const mode = whenPresent(record.mode, (v) => asOneOf<Mode>(v, MODES, "mode"));
  const firstRunPending = whenPresent(record.firstRunPending, parsePending);
  const binding = whenPresent(record.binding, parseBinding);
  const lastRun = whenPresent(record.lastRun, (v) =>
    parseRunRecord(v, "lastRun"),
  );
  const lastFinish = whenPresent(record.lastFinish, parseFinish);
  const counts = whenPresent(record.counts, parseCounts);
  const error = whenPresent(record.error, (v) =>
    asOneOf(v, ERROR_CODES, "error"),
  );
  const running = whenPresent(record.running, parseRunning);
  const pendingMode = whenPresent(record.pendingMode, (v) =>
    asOneOf<Mode>(v, MODES, "pendingMode"),
  );
  const thresholds = whenPresent(record.thresholds, parseThresholds);
  const pauseFromPercent = whenPresent(
    record.pauseFromPercent,
    parsePauseFromPercent,
  );
  const pendingRatings = whenPresent(record.pendingRatings, (v) =>
    asInt(v, 0, "pendingRatings"),
  );
  const pendingSettings = whenPresent(record.pendingSettings, parsePending);
  const pendingActions = whenPresent(record.pendingActions, parseActions);
  return {
    ...(pendingActions === undefined ? {} : { pendingActions }),
    ...(pendingSettings === undefined ? {} : { pendingSettings }),
    ...(mode === undefined ? {} : { mode }),
    ...(firstRunPending === undefined ? {} : { firstRunPending }),
    ...(binding === undefined ? {} : { binding }),
    ...(lastRun === undefined ? {} : { lastRun }),
    ...(lastFinish === undefined ? {} : { lastFinish }),
    ...(counts === undefined ? {} : { counts }),
    ...(pendingRatings === undefined ? {} : { pendingRatings }),
    ...(error === undefined ? {} : { error }),
    ...(running === undefined ? {} : { running }),
    ...(pendingMode === undefined ? {} : { pendingMode }),
    ...(thresholds === undefined ? {} : { thresholds }),
    ...(pauseFromPercent === undefined ? {} : { pauseFromPercent }),
  };
}

export function readSnapshot(raw: unknown): StatusSnapshot | undefined {
  try {
    return parseSnapshot(raw);
  } catch {
    return undefined;
  }
}

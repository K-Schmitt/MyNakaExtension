import {
  asInt,
  asList,
  asOneOf,
  asRecord,
  asString,
  onlyKeys,
  whenPresent,
} from "./field-checks";
import type { JobError } from "./job-error";
import { parseReport } from "./report-schema";
import type { Mode, RunRecord } from "./settings";

export const MODES: readonly Mode[] = ["simulation", "live"];
const TRIGGERS = ["naka-ready", "playlist", "button"] as const;
const OUTCOMES = ["ok", "failed"] as const;
const SIDES = ["naka", "sc"] as const;
const ERRORS: Record<JobError, true> = {
  "no-naka-tab": true,
  "naka-session": true,
  "sc-session": true,
  "other-account": true,
  "stored-state": true,
  unavailable: true,
  "finish-limit": true,
};
export const ERROR_CODES = Object.keys(ERRORS) as JobError[];
const KEYS = ["at", "trigger", "mode", "outcome", "error", "report", "preview"];

function parsePreviewItem(raw: unknown, path: string) {
  const record = asRecord(raw, path);
  onlyKeys(record, ["side", "title"], path);
  return {
    side: asOneOf(record.side, SIDES, `${path}.side`),
    title: asString(record.title, `${path}.title`),
  };
}

export function parseRunRecord(raw: unknown, path: string): RunRecord {
  const record = asRecord(raw, path);
  onlyKeys(record, KEYS, path);
  const error = whenPresent(record.error, (v) =>
    asOneOf(v, ERROR_CODES, `${path}.error`),
  );
  const report = whenPresent(record.report, (v) =>
    parseReport(v, `${path}.report`),
  );
  const preview = whenPresent(record.preview, (v) =>
    asList(v, `${path}.preview`, parsePreviewItem),
  );
  return {
    at: asInt(record.at, 0, `${path}.at`),
    trigger: asOneOf(record.trigger, TRIGGERS, `${path}.trigger`),
    mode: asOneOf(record.mode, MODES, `${path}.mode`),
    outcome: asOneOf(record.outcome, OUTCOMES, `${path}.outcome`),
    ...(error === undefined ? {} : { error }),
    ...(report === undefined ? {} : { report }),
    ...(preview === undefined ? {} : { preview }),
  };
}

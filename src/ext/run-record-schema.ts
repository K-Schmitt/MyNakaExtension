import {
  asInt,
  asList,
  asOneOf,
  asRecord,
  asString,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";
import type { JobError } from "./job-error";
import { parseReport } from "./report-schema";
import type { Mode, RunRecord } from "./settings";

type PreviewItem = NonNullable<RunRecord["preview"]>[number];

export const MODES = valuesOf<Mode>({ simulation: true, live: true });
const TRIGGERS = valuesOf<RunRecord["trigger"]>({
  "naka-ready": true,
  playlist: true,
  button: true,
});
const OUTCOMES = valuesOf<RunRecord["outcome"]>({ ok: true, failed: true });
const SIDES = valuesOf<PreviewItem["side"]>({ naka: true, sc: true });
export const ERROR_CODES = valuesOf<JobError>({
  "no-naka-tab": true,
  "naka-session": true,
  "sc-session": true,
  "other-account": true,
  "stored-state": true,
  unavailable: true,
  "finish-limit": true,
  "naka-list-empty": true,
});
const KEYS = valuesOf<keyof RunRecord>({
  at: true,
  trigger: true,
  mode: true,
  outcome: true,
  error: true,
  report: true,
  preview: true,
});
const PREVIEW_KEYS = valuesOf<keyof PreviewItem>({ side: true, title: true });

function parsePreviewItem(raw: unknown, path: string) {
  const record = asRecord(raw, path);
  onlyKeys(record, PREVIEW_KEYS, path);
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

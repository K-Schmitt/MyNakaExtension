import {
  asInt,
  asList,
  asOneOf,
  asRecord,
  asString,
  fail,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";
import type { JobError } from "./job-error";
import { parseReport } from "./report-schema";
import type { Mode, PreviewItem, RunRecord } from "./settings";

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
  "naka-tab-changed": true,
  "naka-content-unknown": true,
});
const KEYS = valuesOf<keyof RunRecord>({
  at: true,
  trigger: true,
  mode: true,
  outcome: true,
  error: true,
  report: true,
  preview: true,
  next: true,
});
const TYPES = valuesOf<NonNullable<PreviewItem["type"]>>({
  film: true,
  serie: true,
});
const PREVIEW_KEYS = valuesOf<keyof PreviewItem>({
  side: true,
  title: true,
  year: true,
  type: true,
});
const MIN_YEAR = 1800;
const MAX_YEAR = 2100;

function parseYear(raw: unknown, path: string): number {
  const year = asInt(raw, MIN_YEAR, path);
  return year > MAX_YEAR ? fail(path) : year;
}

function parsePreviewItem(raw: unknown, path: string): PreviewItem {
  const record = asRecord(raw, path);
  onlyKeys(record, PREVIEW_KEYS, path);
  const year = whenPresent(record.year, (v) => parseYear(v, `${path}.year`));
  const type = whenPresent(record.type, (v) =>
    asOneOf(v, TYPES, `${path}.type`),
  );
  return {
    side: asOneOf(record.side, SIDES, `${path}.side`),
    title: asString(record.title, `${path}.title`),
    ...(year === undefined ? {} : { year }),
    ...(type === undefined ? {} : { type }),
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
  const next = whenPresent(record.next, (v) =>
    asList(v, `${path}.next`, parsePreviewItem),
  );
  return {
    at: asInt(record.at, 0, `${path}.at`),
    trigger: asOneOf(record.trigger, TRIGGERS, `${path}.trigger`),
    mode: asOneOf(record.mode, MODES, `${path}.mode`),
    outcome: asOneOf(record.outcome, OUTCOMES, `${path}.outcome`),
    ...(error === undefined ? {} : { error }),
    ...(report === undefined ? {} : { report }),
    ...(preview === undefined ? {} : { preview }),
    ...(next === undefined ? {} : { next }),
  };
}

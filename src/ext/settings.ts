import type { FinishOutcome } from "../core/finish-handler";
import type { SyncReport } from "../core/sync-runner";
import type { MediaType } from "../core/title-match";
import { DEFAULT_THRESHOLDS, type Thresholds } from "../core/watch-trigger";
import { type LastAnswer, parseLastAnswer } from "./answer-record";
import {
  asInt,
  asOneOf,
  asRecord,
  asString,
  fail,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";
import { type FinishWindow, MAX_FINISHES_PER_WINDOW } from "./finish-window";
import { MAX_FORGETS_PER_WINDOW } from "./forget-window";
import { parseContentKey } from "./item-schema";
import type { JobError } from "./job-error";
import { ERROR_CODES, MODES, parseRunRecord } from "./run-record-schema";
import { parsePauseFromPercent, parseThresholds } from "./thresholds-schema";
import { parseWindow } from "./window-schema";

export type Mode = "simulation" | "live";

export type PreviewItem = {
  side: "naka" | "sc";
  title: string;
  year?: number;
  type?: MediaType;
};

export type RunRecord = {
  at: number;
  trigger: "naka-ready" | "playlist" | "button";
  mode: Mode;
  outcome: "ok" | "failed";
  error?: JobError;
  report?: SyncReport;
  preview?: PreviewItem[];
  /** The next pass's deferred writes (at most MAX_WRITES_PER_RUN), titled like the preview. */
  next?: PreviewItem[];
};

export type FinishRecord = {
  at: number;
  key: string;
  outcome: FinishOutcome["kind"] | "failed";
  /** Present if and only if the outcome is "failed" (Ruling 13). */
  error?: JobError;
  /** The Naka title of the film or the series, when the finish got as far as reading it. */
  title?: string;
};

/** A finish without its date and key: what a rating-card answer tells the tab. */
export type LastFinish = Pick<FinishRecord, "outcome" | "error">;

export type Settings = {
  mode: Mode;
  binding?: { scUsername: string; nakaAccount?: string };
  lastAutoRunAt?: number;
  lastRun?: RunRecord;
  lastFinish?: FinishRecord;
  /** The hour's budget of finishes (Ruling 15). */
  finishWindow?: FinishWindow;
  /** The hour's budget of forgets asked by a Naka tab (a forged unticked « vu »). */
  forgetWindow?: FinishWindow;
  /** The end of a viewing, per kind (each on the grid of THRESHOLD_CHOICES). Absent: the defaults. */
  thresholds?: Thresholds;
  /** An integer 0 to 99: the progress from which a pause shows the pause block. 0 means "at any time". */
  pauseFromPercent?: number;
  /** The outcome of the last answer to a question (D8). */
  lastAnswer?: LastAnswer;
};

// A Record, so that a field added to Settings without being added here does not compile.
const KEYS = valuesOf<keyof Settings>({
  mode: true,
  binding: true,
  lastAutoRunAt: true,
  lastRun: true,
  lastFinish: true,
  finishWindow: true,
  forgetWindow: true,
  thresholds: true,
  pauseFromPercent: true,
  lastAnswer: true,
});
const FINISH_OUTCOMES = valuesOf<FinishRecord["outcome"]>({
  ignored: true,
  "needs-choice": true,
  "not-found": true,
  done: true,
  failed: true,
});

// Shared with the status page, which reads the binding from the worker's answer.
export function parseBinding(raw: unknown): NonNullable<Settings["binding"]> {
  const path = "settings.binding";
  const record = asRecord(raw, path);
  onlyKeys(record, ["scUsername", "nakaAccount"], path);
  const scUsername = asString(record.scUsername, `${path}.scUsername`);
  if (scUsername === "") return fail(`${path}.scUsername`);
  const nakaAccount = whenPresent(record.nakaAccount, (v) =>
    asString(v, `${path}.nakaAccount`),
  );
  return nakaAccount === undefined
    ? { scUsername }
    : { scUsername, nakaAccount };
}

// The reason comes with a failure, and only with one.
function finishError(
  raw: unknown,
  outcome: FinishRecord["outcome"],
  path: string,
): JobError | undefined {
  if (outcome === "failed") return asOneOf(raw, ERROR_CODES, path);
  return raw === undefined ? undefined : fail(path);
}

// Shared with the tab, which reads a finish's outcome from a rating-card answer.
export function parseOutcome(
  record: Record<string, unknown>,
  path: string,
): LastFinish {
  const outcome = asOneOf(record.outcome, FINISH_OUTCOMES, `${path}.outcome`);
  const error = finishError(record.error, outcome, `${path}.error`);
  return error === undefined ? { outcome } : { outcome, error };
}

// Shared with the status page, which reads the last finish from the worker's answer.
export function parseFinish(raw: unknown): FinishRecord {
  const path = "settings.lastFinish";
  const record = asRecord(raw, path);
  onlyKeys(record, ["at", "key", "outcome", "error", "title"], path);
  const done = parseOutcome(record, path);
  const title = whenPresent(record.title, (v) => asString(v, `${path}.title`));
  return {
    at: asInt(record.at, 0, `${path}.at`),
    key: parseContentKey(record.key, `${path}.key`),
    ...done,
    ...(title === undefined ? {} : { title }),
  };
}

function parseForgetWindow(raw: unknown): FinishWindow {
  return parseWindow(raw, "settings.forgetWindow", MAX_FORGETS_PER_WINDOW);
}

function parseFinishWindow(raw: unknown): FinishWindow {
  return parseWindow(raw, "settings.finishWindow", MAX_FINISHES_PER_WINDOW);
}

// The settings read from storage. An absent key (undefined) is a first install: simulation, nothing else.
export function parseSettings(raw: unknown): Settings {
  if (raw === undefined) return { mode: "simulation" };
  const record = asRecord(raw, "settings");
  onlyKeys(record, KEYS, "settings");
  const binding = whenPresent(record.binding, parseBinding);
  const lastAutoRunAt = whenPresent(record.lastAutoRunAt, (v) =>
    asInt(v, 0, "settings.lastAutoRunAt"),
  );
  const lastRun = whenPresent(record.lastRun, (v) =>
    parseRunRecord(v, "settings.lastRun"),
  );
  const lastFinish = whenPresent(record.lastFinish, parseFinish);
  const finishWindow = whenPresent(record.finishWindow, parseFinishWindow);
  const forgetWindow = whenPresent(record.forgetWindow, parseForgetWindow);
  const thresholds = whenPresent(record.thresholds, parseThresholds);
  const pauseFromPercent = whenPresent(
    record.pauseFromPercent,
    parsePauseFromPercent,
  );
  const lastAnswer = whenPresent(record.lastAnswer, (v) =>
    parseLastAnswer(v, "settings.lastAnswer"),
  );
  return {
    mode: asOneOf(record.mode, MODES, "settings.mode"),
    ...(binding === undefined ? {} : { binding }),
    ...(lastAutoRunAt === undefined ? {} : { lastAutoRunAt }),
    ...(lastRun === undefined ? {} : { lastRun }),
    ...(lastFinish === undefined ? {} : { lastFinish }),
    ...(finishWindow === undefined ? {} : { finishWindow }),
    ...(forgetWindow === undefined ? {} : { forgetWindow }),
    ...(thresholds === undefined ? {} : { thresholds }),
    ...(pauseFromPercent === undefined ? {} : { pauseFromPercent }),
    ...(lastAnswer === undefined ? {} : { lastAnswer }),
  };
}

export function thresholdsOf(s: Settings): Thresholds {
  return s.thresholds ?? DEFAULT_THRESHOLDS;
}

// 0 means "at any time".
export function pauseFromOf(s: Settings): number {
  return s.pauseFromPercent ?? 0;
}

import type { FinishOutcome } from "../core/finish-handler";
import type { SyncReport } from "../core/sync-runner";
import {
  asInt,
  asOneOf,
  asRecord,
  asString,
  fail,
  onlyKeys,
  whenPresent,
} from "./field-checks";
import { parseContentKey } from "./item-schema";
import type { JobError } from "./job-error";
import { MODES, parseRunRecord } from "./run-record-schema";

export type Mode = "simulation" | "live";

export type RunRecord = {
  at: number;
  trigger: "naka-ready" | "playlist" | "button";
  mode: Mode;
  outcome: "ok" | "failed";
  error?: JobError;
  report?: SyncReport;
  preview?: { side: "naka" | "sc"; title: string }[];
};

export type FinishRecord = {
  at: number;
  key: string;
  outcome: FinishOutcome["kind"] | "failed";
};

export type Settings = {
  mode: Mode;
  binding?: { scUsername: string; nakaAccount?: string };
  lastAutoRunAt?: number;
  lastRun?: RunRecord;
  lastFinish?: FinishRecord;
};

const KEYS = ["mode", "binding", "lastAutoRunAt", "lastRun", "lastFinish"];
const FINISH_KINDS: Record<FinishOutcome["kind"] | "failed", true> = {
  ignored: true,
  "needs-choice": true,
  "not-found": true,
  done: true,
  failed: true,
};
const FINISH_OUTCOMES = Object.keys(FINISH_KINDS) as FinishRecord["outcome"][];

function parseBinding(raw: unknown): NonNullable<Settings["binding"]> {
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

function parseFinish(raw: unknown): FinishRecord {
  const path = "settings.lastFinish";
  const record = asRecord(raw, path);
  onlyKeys(record, ["at", "key", "outcome"], path);
  return {
    at: asInt(record.at, 0, `${path}.at`),
    key: parseContentKey(record.key, `${path}.key`),
    outcome: asOneOf(record.outcome, FINISH_OUTCOMES, `${path}.outcome`),
  };
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
  return {
    mode: asOneOf(record.mode, MODES, "settings.mode"),
    ...(binding === undefined ? {} : { binding }),
    ...(lastAutoRunAt === undefined ? {} : { lastAutoRunAt }),
    ...(lastRun === undefined ? {} : { lastRun }),
    ...(lastFinish === undefined ? {} : { lastFinish }),
  };
}

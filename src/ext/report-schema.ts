import type { SyncReport } from "../core/sync-runner";
import { asInt, asRecord, onlyKeys } from "./field-checks";
import { parsePairs } from "./pair-schema";

const KEYS = [
  "added",
  "deferred",
  "failed",
  "alreadyDone",
  "pendingRemovals",
  "unresolved",
];

export function parseReport(raw: unknown, path: string): SyncReport {
  const record = asRecord(raw, path);
  onlyKeys(record, KEYS, path);
  return {
    added: parsePairs(record.added, `${path}.added`),
    deferred: parsePairs(record.deferred, `${path}.deferred`),
    failed: parsePairs(record.failed, `${path}.failed`),
    alreadyDone: parsePairs(record.alreadyDone, `${path}.alreadyDone`),
    pendingRemovals: asInt(
      record.pendingRemovals,
      0,
      `${path}.pendingRemovals`,
    ),
    unresolved: asInt(record.unresolved, 0, `${path}.unresolved`),
  };
}

// Validates the sync state read from storage: every field, no unknown key. Throws a StoredStateError
// holding the field path, never the value.

import type { SyncState } from "../core/state";
import { asInt, asList, asRecord, fail, onlyKeys } from "./field-checks";
import { parseContentKey, parsePending, parseUnlinked } from "./item-schema";
import { parseMapping, parsePairs } from "./pair-schema";
import { parsePresence } from "./presence-schema";

const KEYS = [
  "version",
  "mapping",
  "snapshot",
  "settled",
  "pending",
  "handled",
  "unlinked",
  "retryLast",
  "run",
  "presence",
  "threshold",
];

function parseThreshold(raw: unknown): number {
  if (typeof raw !== "number" || !(raw > 0 && raw <= 1))
    return fail("threshold");
  return raw;
}

export function parseState(raw: unknown): SyncState {
  const record = asRecord(raw, "state");
  onlyKeys(record, KEYS, "state");
  if (record.version !== 1) return fail("version");
  const run = asInt(record.run, 0, "run");
  return {
    version: 1,
    mapping: parseMapping(record.mapping, "mapping"),
    snapshot: parsePairs(record.snapshot, "snapshot"),
    settled: parsePairs(record.settled, "settled"),
    pending: asList(record.pending, "pending", parsePending),
    handled: asList(record.handled, "handled", parseContentKey),
    unlinked: asList(record.unlinked, "unlinked", parseUnlinked),
    retryLast: parsePairs(record.retryLast, "retryLast"),
    run,
    presence: parsePresence(record.presence, "presence", run),
    threshold: parseThreshold(record.threshold),
  };
}

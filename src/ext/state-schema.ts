// Validates the sync state read from storage: every field, no unknown key. Throws a StoredStateError
// holding the field path, never the value.

import type { SyncState } from "../core/state";
import {
  asInt,
  asList,
  asRecord,
  asString,
  fail,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";
import { parseContentKey, parsePending, parseUnlinked } from "./item-schema";
import { parseMapping, parsePairs } from "./pair-schema";
import { parsePresence } from "./presence-schema";

const KEYS = valuesOf<keyof SyncState>({
  version: true,
  mapping: true,
  snapshot: true,
  settled: true,
  pending: true,
  handled: true,
  handledTitles: true,
  unlinked: true,
  retryLast: true,
  run: true,
  presence: true,
  threshold: true,
});

// The key is a content key, the title any text: the page shows it through textContent only.
function parseHandledTitles(raw: unknown): Record<string, string> {
  const record = asRecord(raw, "handledTitles");
  const titles: Record<string, string> = {};
  for (const [key, title] of Object.entries(record)) {
    titles[parseContentKey(key, "handledTitles")] = asString(
      title,
      "handledTitles",
    );
  }
  return titles;
}

function parseThreshold(raw: unknown): number {
  if (typeof raw !== "number" || !(raw > 0 && raw <= 1))
    return fail("threshold");
  return raw;
}

function titlesOf(record: Record<string, unknown>) {
  const handledTitles = whenPresent(record.handledTitles, parseHandledTitles);
  return handledTitles === undefined ? {} : { handledTitles };
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
    ...titlesOf(record),
    unlinked: asList(record.unlinked, "unlinked", parseUnlinked),
    retryLast: parsePairs(record.retryLast, "retryLast"),
    run,
    presence: parsePresence(record.presence, "presence", run),
    threshold: parseThreshold(record.threshold),
  };
}

import type { RetryFinish } from "../core/retry-finishes";
import { MAX_RETRY_FINISHES } from "../core/retry-finishes";
import {
  asInt,
  asList,
  asRecord,
  fail,
  onlyKeys,
  valuesOf,
} from "./field-checks";
import { parseContentKey, parsePending } from "./item-schema";
import { parsePair, parsePairs } from "./pair-schema";

const ENTRY_KEYS = valuesOf<keyof RetryFinish>({
  key: true,
  pair: true,
  evicted: true,
  question: true,
  at: true,
});

// The question is a naka-side ambiguity as it was before the answer: it holds no finish of its own.
function parseQuestion(raw: unknown, path: string): RetryFinish["question"] {
  const item = parsePending(raw, path);
  if (item.kind !== "ambiguity" || item.finish !== undefined) return fail(path);
  return item;
}

function parseEntry(raw: unknown, path: string): RetryFinish {
  const record = asRecord(raw, path);
  onlyKeys(record, ENTRY_KEYS, path);
  return {
    key: parseContentKey(record.key, `${path}.key`),
    pair: parsePair(record.pair, `${path}.pair`),
    evicted: parsePairs(record.evicted, `${path}.evicted`),
    question: parseQuestion(record.question, `${path}.question`),
    at: asInt(record.at, 0, `${path}.at`),
  };
}

export function parseRetryFinishes(raw: unknown, path: string): RetryFinish[] {
  if (Array.isArray(raw) && raw.length > MAX_RETRY_FINISHES) return fail(path);
  return asList(raw, path, parseEntry);
}

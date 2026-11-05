import type { PendingItem, UnlinkedItem } from "../core/state";
import {
  asBoolean,
  asId,
  asList,
  asOneOf,
  asRecord,
  asString,
  fail,
  onlyKeys,
  valuesOf,
} from "./field-checks";
import { parsePair } from "./pair-schema";

const SIDES = valuesOf<UnlinkedItem["side"]>({ naka: true, sc: true });
const REASONS = valuesOf<UnlinkedItem["reason"]>({
  "no-match": true,
  "not-in-catalogue": true,
});
const KINDS = valuesOf<PendingItem["kind"]>({ removal: true, ambiguity: true });
const REMOVAL_KEYS = valuesOf<keyof Extract<PendingItem, { kind: "removal" }>>({
  kind: true,
  removeFrom: true,
  pair: true,
  asked: true,
});
const AMBIGUITY_KEYS = valuesOf<
  keyof Extract<PendingItem, { kind: "ambiguity" }>
>({ kind: true, side: true, id: true, candidateIds: true });
const UNLINKED_KEYS = valuesOf<keyof UnlinkedItem>({
  side: true,
  id: true,
  title: true,
  reason: true,
});

// Movie or episode content key, as the finish handler writes it.
const CONTENT_KEY = /^(movie:\d+|tv:\d+:S\d+E\d+)$/;

export function parseContentKey(raw: unknown, path: string): string {
  const key = asString(raw, path);
  if (!CONTENT_KEY.test(key)) return fail(path);
  return key;
}

function parseRemoval(record: Record<string, unknown>, path: string) {
  onlyKeys(record, REMOVAL_KEYS, path);
  return {
    kind: "removal" as const,
    removeFrom: asOneOf(record.removeFrom, SIDES, `${path}.removeFrom`),
    pair: parsePair(record.pair, `${path}.pair`),
    asked: asBoolean(record.asked, `${path}.asked`),
  };
}

function parseAmbiguity(record: Record<string, unknown>, path: string) {
  onlyKeys(record, AMBIGUITY_KEYS, path);
  return {
    kind: "ambiguity" as const,
    side: asOneOf(record.side, SIDES, `${path}.side`),
    id: asId(record.id, `${path}.id`),
    candidateIds: asList(record.candidateIds, `${path}.candidateIds`, asId),
  };
}

export function parsePending(raw: unknown, path: string): PendingItem {
  const record = asRecord(raw, path);
  const kind = asOneOf(record.kind, KINDS, `${path}.kind`);
  return kind === "removal"
    ? parseRemoval(record, path)
    : parseAmbiguity(record, path);
}

export function parseUnlinked(raw: unknown, path: string): UnlinkedItem {
  const record = asRecord(raw, path);
  onlyKeys(record, UNLINKED_KEYS, path);
  return {
    side: asOneOf(record.side, SIDES, `${path}.side`),
    id: asId(record.id, `${path}.id`),
    title: asString(record.title, `${path}.title`),
    reason: asOneOf(record.reason, REASONS, `${path}.reason`),
  };
}

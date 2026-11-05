import { idsOfKey } from "../core/finish-event";
import type { PendingItem, UnlinkedItem } from "../core/state";
import { parseCandidates } from "./candidate-schema";
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
  whenPresent,
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
  title: true,
});
const AMBIGUITY_KEYS = valuesOf<
  keyof Extract<PendingItem, { kind: "ambiguity" }>
>({
  kind: true,
  side: true,
  id: true,
  candidateIds: true,
  asked: true,
  title: true,
  candidates: true,
  finish: true,
});
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
    ...optionalTitle(record, path),
  };
}

function optionalTitle(record: Record<string, unknown>, path: string) {
  const title = whenPresent(record.title, (v) => asString(v, `${path}.title`));
  return title === undefined ? {} : { title };
}

function parseAsked(raw: unknown, path: string): true {
  return raw === true ? true : fail(path);
}

// Only a naka-side question waits on a finish, and that finish is of the question's own title.
function parseFinish(raw: unknown, side: string, id: number, path: string) {
  const key = parseContentKey(raw, path);
  return side === "naka" && idsOfKey(key)?.contentId === id ? key : fail(path);
}

function parseAmbiguity(record: Record<string, unknown>, path: string) {
  onlyKeys(record, AMBIGUITY_KEYS, path);
  const side = asOneOf(record.side, SIDES, `${path}.side`);
  const id = asId(record.id, `${path}.id`);
  const candidateIds = asList(
    record.candidateIds,
    `${path}.candidateIds`,
    asId,
  );
  const asked = whenPresent(record.asked, (v) =>
    parseAsked(v, `${path}.asked`),
  );
  const candidates = whenPresent(record.candidates, (v) =>
    parseCandidates(v, candidateIds, `${path}.candidates`),
  );
  const finish = whenPresent(record.finish, (v) =>
    parseFinish(v, side, id, `${path}.finish`),
  );
  return {
    kind: "ambiguity" as const,
    side,
    id,
    candidateIds,
    ...(asked === undefined ? {} : { asked }),
    ...optionalTitle(record, path),
    ...(candidates === undefined ? {} : { candidates }),
    ...(finish === undefined ? {} : { finish }),
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

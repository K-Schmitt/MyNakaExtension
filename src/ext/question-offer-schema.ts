// The worker's question answers, checked field by field before a block or the page uses them. Each parser
// returns a fresh object holding only the known keys, or throws: the port then gives `undefined`, never a
// half-read answer. Every key must agree with the fields it names, so a forged answer cannot show a row
// under another question's key. Shared by the Naka tab and the status page.

import type { QuestionKey } from "../core/questions";
import type { Side } from "../core/state";
import type {
  AmbiguityOffer,
  PageQuestion,
  QuestionOffer,
  RemovalOffer,
  UnlinkedOffer,
} from "../sw/question-offers";
import {
  type LastAnswer,
  parseLastAnswer,
  parseQuestionKey,
} from "./answer-record";
import { parseOfferCandidates } from "./candidate-schema";
import {
  asBoolean,
  asId,
  asOneOf,
  asRecord,
  asString,
  fail,
  onlyKeys,
  valuesOf,
} from "./field-checks";
import { optionalImage } from "./image-schema";
import { parsePair } from "./pair-schema";

export type { LastAnswer };
export { parseLastAnswer, parseQuestionKey };

const SIDES = valuesOf<Side>({ naka: true, sc: true });
const AMBIGUITY_KEYS = valuesOf<keyof AmbiguityOffer>({
  kind: true,
  key: true,
  side: true,
  id: true,
  title: true,
  candidates: true,
});
const REMOVAL_KEYS = valuesOf<keyof RemovalOffer>({
  kind: true,
  key: true,
  removeFrom: true,
  pair: true,
  title: true,
  image: true,
});
const LEGACY_KEYS = valuesOf<keyof Extract<PageQuestion, { kind: "legacy" }>>({
  kind: true,
  key: true,
  side: true,
  id: true,
});
const UNLINKED_KEYS = valuesOf<keyof UnlinkedOffer>({
  key: true,
  side: true,
  id: true,
  title: true,
  reason: true,
});
const REASONS = valuesOf<UnlinkedOffer["reason"]>({
  "no-match": true,
  "not-in-catalogue": true,
  "none-chosen": true,
});
function sameKey(raw: unknown, expected: string, path: string): QuestionKey {
  const key = parseQuestionKey(raw, path);
  return key === expected ? key : fail(path);
}

function parseAmbiguity(
  record: Record<string, unknown>,
  path: string,
): AmbiguityOffer {
  const side = asOneOf(record.side, SIDES, `${path}.side`);
  const id = asId(record.id, `${path}.id`);
  return {
    kind: "ambiguity",
    key: sameKey(record.key, `ambiguity:${side}:${id}`, `${path}.key`),
    side,
    id,
    title: asString(record.title, `${path}.title`),
    candidates: parseOfferCandidates(record.candidates, `${path}.candidates`),
  };
}

function parseRemoval(
  record: Record<string, unknown>,
  path: string,
): RemovalOffer {
  const removeFrom = asOneOf(record.removeFrom, SIDES, `${path}.removeFrom`);
  const pair = parsePair(record.pair, `${path}.pair`);
  const expected = `removal:${removeFrom}:${pair.nakaId}:${pair.scId}`;
  return {
    kind: "removal",
    key: sameKey(record.key, expected, `${path}.key`),
    removeFrom,
    pair,
    title: asString(record.title, `${path}.title`),
    ...optionalImage(record, path),
  };
}

function parseLegacy(
  record: Record<string, unknown>,
  path: string,
): Extract<PageQuestion, { kind: "legacy" }> {
  onlyKeys(record, LEGACY_KEYS, path);
  const side = asOneOf(record.side, SIDES, `${path}.side`);
  const id = asId(record.id, `${path}.id`);
  return {
    kind: "legacy",
    key: sameKey(record.key, `ambiguity:${side}:${id}`, `${path}.key`),
    side,
    id,
  };
}

// The keys an offer may hold: its own, and `hidden` on the page.
function parseOfferOf(
  record: Record<string, unknown>,
  path: string,
  extra: readonly string[],
): QuestionOffer {
  const kind = asOneOf(record.kind, ["ambiguity", "removal"], `${path}.kind`);
  const own = kind === "ambiguity" ? AMBIGUITY_KEYS : REMOVAL_KEYS;
  onlyKeys(record, [...own, ...extra], path);
  return kind === "ambiguity"
    ? parseAmbiguity(record, path)
    : parseRemoval(record, path);
}

export function parseQuestionOffer(raw: unknown, path: string): QuestionOffer {
  return parseOfferOf(asRecord(raw, path), path, []);
}

export function parseAmbiguityOffer(
  raw: unknown,
  path: string,
): AmbiguityOffer {
  const offer = parseQuestionOffer(raw, path);
  return offer.kind === "ambiguity" ? offer : fail(`${path}.kind`);
}

export function parsePageQuestion(raw: unknown, path: string): PageQuestion {
  const record = asRecord(raw, path);
  if (record.kind === "legacy") return parseLegacy(record, path);
  const offer = parseOfferOf(record, path, ["hidden"]);
  return { ...offer, hidden: asBoolean(record.hidden, `${path}.hidden`) };
}

export function parseUnlinkedOffer(raw: unknown, path: string): UnlinkedOffer {
  const record = asRecord(raw, path);
  onlyKeys(record, UNLINKED_KEYS, path);
  const side = asOneOf(record.side, SIDES, `${path}.side`);
  const id = asId(record.id, `${path}.id`);
  return {
    key: sameKey(record.key, `link:${side}:${id}`, `${path}.key`),
    side,
    id,
    title: asString(record.title, `${path}.title`),
    reason: asOneOf(record.reason, REASONS, `${path}.reason`),
  };
}

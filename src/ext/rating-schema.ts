// Validates the rating cards read from storage: every field, no unknown key, at most MAX_CARDS cards.
// Throws a StoredStateError holding the field path, never the value.

import {
  type CardTarget,
  MAX_CARDS,
  type RatingCard,
  type RatingLabel,
} from "../core/rating-cards";
import {
  asBoolean,
  asId,
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
import { optionalImage } from "./image-schema";
import { parseContentKey } from "./item-schema";
import { ERROR_CODES } from "./run-record-schema";

const MAX_RATING = 10;

const LABELS = valuesOf<RatingLabel>({
  film: true,
  épisode: true,
  saison: true,
  série: true,
});
const CARD_KEYS = valuesOf<keyof RatingCard>({
  key: true,
  contentId: true,
  title: true,
  season: true,
  episode: true,
  at: true,
  targets: true,
  pending: true,
  given: true,
  seriesFinished: true,
  failed: true,
  image: true,
});
const TARGET_KEYS = valuesOf<keyof CardTarget>({
  label: true,
  productId: true,
  current: true,
});
const FAILED_KEYS = valuesOf<keyof NonNullable<RatingCard["failed"]>>({
  label: true,
  error: true,
  at: true,
});

export function asRating(raw: unknown, path: string): number {
  const rating = asInt(raw, 1, path);
  return rating > MAX_RATING ? fail(path) : rating;
}

export function asLabel(raw: unknown, path: string): RatingLabel {
  return asOneOf(raw, LABELS, path);
}

function parseTarget(raw: unknown, path: string): CardTarget {
  const record = asRecord(raw, path);
  onlyKeys(record, TARGET_KEYS, path);
  return {
    label: asLabel(record.label, `${path}.label`),
    productId: asId(record.productId, `${path}.productId`),
    current:
      record.current === null
        ? null
        : asRating(record.current, `${path}.current`),
  };
}

function parseTargets(raw: unknown, path: string): CardTarget[] {
  const targets = asList(raw, path, parseTarget);
  const labels = targets.map((target) => target.label);
  if (labels.length === 0) return fail(path);
  if (new Set(labels).size !== labels.length) return fail(path);
  return targets;
}

function parsePendingLabels(
  raw: unknown,
  targets: CardTarget[],
  path: string,
): RatingLabel[] {
  const pending = asList(raw, path, asLabel);
  const known = targets.map((target) => target.label);
  if (pending.some((label) => !known.includes(label))) return fail(path);
  return pending;
}

function parseGiven(raw: unknown, path: string): RatingCard["given"] {
  const record = asRecord(raw, path);
  onlyKeys(record, LABELS, path);
  const given: RatingCard["given"] = {};
  for (const label of LABELS) {
    const value = whenPresent(record[label], (v) =>
      asRating(v, `${path}.${label}`),
    );
    if (value !== undefined) given[label] = value;
  }
  return given;
}

function parseFailed(
  raw: unknown,
  path: string,
): NonNullable<RatingCard["failed"]> {
  const record = asRecord(raw, path);
  onlyKeys(record, FAILED_KEYS, path);
  return {
    label: asLabel(record.label, `${path}.label`),
    error: asOneOf(record.error, ERROR_CODES, `${path}.error`),
    at: asInt(record.at, 0, `${path}.at`),
  };
}

// Season and episode go together: both present or both absent.
function parsePosition(
  record: Record<string, unknown>,
  path: string,
): { season?: number; episode?: number } {
  const season = whenPresent(record.season, (v) => asId(v, `${path}.season`));
  const episode = whenPresent(record.episode, (v) =>
    asId(v, `${path}.episode`),
  );
  if (season === undefined && episode === undefined) return {};
  if (season === undefined || episode === undefined) return fail(path);
  return { season, episode };
}

function parseCard(raw: unknown, path: string): RatingCard {
  const record = asRecord(raw, path);
  onlyKeys(record, CARD_KEYS, path);
  const targets = parseTargets(record.targets, `${path}.targets`);
  const failed = whenPresent(record.failed, (v) =>
    parseFailed(v, `${path}.failed`),
  );
  const title = asString(record.title, `${path}.title`);
  if (title === "") return fail(`${path}.title`);
  return {
    key: parseContentKey(record.key, `${path}.key`),
    contentId: asId(record.contentId, `${path}.contentId`),
    title,
    ...parsePosition(record, path),
    at: asInt(record.at, 0, `${path}.at`),
    targets,
    pending: parsePendingLabels(record.pending, targets, `${path}.pending`),
    given: parseGiven(record.given, `${path}.given`),
    seriesFinished: asBoolean(record.seriesFinished, `${path}.seriesFinished`),
    ...(failed === undefined ? {} : { failed }),
    ...optionalImage(record, path),
  };
}

export function parseRatings(raw: unknown): RatingCard[] {
  if (raw === undefined) return [];
  const cards = asList(raw, "ratings", parseCard);
  if (cards.length > MAX_CARDS) return fail("ratings");
  return cards;
}

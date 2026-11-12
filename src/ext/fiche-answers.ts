// The worker's answers to the title page messages, read by the Naka tab. They cross a messaging boundary,
// so each is checked field by field: a parser returns a fresh object with only the known keys, or throws.

import type { QuestionCandidate } from "../core/state";
import { parseOfferCandidates } from "./candidate-schema";
import {
  asId,
  asInt,
  asList,
  asOneOf,
  asRecord,
  fail,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";
import type { JobError } from "./job-error";
import { asRating } from "./rating-schema";
import { ERROR_CODES } from "./run-record-schema";

export type FicheProduct = {
  id: number;
  average: number | null;
  mine: number | null;
};
export type FicheInfo = {
  state: "linked" | "matched" | "choose" | "notfound";
  product?: FicheProduct;
  candidates?: QuestionCandidate[];
};
export type SeasonEpisode = {
  episode: number;
  productId: number;
  average: number | null;
};
export type SeasonAnswer = { episodes: SeasonEpisode[] };
export type MineAnswer = { mine: number | null };
export type RateAnswer = { ok: true } | { error: JobError };

const MAX_AVERAGE = 10;
const MAX_EPISODES = 500;
const STATES = valuesOf<FicheInfo["state"]>({
  linked: true,
  matched: true,
  choose: true,
  notfound: true,
});
const INFO_KEYS = valuesOf<keyof FicheInfo>({
  state: true,
  product: true,
  candidates: true,
});
const PRODUCT_KEYS = valuesOf<keyof FicheProduct>({
  id: true,
  average: true,
  mine: true,
});
const EPISODE_KEYS = valuesOf<keyof SeasonEpisode>({
  episode: true,
  productId: true,
  average: true,
});

function asAverage(raw: unknown, path: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fail(path);
  return raw < 0 || raw > MAX_AVERAGE ? fail(path) : raw;
}

function orNull<T>(raw: unknown, parse: (value: unknown) => T): T | null {
  return raw === null ? null : parse(raw);
}

function nullableAverage(raw: unknown, path: string): number | null {
  return orNull(raw, (v) => asAverage(v, path));
}

function nullableRating(raw: unknown, path: string): number | null {
  return orNull(raw, (v) => asRating(v, path));
}

function parseProduct(raw: unknown): FicheProduct {
  const record = asRecord(raw, "product");
  onlyKeys(record, PRODUCT_KEYS, "product");
  return {
    id: asId(record.id, "product.id"),
    average: nullableAverage(record.average, "product.average"),
    mine: nullableRating(record.mine, "product.mine"),
  };
}

export function parseFicheInfo(raw: unknown): FicheInfo {
  const record = asRecord(raw, "answer");
  onlyKeys(record, INFO_KEYS, "answer");
  const info: FicheInfo = { state: asOneOf(record.state, STATES, "state") };
  const product = whenPresent(record.product, parseProduct);
  const candidates = whenPresent(record.candidates, (v) =>
    parseOfferCandidates(v, "candidates"),
  );
  if (product !== undefined) info.product = product;
  if (candidates !== undefined) info.candidates = candidates;
  return info;
}

function parseEpisode(raw: unknown, path: string): SeasonEpisode {
  const record = asRecord(raw, path);
  onlyKeys(record, EPISODE_KEYS, path);
  return {
    episode: asInt(record.episode, 1, `${path}.episode`),
    productId: asId(record.productId, `${path}.productId`),
    average: nullableAverage(record.average, `${path}.average`),
  };
}

export function parseSeasonAnswer(raw: unknown): SeasonAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, ["episodes"], "answer");
  const episodes = asList(record.episodes, "episodes", parseEpisode);
  return episodes.length > MAX_EPISODES ? fail("episodes") : { episodes };
}

export function parseMineAnswer(raw: unknown): MineAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, ["mine"], "answer");
  return { mine: nullableRating(record.mine, "mine") };
}

export function parseRateAnswer(raw: unknown): RateAnswer {
  const record = asRecord(raw, "answer");
  if (record.ok === true) {
    onlyKeys(record, ["ok"], "answer");
    return { ok: true };
  }
  onlyKeys(record, ["error"], "answer");
  return { error: asOneOf(record.error, ERROR_CODES, "error") };
}

export function parseLinkAnswer(raw: unknown): { ok: true } {
  const record = asRecord(raw, "answer");
  onlyKeys(record, ["ok"], "answer");
  return record.ok === true ? { ok: true } : fail("ok");
}

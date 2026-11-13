// The worker's answers to the title page messages, read by the Naka tab. They cross a messaging boundary,
// so each is checked field by field: a parser returns a fresh object with only the known keys, or throws.

import type { QuestionCandidate } from "../core/state";
import type { ProductLabel } from "../sc/product-label";
import { parseOfferCandidates } from "./candidate-schema";
import { asText, asYear } from "./fiche-page-events";
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
  /** SensCritique's own title and year of the product: the block shows what a star will rate. */
  label: ProductLabel;
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
  /** SensCritique's own title of the episode, when it has one: the stars' name. */
  title?: string;
};
export type SeasonAnswer = { episodes: SeasonEpisode[] };
/** The owner's rating of one product and its public average, read together (authenticated). */
export type MineAnswer = { mine: number | null; average: number | null };
export type OkAnswer = { ok: true };
/** The rating did not go out. */
export type NotSentAnswer = { error: JobError };
/** The rating went out and a later step failed (a film's removal from « Ma liste »). */
export type SentWithErrorAnswer = { sent: true; error: JobError };
export type RateAnswer = OkAnswer | NotSentAnswer | SentWithErrorAnswer;
export type LinkAnswer = OkAnswer;

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
  label: true,
});
const LABEL_KEYS = valuesOf<keyof ProductLabel>({ title: true, year: true });
const EPISODE_KEYS = valuesOf<keyof SeasonEpisode>({
  episode: true,
  productId: true,
  average: true,
  title: true,
});
const SEASON_KEYS = valuesOf<keyof SeasonAnswer>({ episodes: true });
const MINE_KEYS = valuesOf<keyof MineAnswer>({ mine: true, average: true });
const OK_KEYS = valuesOf<keyof OkAnswer>({ ok: true });
const NOT_SENT_KEYS = valuesOf<keyof NotSentAnswer>({ error: true });
const SENT_WITH_ERROR_KEYS = valuesOf<keyof SentWithErrorAnswer>({
  sent: true,
  error: true,
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

function parseLabel(raw: unknown): ProductLabel {
  const record = asRecord(raw, "product.label");
  onlyKeys(record, LABEL_KEYS, "product.label");
  const label: ProductLabel = {
    title: asText(record.title, "product.label.title"),
  };
  const year = whenPresent(record.year, asYear);
  if (year !== undefined) label.year = year;
  return label;
}

function parseProduct(raw: unknown): FicheProduct {
  const record = asRecord(raw, "product");
  onlyKeys(record, PRODUCT_KEYS, "product");
  return {
    id: asId(record.id, "product.id"),
    average: nullableAverage(record.average, "product.average"),
    mine: nullableRating(record.mine, "product.mine"),
    label: parseLabel(record.label),
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
  const episode: SeasonEpisode = {
    episode: asInt(record.episode, 1, `${path}.episode`),
    productId: asId(record.productId, `${path}.productId`),
    average: nullableAverage(record.average, `${path}.average`),
  };
  const title = whenPresent(record.title, (v) => asText(v, `${path}.title`));
  if (title !== undefined) episode.title = title;
  return episode;
}

export function parseSeasonAnswer(raw: unknown): SeasonAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, SEASON_KEYS, "answer");
  const episodes = asList(record.episodes, "episodes", parseEpisode);
  return episodes.length > MAX_EPISODES ? fail("episodes") : { episodes };
}

export function parseMineAnswer(raw: unknown): MineAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, MINE_KEYS, "answer");
  return {
    mine: nullableRating(record.mine, "mine"),
    average: nullableAverage(record.average, "average"),
  };
}

export function parseRateAnswer(raw: unknown): RateAnswer {
  const record = asRecord(raw, "answer");
  if (record.ok === true) {
    onlyKeys(record, OK_KEYS, "answer");
    return { ok: true };
  }
  const error = asOneOf(record.error, ERROR_CODES, "error");
  if (record.sent === undefined) {
    onlyKeys(record, NOT_SENT_KEYS, "answer");
    return { error };
  }
  onlyKeys(record, SENT_WITH_ERROR_KEYS, "answer");
  return record.sent === true ? { sent: true, error } : fail("sent");
}

export function parseLinkAnswer(raw: unknown): LinkAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, OK_KEYS, "answer");
  return record.ok === true ? { ok: true } : fail("ok");
}

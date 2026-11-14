// The worker's answers to the title page messages, read by the Naka tab. They cross a messaging boundary,
// so each is checked field by field: a parser returns a fresh object with only the known keys, or throws.

import type { QuestionCandidate } from "../core/state";
import type { ProductLabel } from "../sc/product-label";
import { isProductUrl } from "../sc/product-url";
import { parseOfferCandidates } from "./candidate-schema";
import { asText, asYear } from "./fiche-page-events";
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
import type { JobError } from "./job-error";
import { asRating } from "./rating-schema";
import { ERROR_CODES } from "./run-record-schema";

/** The title panel's actions (spec §6): « Annuler », « Retirer la note », « Voir sur SensCritique ». */
export type PanelFlags = {
  /** A live undo record names this title and this product. */
  canUndo: boolean;
  /** Rated, with no critique or recommendation to lose. */
  canRemove: boolean;
  /** A critique or a recommendation is tied to the product: the panel sends the owner to SensCritique. */
  protected: boolean;
  /** The product's page, a SensCritique product page only (product-url). */
  url?: string;
};
export type FicheProduct = PanelFlags & {
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
/** The panel's flags once a film's or a series' rating went out; an episode's answer has none. */
type Paneled = { panel?: PanelFlags };
/** A film's live rating with Naka's button on screen: the tab clicks « Ma liste » itself, the client did not. */
type ListedByTab = { maListe?: "tab" };
export type RateOkAnswer = OkAnswer & Paneled & ListedByTab;
/** The rating did not go out. */
export type NotSentAnswer = { error: JobError };
/** The rating went out and a later step failed (a film's removal from « Ma liste »). */
export type SentWithErrorAnswer = { sent: true; error: JobError } & Paneled;
export type RateAnswer = RateOkAnswer | NotSentAnswer | SentWithErrorAnswer;
export type LinkAnswer = OkAnswer;
/** « Chercher »'s results, at most MAX_SEARCH_RESULTS, each issued to the tab as a candidate. */
export type FicheSearchAnswer = { candidates: QuestionCandidate[] };

export const MAX_SEARCH_RESULTS = 10;

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
  canUndo: true,
  canRemove: true,
  protected: true,
  url: true,
});
const PANEL_KEYS = valuesOf<keyof PanelFlags>({
  canUndo: true,
  canRemove: true,
  protected: true,
  url: true,
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
const SEARCH_KEYS = valuesOf<keyof FicheSearchAnswer>({ candidates: true });
const RATE_OK_KEYS = valuesOf<keyof RateOkAnswer>({
  ok: true,
  panel: true,
  maListe: true,
});
const BY_TAB = valuesOf<NonNullable<ListedByTab["maListe"]>>({ tab: true });
const NOT_SENT_KEYS = valuesOf<keyof NotSentAnswer>({ error: true });
const SENT_WITH_ERROR_KEYS = valuesOf<keyof SentWithErrorAnswer>({
  sent: true,
  error: true,
  panel: true,
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

function asProductUrl(raw: unknown, path: string): string {
  const url = asString(raw, path);
  return isProductUrl(url) ? url : fail(path);
}

/** The flags held by `record` (a product, or a rating's panel), checked under `path`. */
function readFlags(record: Record<string, unknown>, path: string): PanelFlags {
  const flags: PanelFlags = {
    canUndo: asBoolean(record.canUndo, `${path}.canUndo`),
    canRemove: asBoolean(record.canRemove, `${path}.canRemove`),
    protected: asBoolean(record.protected, `${path}.protected`),
  };
  const url = whenPresent(record.url, (v) => asProductUrl(v, `${path}.url`));
  return url === undefined ? flags : { ...flags, url };
}

function parsePanel(raw: unknown): PanelFlags {
  const record = asRecord(raw, "panel");
  onlyKeys(record, PANEL_KEYS, "panel");
  return readFlags(record, "panel");
}

function parseProduct(raw: unknown): FicheProduct {
  const record = asRecord(raw, "product");
  onlyKeys(record, PRODUCT_KEYS, "product");
  return {
    id: asId(record.id, "product.id"),
    average: nullableAverage(record.average, "product.average"),
    mine: nullableRating(record.mine, "product.mine"),
    label: parseLabel(record.label),
    ...readFlags(record, "product"),
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

function withPanel<T extends object>(answer: T, raw: unknown): T & Paneled {
  const panel = whenPresent(raw, parsePanel);
  return panel === undefined ? answer : { ...answer, panel };
}

function withListedByTab(answer: RateOkAnswer, raw: unknown): RateOkAnswer {
  const maListe = whenPresent(raw, (v) => asOneOf(v, BY_TAB, "maListe"));
  return maListe === undefined ? answer : { ...answer, maListe };
}

export function parseRateAnswer(raw: unknown): RateAnswer {
  const record = asRecord(raw, "answer");
  if (record.ok === true) {
    onlyKeys(record, RATE_OK_KEYS, "answer");
    const ok = withPanel({ ok: true as const }, record.panel);
    return withListedByTab(ok, record.maListe);
  }
  const error = asOneOf(record.error, ERROR_CODES, "error");
  if (record.sent === undefined) {
    onlyKeys(record, NOT_SENT_KEYS, "answer");
    return { error };
  }
  onlyKeys(record, SENT_WITH_ERROR_KEYS, "answer");
  if (record.sent !== true) return fail("sent");
  return withPanel({ sent: true as const, error }, record.panel);
}

export function parseLinkAnswer(raw: unknown): LinkAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, OK_KEYS, "answer");
  return record.ok === true ? { ok: true } : fail("ok");
}

export function parseSearchAnswer(raw: unknown): FicheSearchAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, SEARCH_KEYS, "answer");
  const candidates = parseOfferCandidates(record.candidates, "candidates");
  return candidates.length > MAX_SEARCH_RESULTS
    ? fail("candidates")
    : { candidates };
}

// The worker's answers to `rating-card` and `rating-cards`, checked field by field before a block uses
// them. Each parser returns a fresh object holding only the known keys, or throws: the port then gives
// `undefined`, never a half-read answer.

import { cardlessLabel } from "../../core/cardless-label";
import type { ContentIds } from "../../core/finish-event";
import type { RatingCard, RatingLabel } from "../../core/rating-cards";
import {
  asInt,
  asList,
  asOneOf,
  asRecord,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "../../ext/field-checks";
import { asRating, parseRatings } from "../../ext/rating-schema";
import { type LastFinish, parseOutcome } from "../../ext/settings";
import type { CardAnswer, CardsAnswer } from "../../sw/rating-answers";

const MAX_PAUSE_PERCENT = 99;
const CARD_ANSWER_KEYS = valuesOf<keyof CardAnswer>({
  card: true,
  pauseFromPercent: true,
  start: true,
  sending: true,
  lastFinish: true,
});
const CARDS_ANSWER_KEYS = valuesOf<keyof CardsAnswer>({ cards: true });
const ENTRY_KEYS = valuesOf<keyof CardsAnswer["cards"][number]>({
  card: true,
  start: true,
  sending: true,
});
const LAST_FINISH_KEYS = valuesOf<keyof LastFinish>({
  outcome: true,
  error: true,
});

function startOf(raw: unknown): { start?: number } {
  const start = whenPresent(raw, (v) => asRating(v, "start"));
  return start === undefined ? {} : { start };
}

// A card's targets; with no card, the one label a rate of the asked ids can have (a film, an épisode).
function sendableOf(card: RatingCard | null, ids?: ContentIds): RatingLabel[] {
  if (card !== null) return card.targets.map((t) => t.label);
  const label = ids === undefined ? undefined : cardlessLabel(ids);
  return label === undefined ? [] : [label];
}

// The labels whose rating is still being sent: each one sendable, none twice. Empty is none.
function sendingOf(
  raw: unknown,
  allowed: RatingLabel[],
): { sending?: RatingLabel[] } {
  if (raw === undefined) return {};
  const labels = asList(raw, "sending", (item) =>
    asOneOf(item, allowed, "sending"),
  );
  if (new Set(labels).size !== labels.length) throw new Error("sending");
  return labels.length === 0 ? {} : { sending: labels };
}

// The title's last finish: an outcome, and its error code with a failure only.
function lastFinishOf(raw: unknown): { lastFinish?: LastFinish } {
  if (raw === undefined) return {};
  const record = asRecord(raw, "lastFinish");
  onlyKeys(record, LAST_FINISH_KEYS, "lastFinish");
  return { lastFinish: parseOutcome(record, "lastFinish") };
}

function parseCard(raw: unknown): CardAnswer["card"] {
  if (raw === null) return null;
  const [card] = parseRatings([raw]);
  if (card === undefined) throw new Error("card");
  return card;
}

/** The answer to a `rating-card` for these ids. */
export function parseCardAnswer(raw: unknown, ids: ContentIds): CardAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, CARD_ANSWER_KEYS, "answer");
  const pause = asInt(record.pauseFromPercent, 0, "pauseFromPercent");
  if (pause > MAX_PAUSE_PERCENT) throw new Error("pauseFromPercent");
  const card = parseCard(record.card);
  return {
    card,
    pauseFromPercent: pause,
    ...startOf(record.start),
    ...sendingOf(record.sending, sendableOf(card, ids)),
    ...lastFinishOf(record.lastFinish),
  };
}

function parseEntry(raw: unknown): CardsAnswer["cards"][number] {
  const record = asRecord(raw, "entry");
  onlyKeys(record, ENTRY_KEYS, "entry");
  const card = parseCard(record.card);
  if (card === null) throw new Error("card");
  return {
    card,
    ...startOf(record.start),
    ...sendingOf(record.sending, sendableOf(card)),
  };
}

/** The answer to a `rating-cards`. */
export function parseCardsAnswer(raw: unknown): CardsAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, CARDS_ANSWER_KEYS, "answer");
  const list = record.cards;
  if (!Array.isArray(list)) throw new Error("cards");
  return { cards: list.map(parseEntry) };
}

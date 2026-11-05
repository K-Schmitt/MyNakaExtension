// The block's line to the worker. The send function is injected (the entry binds chrome.runtime), so
// nothing here touches chrome.*. A send that fails gives `undefined`, never a throw; an answer is
// validated field by field before the block uses it.

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
import type { RatingMessage } from "../../ext/rating-messages";
import { asRating, parseRatings } from "../../ext/rating-schema";
import type { CardAnswer, CardsAnswer } from "../../sw/rating-answers";

export type SendRating = (msg: RatingMessage) => Promise<unknown>;

const MAX_PAUSE_PERCENT = 99;
const CARD_ANSWER_KEYS = valuesOf<keyof CardAnswer>({
  card: true,
  pauseFromPercent: true,
  start: true,
  sending: true,
});
const CARDS_ANSWER_KEYS = valuesOf<keyof CardsAnswer>({ cards: true });
const ENTRY_KEYS = valuesOf<keyof CardsAnswer["cards"][number]>({
  card: true,
  start: true,
  sending: true,
});

function idsOf({ contentId, season, episode }: ContentIds): ContentIds {
  return {
    contentId,
    ...(season === undefined ? {} : { season }),
    ...(episode === undefined ? {} : { episode }),
  };
}

function startOf(raw: unknown): { start?: number } {
  const start = whenPresent(raw, (v) => asRating(v, "start"));
  return start === undefined ? {} : { start };
}

// The labels whose rating is still being sent: each one a target of the card, none twice. Empty is none.
function sendingOf(
  raw: unknown,
  card: RatingCard | null,
): { sending?: RatingLabel[] } {
  if (raw === undefined) return {};
  const allowed = card === null ? [] : card.targets.map((t) => t.label);
  const labels = asList(raw, "sending", (item) =>
    asOneOf(item, allowed, "sending"),
  );
  if (new Set(labels).size !== labels.length) throw new Error("sending");
  return labels.length === 0 ? {} : { sending: labels };
}

function parseCard(raw: unknown): CardAnswer["card"] {
  if (raw === null) return null;
  const [card] = parseRatings([raw]);
  if (card === undefined) throw new Error("card");
  return card;
}

function parseCardAnswer(raw: unknown): CardAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, CARD_ANSWER_KEYS, "answer");
  const pause = asInt(record.pauseFromPercent, 0, "pauseFromPercent");
  if (pause > MAX_PAUSE_PERCENT) throw new Error("pauseFromPercent");
  const card = parseCard(record.card);
  return {
    card,
    pauseFromPercent: pause,
    ...startOf(record.start),
    ...sendingOf(record.sending, card),
  };
}

function parseEntry(raw: unknown): CardsAnswer["cards"][number] {
  const record = asRecord(raw, "entry");
  onlyKeys(record, ENTRY_KEYS, "entry");
  const card = parseCard(record.card);
  if (card === null) throw new Error("card");
  return { card, ...startOf(record.start), ...sendingOf(record.sending, card) };
}

function parseCardsAnswer(raw: unknown): CardsAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, CARDS_ANSWER_KEYS, "answer");
  const list = record.cards;
  if (!Array.isArray(list)) throw new Error("cards");
  return { cards: list.map(parseEntry) };
}

export type WorkerPort = ReturnType<typeof createWorkerPort>;

export function createWorkerPort(send: SendRating) {
  async function ask(msg: RatingMessage): Promise<unknown> {
    try {
      return await send(msg);
    } catch {
      return undefined;
    }
  }

  // True when the send resolved, false when it rejected or threw: the answer itself is not read.
  async function sent(msg: RatingMessage): Promise<boolean> {
    try {
      await send(msg);
      return true;
    } catch {
      return false;
    }
  }

  async function askChecked<T>(
    msg: RatingMessage,
    parse: (raw: unknown) => T,
  ): Promise<T | undefined> {
    const raw = await ask(msg);
    try {
      return parse(raw);
    } catch {
      return undefined;
    }
  }

  return {
    askCard: (ids: ContentIds) =>
      askChecked({ type: "rating-card", ...idsOf(ids) }, parseCardAnswer),
    askCards: () => askChecked({ type: "rating-cards" }, parseCardsAnswer),
    rate: (ids: ContentIds, label: RatingLabel, rating: number) =>
      sent({ type: "rate", ...idsOf(ids), label, rating }),
    dismiss: (ids: ContentIds, label: RatingLabel) =>
      sent({ type: "dismiss-rating", ...idsOf(ids), label }),
  };
}

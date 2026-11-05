// What the worker answers to `rating-card` and `rating-cards`. Read-only: it loads, it never saves. The
// answers hold stored cards and a settings number only, so no token and no error text can be in them.
// An unreadable store rejects: the router then gives no answer rather than an invented one.

import { contentKeyOf } from "../core/finish-event";
import {
  cardFor,
  type RatingCard,
  type RatingLabel,
} from "../core/rating-cards";
import { startValue } from "../core/rating-start";
import type { RatingCardMessage } from "../ext/rating-messages";
import { pauseFromOf } from "../ext/settings";
import type { Store } from "../ext/store";

export type CardAnswer = {
  card: RatingCard | null;
  pauseFromPercent: number;
  start?: number;
  sending?: RatingLabel[]; // labels of the card whose rate is waiting or running; omitted when none
};
export type CardsAnswer = {
  cards: { card: RatingCard; start?: number; sending?: RatingLabel[] }[];
};

/** The labels being sent for a card, in target order; the field is omitted when none. */
export function sendingOf(
  card: RatingCard,
  sendingLabels: (key: string) => RatingLabel[],
): { sending?: RatingLabel[] } {
  const sent = sendingLabels(card.key);
  const labels = card.targets
    .map((t) => t.label)
    .filter((l) => sent.includes(l));
  return labels.length === 0 ? {} : { sending: labels };
}

/** The store as the answers read it: no save. */
export type RatingsReader = Pick<Store, "loadSettings" | "loadRatings">;

const MAX_ANSWERED = 20;

// The rating the block starts on: the startValue of the card's first pending label.
function startOf(cards: RatingCard[], card: RatingCard): { start?: number } {
  const label = card.pending[0];
  if (label === undefined) return {};
  const start = startValue(cards, card, label);
  return start === undefined ? {} : { start };
}

export async function answerCard(
  store: RatingsReader,
  msg: RatingCardMessage,
): Promise<CardAnswer> {
  const settings = await store.loadSettings();
  const cards = await store.loadRatings();
  const card = cardFor(cards, contentKeyOf(msg));
  return {
    card: card ?? null,
    pauseFromPercent: pauseFromOf(settings),
    ...(card === undefined ? {} : startOf(cards, card)),
  };
}

// The stored cards are kept newest first: the first 20 with something still asked.
export async function answerCards(store: RatingsReader): Promise<CardsAnswer> {
  const cards = await store.loadRatings();
  const open = cards.filter((card) => card.pending.length > 0);
  return {
    cards: open
      .slice(0, MAX_ANSWERED)
      .map((card) => ({ card, ...startOf(cards, card) })),
  };
}

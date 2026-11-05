// What the worker answers to `rating-card` and `rating-cards`. Read-only: it loads, it never saves. The
// answers hold stored cards, a settings number and the codes of the title's last finish only, so no token
// and no error text can be in them. An unreadable store rejects: the router then answers `undefined`
// rather than an invented answer.

import { cardlessLabel } from "../core/cardless-label";
import { type ContentIds, contentKeyOf } from "../core/finish-event";
import {
  cardFor,
  type RatingCard,
  type RatingLabel,
} from "../core/rating-cards";
import { startValue } from "../core/rating-start";
import type { RatingCardMessage } from "../ext/rating-messages";
import { type LastFinish, pauseFromOf, type Settings } from "../ext/settings";
import type { Store } from "../ext/store";

export type CardAnswer = {
  card: RatingCard | null;
  pauseFromPercent: number;
  start?: number;
  sending?: RatingLabel[]; // labels of the card whose rate is waiting or running; omitted when none
  lastFinish?: LastFinish; // the last finish recorded, when it is this title's
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

/** For a title with no card: its film or épisode label, when a rate of it is waiting or running. */
export function cardlessSendingOf(
  ids: ContentIds,
  sendingLabels: (key: string) => RatingLabel[],
): { sending?: RatingLabel[] } {
  const label = cardlessLabel(ids);
  if (label === undefined) return {};
  return sendingLabels(contentKeyOf(ids)).includes(label)
    ? { sending: [label] }
    : {};
}

/** The store as the answers read it: no save. */
export type RatingsReader = Pick<Store, "loadSettings" | "loadRatings">;

const MAX_ANSWERED = 20;

// A rate on a title with no card runs its finish first: its outcome tells the tab why no card came.
function lastFinishOf(
  settings: Settings,
  key: string,
): { lastFinish?: LastFinish } {
  const last = settings.lastFinish;
  if (last?.key !== key) return {};
  const { outcome, error } = last;
  return { lastFinish: error === undefined ? { outcome } : { outcome, error } };
}

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
  const key = contentKeyOf(msg);
  const card = cardFor(cards, key);
  return {
    card: card ?? null,
    pauseFromPercent: pauseFromOf(settings),
    ...(card === undefined ? {} : startOf(cards, card)),
    ...lastFinishOf(settings, key),
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

// The rating cards: one per finished content, kept newest first. Pure: no chrome.*, no DOM.

import type { JobError } from "../ext/job-error";
import type { RatingTarget } from "./finish-handler";
import type { TitleImage } from "./title-image";

export type RatingLabel = RatingTarget["label"];
export type CardTarget = {
  label: RatingLabel;
  productId: number;
  current: number | null;
};
export type RatingCard = {
  key: string; // contentKey of the finished content
  contentId: number; // Naka id of the film or the SERIES
  title: string; // Naka title of the film or the series (catalogue text)
  season?: number;
  episode?: number;
  at: number; // ms, when the card was made or last refreshed
  targets: CardTarget[]; // chain order: film | épisode, saison, série
  pending: RatingLabel[]; // still asked, chain order, a subset of targets' labels
  given: Partial<Record<RatingLabel, number>>; // ratings sent through the extension
  seriesFinished: boolean;
  image?: TitleImage;
  failed?: { label: RatingLabel; error: JobError; at: number };
};

export const MAX_CARDS = 100;

const isOpen = (t: CardTarget): boolean => t.current === null;

export function pendingOf(
  targets: CardTarget[],
  lastOfSeason: boolean,
  seriesFinished: boolean,
): RatingLabel[] {
  const asked: Record<RatingLabel, boolean> = {
    film: true,
    épisode: true,
    saison: lastOfSeason,
    série: seriesFinished,
  };
  return targets.filter((t) => isOpen(t) && asked[t.label]).map((t) => t.label);
}

export function upsertCard(
  cards: RatingCard[],
  card: RatingCard,
): RatingCard[] {
  const others = cards.filter((c) => c.key !== card.key);
  return [card, ...others].slice(0, MAX_CARDS);
}

function mapCard(
  cards: RatingCard[],
  key: string,
  change: (card: RatingCard) => RatingCard,
): RatingCard[] {
  return cards.map((card) => (card.key === key ? change(card) : card));
}

function withoutFailureOf(card: RatingCard, label: RatingLabel): RatingCard {
  if (card.failed?.label !== label) return card;
  const { failed: _dropped, ...rest } = card;
  return rest;
}

export function applyRating(
  cards: RatingCard[],
  key: string,
  label: RatingLabel,
  rating: number,
): RatingCard[] {
  return mapCard(cards, key, (card) =>
    withoutFailureOf(
      {
        ...card,
        given: { ...card.given, [label]: rating },
        targets: card.targets.map((t) =>
          t.label === label ? { ...t, current: rating } : t,
        ),
        pending: card.pending.filter((l) => l !== label),
      },
      label,
    ),
  );
}

export function applyDismiss(
  cards: RatingCard[],
  key: string,
  label: RatingLabel,
): RatingCard[] {
  return mapCard(cards, key, (card) => ({
    ...card,
    pending: card.pending.filter((l) => l !== label),
  }));
}

export function applyFailure(
  cards: RatingCard[],
  key: string,
  label: RatingLabel,
  error: JobError,
  at: number,
): RatingCard[] {
  return mapCard(cards, key, (card) => ({
    ...card,
    failed: { label, error, at },
  }));
}

export function cardFor(
  cards: readonly RatingCard[],
  key: string,
): RatingCard | undefined {
  return cards.find((card) => card.key === key);
}

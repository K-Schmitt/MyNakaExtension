// The rating a block starts on: the rounded mean of the ratings already given one level down.

import type { RatingCard, RatingLabel } from "./rating-cards";

function meanRounded(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round(sum / values.length);
}

function givenBy(
  cards: RatingCard[],
  label: RatingLabel,
  same: (other: RatingCard) => boolean,
): number[] {
  return cards.filter(same).flatMap((other) => other.given[label] ?? []);
}

export function startValue(
  cards: RatingCard[],
  card: RatingCard,
  label: RatingLabel,
): number | undefined {
  if (label === "saison") {
    return meanRounded(
      givenBy(
        cards,
        "épisode",
        (c) => c.contentId === card.contentId && c.season === card.season,
      ),
    );
  }
  if (label === "série") {
    return meanRounded(
      givenBy(cards, "saison", (c) => c.contentId === card.contentId),
    );
  }
  return undefined;
}

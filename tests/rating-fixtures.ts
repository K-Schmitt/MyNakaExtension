import type {
  CardTarget,
  RatingCard,
  RatingLabel,
} from "../src/core/rating-cards";

export function target(
  label: RatingLabel,
  current: number | null = null,
  productId = 100,
): CardTarget {
  return { label, productId, current };
}

export function episodeCard(over: Partial<RatingCard> = {}): RatingCard {
  return {
    key: "tv:5:S1E1",
    contentId: 5,
    title: "Une série",
    season: 1,
    episode: 1,
    at: 1000,
    targets: [
      target("épisode", null, 11),
      target("saison", null, 12),
      target("série", null, 13),
    ],
    pending: ["épisode", "saison"],
    given: {},
    seriesFinished: false,
    ...over,
  };
}

export function filmCard(over: Partial<RatingCard> = {}): RatingCard {
  return {
    key: "movie:9",
    contentId: 9,
    title: "Un film",
    at: 1000,
    targets: [target("film", null, 21)],
    pending: ["film"],
    given: {},
    seriesFinished: false,
    ...over,
  };
}

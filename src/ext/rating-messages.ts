// The rating messages a Naka tab sends the worker, and their parsers. Each parser returns a fresh object
// holding only the known keys, or throws (the caller turns that into "ignored"). A rating is an integer
// from 1 to 10 and a label is one of the four RatingLabel values: anything else never reaches a job.

import type { ContentIds } from "../core/finish-event";
import type { RatingLabel } from "../core/rating-cards";
import { asId, valuesOf } from "./field-checks";
import { playbackContext } from "./playback-context";
import { asLabel, asRating } from "./rating-schema";

export type RatingMessage =
  | ({ type: "rating-card" } & ContentIds)
  | { type: "rating-cards" }
  | ({ type: "rate" } & ContentIds & { label: RatingLabel; rating: number })
  | ({ type: "dismiss-rating" } & ContentIds & { label: RatingLabel });

export type RatingCardMessage = Extract<RatingMessage, { type: "rating-card" }>;
export type RateMessage = Extract<RatingMessage, { type: "rate" }>;
export type DismissRatingMessage = Extract<
  RatingMessage,
  { type: "dismiss-rating" }
>;

export type RatingType = RatingMessage["type"];

const RATING_TYPES = valuesOf<RatingType>({
  "rating-card": true,
  "rating-cards": true,
  rate: true,
  "dismiss-rating": true,
});

export function isRatingType(type: string): type is RatingType {
  return RATING_TYPES.some((known) => known === type);
}

function idsOf(record: Record<string, unknown>): ContentIds {
  return {
    contentId: asId(record.contentId, "contentId"),
    ...playbackContext(record),
  };
}

export function parseRatingMessage(
  type: RatingType,
  record: Record<string, unknown>,
): RatingMessage {
  switch (type) {
    case "rating-cards":
      return { type };
    case "rating-card":
      return { type, ...idsOf(record) };
    case "dismiss-rating":
      return { type, ...idsOf(record), label: asLabel(record.label, "label") };
    case "rate":
      return {
        type,
        ...idsOf(record),
        label: asLabel(record.label, "label"),
        rating: asRating(record.rating, "rating"),
      };
  }
}

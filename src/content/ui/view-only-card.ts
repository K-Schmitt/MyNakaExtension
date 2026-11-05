// The card the pause block shows for a title the worker has no card for: it exists only in the view.
// It is never stored or sent; a choice sends `rate` with the ids and the label, and the worker's
// explicit finish makes the real card. Its single target is the film, or the episode when both ids are there.

import { type ContentIds, contentKeyOf } from "../../core/finish-event";
import type { RatingCard, RatingLabel } from "../../core/rating-cards";

const NO_PRODUCT = 0; // the worker's message carries no product id, so the view has none either

export function viewOnlyLabel({ season, episode }: ContentIds): RatingLabel {
  return season !== undefined && episode !== undefined ? "épisode" : "film";
}

export function viewOnlyCard(
  ids: ContentIds,
  title: string,
  at: number,
): RatingCard {
  const { season, episode } = ids;
  const label = viewOnlyLabel(ids);
  return {
    key: contentKeyOf(ids),
    contentId: ids.contentId,
    title,
    ...(label === "épisode" ? { season, episode } : {}),
    at,
    targets: [{ label, productId: NO_PRODUCT, current: null }],
    pending: [],
    given: {},
    seriesFinished: false,
  };
}

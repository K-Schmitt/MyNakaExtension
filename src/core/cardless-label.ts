// A title with no rating card is rated as ONE content (the pause case): a film has no season,
// an épisode has both. A saison or a série is never rated without its card.

import type { ContentIds } from "./finish-event";
import type { RatingLabel } from "./rating-cards";

export function cardlessLabel({
  season,
  episode,
}: ContentIds): RatingLabel | undefined {
  if (season === undefined && episode === undefined) return "film";
  return season !== undefined && episode !== undefined ? "épisode" : undefined;
}

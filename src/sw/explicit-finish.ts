// The `finished` message the worker makes itself for a content the owner marked seen: the pause case of
// a rating with no card, or the finish a question waited on. Explicit, so complete
// whatever the threshold; it then runs through the one finish job: its pre-check, its budget, its binding.

import type { FinishedMessage } from "../content/playback-tracker";
import type { ContentIds } from "../core/finish-event";

export function explicitFinish({
  contentId,
  season,
  episode,
}: ContentIds): FinishedMessage {
  return {
    type: "finished",
    source: "explicit",
    progress: 1,
    contentId,
    ...(season === undefined || episode === undefined
      ? {}
      : { season, episode }),
  };
}

// After the `rate` job (the end and pause cards AND the home-row tiles) rated a film or an episode: the title
// is also « vu » on Naka. Best effort: the
// card's answer has no step for it, so a failure is not reported (the title shows on its page later). A
// season or a series is never marked: only the title that was watched.

import { idsOf } from "../core/finish-event";
import type { RateMessage } from "../ext/rating-messages";
import type { JobDeps } from "./job-deps";
import { markedWatched } from "./naka-watched-step";
import type { RateEnd } from "./rating-jobs";

export async function watchedAfterPlayerRating(
  deps: JobDeps,
  msg: RateMessage,
  end: RateEnd,
): Promise<void> {
  if (end.error !== undefined) return;
  if (msg.label !== "film" && msg.label !== "épisode") return;
  await markedWatched(deps, idsOf(msg), false);
}

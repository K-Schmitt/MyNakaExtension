// The one extra Naka read of an episode's finish: the series' season list, for the end of the season and
// of the series. A film asks nothing. A refusal, a lost tab or a late answer is "no list": the card then
// keeps its fallback and the finish is never put in question.

import type { FinishEvent } from "../core/finish-event";
import type { RateLimiter } from "../core/rate-limiter";
import type { NakaClient, NakaSeasons } from "../naka/naka-client";

export type SeasonsRead = () => Promise<NakaSeasons | undefined>;

export async function readSeasons(
  naka: NakaClient,
  limiter: RateLimiter,
  event: FinishEvent,
): Promise<NakaSeasons | undefined> {
  const { contentId, season, episode } = event.naka;
  if (season === undefined || episode === undefined) return undefined;
  try {
    return await limiter.run(() => naka.availableSeasons(contentId));
  } catch {
    return undefined;
  }
}

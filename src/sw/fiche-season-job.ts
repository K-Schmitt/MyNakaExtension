// The episodes of one season of the title page (fiche-season): only for the series product issued to
// the asking tab for that content (none yet, or a film's: no episodes, no request). One public season page read
// through the SC limiter; each episode product is issued to the tab, at most MAX_SEASON_EPISODES.

import type { SeasonAnswer, SeasonEpisode } from "../ext/fiche-answers";
import type { FicheSeasonMessage } from "../ext/fiche-messages";
import type { ScEpisode } from "../sc/season-episodes";
import type { FicheAsker } from "./fiche-info-job";
import type { JobDeps } from "./job-deps";

export const MAX_SEASON_EPISODES = 500;

function toSeasonEpisode(found: ScEpisode): SeasonEpisode {
  return {
    episode: found.episode,
    productId: found.productId,
    average: found.average,
  };
}

export async function ficheSeasonJob(
  deps: JobDeps,
  asker: FicheAsker,
  msg: FicheSeasonMessage,
): Promise<SeasonAnswer> {
  const title = await asker.registry.titleOf(asker.tabId, msg.contentId);
  if (title?.type !== "serie") return { episodes: [] };
  const read = await deps.limiters.sc.run(() =>
    deps.sc.seasonInfo(title.productId, msg.season),
  );
  const episodes = read.episodes
    .slice(0, MAX_SEASON_EPISODES)
    .map(toSeasonEpisode);
  const ids = episodes.map((found) => found.productId);
  await asker.registry.issue(asker.tabId, msg.contentId, ids);
  return { episodes };
}

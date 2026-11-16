// The episodes of one season of the title page (fiche-season): only for the series product issued to
// the asking tab for that content (none yet, or a film's: no episodes, no request). One public season page
// read through the SC limiter; each episode product the tab can read is issued to it, at most MAX_SEASON_EPISODES,
// each with its SensCritique title when it has one (at most MAX_TEXT characters). One fiche-season per tab
// is in flight: a newer one of the same tab supersedes it (fiche-tab-turns); its read still waiting is
// then skipped when its slot comes, and it answers no episodes and issues nothing.

import type { SeasonAnswer, SeasonEpisode } from "../ext/fiche-answers";
import type { FicheSeasonMessage } from "../ext/fiche-messages";
import { MAX_TEXT } from "../ext/fiche-page-events";
import type { ScEpisode } from "../sc/season-episodes";
import type { FicheAsker } from "./fiche-info-job";
import { type TabTurn, turnLimiters } from "./fiche-tab-turns";
import type { JobDeps } from "./job-deps";

const MAX_SEASON_EPISODES = 500;

const isId = (n: number): boolean => Number.isSafeInteger(n) && n >= 1;

// The tab reads an episode number and a product id as positive safe integers and refuses the whole answer
// otherwise (and the registry's stored form refuses such an id): an episode SensCritique lists as E0, or
// under an id that is none, is left out, never issued.
const isShowable = (found: ScEpisode): boolean =>
  isId(found.episode) && isId(found.productId);

function toSeasonEpisode(found: ScEpisode): SeasonEpisode {
  const episode: SeasonEpisode = {
    episode: found.episode,
    productId: found.productId,
    average: found.average,
  };
  if (found.title !== "") episode.title = found.title.slice(0, MAX_TEXT);
  return episode;
}

// undefined once a newer fiche-season of the tab started: a failed read of a superseded turn is not one.
async function readEpisodes(
  deps: JobDeps,
  productId: number,
  msg: FicheSeasonMessage,
  turn: TabTurn,
): Promise<ScEpisode[] | undefined> {
  const { sc } = turnLimiters(deps.limiters, turn);
  try {
    const read = await sc.run(() => deps.sc.seasonInfo(productId, msg.season));
    return turn.live() ? read.episodes : undefined;
  } catch (error) {
    if (turn.live()) throw error;
    return undefined;
  }
}

async function answered(
  deps: JobDeps,
  asker: FicheAsker,
  msg: FicheSeasonMessage,
  turn: TabTurn,
): Promise<SeasonAnswer> {
  const title = await asker.registry.titleOf(asker.tabId, msg.contentId);
  if (title?.type !== "serie") return { episodes: [] };
  const found = await readEpisodes(deps, title.productId, msg, turn);
  if (found === undefined) return { episodes: [] };
  const episodes = found
    .filter(isShowable)
    .slice(0, MAX_SEASON_EPISODES)
    .map(toSeasonEpisode);
  const ids = episodes.map((episode) => episode.productId);
  await asker.registry.issue(asker.tabId, msg.contentId, ids);
  return { episodes };
}

export async function ficheSeasonJob(
  deps: JobDeps,
  asker: FicheAsker,
  msg: FicheSeasonMessage,
  turn: TabTurn,
): Promise<SeasonAnswer> {
  try {
    return await answered(deps, asker, msg, turn);
  } finally {
    turn.end();
  }
}

// A star clicked on the title page (fiche-rate), queued like every write. Only a product issued to the
// asking tab for that content as the message's target is written (the film's or the series' title of
// that type, an episode other than the title, under a series' title it links); any other rejects before
// any request (answered undefined). Ratings go out in both modes; only the film's list removal is skipped
// in simulation.

import type { RateAnswer } from "../ext/fiche-answers";
import type { FicheRateMessage } from "../ext/fiche-messages";
import type { FicheAsker } from "./fiche-asker";
import { rateFilm } from "./fiche-film-rate";
import { assertIssued, issuedSeries } from "./fiche-issued";
import { rateEpisode, rateSeries } from "./fiche-series-rate";
import type { JobDeps } from "./job-deps";

export async function ficheRateJob(
  deps: JobDeps,
  asker: FicheAsker,
  msg: FicheRateMessage,
): Promise<RateAnswer> {
  await assertIssued(asker, msg.contentId, msg.productId, msg.target);
  switch (msg.target) {
    case "film":
      return rateFilm(deps, msg);
    case "série":
      return rateSeries(deps, msg);
    case "épisode":
      return rateEpisode(deps, msg, await issuedSeries(asker, msg.contentId));
  }
}

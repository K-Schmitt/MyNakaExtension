// A film rated from its title page (Q9, Q11, Q12): linked first when it has no pair, then the pause path
// of the rating (rateJob: the card, or the explicit finish with its pre-check, its slot of the hour's
// budget and its binding, then the ProductRate), then out of « Ma liste » (live mode only). An error of
// the rate path is answered and stops there: no list removal. A stored card that would rate another
// product than the one issued refuses the write before any request.

import { contentKeyOf } from "../core/finish-event";
import { cardFor } from "../core/rating-cards";
import type { RateAnswer } from "../ext/fiche-answers";
import type { FicheRateMessage } from "../ext/fiche-messages";
import type { Store } from "../ext/store";
import { linkForRating } from "./fiche-link-pair";
import { leaveNakaList } from "./fiche-list-removal";
import { NotIssuedError } from "./fiche-mine-job";
import type { JobDeps } from "./job-deps";
import { rateJob } from "./rating-jobs";

async function assertCardProduct(
  store: Pick<Store, "loadRatings">,
  { contentId, productId }: FicheRateMessage,
): Promise<void> {
  const card = cardFor(await store.loadRatings(), contentKeyOf({ contentId }));
  const film = card?.targets.find((target) => target.label === "film");
  if (film !== undefined && film.productId !== productId) {
    throw new NotIssuedError();
  }
}

export async function rateFilm(
  deps: JobDeps,
  msg: FicheRateMessage,
): Promise<RateAnswer> {
  const { contentId, productId, rating } = msg;
  await assertCardProduct(deps.store, msg);
  await linkForRating(deps.store, { nakaId: contentId, scId: productId });
  const error = await rateJob(deps, {
    type: "rate",
    contentId,
    label: "film",
    rating,
  });
  if (error !== undefined) return { error };
  return leaveNakaList(deps, contentId);
}

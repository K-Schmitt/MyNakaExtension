// A series or an episode rated from its title page (Q10): no finish, no slot of the hour's budget. The
// binding is checked before the one ProductRate (sendRating); a failure is answered with its code. Then
// the stored cards that name this very product are updated: a series' rating goes to the série target of
// every card of the content, an episode's to the épisode target of that episode's card. A series' pair is
// settled only after linkForRating's checks passed in this same queued job (no conflicting mapping, no
// settled pair holding either side), so settlePair never makes a pair the sync would skip.

import { contentKeyOf } from "../core/finish-event";
import {
  applyRating,
  type RatingCard,
  type RatingLabel,
} from "../core/rating-cards";
import { settlePair } from "../core/state";
import type { RateAnswer } from "../ext/fiche-answers";
import type { FicheRateMessage } from "../ext/fiche-messages";
import { linkForRating } from "./fiche-link-pair";
import type { JobDeps } from "./job-deps";
import { sendRating } from "./rating-jobs";
import { toJobError } from "./to-job-error";

const OK: RateAnswer = { ok: true };

function names(card: RatingCard, label: RatingLabel, productId: number) {
  return card.targets.some(
    (target) => target.label === label && target.productId === productId,
  );
}

async function rateCards(
  deps: JobDeps,
  keys: (card: RatingCard) => boolean,
  label: RatingLabel,
  { productId, rating }: FicheRateMessage,
): Promise<void> {
  const cards = await deps.store.loadRatings();
  const touched = cards.filter(
    (card) => keys(card) && names(card, label, productId),
  );
  if (touched.length === 0) return;
  const at = deps.now();
  const next = touched.reduce(
    (all, card) => applyRating(all, card.key, label, rating, at),
    cards,
  );
  await deps.store.saveRatings(next);
}

async function sent(
  deps: JobDeps,
  msg: FicheRateMessage,
): Promise<RateAnswer | undefined> {
  try {
    await sendRating(deps, msg.productId, msg.rating);
    return undefined;
  } catch (error) {
    return { error: toJobError(error) };
  }
}

export async function rateSeries(
  deps: JobDeps,
  msg: FicheRateMessage,
): Promise<RateAnswer> {
  const pair = { nakaId: msg.contentId, scId: msg.productId };
  await linkForRating(deps.store, pair);
  const failed = await sent(deps, msg);
  if (failed !== undefined) return failed;
  await deps.store.saveState(settlePair(await deps.store.loadState(), pair));
  const ofContent = (card: RatingCard) => card.contentId === msg.contentId;
  await rateCards(deps, ofContent, "série", msg);
  return OK;
}

export async function rateEpisode(
  deps: JobDeps,
  msg: FicheRateMessage,
): Promise<RateAnswer> {
  const failed = await sent(deps, msg);
  if (failed !== undefined) return failed;
  const key = contentKeyOf(msg);
  await rateCards(deps, (card) => card.key === key, "épisode", msg);
  return OK;
}

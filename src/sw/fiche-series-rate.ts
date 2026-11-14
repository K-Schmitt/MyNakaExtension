// A series or an episode rated from its title page (Q10): no finish, no slot of the hour's budget. Both
// first make the series' link (Q11, D6: an episode's star links its series like the panel's star): the
// title's pair {content, series product} goes through linkForRating's checks in this same queued job (no
// conflicting mapping, no settled pair holding either side), so a refusal writes nothing and sends nothing.
// The binding is checked before the one ProductRate (sendRating); a failure is answered with its code. Then
// the stored cards that name this very product are updated: a series' rating goes to the série target of
// every card of the content, an episode's to the épisode target of that episode's card. Only a series'
// rating settles the pair, so settlePair never makes a pair the sync would skip. A finish that waited on
// the series' resolved question (an episode's) then runs once, after the rating, as after the status
// page's link, whether the rating went out or not: the link is made either way. A series' state is read and
// kept as the undo record after the link, before its ProductRate (put back as it was when the rating does not
// go out); its answer carries the panel. An episode's
// rating keeps nothing and answers no panel.

import { contentKeyOf } from "../core/finish-event";
import type { Pair } from "../core/list-diff";
import {
  applyRating,
  type RatingCard,
  type RatingLabel,
} from "../core/rating-cards";
import { settlePair } from "../core/state";
import type { RateAnswer } from "../ext/fiche-answers";
import type { FicheRateMessage } from "../ext/fiche-messages";
import { linkForRating } from "./fiche-link-pair";
import { afterRating } from "./fiche-panel-flags";
import { putBackReplaced, recordBefore } from "./fiche-undo-record";
import { finishJob } from "./finish-job";
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

async function afterLink(
  deps: JobDeps,
  pair: Pair,
  rated: () => Promise<RateAnswer>,
): Promise<RateAnswer> {
  const waiting = await linkForRating(deps.store, pair);
  const answer = await rated();
  if (waiting !== undefined) await finishJob(deps, waiting);
  return answer;
}

export function rateSeries(
  deps: JobDeps,
  msg: FicheRateMessage,
): Promise<RateAnswer> {
  const pair = { nakaId: msg.contentId, scId: msg.productId };
  return afterLink(deps, pair, () => ratedSeries(deps, msg, pair));
}

async function ratedSeries(
  deps: JobDeps,
  msg: FicheRateMessage,
  pair: Pair,
): Promise<RateAnswer> {
  const kept = await recordBefore(deps, msg, "série");
  const failed = await sent(deps, msg);
  if (failed !== undefined) {
    await putBackReplaced(deps, kept);
    return failed;
  }
  await deps.store.saveState(settlePair(await deps.store.loadState(), pair));
  const ofContent = (card: RatingCard) => card.contentId === msg.contentId;
  await rateCards(deps, ofContent, "série", msg);
  return {
    ok: true,
    panel: afterRating(kept.state, msg.rating, kept.record !== undefined),
  };
}

/** `seriesId`: the series' product issued to the tab as the title (fiche-issued's issuedSeries). */
export function rateEpisode(
  deps: JobDeps,
  msg: FicheRateMessage,
  seriesId: number,
): Promise<RateAnswer> {
  const pair = { nakaId: msg.contentId, scId: seriesId };
  return afterLink(deps, pair, () => ratedEpisode(deps, msg));
}

async function ratedEpisode(
  deps: JobDeps,
  msg: FicheRateMessage,
): Promise<RateAnswer> {
  const failed = await sent(deps, msg);
  if (failed !== undefined) return failed;
  const key = contentKeyOf(msg);
  await rateCards(deps, (card) => card.key === key, "épisode", msg);
  return OK;
}

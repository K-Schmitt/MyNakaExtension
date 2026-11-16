// A series or an episode rated from its title page: no finish, no slot of the hour's budget. Both first make
// the series' link (an episode's star links its series like the panel's star): the title's pair {content,
// series product} goes through linkForRating's checks in this same queued job (no conflicting mapping, no
// settled pair holding either side), so a refusal writes nothing and sends nothing. The binding is checked
// before the one ProductRate (sendRating); a failure is answered with its code. Then the stored cards that
// name this very product are updated: a series' rating goes to the série target of every card of the content,
// an episode's to the épisode target of that episode's card. Only a series' rating settles the pair, so
// settlePair never makes a pair the sync would skip. A finish that waited on the series' resolved question
// (an episode's) then runs once, after the rating, as after the status page's link, whether the rating went
// out or not: the link is made either way. A series' state is read and kept as the undo record after the
// link, before its ProductRate (put back as it was when the rating does not go out: the ProductRate is the
// series' only write, so nothing was written before it); its answer carries the panel. An episode's rating
// keeps nothing and answers no panel. Once the rating went out, the local saves after it (the settled pair,
// the cards) are best-effort: a failure is answered `{ sent: true, step: "local-save", error }`, never as not
// sent.

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
import type { JobError } from "../ext/job-error";
import { savedAfterSent } from "./after-sent";
import { linkForRating } from "./fiche-link-pair";
import { afterRating } from "./fiche-panel-flags";
import { putBackReplaced, recordBefore } from "./fiche-undo-record";
import { finishJob } from "./finish-job";
import type { JobDeps } from "./job-deps";
import { sendRating } from "./rating-jobs";
import { toJobError } from "./to-job-error";

// The rating went out: a local save that failed is answered as sent with its code, never as not sent.
const sentAnswer = (unsaved: JobError | undefined) =>
  unsaved === undefined
    ? { ok: true as const }
    : { sent: true as const, step: "local-save" as const, error: unsaved };

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
  const next = touched.reduce(
    (all, card) => applyRating(all, card.key, label, rating),
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
  try {
    return await rated();
  } finally {
    // The link resolved the question that held the finish: it is run even when the rating step threw.
    if (waiting !== undefined) await finishJob(deps, waiting);
  }
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
  const unsettled = await savedAfterSent(async () =>
    deps.store.saveState(settlePair(await deps.store.loadState(), pair)),
  );
  const ofContent = (card: RatingCard) => card.contentId === msg.contentId;
  const unsaved = await savedAfterSent(() =>
    rateCards(deps, ofContent, "série", msg),
  );
  return {
    ...sentAnswer(unsettled ?? unsaved),
    panel: afterRating(kept.state, msg.rating, kept.record, deps.now()),
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
  const unsaved = await savedAfterSent(() =>
    rateCards(deps, (card) => card.key === key, "épisode", msg),
  );
  return sentAnswer(unsaved);
}

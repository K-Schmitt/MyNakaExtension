// The rating jobs. A rating goes out only for a target of a STORED card: the worker never takes a product id
// from a message. The card is the one the finish made, the one the explicit finish of the pause case makes
// here, or, for a title already handled, the one rebuilt read-only (handled-card.ts). A film or an épisode
// only: a saison or a série is never rated without its card. The binding is checked before the write, as the
// finish does. A failure is stored on the card as a code, never as text. rateJob says how it ended: no error
// once the rating went out, else the error (the card's failure, or why no card could be made), and whether
// the card step wrote before it (write-watch: the explicit finish's SensCritique writes or its sync state).

import { cardlessLabel } from "../core/cardless-label";
import { contentKeyOf } from "../core/finish-event";
import {
  applyDismiss,
  applyFailure,
  applyRating,
  type CardTarget,
  cardFor,
  type RatingCard,
  type RatingLabel,
} from "../core/rating-cards";
import { isHandled } from "../core/state";
import type { JobError } from "../ext/job-error";
import type { DismissRatingMessage, RateMessage } from "../ext/rating-messages";
import type { Store } from "../ext/store";
import { savedAfterSent } from "./after-sent";
import { checkBinding } from "./binding";
import { explicitFinish } from "./explicit-finish";
import { finishJob } from "./finish-job";
import { handledCard } from "./handled-card";
import { type JobDeps, jobAccounts, jobNaka } from "./job-deps";
import { toJobError } from "./to-job-error";
import { watchWrites } from "./write-watch";

type Found = { cards: RatingCard[]; target: CardTarget };
/** Whether the card step wrote anything before the ProductRate (watchWrites). */
type Wrote = { wroteBefore: boolean };
/** The card's target, or why there is none (a label never rated without its card has no error). */
type Lookup = Wrote & { found?: Found; error?: JobError };
type Rated = { cards: RatingCard[]; error?: JobError };
/**
 * How a rating ended: no error once it went out. `unsaved`: it went out, and its card's save failed
 * (after-sent: never a failure of the rating).
 */
export type RateEnd = Wrote & { error?: JobError; unsaved?: JobError };

function foundIn(
  cards: RatingCard[],
  key: string,
  label: RatingLabel,
): Found | undefined {
  const target = cardFor(cards, key)?.targets.find((t) => t.label === label);
  return target === undefined ? undefined : { cards, target };
}

// With no card, a film or an épisode runs its explicit finish first (the pause case), through
// the same job as any finish: its pre-check, its budget, its binding. A title already handled (finished
// by an older version, or before its card existed) has a free finish that makes no card: its card is built
// read-only instead, with no write and no finish record. The finish's error, if any.
async function cardStep(
  deps: JobDeps,
  msg: RateMessage,
  cards: RatingCard[],
): Promise<JobError | undefined> {
  const key = contentKeyOf(msg);
  const cardless = cardFor(cards, key) === undefined;
  if (cardless && isHandled(await deps.store.loadState(), key)) {
    await handledCard(deps, msg);
    return undefined;
  }
  return finishJob(deps, explicitFinish(msg));
}

async function makeCard(
  deps: JobDeps,
  msg: RateMessage,
  cards: RatingCard[],
): Promise<RateEnd> {
  const watched = watchWrites(deps);
  const error = await cardStep(watched.deps, msg, cards);
  return { error, wroteBefore: watched.wrote() };
}

// The card's target, or why none. A finish that ended with no card and no error (Naka does not know
// the content) is `unavailable`.
async function targetFor(deps: JobDeps, msg: RateMessage): Promise<Lookup> {
  const key = contentKeyOf(msg);
  const cards = await deps.store.loadRatings();
  const known = foundIn(cards, key, msg.label);
  if (known !== undefined) return { found: known, wroteBefore: false };
  if (cardlessLabel(msg) !== msg.label) return { wroteBefore: false };
  const { error, wroteBefore } = await makeCard(deps, msg, cards);
  const found = foundIn(await deps.store.loadRatings(), key, msg.label);
  if (found === undefined)
    return { error: error ?? "unavailable", wroteBefore };
  return { found, wroteBefore };
}

/** The binding checked, then the one ProductRate. */
export async function sendRating(
  deps: JobDeps,
  productId: number,
  rating: number,
): Promise<void> {
  const settings = await deps.store.loadSettings();
  await checkBinding(settings.binding, jobAccounts(jobNaka(deps), deps));
  await deps.sc.rate(productId, rating);
}

async function rated(
  deps: JobDeps,
  { cards, target }: Found,
  msg: RateMessage,
): Promise<Rated> {
  const key = contentKeyOf(msg);
  const at = deps.now();
  try {
    await sendRating(deps, target.productId, msg.rating);
    return { cards: applyRating(cards, key, msg.label, msg.rating) };
  } catch (caught) {
    const error = toJobError(caught);
    return { cards: applyFailure(cards, key, msg.label, error, at), error };
  }
}

// A ProductRate that throws counts as not sent: SensCritique answered no rating, and the card keeps the
// failure. `wroteBefore` covers only the card step before it, whose writes do stand on SensCritique.
export async function rateJob(
  deps: JobDeps,
  msg: RateMessage,
): Promise<RateEnd> {
  const { found, error, wroteBefore } = await targetFor(deps, msg);
  if (found === undefined)
    return { error: error ?? "unavailable", wroteBefore };
  const result = await rated(deps, found, msg);
  if (result.error !== undefined) {
    await deps.store.saveRatings(result.cards);
    return { error: result.error, wroteBefore };
  }
  const unsaved = await savedAfterSent(() =>
    deps.store.saveRatings(result.cards),
  );
  return unsaved === undefined ? { wroteBefore } : { wroteBefore, unsaved };
}

export async function dismissJob(
  store: Pick<Store, "loadRatings" | "saveRatings">,
  msg: DismissRatingMessage,
): Promise<void> {
  const cards = await store.loadRatings();
  const key = contentKeyOf(msg);
  if (cardFor(cards, key) === undefined) return;
  await store.saveRatings(applyDismiss(cards, key, msg.label));
}

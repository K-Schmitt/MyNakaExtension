// The rating jobs. A rating goes out only for a target of a STORED card: the worker never takes a product id
// from a message. The card is the one the finish made, the one the explicit finish of the pause case makes
// here, or, for a title already handled, the one rebuilt read-only (handled-card.ts). A film or an épisode
// only: a saison or a série is never rated without its card. The binding is checked before the write, as
// the finish does. A failure is stored on the card as a code, never as text.

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
import type { DismissRatingMessage, RateMessage } from "../ext/rating-messages";
import type { Store } from "../ext/store";
import { checkBinding } from "./binding";
import { explicitFinish } from "./explicit-finish";
import { finishJob } from "./finish-job";
import { handledCard } from "./handled-card";
import { type JobDeps, jobAccounts, jobNaka } from "./job-deps";
import { toJobError } from "./to-job-error";

type Found = { cards: RatingCard[]; target: CardTarget };

function foundIn(
  cards: RatingCard[],
  key: string,
  label: RatingLabel,
): Found | undefined {
  const target = cardFor(cards, key)?.targets.find((t) => t.label === label);
  return target === undefined ? undefined : { cards, target };
}

// With no card, a film or an épisode runs its explicit finish first (the design's §2.4 pause case), through
// the same job as any finish: its pre-check, its budget, its binding. A title already handled (finished
// under Plan 3, or before its card existed) has a free finish that makes no card: its card is built
// read-only instead (Ruling L2), with no write and no finish record.
async function makeCard(
  deps: JobDeps,
  msg: RateMessage,
  cards: RatingCard[],
): Promise<void> {
  const key = contentKeyOf(msg);
  const cardless = cardFor(cards, key) === undefined;
  if (cardless && isHandled(await deps.store.loadState(), key)) {
    await handledCard(deps, msg);
    return;
  }
  await finishJob(deps, explicitFinish(msg));
}

// The card's target, or none.
async function targetFor(
  deps: JobDeps,
  msg: RateMessage,
): Promise<Found | undefined> {
  const key = contentKeyOf(msg);
  const cards = await deps.store.loadRatings();
  const known = foundIn(cards, key, msg.label);
  if (known !== undefined || cardlessLabel(msg) !== msg.label) return known;
  await makeCard(deps, msg, cards);
  return foundIn(await deps.store.loadRatings(), key, msg.label);
}

async function sendRating(
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
): Promise<RatingCard[]> {
  const key = contentKeyOf(msg);
  const at = deps.now();
  try {
    await sendRating(deps, target.productId, msg.rating);
    return applyRating(cards, key, msg.label, msg.rating, at);
  } catch (error) {
    return applyFailure(cards, key, msg.label, toJobError(error), at);
  }
}

export async function rateJob(deps: JobDeps, msg: RateMessage): Promise<void> {
  const found = await targetFor(deps, msg);
  if (found === undefined) return;
  await deps.store.saveRatings(await rated(deps, found, msg));
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

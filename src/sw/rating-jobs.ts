// The rating jobs. A rating goes out only for a target of a STORED card: the worker never takes a product id
// from a message. The card is the one the finish made, or the one the explicit finish of the pause case makes
// here (a film or an épisode only: a saison or a série is never rated without its card). The binding is
// checked before the write, as the finish does. A failure is stored on the card as a code, never as text.

import type { FinishedMessage } from "../content/playback-tracker";
import { type ContentIds, contentKeyOf } from "../core/finish-event";
import {
  applyDismiss,
  applyFailure,
  applyRating,
  type CardTarget,
  cardFor,
  type RatingCard,
  type RatingLabel,
} from "../core/rating-cards";
import type { DismissRatingMessage, RateMessage } from "../ext/rating-messages";
import type { Store } from "../ext/store";
import { checkBinding } from "./binding";
import { withBreaker } from "./circuit-breaker";
import { finishJob } from "./finish-job";
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

// The pause case asks for the finish of ONE content: a film has no season, an épisode has both.
function fitsIds(label: RatingLabel, { season, episode }: ContentIds): boolean {
  if (label === "film") return season === undefined && episode === undefined;
  return label === "épisode" && season !== undefined && episode !== undefined;
}

function explicitFinish({
  contentId,
  season,
  episode,
}: ContentIds): FinishedMessage {
  return {
    type: "finished",
    source: "explicit",
    progress: 1,
    contentId,
    ...(season === undefined || episode === undefined
      ? {}
      : { season, episode }),
  };
}

// The card's target, or none. With no card, a film or an épisode runs its explicit finish first (the
// design's §2.4 pause case), through the same job as any finish: its pre-check, its budget, its binding.
async function targetFor(
  deps: JobDeps,
  msg: RateMessage,
): Promise<Found | undefined> {
  const key = contentKeyOf(msg);
  const known = foundIn(await deps.store.loadRatings(), key, msg.label);
  if (known !== undefined || !fitsIds(msg.label, msg)) return known;
  await finishJob(deps, explicitFinish(msg));
  return foundIn(await deps.store.loadRatings(), key, msg.label);
}

async function sendRating(
  deps: JobDeps,
  productId: number,
  rating: number,
): Promise<void> {
  const settings = await deps.store.loadSettings();
  await checkBinding(settings.binding, jobAccounts(jobNaka(deps), deps));
  await withBreaker((id: number, value: number) => deps.sc.rate(id, value))(
    productId,
    rating,
  );
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

// « Oublier » a handled title, whether the owner unticked « vu » on Naka or pressed the button on the page.
// Storage only: nothing is sent to SensCritique or Naka, and what is already there stays (ratings, « vu »,
// the settled pair). The state is saved first, then the cards; each only when it changes.

import { contentKeyOf } from "../core/finish-event";
import { cardFor, type RatingCard } from "../core/rating-cards";
import { forgetHandled, isHandled } from "../core/state";
import type { ForgetHandledMessage } from "../ext/page-messages";
import type { Store } from "../ext/store";

type ForgetStore = Pick<
  Store,
  "loadState" | "saveState" | "loadRatings" | "saveRatings"
>;

async function forgetKey(store: ForgetStore, key: string): Promise<void> {
  const state = await store.loadState();
  if (isHandled(state, key)) await store.saveState(forgetHandled(state, key));
}

// An unwatched title is not « à noter »: its card goes, other cards stay.
async function dropCard(store: ForgetStore, key: string): Promise<void> {
  const cards = await store.loadRatings();
  if (cardFor(cards, key) === undefined) return;
  await store.saveRatings(cards.filter((card: RatingCard) => card.key !== key));
}

export async function forgetHandledJob(
  store: ForgetStore,
  msg: ForgetHandledMessage,
): Promise<void> {
  const key = contentKeyOf(msg);
  await forgetKey(store, key);
  await dropCard(store, key);
}

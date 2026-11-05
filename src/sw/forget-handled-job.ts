// « Oublier » a handled title, whether the owner unticked « vu » on Naka or pressed the button on the page.
// Storage only: nothing is sent to SensCritique or Naka, and what is already there stays (ratings, « vu »,
// the settled pair). The state is saved first, then the cards; each only when it changes.

import { contentKeyOf } from "../core/finish-event";
import { cardFor, type RatingCard } from "../core/rating-cards";
import { forgetHandled, holdsKey } from "../core/state";
import { windowAt, withOneMore } from "../ext/finish-window";
import { isForgetFull } from "../ext/forget-window";
import type { ForgetHandledMessage } from "../ext/page-messages";
import type { Store } from "../ext/store";

type ForgetStore = Pick<
  Store,
  "loadState" | "saveState" | "loadRatings" | "saveRatings"
>;

async function forgetKey(store: ForgetStore, key: string): Promise<void> {
  const state = await store.loadState();
  if (holdsKey(state, key)) await store.saveState(forgetHandled(state, key));
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

// Something is kept under the key: handled, a question's finish, or a card. A forged id holds nothing.
async function heldBy(store: ForgetStore, key: string): Promise<boolean> {
  if (holdsKey(await store.loadState(), key)) return true;
  return cardFor(await store.loadRatings(), key) !== undefined;
}

// A forget a Naka tab asked for takes a slot of the hour's budget first (a naka.cx script can forge the
// event), reserved before the forget so that a restart cannot give it back. Over budget: nothing changes.
// A key nothing holds spends no slot, so forged ids cannot use up the owner's budget.
export async function forgetFromTabJob(
  store: ForgetStore & Pick<Store, "loadSettings" | "saveSettings">,
  now: () => number,
  msg: ForgetHandledMessage,
): Promise<void> {
  if (!(await heldBy(store, contentKeyOf(msg)))) return;
  const settings = await store.loadSettings();
  const window = windowAt(settings.forgetWindow, now());
  if (isForgetFull(window)) return;
  await store.saveSettings({ ...settings, forgetWindow: withOneMore(window) });
  await forgetHandledJob(store, msg);
}

// « Oublier » a handled title, whether the owner unticked « vu » on Naka or pressed the button on the page.
// Storage only: nothing is sent to SensCritique or Naka, and what is already there stays (ratings, « vu »,
// the settled pair). The state is saved first, then the cards; each only when it changes. Each job says whether
// it forgot anything, so the title page's undo record goes only after a forget that changed something.

import { contentKeyOf } from "../core/finish-event";
import { cardFor, type RatingCard } from "../core/rating-cards";
import { dropRetry, isWaiting } from "../core/retry-finishes";
import { forgetHandled, holdsKey, type SyncState } from "../core/state";
import { windowAt, withOneMore } from "../ext/finish-window";
import { isForgetFull } from "../ext/forget-window";
import type { ForgetHandledMessage } from "../ext/page-messages";
import type { Store } from "../ext/store";

type ForgetStore = Pick<
  Store,
  "loadState" | "saveState" | "loadRatings" | "saveRatings"
>;

// A finish waiting for a Naka tab (retry-job) is held too: once unticked, no retry may mark the title seen.
function holds(state: SyncState, key: string): boolean {
  return holdsKey(state, key) || isWaiting(state, key);
}

async function forgetKey(store: ForgetStore, key: string): Promise<boolean> {
  const state = await store.loadState();
  if (!holds(state, key)) return false;
  await store.saveState(dropRetry(forgetHandled(state, key), key));
  return true;
}

// An unwatched title is not « à noter »: its card goes, other cards stay.
async function dropCard(store: ForgetStore, key: string): Promise<boolean> {
  const cards = await store.loadRatings();
  if (cardFor(cards, key) === undefined) return false;
  await store.saveRatings(cards.filter((card: RatingCard) => card.key !== key));
  return true;
}

export async function forgetHandledJob(
  store: ForgetStore,
  msg: ForgetHandledMessage,
): Promise<boolean> {
  const key = contentKeyOf(msg);
  const forgot = await forgetKey(store, key);
  const dropped = await dropCard(store, key);
  return forgot || dropped;
}

// Something is kept under the key: handled, a question's or a waiting finish, or a card. A forged id holds
// nothing.
async function heldBy(store: ForgetStore, key: string): Promise<boolean> {
  if (holds(await store.loadState(), key)) return true;
  return cardFor(await store.loadRatings(), key) !== undefined;
}

// Over budget, only a finish waiting for a tab is dropped: a drop is never a write, and a kept entry would
// let the next sync mark the title seen against the untick (owner's choice, 2026-11-07).
async function dropWaiting(store: ForgetStore, key: string): Promise<void> {
  const state = await store.loadState();
  const dropped = dropRetry(state, key);
  if (dropped !== state) await store.saveState(dropped);
}

// A forget a Naka tab asked for takes a slot of the hour's budget first (a naka.cx script can forge the
// event), reserved before the forget so that a restart cannot give it back. Over budget: nothing else
// changes. A key nothing holds spends no slot, so forged ids cannot use up the owner's budget.
export async function forgetFromTabJob(
  store: ForgetStore & Pick<Store, "loadSettings" | "saveSettings">,
  now: () => number,
  msg: ForgetHandledMessage,
): Promise<boolean> {
  if (!(await heldBy(store, contentKeyOf(msg)))) return false;
  const settings = await store.loadSettings();
  const window = windowAt(settings.forgetWindow, now());
  if (isForgetFull(window)) {
    await dropWaiting(store, contentKeyOf(msg));
    return false;
  }
  await store.saveSettings({ ...settings, forgetWindow: withOneMore(window) });
  return forgetHandledJob(store, msg);
}

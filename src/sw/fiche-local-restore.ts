// The extension's own state of a title after « Annuler » and « Retirer la note ».
// « Annuler » puts back exactly what the undo record kept before the rating, as its very last step (so
// that no removal offer or question appears between its SensCritique and Naka steps):
// - the settled pair and, for a film, its handled key, each in or out as they were (a waiting finish, a
//   question's finish and the stored title are left as they are now);
// - the title's cards as stored: each kept card replaced by its copy, and a film's card that did not exist
//   then (made by the rating's finish) removed. A series' rating makes no card: none is removed.
// The link stays; lastFinish, the spent finish slot and a question the link resolved stay too.
// « Retirer la note » only takes the rating off the cards naming the product.

import type { FicheUndo, UndoLocal, UndoRole } from "../core/fiche-undo";
import { contentKeyOf } from "../core/finish-event";
import {
  type RatingCard,
  type RatingLabel,
  upsertCard,
} from "../core/rating-cards";
import {
  isHandled,
  markHandled,
  type SyncState,
  samePair,
  settlePair,
  unsettlePair,
} from "../core/state";
import type { Store } from "../ext/store";

export type CardTitle = {
  role: UndoRole;
  contentId: number;
  productId: number;
};
type LocalStore = Pick<
  Store,
  "loadState" | "saveState" | "loadRatings" | "saveRatings"
>;

const LABEL: Record<UndoRole, RatingLabel> = { film: "film", série: "série" };

const filmKey = (contentId: number): string => contentKeyOf({ contentId });

/** A card the title's rating may change: the film's card of its key, or a série target naming the product. */
export function isTitleCard(card: RatingCard, title: CardTitle): boolean {
  if (title.role === "film") return card.key === filmKey(title.contentId);
  return (
    card.contentId === title.contentId &&
    card.targets.some(
      (t) => t.label === "série" && t.productId === title.productId,
    )
  );
}

export function isSettled(state: SyncState, title: CardTitle): boolean {
  const pair = { nakaId: title.contentId, scId: title.productId };
  return state.settled.some((settled) => samePair(settled, pair));
}

/** Whether the film's key is handled; a series' content key never is. */
export function isTitleHandled(state: SyncState, title: CardTitle): boolean {
  return title.role === "film" && isHandled(state, filmKey(title.contentId));
}

function unmarkHandled(state: SyncState, key: string): SyncState {
  const handled = state.handled.filter((k) => k !== key);
  if (state.handledTitles === undefined) return { ...state, handled };
  const { [key]: _gone, ...titles } = state.handledTitles;
  return { ...state, handled, handledTitles: titles };
}

function withSettled(state: SyncState, title: CardTitle, settled: boolean) {
  if (isSettled(state, title) === settled) return state;
  const pair = { nakaId: title.contentId, scId: title.productId };
  return settled ? settlePair(state, pair) : unsettlePair(state, pair);
}

function withHandled(state: SyncState, title: CardTitle, handled: boolean) {
  if (title.role !== "film" || isTitleHandled(state, title) === handled) {
    return state;
  }
  const key = filmKey(title.contentId);
  return handled ? markHandled(state, key) : unmarkHandled(state, key);
}

async function restoreState(
  store: LocalStore,
  title: CardTitle,
  local: UndoLocal,
) {
  const state = await store.loadState();
  const next = withHandled(
    withSettled(state, title, local.settled),
    title,
    local.handled,
  );
  if (next !== state) await store.saveState(next);
}

function restoredCards(
  cards: RatingCard[],
  title: CardTitle,
  kept: RatingCard[],
) {
  const madeSince = (card: RatingCard) =>
    title.role === "film" &&
    isTitleCard(card, title) &&
    !kept.some((k) => k.key === card.key);
  const current = cards
    .filter((card) => !madeSince(card))
    .map((card) => kept.find((k) => k.key === card.key) ?? card);
  const missing = kept.filter(
    (k) => !current.some((card) => card.key === k.key),
  );
  return missing.reduce(upsertCard, current);
}

/** The undo's `localRestore` step. */
export async function restoreLocal(
  store: LocalStore,
  record: FicheUndo,
): Promise<void> {
  const title = {
    role: record.role,
    contentId: record.contentId,
    productId: record.productId,
  };
  await restoreState(store, title, record.local);
  const cards = await store.loadRatings();
  const next = restoredCards(cards, title, record.local.cards);
  const changed =
    next.length !== cards.length || next.some((card, i) => card !== cards[i]);
  if (changed) await store.saveRatings(next);
}

function unrated(card: RatingCard, label: RatingLabel, productId: number) {
  const { [label]: _dropped, ...given } = card.given;
  const targets = card.targets.map((t) =>
    t.label === label && t.productId === productId
      ? { ...t, current: null }
      : t,
  );
  return { ...card, given, targets };
}

/** « Retirer la note »: every card target naming the product loses its rating; nothing is asked again. */
export async function unrateCards(
  store: Pick<Store, "loadRatings" | "saveRatings">,
  title: CardTitle,
): Promise<void> {
  const cards = await store.loadRatings();
  if (!cards.some((card) => isTitleCard(card, title))) return;
  const label = LABEL[title.role];
  await store.saveRatings(
    cards.map((card) =>
      isTitleCard(card, title) ? unrated(card, label, title.productId) : card,
    ),
  );
}

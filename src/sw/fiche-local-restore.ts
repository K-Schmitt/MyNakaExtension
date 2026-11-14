// The extension's own state after « Annuler » and « Retirer la note » (spec §7). The undo record holds the
// product's SensCritique state before the rating, not the extension's: what is put back is what that state
// decides. Storage only, and an undo's very last step (spec §8), so no removal offer or question can
// appear between its SensCritique and Naka steps.
// - A title not seen before the rating is unfinished again: its pair is no longer settled (the sync acts
//   on it again, as before its finish), and a film is no longer handled, its card gone (forgetHandledJob),
//   so a later end of viewing marks it seen again.
// - A title seen before stays handled and settled.
// - The link stays: a link is not a rating's to undo.
// - Each card target naming the product gets its old rating back (the film's, or the série target of every
//   card of the series); the extension's own given rating goes. A target left unrated is asked again
//   (pending) when its card asks for it: a film always, a series once it is finished. A removal leaves it
//   unasked: the owner just took the rating away.

import type { FicheUndo, UndoRole } from "../core/fiche-undo";
import type { RatingCard, RatingLabel } from "../core/rating-cards";
import { samePair, unsettlePair } from "../core/state";
import type { Store } from "../ext/store";
import { forgetHandledJob } from "./forget-handled-job";

export type CardTitle = {
  role: UndoRole;
  contentId: number;
  productId: number;
};
type Rerate = { rating: number | null; ask: boolean };
type LocalStore = Pick<
  Store,
  "loadState" | "saveState" | "loadRatings" | "saveRatings"
>;

const LABEL: Record<UndoRole, RatingLabel> = { film: "film", série: "série" };

function names(card: RatingCard, title: CardTitle): boolean {
  const label = LABEL[title.role];
  return (
    card.contentId === title.contentId &&
    card.targets.some(
      (t) => t.label === label && t.productId === title.productId,
    )
  );
}

function asksAgain(card: RatingCard, label: RatingLabel, rerate: Rerate) {
  if (!rerate.ask || rerate.rating !== null) return false;
  return label === "film" || card.seriesFinished;
}

function rerated(card: RatingCard, title: CardTitle, rerate: Rerate) {
  const label = LABEL[title.role];
  const { [label]: _dropped, ...given } = card.given;
  const targets = card.targets.map((t) =>
    t.label === label ? { ...t, current: rerate.rating } : t,
  );
  const asked = asksAgain(card, label, rerate) ? [label] : [];
  const pending = targets
    .map((t) => t.label)
    .filter((l) => card.pending.includes(l) || asked.includes(l));
  return { ...card, given, targets, pending };
}

/** Sets the product's rating on every card target naming it; saves only when a card names it. */
export async function rerateCards(
  store: Pick<Store, "loadRatings" | "saveRatings">,
  title: CardTitle,
  rerate: Rerate,
): Promise<void> {
  const cards = await store.loadRatings();
  if (!cards.some((card) => names(card, title))) return;
  await store.saveRatings(
    cards.map((card) =>
      names(card, title) ? rerated(card, title, rerate) : card,
    ),
  );
}

async function unfinish(store: LocalStore, title: CardTitle): Promise<void> {
  const state = await store.loadState();
  const pair = { nakaId: title.contentId, scId: title.productId };
  if (state.settled.some((settled) => samePair(settled, pair))) {
    await store.saveState(unsettlePair(state, pair));
  }
  if (title.role !== "film") return;
  await forgetHandledJob(store, {
    type: "forget-handled",
    contentId: title.contentId,
  });
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
  if (!record.before.isDone) await unfinish(store, title);
  await rerateCards(store, title, { rating: record.before.rating, ask: true });
}

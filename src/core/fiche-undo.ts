// What « Annuler » restores after a rating given from a title page. Pure.
// One record holds the product's state just before that rating; it is live for ten minutes, for its own
// title only. The steps never send ProductUndone over a critique or a recommendation: a title seen
// with a rating gets its old rating back, and any other title that is reviewed or recommended now is
// refused before any request. The steps are planned against the product's state read now, so that a
// retry after a partial failure skips what is already back. The record also keeps the
// extension's own state of the title before the rating, put back exactly by the last step.

import type { RatingCard } from "./rating-cards";

export type UndoRole = "film" | "série";

export type UndoBefore = {
  rating: number | null;
  isDone: boolean;
  /** YYYY-MM-DD, as SensCritique gave it; null when it gave none. */
  dateDone: string | null;
  isWished: boolean;
  /** Naka's « Ma liste », read by the tab for a film; null when unknown (a series). */
  inMaListe: boolean | null;
  /** Naka's « Déjà vu » button before the rating, read by the tab for a film; null when unknown (a series, an old record, no button). */
  dejaVuOn: boolean | null;
};

/** The extension's own state of the title just before the rating. */
export type UndoLocal = {
  /** The film's content key was handled (a series' key never is). */
  handled: boolean;
  /** The pair {content, product} was settled. */
  settled: boolean;
  /** The stored cards the rating may change, as stored: the film's card of its key (none or one), or every
   * card of the series' content whose série target names the product. */
  cards: RatingCard[];
};

export type FicheUndo = {
  contentId: number;
  productId: number;
  role: UndoRole;
  /** When the rating was sent, in epoch milliseconds. */
  at: number;
  before: UndoBefore;
  local: UndoLocal;
};

export type UndoStep =
  | { kind: "refused-protected" }
  | { kind: "rate"; rating: number }
  | { kind: "undone" }
  | { kind: "markDone"; date: string }
  | { kind: "markDoneWithoutDate" }
  | { kind: "wish" }
  | { kind: "maListe" }
  | { kind: "dejaVu" }
  | { kind: "localRestore" };

export type ProtectedFlags = { isReviewed: boolean; isRecommended: boolean };
/** The product's state read just before the undo. */
export type UndoCurrent = ProtectedFlags &
  Pick<UndoBefore, "rating" | "isDone" | "dateDone" | "isWished">;

export const UNDO_WINDOW_MS = 600_000;

/** The record, while it is under ten minutes old and names this title. A record from the future (the
 * clock set back) fails closed: it is never live. */
export function liveUndo(
  record: FicheUndo | null,
  contentId: number,
  now: number,
): FicheUndo | undefined {
  if (record === null || record.contentId !== contentId) return undefined;
  const age = now - record.at;
  return age >= 0 && age < UNDO_WINDOW_MS ? record : undefined;
}

/** A critique or a recommendation SensCritique could lose with the seen mark: an undo that would take « vu »
 * off such a title is refused. */
export function isProtected(current: ProtectedFlags): boolean {
  return current.isReviewed || current.isRecommended;
}

/** The rating, « vu » and its date are as they were before the rating. */
function ratingBack(before: UndoBefore, current: UndoCurrent): boolean {
  return (
    current.isDone === before.isDone &&
    current.rating === before.rating &&
    (!before.isDone || current.dateDone === before.dateDone)
  );
}

/** The SensCritique steps that put the rating and « vu » back, before the lists. */
function fullRatingSteps(before: UndoBefore): UndoStep[] {
  if (before.isDone && before.rating !== null) {
    return [{ kind: "rate", rating: before.rating }];
  }
  if (before.isDone) {
    return before.dateDone === null
      ? [{ kind: "undone" }, { kind: "markDoneWithoutDate" }]
      : [{ kind: "undone" }, { kind: "markDone", date: before.dateDone }];
  }
  return before.rating === null
    ? [{ kind: "undone" }]
    : [{ kind: "undone" }, { kind: "rate", rating: before.rating }];
}

/** What is still to put back: nothing when it is back, no undone over a product neither seen nor rated. */
function ratingSteps(before: UndoBefore, current: UndoCurrent): UndoStep[] {
  if (ratingBack(before, current)) return [];
  const steps = fullRatingSteps(before);
  const bare = !current.isDone && current.rating === null;
  return bare ? steps.filter((step) => step.kind !== "undone") : steps;
}

/** The wish unless it is back, Ma liste, « Déjà vu » turned off, then the extension's own state, always last. */
function listSteps(before: UndoBefore, current: UndoCurrent): UndoStep[] {
  const wish = before.isWished && !current.isWished;
  return [
    ...(wish ? [{ kind: "wish" } as const] : []),
    ...(before.inMaListe === true ? [{ kind: "maListe" } as const] : []),
    ...(before.dejaVuOn === false ? [{ kind: "dejaVu" } as const] : []),
    { kind: "localRestore" },
  ];
}

/** The restoration steps, SensCritique first and the extension's own state last, or a single refusal when
 * it would undo a protected title. */
export function undoSteps(record: FicheUndo, current: UndoCurrent): UndoStep[] {
  const rating = ratingSteps(record.before, current);
  if (rating.some((step) => step.kind === "undone") && isProtected(current)) {
    return [{ kind: "refused-protected" }];
  }
  return [...rating, ...listSteps(record.before, current)];
}

/** « Retirer la note » is offered for a rated title with no critique or recommendation to lose. */
export function canRemove(
  current: ProtectedFlags & { rating: number | null },
): boolean {
  return current.rating !== null && !isProtected(current);
}

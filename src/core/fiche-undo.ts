// What « Annuler » restores after a rating given from a title page (spec §6 decisions 1, 6 and §7). Pure.
// One record holds the product's state just before that rating; it is live for ten minutes, for its own
// title only. The steps never send ProductUndone over a critique or a recommendation: a title seen
// with a rating gets its old rating back, and any other title that is reviewed or recommended now is
// refused before any request.

export type UndoRole = "film" | "série";

export type UndoBefore = {
  rating: number | null;
  isDone: boolean;
  /** YYYY-MM-DD, as SensCritique gave it; null when it gave none. */
  dateDone: string | null;
  isWished: boolean;
  /** Naka's « Ma liste », read by the tab for a film; null when unknown (a series). */
  inMaListe: boolean | null;
};

export type FicheUndo = {
  contentId: number;
  productId: number;
  role: UndoRole;
  /** When the rating was sent, in epoch milliseconds. */
  at: number;
  before: UndoBefore;
};

export type UndoStep =
  | { kind: "refused-protected" }
  | { kind: "rate"; rating: number }
  | { kind: "undone" }
  | { kind: "markDone"; date: string }
  | { kind: "markDoneWithoutDate" }
  | { kind: "wish" }
  | { kind: "maListe" }
  | { kind: "localRestore" };

export type ProtectedFlags = { isReviewed: boolean; isRecommended: boolean };

export const UNDO_WINDOW_MS = 600_000;

/** The record, while it is under ten minutes old and names this title. */
export function liveUndo(
  record: FicheUndo | null,
  contentId: number,
  now: number,
): FicheUndo | undefined {
  if (record === null || record.contentId !== contentId) return undefined;
  return now - record.at < UNDO_WINDOW_MS ? record : undefined;
}

function isProtected(current: ProtectedFlags): boolean {
  return current.isReviewed || current.isRecommended;
}

/** The SensCritique steps that put the rating and « vu » back, before the lists. */
function ratingSteps(before: UndoBefore): UndoStep[] {
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

/** The wish, Ma liste, then the extension's own state, always last. */
function listSteps(before: UndoBefore): UndoStep[] {
  return [
    ...(before.isWished ? [{ kind: "wish" } as const] : []),
    ...(before.inMaListe === true ? [{ kind: "maListe" } as const] : []),
    { kind: "localRestore" },
  ];
}

/** The restoration sequence of spec §7, or a single refusal when it would undo a protected title. */
export function undoSteps(
  record: FicheUndo,
  current: ProtectedFlags,
): UndoStep[] {
  const rating = ratingSteps(record.before);
  if (rating.some((step) => step.kind === "undone") && isProtected(current)) {
    return [{ kind: "refused-protected" }];
  }
  return [...rating, ...listSteps(record.before)];
}

/** « Retirer la note » is offered for a rated title with no critique or recommendation to lose. */
export function canRemove(
  current: ProtectedFlags & { rating: number | null },
): boolean {
  return current.rating !== null && !isProtected(current);
}

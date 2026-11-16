// « Annuler » for 10 minutes: the worker says how long its record stays live (`undoLeftMs`); once that time
// is over on the same page, the tab stops offering it (« Retirer la note » then shows when the worker offered
// it, and the protected line when the title has one; the line of a rating that did not go out after its
// finish wrote stops naming it). One timer per visit: every new info replaces it, the end of the visit stops
// it.

import { UNDO_WINDOW_MS } from "../core/fiche-undo";
import type { FicheScope } from "./fiche-page";

function expireUndo(scope: FicheScope, token: object): void {
  const { page } = scope;
  if (!scope.live() || page.undoExpiry?.token !== token) return;
  page.undoExpiry = undefined;
  const product = page.info?.product;
  if (page.info === undefined || product === undefined) return;
  const { undoLeftMs: _left, ...flags } = product;
  page.info = { ...page.info, product: { ...flags, canUndo: false } };
  if (page.outcome?.kind === "finish-wrote") {
    page.outcome = { kind: "finish-wrote-expired" };
  }
  scope.show();
}

/** The visit's timer, if any, stopped. */
export function stopUndoExpiry(scope: FicheScope): void {
  const expiry = scope.page.undoExpiry;
  if (expiry === undefined) return;
  scope.ports.timer.clear(expiry.handle);
  scope.page.undoExpiry = undefined;
}

/** The shown product's « Annuler », if offered, timed out when the worker's record will be. */
export function watchUndoExpiry(scope: FicheScope): void {
  stopUndoExpiry(scope);
  const product = scope.page.info?.product;
  if (product?.canUndo !== true) return;
  const token = {};
  const left = product.undoLeftMs ?? UNDO_WINDOW_MS;
  const handle = scope.ports.timer.set(() => expireUndo(scope, token), left);
  scope.page.undoExpiry = { token, handle };
}

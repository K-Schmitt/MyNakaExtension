// The product's actions under Naka's info panel (spec §2, §6): « Voir sur SensCritique », an
// `<a target="_blank">` to the validated product page, and « Annuler » or « Retirer la note » (the
// protected-title line instead of the latter), then the write on its way and its ending. A series'
// confirmation replaces them while it is shown, so its « Annuler » never sits by the undo one. Each button
// acts on a trusted click only; « Annuler », « Retirer la note » and the confirmation only while `watch` says
// them visible (D7).

import type { FicheProduct } from "../../ext/fiche-answers";
import type { FichePending, FicheView } from "../fiche-view";
import type { ElementLike } from "./dom-like";
import type { RowWatch } from "./draw-watch";
import {
  MA_LISTE_MISSED_LINE,
  PROTECTED_LINE,
  REMOVE_LABEL,
  REMOVING_LINE,
  SC_LINK_LABEL,
  UNDO_LABEL,
  UNDOING_LINE,
} from "./fiche-copy";
import type { FicheHandlers } from "./fiche-handlers";
import { outcomeLines, seriesConfirm } from "./fiche-rare-states";
import { NOT_RATED_LINE, SENDING_LINE } from "./rating-copy";
import {
  BUTTON_CLASS,
  type Maker,
  row,
  textLine,
  watchedButton,
} from "./rating-render";

const LINK_CLASS = `${BUTTON_CLASS} mn-link`;
/** The line of a write on its way; the link and the confirmation show their own state. */
const PENDING_LINES: Partial<Record<FichePending, string>> = {
  rating: SENDING_LINE,
  undo: UNDOING_LINE,
  remove: REMOVING_LINE,
};

function scLink(doc: Maker, url: string): ElementLike {
  const link = doc.createElement("a");
  link.textContent = SC_LINK_LABEL;
  link.className = LINK_CLASS;
  link.setAttribute("href", url);
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
  return link;
}

/** While a write is on its way, the controller refuses another: the button says so. */
function disabledWhile(view: FicheView, el: ElementLike): ElementLike {
  if (view.pending === undefined) return el;
  el.setAttribute("disabled", "");
  el.setAttribute("aria-disabled", "true");
  return el;
}

function writeButton(
  doc: Maker,
  product: FicheProduct,
  handlers: FicheHandlers,
  watch: RowWatch,
) {
  if (product.canUndo)
    return [watchedButton(doc, UNDO_LABEL, BUTTON_CLASS, watch, handlers.undo)];
  if (!product.canRemove) return [];
  return [
    watchedButton(doc, REMOVE_LABEL, BUTTON_CLASS, watch, handlers.remove),
  ];
}

/** The worker's word (decision 6); « Annuler » stays offered over it, since it never loses a critique. */
function showsProtected(product: FicheProduct): boolean {
  return product.protected && !product.canUndo;
}

function lines(doc: Maker, view: FicheView, product: FicheProduct) {
  const pending =
    view.pending === undefined ? undefined : PENDING_LINES[view.pending];
  const texts = [
    ...(showsProtected(product) ? [textLine(doc, PROTECTED_LINE)] : []),
    ...(pending === undefined ? [] : [textLine(doc, pending)]),
    ...(view.maListeMissed === true
      ? [textLine(doc, MA_LISTE_MISSED_LINE)]
      : []),
  ];
  const shown = new Set(texts.map((line) => line.textContent));
  const outcome = outcomeLines(doc, view, NOT_RATED_LINE);
  return [...texts, ...outcome.filter((line) => !shown.has(line.textContent))];
}

export function productActions(
  doc: Maker,
  view: FicheView,
  product: FicheProduct,
  handlers: FicheHandlers,
  watch: RowWatch,
): ElementLike[] {
  if (view.pending === "confirm-series") {
    return seriesConfirm(doc, handlers, watch);
  }
  const writes = writeButton(doc, product, handlers, watch);
  const buttons = [
    ...(product.url === undefined ? [] : [scLink(doc, product.url)]),
    ...writes.map((el) => disabledWhile(view, el)),
  ];
  return [
    ...(buttons.length > 0 ? [row(doc, buttons)] : []),
    ...lines(doc, view, product),
  ];
}

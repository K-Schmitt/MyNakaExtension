// The actions under Naka's « À propos » facts: a closed host right after `dl.nh-fiche-facts`, kept there by the
// row keeper whenever Naka redraws the section. It holds the product's actions (fiche-product-actions:
// « Voir sur SensCritique », « Annuler » or « Retirer la note », the protected-title line) or, without a
// product, every rare state of the title (fiche-rare-states) with the search field and « Réessayer ».
// Built again only when what it shows changed; a search field that had the focus gets it back
// (field-focus). The search field's keys and input stay in the host. « Annuler », « Retirer la note », the
// series confirmation and the candidates act only while `seen` says them visible; a redraw and a hide
// stop watching the rows of the last draw.

import type { FicheView } from "../fiche-view";
import type { DocLike, ElementLike, ShadowRootLike } from "./dom-like";
import { createDrawWatch, type RowWatch } from "./draw-watch";
import type { FicheHandlers } from "./fiche-handlers";
import { actionsPorts, type PanelPlace } from "./fiche-panel-dom";
import { productActions } from "./fiche-product-actions";
import { rareParts, seasonLines } from "./fiche-rare-states";
import { ACTIONS_SHEET } from "./fiche-styles";
import { type FieldSlot, focusAtEnd, hasFocus } from "./field-focus";
import { FIELD_STOPPED_EVENTS, stopAtHost } from "./input-stop";
import type { Maker } from "./rating-render";
import { createClosedHost } from "./row-host";
import { createRowKeeper } from "./row-keeper";
import type { ReleasableWatch } from "./star-visibility";

const ACTIONS_CLASS = "mn-fiche-actions";
// `all: initial` resets `color-scheme` too: set back to dark, a scrolling candidate list keeps a dark bar.
const HOST_DECLARATIONS = [
  "all: initial",
  "color-scheme: dark",
  "display: block",
];

export type FicheActionsPorts = PanelPlace & {
  doc: Pick<DocLike, "createElement">;
  /** The visibility watch of the write buttons. */
  seen: ReleasableWatch;
};

function buildActions(
  doc: Maker,
  view: FicheView,
  handlers: FicheHandlers,
  slot: FieldSlot,
  watch: RowWatch,
): ElementLike[] {
  const product = view.info?.product;
  const parts = [
    ...(product === undefined
      ? rareParts(doc, view, handlers, slot, watch)
      : productActions(doc, view, product, handlers, watch)),
    ...seasonLines(doc, view),
  ];
  if (parts.length === 0) return [];
  const wrap = doc.createElement("div");
  wrap.className = ACTIONS_CLASS;
  for (const part of parts) wrap.appendChild(part);
  return [wrap];
}

/**
 * What the actions show, as one string: two views with equal inputs draw the same actions. Every field
 * counts but the episodes (the boxes draw them), so a field added to the view is compared by default.
 */
function actionsInputs(view: FicheView): string {
  const { episodes: _drawnByTheBoxes, ...shown } = view;
  return JSON.stringify(shown);
}

type Drawn = { inputs: string; handlers: FicheHandlers; slot: FieldSlot };

function draw(
  doc: Maker,
  root: ShadowRootLike,
  view: FicheView,
  handlers: FicheHandlers,
  watch: RowWatch,
): Drawn {
  const slot: FieldSlot = {};
  root.replaceChildren(...buildActions(doc, view, handlers, slot, watch));
  return { inputs: actionsInputs(view), handlers, slot };
}

function createHost(ports: FicheActionsPorts) {
  const { host, root } = createClosedHost(
    ports.doc,
    "div",
    HOST_DECLARATIONS,
    ACTIONS_SHEET,
  );
  stopAtHost(host, FIELD_STOPPED_EVENTS);
  return { root, keeper: createRowKeeper(actionsPorts(ports, host)) };
}

export function createFicheActions(ports: FicheActionsPorts): {
  show(view: FicheView, handlers: FicheHandlers): void;
  hide(): void;
} {
  let made: ReturnType<typeof createHost> | undefined;
  let drawn: Drawn | undefined;
  const watched = createDrawWatch(ports.seen);
  // A new draw: the rows of the last one are watched no more.
  const redrawn = (root: ShadowRootLike, view: FicheView, h: FicheHandlers) => {
    watched.clear();
    return draw(ports.doc, root, view, h, watched.watch);
  };
  return {
    show(view, handlers) {
      made ??= createHost(ports);
      const inputs = actionsInputs(view);
      const redraw = drawn?.inputs !== inputs || drawn.handlers !== handlers;
      const refocus = redraw && hasFocus(made.root, drawn?.slot.field);
      if (redraw) drawn = redrawn(made.root, view, handlers);
      made.keeper.start();
      const field = drawn?.slot.field;
      if (refocus && field !== undefined) focusAtEnd(field);
    },
    hide() {
      watched.clear();
      drawn = undefined;
      made?.root.replaceChildren();
      made?.keeper.stop();
    },
  };
}

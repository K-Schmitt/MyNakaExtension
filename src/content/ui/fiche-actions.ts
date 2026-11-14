// The actions under Naka's info panel (spec §2): a closed host right after `div.dca-panel`, kept there by the
// row keeper whenever Naka redraws the aside. It holds the product's actions (fiche-product-actions:
// « Voir sur SensCritique », « Annuler » or « Retirer la note », the protected-title line) or, without a
// product, every rare state of step 7 (fiche-rare-states). Built again only when what it shows changed.

import type { FicheView } from "../fiche-view";
import type { DocLike, ElementLike } from "./dom-like";
import type { FicheHandlers } from "./fiche-handlers";
import { actionsPorts, type PanelPlace } from "./fiche-panel-dom";
import { productActions } from "./fiche-product-actions";
import { rareParts, seasonLines } from "./fiche-rare-states";
import { ACTIONS_SHEET } from "./fiche-styles";
import type { Maker } from "./rating-render";
import { createClosedHost } from "./row-host";
import { createRowKeeper } from "./row-keeper";

const ACTIONS_CLASS = "mn-fiche-actions";
const HOST_DECLARATIONS = ["all: initial", "display: block"];

export type FicheActionsPorts = PanelPlace & {
  doc: Pick<DocLike, "createElement">;
};

function buildActions(
  doc: Maker,
  view: FicheView,
  handlers: FicheHandlers,
): ElementLike[] {
  const product = view.info?.product;
  const parts = [
    ...(product === undefined
      ? rareParts(doc, view, handlers)
      : productActions(doc, view, product, handlers)),
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
export function actionsInputs(view: FicheView): string {
  const { episodes: _drawnByTheBoxes, ...shown } = view;
  return JSON.stringify(shown);
}

function createHost(ports: FicheActionsPorts) {
  const { host, root } = createClosedHost(
    ports.doc,
    "div",
    HOST_DECLARATIONS,
    ACTIONS_SHEET,
  );
  return { root, keeper: createRowKeeper(actionsPorts(ports, host)) };
}

export function createFicheActions(ports: FicheActionsPorts): {
  show(view: FicheView, handlers: FicheHandlers): void;
  hide(): void;
} {
  let made: ReturnType<typeof createHost> | undefined;
  let drawn: { inputs: string; handlers: FicheHandlers } | undefined;
  return {
    show(view, handlers) {
      made ??= createHost(ports);
      const inputs = actionsInputs(view);
      if (drawn?.inputs !== inputs || drawn.handlers !== handlers) {
        drawn = { inputs, handlers };
        made.root.replaceChildren(...buildActions(ports.doc, view, handlers));
      }
      made.keeper.start();
    },
    hide() {
      drawn = undefined;
      made?.root.replaceChildren();
      made?.keeper.stop();
    },
  };
}

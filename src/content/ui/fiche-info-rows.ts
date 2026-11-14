// The two SensCritique rows at the end of Naka's info panel (spec §2, decision 3): « SensCritique » and the
// average, « Ta note » and the ten stars. They copy Naka's rows (`div.dcf-info-row`: a label `span`, a value
// `span`) so its styles apply; the stars sit in a closed host inside the value. The row keeper puts them back
// at the end of the panel whenever Naka redraws the aside. Input stops at the rows. Texts go through
// textContent; the stars are built again only when what they show changed, so their focus stays.

import type { FicheProduct } from "../../ext/fiche-answers";
import type { FicheView } from "../fiche-view";
import type { DocLike, ElementLike } from "./dom-like";
import {
  averageLine,
  episodeStarsName,
  labelLine,
  MINE_LABEL,
  NO_VALUE,
  PANEL_TITLE,
} from "./fiche-copy";
import { type FicheHandlers, ficheStars } from "./fiche-handlers";
import { type PanelPlace, rowsPorts } from "./fiche-panel-dom";
import { PANEL_STARS_SHEET } from "./fiche-styles";
import { ROW_STOPPED_EVENTS, stopAtHost } from "./input-stop";
import { type Maker, textLine } from "./rating-render";
import { createClosedHost } from "./row-host";
import { createRowKeeper } from "./row-keeper";
import type { SeenWatch } from "./star-visibility";

const NAKA_ROW_CLASS = "dcf-info-row";
const STARS_DECLARATIONS = [
  "all: initial",
  "display: inline-block",
  "vertical-align: middle",
];

export type FicheRowsPorts = PanelPlace & {
  doc: Pick<DocLike, "createElement">;
  seen: SeenWatch;
};

function infoRow(doc: Maker, label: string) {
  const row = doc.createElement("div");
  row.className = NAKA_ROW_CLASS;
  const name = doc.createElement("span");
  name.textContent = label;
  const value = doc.createElement("span");
  row.appendChild(name);
  row.appendChild(value);
  stopAtHost(row, ROW_STOPPED_EVENTS);
  return { row, value };
}

function averageText(product: FicheProduct | undefined): string {
  const average = product?.average;
  return average == null ? NO_VALUE : averageLine(average);
}

function starsOf(
  ports: Pick<FicheRowsPorts, "doc" | "seen">,
  slot: object,
  product: FicheProduct | undefined,
  handlers: FicheHandlers,
): ElementLike {
  const { doc, seen } = ports;
  if (product === undefined) return textLine(doc, NO_VALUE);
  const name = episodeStarsName(labelLine(product.label));
  const watch = { watch: seen, slot };
  return ficheStars(doc, product.mine, handlers.rateTitle, watch, name);
}

// Made on the first show, never while the tab's entry runs (the title page may never come).
function createRows(ports: FicheRowsPorts) {
  const { doc } = ports;
  const average = infoRow(doc, PANEL_TITLE);
  const mine = infoRow(doc, MINE_LABEL);
  const stars = createClosedHost(
    doc,
    "span",
    STARS_DECLARATIONS,
    PANEL_STARS_SHEET,
  );
  mine.value.appendChild(stars.host);
  const rows = [average.row, mine.row];
  return {
    average: average.value,
    stars: stars.root,
    keeper: createRowKeeper(rowsPorts(ports, rows)),
  };
}

export function createFicheRows(ports: FicheRowsPorts): {
  show(view: FicheView, handlers: FicheHandlers): void;
  hide(): void;
} {
  let made: ReturnType<typeof createRows> | undefined;
  let drawn: { key: string; handlers: FicheHandlers } | undefined;
  return {
    show(view, handlers) {
      made ??= createRows(ports);
      const product = view.info?.product;
      const text = averageText(product);
      // An equal write would still replace the text node: one page change less for every watcher.
      if (made.average.textContent !== text) made.average.textContent = text;
      const key = JSON.stringify([product?.id, product?.mine, product?.label]);
      if (drawn?.key !== key || drawn.handlers !== handlers) {
        drawn = { key, handlers };
        made.stars.replaceChildren(starsOf(ports, made, product, handlers));
      }
      made.keeper.start();
    },
    hide() {
      made?.keeper.stop();
    },
  };
}

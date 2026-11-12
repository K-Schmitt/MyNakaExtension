// Where the title page's SensCritique block draws: a closed host right after Naka's info panel
// (`div.dca-panel` in `aside.dcf-aside`), made on the first show and kept there by the row keeper whenever
// Naka redraws the aside. The page's parts come in through ports (fiche-page-dom.ts binds them).

import type { FicheView } from "../fiche-view";
import type { DocLike, ElementLike } from "./dom-like";
import type { FicheHandlers } from "./fiche-handlers";
import { buildFichePanel } from "./fiche-panel-block";
import { PANEL_SHEET } from "./fiche-styles";
import { createClosedHost } from "./row-host";
import { createRowKeeper, type KeeperPorts } from "./row-keeper";

const PANEL_DECLARATIONS = [
  "all: initial",
  "display: block",
  "margin: 16px 0 0",
];

export type FichePanelPorts = {
  doc: DocLike;
  /** The keeper's ports over the page's aside, for the host just made. */
  keeper(host: ElementLike): KeeperPorts;
};

function createPanel(ports: FichePanelPorts) {
  const { host, root } = createClosedHost(
    ports.doc,
    "div",
    PANEL_DECLARATIONS,
    PANEL_SHEET,
  );
  return { root, keeper: createRowKeeper(ports.keeper(host)) };
}

export function createFichePanel(ports: FichePanelPorts): {
  show(view: FicheView, handlers: FicheHandlers): void;
  hide(): void;
} {
  let panel: ReturnType<typeof createPanel> | undefined;
  return {
    show(view, handlers) {
      panel ??= createPanel(ports);
      panel.root.replaceChildren(buildFichePanel(ports.doc, view, handlers));
      panel.keeper.start();
    },
    hide() {
      panel?.root.replaceChildren();
      panel?.keeper.stop();
    },
  };
}

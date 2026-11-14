// The title page UI's ports in the page: the real document, Naka's info panel, the episode boxes of the grid,
// the page's change watch and the keepers' timer.

import type { EndTimer } from "./end-poll";
import { episodeBoxes } from "./fiche-grid-dom";
import { watchPage } from "./fiche-page-watch";
import type { PanelElement } from "./fiche-panel-dom";
import type { FicheUiPorts } from "./fiche-ui";

const INFO_PANEL = "aside.dcf-aside div.dca-panel";

export function fichePagePorts(doc: Document, timer: EndTimer): FicheUiPorts {
  return {
    doc,
    // The real document made our rows and host, so they are real elements: the panel takes them.
    panel: () =>
      doc.querySelector(INFO_PANEL) as unknown as PanelElement | null,
    timer,
    boxes: () => episodeBoxes(doc),
    watch: (onChange) => watchPage(doc, onChange),
  };
}

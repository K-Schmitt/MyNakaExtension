// The title page UI's ports in the page: the real document, the keeper's ports over Naka's aside, the
// episode boxes of the grid and the page's change watch.

import type { EndTimer } from "./end-poll";
import { episodeBoxes } from "./fiche-grid-dom";
import { watchPage } from "./fiche-page-watch";
import { createPanelPorts } from "./fiche-panel-dom";
import type { FicheUiPorts } from "./fiche-ui";

export function fichePagePorts(doc: Document, timer: EndTimer): FicheUiPorts {
  return {
    doc,
    // The real document made the host, so it is a real element: the DOM binding moves it in the aside.
    keeper: (host) =>
      createPanelPorts(doc, host as unknown as HTMLElement, timer),
    boxes: () => episodeBoxes(doc),
    watch: (onChange) => watchPage(doc, onChange),
  };
}

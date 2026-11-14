// The title page UI's ports in the page: the real document, Naka's info panel, the episode boxes of the grid,
// the page's change watch, the keepers' timer and the stars' visibility watch (D7).

import type { EndTimer } from "./end-poll";
import { episodeBoxes } from "./fiche-grid-dom";
import { watchPage } from "./fiche-page-watch";
import type { PanelElement } from "./fiche-panel-dom";
import type { FicheUiPorts } from "./fiche-ui";
import { createSeenWatch } from "./star-visibility";
import {
  intersectionObserverV2,
  type ObserverWindow,
} from "./star-visibility-dom";

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
    // One observer for the page's star rows (D7); the content script's window has the page's observer.
    seen: createSeenWatch(
      intersectionObserverV2(window as unknown as ObserverWindow),
    ),
  };
}

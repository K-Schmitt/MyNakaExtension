// The title page UI's ports in the page: the real document, Naka's « À propos » facts, the episode boxes of the grid,
// the page's change watch, the keepers' timer and the write controls' visibility watch.

import type { EndTimer } from "./end-poll";
import { episodeBoxes } from "./fiche-grid-dom";
import type { HeroBadges, HeroRating } from "./fiche-hero-place";
import { watchPage } from "./fiche-page-watch";
import type { PanelElement } from "./fiche-panel-dom";
import type { FicheUiPorts } from "./fiche-ui";
import { type ObserverWindow, pageSeenWatch } from "./star-visibility-dom";

const BADGES = "header.nh-fiche-hero div.nh-fiche-badges";
const INFO_PANEL = "section.nh-fiche-about dl.nh-fiche-facts";

export function fichePagePorts(doc: Document, timer: EndTimer): FicheUiPorts {
  return {
    doc,
    // The real document made our rows and host, so they are real elements: the panel takes them.
    panel: () =>
      doc.querySelector(INFO_PANEL) as unknown as PanelElement | null,
    timer,
    badges: () => doc.querySelector(BADGES) as unknown as HeroBadges | null,
    rating: () =>
      doc.querySelector(
        `${BADGES} > span.nh-rating`,
      ) as unknown as HeroRating | null,
    boxes: () => episodeBoxes(doc),
    watch: (onChange) => watchPage(doc, onChange),
    // One visibility observer for the page's star rows and write buttons.
    seen: pageSeenWatch(window as unknown as ObserverWindow),
  };
}

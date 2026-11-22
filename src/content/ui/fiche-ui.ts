// The title page UI the controller renders into: our two rows in Naka's info panel, the actions right after
// it and the episode boxes, all taken off when the tab leaves the title page (an undefined view).

import type { FicheView } from "../fiche-view";
import { createFicheActions, type FicheActionsPorts } from "./fiche-actions";
import { createFicheEpisodes, type FicheEpisodesPorts } from "./fiche-episodes";
import type { FicheHandlers } from "./fiche-handlers";
import { createHeroChip } from "./fiche-hero-chip";
import type { HeroPlace } from "./fiche-hero-place";
import { createFicheRows } from "./fiche-info-rows";

export type FicheUiPorts = FicheActionsPorts & FicheEpisodesPorts & HeroPlace;

export function createFicheUi(ports: FicheUiPorts): {
  render(view: FicheView | undefined, handlers: FicheHandlers): void;
} {
  const rows = createFicheRows(ports);
  const actions = createFicheActions(ports);
  const episodes = createFicheEpisodes(ports);
  const chip = createHeroChip(ports);
  return {
    render(view, handlers) {
      if (view === undefined) {
        rows.hide();
        chip.hide();
        actions.hide();
        episodes.clear();
        return;
      }
      rows.show(view, handlers);
      actions.show(view, handlers);
      chip.show(view, rows.reveal);
      episodes.draw(view, handlers);
    },
  };
}

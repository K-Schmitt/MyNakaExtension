// The title page UI the controller renders into: the panel block and the episode boxes, both taken off
// when the tab leaves the title page (an undefined view).

import type { FicheView } from "../fiche-view";
import { createFicheEpisodes, type FicheEpisodesPorts } from "./fiche-episodes";
import type { FicheHandlers } from "./fiche-handlers";
import { createFichePanel, type FichePanelPorts } from "./fiche-panel";

export type FicheUiPorts = FichePanelPorts & FicheEpisodesPorts;

export function createFicheUi(ports: FicheUiPorts): {
  render(view: FicheView | undefined, handlers: FicheHandlers): void;
} {
  const panel = createFichePanel(ports);
  const episodes = createFicheEpisodes(ports);
  return {
    render(view, handlers) {
      if (view === undefined) {
        panel.hide();
        episodes.clear();
        return;
      }
      panel.show(view, handlers);
      episodes.draw(view, handlers);
    },
  };
}

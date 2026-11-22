// Naka's own « Déjà vu » button on a film page: in `div.nh-fiche-actions`, `button.nh-fiche-act` titled
// « Marquer comme vu » while off and « Retirer des titres vus » once on. An episode's is the « Vu » button of
// its row (fiche-grid-dom). Read, and clicked once when off (never when on: that would take the title out of
// the seen ones); Naka's page then sends its own request and the button follows.

import type { FichePorts } from "../fiche-ports";
import { clickEpisodeVu, episodeVuState } from "./fiche-grid-dom";

const ACTION = "div.nh-fiche-actions > button.nh-fiche-act";
const OFF = `${ACTION}[title="Marquer comme vu"]`;
const ON = `${ACTION}[title="Retirer des titres vus"]`;

export type DejaVuButton = { click(): void };
export type DejaVuDoc = {
  querySelector(selector: string): DejaVuButton | null;
  querySelectorAll: Document["querySelectorAll"];
};

/** The film's button: undefined when absent, else whether it is on. */
function filmState(doc: DejaVuDoc): boolean | undefined {
  if (doc.querySelector(OFF) !== null) return false;
  return doc.querySelector(ON) === null ? undefined : true;
}

export function dejaVuPorts(
  doc: DejaVuDoc,
): Pick<FichePorts, "dejaVu" | "clickDejaVu"> {
  return {
    dejaVu: (episode) =>
      episode === undefined ? filmState(doc) : episodeVuState(doc, episode),
    clickDejaVu(episode) {
      if (episode !== undefined) clickEpisodeVu(doc, episode);
      else doc.querySelector(OFF)?.click();
    },
  };
}

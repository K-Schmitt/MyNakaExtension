// Naka's « Déjà vu » (a film) or « Vu » (an episode row) lit after our rating: when the button is on screen (lit or
// not), the tab tells the worker so (`vuByTab`), and once the worker answers `dejaVu: "tab"` the tab notes the
// ids watched in its playback tracker (so Naka's own « vu » is not taken for a finish) and THEN clicks once.
// The button is read again right before: already on, gone, a visit that is over, or an episode whose season
// is no longer the shown one gets no click. A series has no such button: it is never read.

import type { RateAnswer } from "../ext/fiche-answers";
import type { FicheRateMessage } from "../ext/fiche-messages";
import { stillOnTitle } from "./fiche-address";
import { contentOf, type FicheScope } from "./fiche-page";

/** The rating's `vuByTab` field: the button is on screen, lit or not (film, or the rated episode's row). A lit one is never written over. */
export function vuField(
  scope: FicheScope,
  episode?: number,
): Pick<FicheRateMessage, "vuByTab"> {
  return scope.ports.dejaVu(episode) !== undefined ? { vuByTab: true } : {};
}

/** The worker left the « Déjà vu » to the tab. */
export function vuLeftToTab(answer: RateAnswer | undefined): boolean {
  return answer !== undefined && "ok" in answer && answer.dejaVu === "tab";
}

/** One click, after noting the ids, when the visit goes on, the season is the rated one and the button is off. */
export function clickVu(
  scope: FicheScope,
  place?: { season: number; episode: number },
): void {
  const { page, ports } = scope;
  const contentId = contentOf(page);
  if (contentId === undefined) return;
  if (!scope.live() || !stillOnTitle(scope)) return;
  if (place !== undefined && ports.shownSeason() !== place.season) return;
  if (ports.dejaVu(place?.episode) !== false) return;
  ports.noteOwnVu({ contentId, ...place });
  ports.clickDejaVu(place?.episode);
}

// Naka's « Ma liste » button kept right after our writes (spec §7): when it is on screen, the tab tells the
// worker so (`listByTab`), and once the worker answers `maListe: "tab"` the tab clicks it itself; Naka's page
// then sends its own request and its class follows. One click at most per answer, the button read again
// right before it, and only when the tab itself sent `listByTab`: a button already in the wanted state, gone
// from the screen, or a visit that is over (or whose address already names another page) gets none, so no
// click ever calls another. In simulation the
// worker never answers "tab": no click.

import type { RateAnswer } from "../ext/fiche-answers";
import type { FicheRateMessage } from "../ext/fiche-messages";
import type { UndoAnswer } from "../ext/fiche-undo-answers";
import { stillOnTitle } from "./fiche-address";
import type { FicheScope } from "./fiche-page";

type RateListFields = Pick<FicheRateMessage, "inMaListe" | "listByTab">;

/** A film rating's fields: whether the button was active, and that the tab will click it. */
export function rateListFields(scope: FicheScope): RateListFields {
  const inMaListe = scope.ports.maListe();
  return inMaListe === undefined ? {} : { inMaListe, listByTab: true };
}

/** An undo's field: the button is on screen, so the tab gives the film back itself. */
export function undoListField(scope: FicheScope): { listByTab?: true } {
  return scope.ports.maListe() === undefined ? {} : { listByTab: true };
}

/** The worker left the film's removal from « Ma liste » to the tab. */
export function removedByTab(answer: RateAnswer | undefined): boolean {
  return answer !== undefined && "ok" in answer && answer.maListe === "tab";
}

/** The worker left the film's return to « Ma liste » to the tab, and that step is done. */
export function givenBackByTab(answer: UndoAnswer | undefined): boolean {
  if (answer === undefined) return false;
  if ("ok" in answer) return answer.maListe === "tab";
  if (!("partial" in answer) || answer.maListe !== "tab") return false;
  return answer.partial.done.some((step) => step.kind === "maListe");
}

/** One click when the visit goes on and the button is on screen but not `wanted` (true: in the list). */
export function setMaListe(scope: FicheScope, wanted: boolean): void {
  if (!scope.live() || !stillOnTitle(scope)) return;
  const now = scope.ports.maListe();
  if (now !== undefined && now !== wanted) scope.ports.clickMaListe();
}

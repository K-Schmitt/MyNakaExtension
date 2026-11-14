// « Annuler » from the title page (spec §6): the worker puts back what the last rating changed. The tab
// sends it for the shown product, never while another write is on its way, and gives the film back to
// Naka's « Ma liste » itself when the worker leaves that to it (fiche-ma-liste). The answer is returned
// for the panel, which shows what was put back.

import type { FicheUndoMessage } from "../ext/fiche-messages";
import type { UndoAnswer } from "../ext/fiche-undo-answers";
import { givenBackByTab, setMaListe, undoListField } from "./fiche-ma-liste";
import { contentOf, type FicheScope } from "./fiche-page";

function undoMessage(scope: FicheScope): FicheUndoMessage | undefined {
  const { page } = scope;
  const product = page.info?.product;
  const contentId = contentOf(page);
  if (page.pending !== undefined) return undefined;
  if (product === undefined || contentId === undefined) return undefined;
  const film = page.title.mediaType === "movie";
  const list = film ? undoListField(scope) : {};
  return { type: "fiche-undo", contentId, productId: product.id, ...list };
}

export async function undoTitle(
  scope: FicheScope,
): Promise<UndoAnswer | undefined> {
  const msg = undoMessage(scope);
  if (msg === undefined) return undefined;
  const answer = await scope.ports.undo(msg);
  if (msg.listByTab === true && givenBackByTab(answer)) setMaListe(scope, true);
  return answer;
}

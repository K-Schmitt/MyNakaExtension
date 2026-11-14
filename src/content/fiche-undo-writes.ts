// « Annuler » and « Retirer la note » from the title page (spec §6): the worker puts back what the last
// rating changed, or takes the rating off. The tab sends either for the shown product, never while another
// write is on its way (its `pending` turns a double click into one message), and gives the film back to
// Naka's « Ma liste » itself when the worker leaves that to it (fiche-ma-liste). The answer's line stays
// shown; the info is then asked again, since these answers carry no panel flags (ruling R11), and with it
// the shown season.

import type { FicheUndoMessage } from "../ext/fiche-messages";
import type { RemoveAnswer, UndoAnswer } from "../ext/fiche-undo-answers";
import { givenBackByTab, setMaListe, undoListField } from "./fiche-ma-liste";
import { contentOf, type FicheScope } from "./fiche-page";
import { considerSeason, forgetSeasons } from "./fiche-season-reader";
import { watchUndoExpiry } from "./fiche-undo-expiry";
import type { FicheOutcome, UndoAction } from "./fiche-view";

type TitleIds = { contentId: number; productId: number };

function shownTitle(scope: FicheScope): TitleIds | undefined {
  const { page } = scope;
  const product = page.info?.product;
  const contentId = contentOf(page);
  if (page.pending !== undefined) return undefined;
  if (product === undefined || contentId === undefined) return undefined;
  return { contentId, productId: product.id };
}

/** The line an answer leaves: none once it all went through. */
export function undoOutcome(
  answer: UndoAnswer | RemoveAnswer | undefined,
  action: UndoAction,
): FicheOutcome | undefined {
  if (answer === undefined) return { kind: "undo-failed", action };
  if ("ok" in answer) return undefined;
  if ("refused" in answer)
    return { kind: "undo-refused", reason: answer.refused };
  if ("partial" in answer) {
    return { kind: "undo-partial", failed: answer.partial.failed.kind };
  }
  return { kind: "undo-failed", action };
}

function begin(scope: FicheScope, action: UndoAction): void {
  const { page } = scope;
  page.pending = action;
  page.outcome = undefined;
  page.ratedEpisode = undefined;
  scope.show();
}

// Every fiche-info resets what the worker issued to the tab: the seasons are read again, as after a link.
// A lost read leaves no product of the old page on screen (its stars would be refused): the read failure
// shows, with « Réessayer », and the answer's line stays next to it (spec §4).
async function refreshInfo(scope: FicheScope): Promise<void> {
  const msg = scope.page.infoMessage;
  const info = msg === undefined ? undefined : await scope.ports.info(msg);
  if (!scope.live()) return;
  forgetSeasons(scope);
  scope.page.info = info;
  if (info === undefined) scope.page.infoFailed = true;
  watchUndoExpiry(scope);
  considerSeason(scope);
}

// The line shows at once; the write stays pending until the fresh flags are in, so no stale « Annuler »
// can be clicked between the answer and the new info.
async function end(
  scope: FicheScope,
  action: UndoAction,
  answer: UndoAnswer | RemoveAnswer | undefined,
): Promise<void> {
  if (!scope.live()) return;
  scope.page.outcome = undoOutcome(answer, action);
  scope.show();
  await refreshInfo(scope);
  if (!scope.live()) return;
  scope.page.pending = undefined;
  scope.show();
}

export async function undoTitle(
  scope: FicheScope,
): Promise<UndoAnswer | undefined> {
  const title = shownTitle(scope);
  if (title === undefined) return undefined;
  const film = scope.page.title.mediaType === "movie";
  const msg: FicheUndoMessage = {
    type: "fiche-undo",
    ...title,
    ...(film ? undoListField(scope) : {}),
  };
  begin(scope, "undo");
  const answer = await scope.ports.undo(msg);
  if (msg.listByTab === true && givenBackByTab(answer)) setMaListe(scope, true);
  await end(scope, "undo", answer);
  return answer;
}

export async function removeTitle(scope: FicheScope): Promise<void> {
  const title = shownTitle(scope);
  if (title === undefined) return;
  begin(scope, "remove");
  const answer = await scope.ports.remove({ type: "fiche-remove", ...title });
  await end(scope, "remove", answer);
}

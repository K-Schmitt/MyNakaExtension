// The title page family of the router. Every fiche message names the tab that sent it (a Naka tab with
// no tab id is ignored): the worker answers and later writes per tab. The three reads are answered
// outside the queue (answerRead: a rejection is answered undefined). fiche-rate and fiche-link are not
// routed yet: no answer, never a write.

import type { FicheMessage } from "../ext/fiche-messages";
import { answerRead, type Respond } from "./answer-read";
import type { Jobs } from "./jobs";

export function routeFiche(
  jobs: Jobs,
  msg: FicheMessage,
  tabId: number | undefined,
  respond: Respond,
): boolean {
  if (tabId === undefined) return false;
  switch (msg.type) {
    case "fiche-info":
      answerRead(() => jobs.ficheInfo(tabId, msg), respond);
      return true;
    case "fiche-season":
      answerRead(() => jobs.ficheSeason(tabId, msg), respond);
      return true;
    case "fiche-mine":
      answerRead(() => jobs.ficheMine(tabId, msg), respond);
      return true;
    case "fiche-rate":
    case "fiche-link":
      return false;
  }
}

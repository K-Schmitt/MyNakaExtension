// The title page family of the router. Every fiche message names the tab that sent it (a Naka tab with
// no tab id is ignored): the worker answers and later writes per tab. The three reads are answered
// outside the queue (answerRead: a rejection is answered undefined); a tab's newer fiche-info or
// fiche-season supersedes its older one, which answers notfound or no episodes (fiche-tab-turns). The
// writes, fiche-rate, fiche-link, fiche-undo and fiche-remove, run on the worker's one queue (`run`) and are
// answered when their job ends: the job's answer, or undefined when it rejected (a product not issued, the
// store down).

import type { FicheMessage } from "../ext/fiche-messages";
import { answerRead, type Respond } from "./answer-read";
import type { JobQueue } from "./job-queue";
import type { Jobs } from "./jobs";

export function routeFiche(
  run: JobQueue["run"],
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
      answerRead(() => run(() => jobs.ficheRate(tabId, msg)), respond);
      return true;
    case "fiche-link":
      answerRead(() => run(() => jobs.ficheLink(tabId, msg)), respond);
      return true;
    case "fiche-undo":
      answerRead(() => run(() => jobs.ficheUndo(tabId, msg)), respond);
      return true;
    case "fiche-remove":
      answerRead(() => run(() => jobs.ficheRemove(tabId, msg)), respond);
      return true;
  }
}

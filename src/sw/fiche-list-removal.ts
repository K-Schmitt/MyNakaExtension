// After a film rated from its title page (Q9): the film leaves « Ma liste » on Naka. A list write, so live
// mode only (« Le mode simulation ne concerne que les listes »): in simulation the list is not even read.
// With Naka's button on screen (listByTab) the tab clicks it itself, so Naka's page does its own request and
// its button follows: the worker answers `maListe: "tab"` and calls no client. Otherwise the binding is
// checked first; a film not in the list (or an empty list) is left alone. The rating has gone out by then:
// a failure here is answered `{ sent: true, error }`. The job is told whether the client took the film out,
// so the undo record can say it was listed (ruling R10).

import type { RateOkAnswer, SentWithErrorAnswer } from "../ext/fiche-answers";
import type { Settings } from "../ext/settings";
import { checkBinding } from "./binding";
import { type JobDeps, jobAccounts, jobNaka } from "./job-deps";
import { toJobError } from "./to-job-error";

const OK: RateOkAnswer = { ok: true };
const BY_TAB: RateOkAnswer = { ok: true, maListe: "tab" };

export type ListLeaving = {
  answer: RateOkAnswer | SentWithErrorAnswer;
  /** The worker's client took the film out of « Ma liste ». */
  removed: boolean;
};

/** Whether the client removed the film: false when it was not listed. */
async function removeListed(
  deps: JobDeps,
  binding: Settings["binding"],
  contentId: number,
): Promise<boolean> {
  const naka = jobNaka(deps);
  await checkBinding(binding, jobAccounts(naka, deps));
  const ids = await naka.playlistIds();
  if (!ids.includes(contentId)) return false;
  await naka.removeFromPlaylist(contentId);
  return true;
}

async function leave(
  deps: JobDeps,
  contentId: number,
  listByTab: boolean,
): Promise<ListLeaving> {
  const settings = await deps.store.loadSettings();
  if (settings.mode !== "live") return { answer: OK, removed: false };
  if (listByTab) return { answer: BY_TAB, removed: false };
  const removed = await removeListed(deps, settings.binding, contentId);
  return { answer: OK, removed };
}

export async function leaveNakaList(
  deps: JobDeps,
  contentId: number,
  listByTab: boolean,
): Promise<ListLeaving> {
  try {
    return await leave(deps, contentId, listByTab);
  } catch (error) {
    return { answer: { sent: true, error: toJobError(error) }, removed: false };
  }
}

// After a film rated from its title page (Q9): the film leaves « Ma liste » on Naka. A list write, so live
// mode only (« Le mode simulation ne concerne que les listes »): in simulation the list is not even read.
// With Naka's button on screen (listByTab) the tab clicks it itself, so Naka's page does its own request and
// its button follows: the worker answers `maListe: "tab"` and calls no client. Otherwise the binding is
// checked first; a film not in the list (or an empty list) is left alone. The rating has gone out by then:
// a failure here is answered `{ sent: true, error }`.

import type { RateOkAnswer, SentWithErrorAnswer } from "../ext/fiche-answers";
import type { Settings } from "../ext/settings";
import { checkBinding } from "./binding";
import { type JobDeps, jobAccounts, jobNaka } from "./job-deps";
import { toJobError } from "./to-job-error";

const OK: RateOkAnswer = { ok: true };
const BY_TAB: RateOkAnswer = { ok: true, maListe: "tab" };

async function removeListed(
  deps: JobDeps,
  binding: Settings["binding"],
  contentId: number,
): Promise<void> {
  const naka = jobNaka(deps);
  await checkBinding(binding, jobAccounts(naka, deps));
  const ids = await naka.playlistIds();
  if (ids.includes(contentId)) await naka.removeFromPlaylist(contentId);
}

async function leave(
  deps: JobDeps,
  contentId: number,
  listByTab: boolean,
): Promise<RateOkAnswer> {
  const settings = await deps.store.loadSettings();
  if (settings.mode !== "live") return OK;
  if (listByTab) return BY_TAB;
  await removeListed(deps, settings.binding, contentId);
  return OK;
}

export async function leaveNakaList(
  deps: JobDeps,
  contentId: number,
  listByTab: boolean,
): Promise<RateOkAnswer | SentWithErrorAnswer> {
  try {
    return await leave(deps, contentId, listByTab);
  } catch (error) {
    return { sent: true, error: toJobError(error) };
  }
}

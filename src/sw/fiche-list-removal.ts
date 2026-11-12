// After a film rated from its title page (Q9): the film leaves « Ma liste » on Naka. A list write, so live
// mode only (« Le mode simulation ne concerne que les listes »): in simulation the list is not even read.
// The binding is checked first; a film not in the list (or an empty list) is left alone.

import type { RateAnswer } from "../ext/fiche-answers";
import { checkBinding } from "./binding";
import { type JobDeps, jobAccounts, jobNaka } from "./job-deps";
import { toJobError } from "./to-job-error";

const OK: RateAnswer = { ok: true };

async function removeListed(deps: JobDeps, contentId: number): Promise<void> {
  const settings = await deps.store.loadSettings();
  if (settings.mode !== "live") return;
  const naka = jobNaka(deps);
  await checkBinding(settings.binding, jobAccounts(naka, deps));
  const ids = await naka.playlistIds();
  if (ids.includes(contentId)) await naka.removeFromPlaylist(contentId);
}

export async function leaveNakaList(
  deps: JobDeps,
  contentId: number,
): Promise<RateAnswer> {
  try {
    await removeListed(deps, contentId);
    return OK;
  } catch (error) {
    return { error: toJobError(error) };
  }
}

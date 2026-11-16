// « Annuler » on a title page (fiche-undo), queued like every write.
// Refused before any request unless the product is issued to the asking tab as that content's title and
// a live undo record names that title, that product and that role. The product's state is read again:
// undoSteps refuses a title whose critique or recommendation ProductUndone could erase (answered
// `refused: "protected"`, no write). The binding is checked before the first write; then the steps run in
// order, the first failure stopping them: the answer names the steps done and the one that failed (and
// who gave « Ma liste » back so far), and the record is kept so the owner can try again; the retry plans
// from the state read then, skipping what is already back (undoSteps). Once every step ran the
// record is cleared: a clear that fails still answers ok, the steps being done (it then simply expires).
// In simulation the « Ma liste » step is dropped: everything else is sent.

import { type FicheUndo, type UndoStep, undoSteps } from "../core/fiche-undo";
import type { FicheUndoMessage } from "../ext/fiche-messages";
import type {
  RunStep,
  UndoAnswer,
  UndoMaListe,
} from "../ext/fiche-undo-answers";
import type { Mode } from "../ext/settings";
import { checkBinding } from "./binding";
import type { FicheAsker } from "./fiche-asker";
import { issuedTitle } from "./fiche-issued";
import { undoLive } from "./fiche-panel-flags";
import { runStep, type StepRun } from "./fiche-undo-steps";
import { type JobDeps, jobAccounts, jobNaka } from "./job-deps";
import { toJobError } from "./to-job-error";

const isRun = (step: UndoStep): step is RunStep =>
  step.kind !== "refused-protected";

/** The steps of this mode: « Ma liste » is a list write, live mode only. */
function forMode(steps: RunStep[], mode: Mode): RunStep[] {
  return mode === "live"
    ? steps
    : steps.filter((step) => step.kind !== "maListe");
}

async function liveRecord(
  deps: JobDeps,
  msg: FicheUndoMessage,
  role: FicheUndo["role"],
): Promise<FicheUndo | undefined> {
  const record = await deps.store.loadFicheUndo();
  const live = undoLive(record, msg, deps.now());
  return live && record?.role === role ? record : undefined;
}

/** undoSteps on the product's state read now, so a retry skips what is back; undefined when the title is
 * protected. */
async function plan(
  deps: JobDeps,
  record: FicheUndo,
): Promise<RunStep[] | undefined> {
  const current = await deps.limiters.sc.run(() =>
    deps.sc.productState(record.productId),
  );
  const steps = undoSteps(record, current);
  return steps.every(isRun) ? steps : undefined;
}

async function runAll(run: StepRun, steps: RunStep[]): Promise<UndoAnswer> {
  let done: RunStep[] = [];
  let maListe: UndoMaListe = "none";
  for (const step of steps) {
    try {
      maListe = (await runStep(run, step)) ?? maListe;
    } catch (error) {
      return {
        partial: { done, failed: step },
        maListe,
        error: toJobError(error),
      };
    }
    done = [...done, step];
  }
  return { ok: true, maListe };
}

async function restored(
  deps: JobDeps,
  msg: FicheUndoMessage,
  record: FicheUndo,
): Promise<UndoAnswer> {
  try {
    const steps = await plan(deps, record);
    if (steps === undefined) return { refused: "protected" };
    const settings = await deps.store.loadSettings();
    const naka = jobNaka(deps);
    await checkBinding(settings.binding, jobAccounts(naka, deps));
    const run = { deps, record, naka, listByTab: msg.listByTab === true };
    return await runAll(run, forMode(steps, settings.mode));
  } catch (error) {
    return { error: toJobError(error) };
  }
}

async function forget(deps: JobDeps): Promise<void> {
  try {
    await deps.store.saveFicheUndo(null);
  } catch {
    // See the header: the record expires within ten minutes.
  }
}

export async function ficheUndoJob(
  deps: JobDeps,
  asker: FicheAsker,
  msg: FicheUndoMessage,
): Promise<UndoAnswer> {
  const role = await issuedTitle(asker, msg.contentId, msg.productId);
  const record = await liveRecord(deps, msg, role);
  if (record === undefined) return { refused: "expired" };
  const answer = await restored(deps, msg, record);
  if ("ok" in answer) await forget(deps);
  return answer;
}

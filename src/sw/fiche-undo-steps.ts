// One step of « Annuler » (undoSteps' plan): the SensCritique writes, each a slot of the SC
// limiter; « Ma liste » given back on Naka; then the extension's own state (fiche-local-restore). The
// « Ma liste » step is a list write: the job drops it in simulation. With Naka's button on screen
// (listByTab) the tab clicks it itself and the worker writes nothing; else the client adds the film,
// unless it is listed already.

import type { FicheUndo } from "../core/fiche-undo";
import type { RunStep, UndoMaListe } from "../ext/fiche-undo-answers";
import type { ScClient } from "../sc/sc-client";
import { restoreLocal } from "./fiche-local-restore";
import type { JobDeps } from "./job-deps";
import type { NakaProxy } from "./naka-proxy";

export type StepRun = {
  deps: JobDeps;
  record: FicheUndo;
  /** The job's Naka proxy, the one its binding was checked through. */
  naka: NakaProxy;
  listByTab: boolean;
};

type ScStep = Exclude<RunStep, { kind: "maListe" | "localRestore" }>;

function scStep(sc: ScClient, id: number, step: ScStep): Promise<void> {
  switch (step.kind) {
    case "rate":
      return sc.rate(id, step.rating);
    case "undone":
      return sc.unmarkDone(id);
    case "markDone":
      return sc.markDone(id, step.date);
    case "markDoneWithoutDate":
      return sc.markDoneWithoutDate(id);
    case "wish":
      return sc.wish(id);
  }
}

async function listAgain(run: StepRun): Promise<UndoMaListe> {
  if (run.listByTab) return "tab";
  const { contentId } = run.record;
  if ((await run.naka.playlistIds()).includes(contentId)) return "none";
  await run.naka.addToPlaylist(contentId);
  return "client";
}

/** Runs the step; a « Ma liste » step says who gave the film back. Throws when the step failed. */
export async function runStep(
  run: StepRun,
  step: RunStep,
): Promise<UndoMaListe | undefined> {
  const { deps, record } = run;
  if (step.kind === "maListe") return listAgain(run);
  if (step.kind === "localRestore") {
    await restoreLocal(deps.store, record);
    return undefined;
  }
  await deps.limiters.sc.run(() => scStep(deps.sc, record.productId, step));
  return undefined;
}

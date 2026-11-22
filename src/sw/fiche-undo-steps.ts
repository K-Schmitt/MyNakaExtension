// One step of « Annuler » (undoSteps' plan): the SensCritique writes, each a slot of the SC
// limiter; « Ma liste » given back on Naka and « Déjà vu » turned off again; then the extension's own
// state (fiche-local-restore). Those two are Naka writes: the job drops them in simulation. With Naka's
// button on screen (listByTab, vuByTab) the tab clicks it itself and the worker writes nothing; else the
// client adds the film (unless it is listed already) or marks it unwatched.

import type { FicheUndo } from "../core/fiche-undo";
import type {
  RunStep,
  UndoDejaVu,
  UndoMaListe,
} from "../ext/fiche-undo-answers";
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
  vuByTab: boolean;
};

/** What a step leaves to the tab: who gave « Ma liste » back, and a « Déjà vu » the tab turns off. */
export type StepHand = { maListe?: UndoMaListe; dejaVu?: UndoDejaVu };

type ScStep = Exclude<RunStep, { kind: "maListe" | "dejaVu" | "localRestore" }>;

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

async function unwatchAgain(run: StepRun): Promise<StepHand> {
  if (run.vuByTab) return { dejaVu: "tab" };
  await run.naka.markUnwatched({ contentId: run.record.contentId });
  return {};
}

/** Runs the step; a Naka step says what it left to the tab. Throws when the step failed. */
export async function runStep(run: StepRun, step: RunStep): Promise<StepHand> {
  const { deps, record } = run;
  if (step.kind === "maListe") return { maListe: await listAgain(run) };
  if (step.kind === "dejaVu") return unwatchAgain(run);
  if (step.kind === "localRestore") {
    await restoreLocal(deps.store, record);
    return {};
  }
  await deps.limiters.sc.run(() => scStep(deps.sc, record.productId, step));
  return {};
}

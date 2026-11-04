// The sentences of the status page, one function per sentence. Text only; dates go through the format.

import type { JobError } from "../ext/job-error";
import type { FinishRecord, Mode, RunRecord } from "../ext/settings";
import type { Running } from "../sw/activity";
import type { Counts } from "../sw/status-snapshot";
import { JOB_ERROR_LABELS } from "./job-error-labels";
import type { StatusFormat } from "./status-format";

const TRIGGERS: Record<RunRecord["trigger"], string> = {
  "naka-ready": "ouverture de Naka",
  playlist: "changement de la liste",
  button: "bouton Resynchroniser",
};

const FINISH_OUTCOMES: Record<FinishRecord["outcome"], string> = {
  ignored: "ignorée",
  "needs-choice": "choix à faire",
  "not-found": "introuvable",
  done: "enregistrée",
  failed: "échec",
};

const MODE_LABELS: Record<Mode, string> = {
  simulation: "simulation",
  live: "écritures actives",
};

export function runningLine(running: Running, format: StatusFormat): string {
  if (running.kind === "finish")
    return "Fin de visionnage en cours de traitement";
  return `Synchronisation en cours depuis ${format.time(running.since)}`;
}

export function pendingModeLine(mode: Mode): string {
  return `Changement de mode en attente\u202F: ${MODE_LABELS[mode]}`;
}

export function snapshotErrorLine(error: JobError): string {
  return `Lecture de l'état impossible : ${JOB_ERROR_LABELS[error]}`;
}

export function questionsLine(counts: Counts): string {
  return `Questions à traiter dans une prochaine version : ${counts.openQuestions}`;
}

export function runLine(run: RunRecord, format: StatusFormat): string {
  return `Dernière synchronisation : ${format.dateTime(run.at)} (${TRIGGERS[run.trigger]})`;
}

export function reportLine(run: RunRecord): string | undefined {
  const report = run.report;
  if (report === undefined) return undefined;
  return `Ajoutés : ${report.added.length} · Reportés : ${report.deferred.length} · Échecs : ${report.failed.length} · Déjà vus : ${report.alreadyDone.length}`;
}

export function runErrorLine(run: RunRecord): string | undefined {
  if (run.outcome === "failed") {
    const why =
      run.error === undefined ? "" : ` : ${JOB_ERROR_LABELS[run.error]}`;
    return `Synchronisation échouée${why}`;
  }
  if (run.error === undefined) return undefined;
  return `Terminée, mais arrêtée en cours : ${JOB_ERROR_LABELS[run.error]}`;
}

export function finishLine(finish: FinishRecord, format: StatusFormat): string {
  if (finish.error === "finish-limit") {
    return `Limite atteinte depuis ${format.time(finish.at)}`;
  }
  const outcome = FINISH_OUTCOMES[finish.outcome];
  const why =
    finish.error === undefined ? "" : ` : ${JOB_ERROR_LABELS[finish.error]}`;
  return `Dernière fin de visionnage : ${format.dateTime(finish.at)}, ${outcome}${why}`;
}

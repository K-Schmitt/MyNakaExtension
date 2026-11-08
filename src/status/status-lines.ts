// The sentences about the stored records: the last run, its counts and preview, the last finish, a read
// error. One function per sentence; text only; dates go through the format. A run is worded by its own
// mode, whatever the mode is now. French typography: U+202F before « : ; ? ! ».

import { idsOfKey } from "../core/finish-event";
import { MAX_WRITES_PER_RUN } from "../core/sync-writes";
import { MAX_FINISHES_PER_WINDOW } from "../ext/finish-window";
import type { JobError } from "../ext/job-error";
import type { FinishRecord, RunRecord } from "../ext/settings";
import { JOB_ERROR_LABELS } from "./job-error-labels";
import type { StatusFormat } from "./status-format";

type PreviewItem = NonNullable<RunRecord["preview"]>[number];

const TYPE_WORDS: Record<NonNullable<PreviewItem["type"]>, string> = {
  film: "film",
  serie: "série",
};

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

const TARGETS: Record<PreviewItem["side"], string> = {
  sc: "Envies SensCritique",
  naka: "Ma liste Naka",
};

const because = (error: JobError | undefined): string =>
  error === undefined ? "" : `\u202F: ${JOB_ERROR_LABELS[error]}`;

export function snapshotErrorLine(error: JobError): string {
  return `Lecture de l'état impossible${because(error)}`;
}

export function runLine(run: RunRecord, format: StatusFormat): string {
  const which = run.mode === "simulation" ? " (simulation)" : "";
  return `Dernière synchronisation${which}\u202F: ${format.dateTime(run.at)} (${TRIGGERS[run.trigger]})`;
}

// Failed writes, in either mode, only when there are some (Ruling 21): Plan 2 retries them next run.
function failedLines(failed: number): string[] {
  if (failed === 0) return [];
  return [`Échecs (nouvel essai au prochain passage)\u202F: ${failed}`];
}

// A simulated run planned its writes; a live one made them.
export function reportLines(run: RunRecord): string[] {
  const report = run.report;
  if (report === undefined) return [];
  const written = run.mode === "simulation" ? "Prévus" : "Ajoutés";
  return [
    `${written}\u202F: ${report.added.length}`,
    `Reportés (${MAX_WRITES_PER_RUN} écritures au plus par passage)\u202F: ${report.deferred.length}`,
    `Déjà vus sur SensCritique\u202F: ${report.alreadyDone.length}`,
    ...failedLines(report.failed.length),
    `Pas encore examinés\u202F: ${report.unresolved}`,
  ];
}

export function runErrorLine(run: RunRecord): string | undefined {
  if (run.outcome === "failed") {
    return `Synchronisation échouée${because(run.error)}`;
  }
  if (run.error === undefined) return undefined;
  return `Terminée, mais arrêtée en cours${because(run.error)}`;
}

// « Titre », then the season and the episode of a series, when the record holds the title.
function finishWhat(finish: FinishRecord): string {
  if (finish.title === undefined) return "";
  const ids = idsOfKey(finish.key);
  const place =
    ids?.season === undefined || ids.episode === undefined
      ? ""
      : `, saison ${ids.season}, épisode ${ids.episode}`;
  return `\u00AB\u202F${finish.title}\u202F\u00BB${place}, `;
}

export function finishLine(finish: FinishRecord, format: StatusFormat): string {
  if (finish.error === "finish-limit") {
    return `Fins de visionnage\u202F: limite de ${MAX_FINISHES_PER_WINDOW} par heure atteinte le ${format.date(finish.at)} à ${format.time(finish.at)}`;
  }
  const outcome = FINISH_OUTCOMES[finish.outcome];
  return `Dernière fin de visionnage\u202F: ${finishWhat(finish)}${format.dateTime(finish.at)}, ${outcome}${because(finish.error)}`;
}

// The year and the type, when known, in parentheses after the title.
function details(item: PreviewItem): string {
  const known = [
    item.year === undefined ? undefined : String(item.year),
    item.type === undefined ? undefined : TYPE_WORDS[item.type],
  ].filter((part) => part !== undefined);
  return known.length === 0 ? "" : ` (${known.join(", ")})`;
}

// A title Naka could not give is empty in the record.
export function previewLine(item: PreviewItem): string {
  const title = item.title === "" ? "(titre inconnu)" : item.title;
  return `${TARGETS[item.side]}\u202F: ${title}${details(item)}`;
}

// The cards waiting for a rating, whatever the home row shows: the line that stays if the row is lost.
export function pendingRatingsLine(count: number): string {
  if (count === 0) return "Notes \u00E0 donner\u202F: aucune";
  return `Notes \u00E0 donner\u202F: ${count}, dans la rang\u00E9e \u00AB\u202F\u00C0 traiter\u202F\u00BB de l\u2019accueil de Naka`;
}

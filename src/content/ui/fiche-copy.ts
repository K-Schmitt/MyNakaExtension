// Every sentence of the title page's rows and actions. French typography: U+202F before « : ; ? ! » and
// inside « », apostrophe ’, « tu ». A rating that did not go out reuses the rating block's lines.

import type { RunStep } from "../../ext/fiche-undo-answers";
import type { JobError } from "../../ext/job-error";
import type { ProductLabel } from "../../sc/product-label";
import type { FicheOutcome, UndoAction } from "../fiche-view";
import { frenchAverage } from "./fiche-numbers";
import { errorLine, RATING_ERROR_LABELS } from "./rating-copy";

const NB = "\u202F";

export const PANEL_TITLE = "SensCritique";
export const MINE_LABEL = "Ta note";
export const LOADING_LINE = "Recherche sur SensCritique\u2026";
export const INFO_FAILED_LINE = "SensCritique n’a pas pu être lu.";
export const NOT_FOUND_LINE = "Pas trouvé sur SensCritique";
export const LINK_HEADING = "Relier à SensCritique";
export const LINKING_LINE = "Liaison en cours\u2026";
export const LINK_FAILED_LINE = "La liaison n’a pas abouti.";
export const RETRY_LABEL = "Réessayer";
export const SEARCH_LABEL = "Chercher";
export const SEARCH_PLACEHOLDER = "Titre sur SensCritique";
export const SEARCHING_LINE = "Recherche en cours\u2026";
/** A row's value when SensCritique gives none (no average, nothing read yet). */
export const NO_VALUE = "—";
export const SERIES_CONFIRM = "SensCritique va retirer la série de tes envies.";
export const SC_LINK_LABEL = "Voir sur SensCritique";
export const UNDO_LABEL = "Annuler";
export const REMOVE_LABEL = "Retirer la note";
export const PROTECTED_LINE = `Une critique ou une recommandation y est liée${NB}: retire la note sur SensCritique.`;
export const UNDOING_LINE = "Annulation en cours\u2026";
export const REMOVING_LINE = "Retrait de la note\u2026";

/** « Annuler » or « Retirer la note » with no answer, or one the worker could not run. */
export const UNDO_FAILED_LINES: Record<UndoAction, string> = {
  undo: "L’annulation n’a pas abouti.",
  remove: "La note n’a pas pu être retirée.",
};

/** The worker's refusals, before any write. « expired »: no live record names this title any more. */
export const REFUSED_LINES = {
  protected: PROTECTED_LINE,
  expired: "Il n’y a plus rien à annuler pour ce titre.",
  unrated: "Ce titre n’a plus de note sur SensCritique.",
} as const;

const SEEN = `«${NB}vu${NB}»`;

/** What a failed step of « Annuler » did not put back. */
const NOT_PUT_BACK: Record<RunStep["kind"], string> = {
  rate: "ta note d’avant n’est pas revenue",
  markDone: `le ${SEEN} et sa date ne sont pas revenus`,
  markDoneWithoutDate: `le ${SEEN} n’est pas revenu`,
  undone: `la note et le ${SEEN} n’ont pas été retirés`,
  wish: "le titre n’est pas revenu dans tes envies",
  maListe: "le film n’est pas revenu dans Ma liste Naka",
  localRestore: "l’extension n’a pas repris son état d’avant",
};

/** « Annuler » stopped at `failed`: that step and the ones after it were not done (spec §4). */
export function partialUndoLine(failed: RunStep["kind"]): string {
  return `L’annulation s’est arrêtée${NB}: ${NOT_PUT_BACK[failed]}, et la suite n’a pas été faite.`;
}

export function averageLine(average: number): string {
  return `${frenchAverage(average)} / 10`;
}

/** The SensCritique title a star rates, with its year when known. */
export function labelLine({ title, year }: ProductLabel): string {
  return year === undefined ? title : `${title} (${year})`;
}

/** The rating went out; the removal from « Ma liste » that follows a film's did not. */
export function sentWithErrorLine(error: JobError): string {
  return `Note envoyée, mais le retrait de Ma liste Naka n’a pas abouti${NB}: ${RATING_ERROR_LABELS[error]}.`;
}

/** A film's rating that did not go out after its explicit finish wrote (D9, ruling R2). */
export const FINISH_WROTE_LINE = `La note n’est pas partie, mais SensCritique a déjà marqué le titre vu${NB}: «${NB}${UNDO_LABEL}${NB}» le remet comme avant.`;

/** The name of a group of stars: the SensCritique title or episode they rate. */
export function episodeStarsName(title: string): string {
  return `Noter «${NB}${title}${NB}» sur SensCritique`;
}

/** The error line of a write's outcome; `failed` names what an unanswered or refused write was. */
export function outcomeLine(outcome: FicheOutcome, failed: string): string {
  switch (outcome.kind) {
    case "failed":
      return failed;
    case "not-sent":
      return errorLine(outcome.error);
    case "sent-with-error":
      return sentWithErrorLine(outcome.error);
    case "finish-wrote":
      return FINISH_WROTE_LINE;
    case "undo-failed":
      return UNDO_FAILED_LINES[outcome.action];
    case "undo-refused":
      return REFUSED_LINES[outcome.reason];
    case "undo-partial":
      return partialUndoLine(outcome.failed);
  }
}

/** A search that came back empty, with the owner's words. */
export function nothingFoundLine(query: string): string {
  return `Rien trouvé pour «${NB}${query}${NB}»`;
}

export function seasonFailedLine(season: number): string {
  return `Les notes de la saison ${season} n’ont pas pu être lues.`;
}

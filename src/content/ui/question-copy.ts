// Every sentence of the question block and of the page's question rows. French typography: U+202F
// before « : ; ? ! » and inside « ».

import type { QuestionCandidate, Side } from "../../core/state";
import type { JobError } from "../../ext/job-error";
import type { QuestionAction } from "./question-view";
import { RATING_ERROR_LABELS } from "./rating-copy";

const NB = "\u202F";
const quoted = (title: string): string => `«${NB}${title}${NB}»`;

/** The side is the one the title comes from: the question asks for its match on the other site. */
export function ambiguityHeading(side: Side, title: string): string {
  const other = side === "naka" ? "SensCritique" : "Naka";
  return `Quel titre ${other} correspond à ${quoted(title)}${NB}?`;
}

export function candidateLabel({
  title,
  year,
  type,
}: QuestionCandidate): string {
  const kind = type === "film" ? "film" : "série";
  return `${title} (${year === undefined ? "" : `${year}, `}${kind})`;
}

export const NONE_LABEL = "Aucun de ceux-là";
export const KEEP_LABEL = "Non";

/** `removeFrom` is the side the title would also leave. */
export function removalHeading(removeFrom: Side, title: string): string {
  const left =
    removeFrom === "sc" ? "Ma liste Naka" : "tes envies SensCritique";
  return `${quoted(title)} a quitté ${left}.`;
}

export function removalQuestion(removeFrom: Side): string {
  return `${removeLabel(removeFrom)}${NB}?`;
}

export function removeLabel(removeFrom: Side): string {
  return removeFrom === "sc"
    ? "Retirer aussi de tes envies SensCritique"
    : "Retirer aussi de Ma liste Naka";
}

export const ACTION_LABELS: Record<QuestionAction, string> = {
  "plus-tard": "Plus tard",
  ecarter: "Écarter",
  fermer: "Fermer",
};

export const SENDING_LINE = "Envoi de la réponse\u2026";
export const MOOT_LINE = `Rien à retirer${NB}: ce titre n’y est déjà plus.`;
export const REFUSED_LINE = `La réponse n’a pas été prise en compte${NB}: la question a changé.`;
export const MISMATCH_LINE = `Ce titre n’est pas du même type${NB}: un film ne se relie qu’à un film, une série qu’à une série.`;
export const UNREACHABLE_LINE = `La réponse n’est pas partie${NB}: l’extension ne répond pas.`;
export const UNKNOWN_TITLE = "(titre inconnu)";

export function notSentLine(error: JobError): string {
  return `La réponse n’est pas partie${NB}: ${RATING_ERROR_LABELS[error]}.`;
}

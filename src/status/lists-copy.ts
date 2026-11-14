// The sentences of the two sections that the Naka block does not already have. French typography: U+202F
// before « : ; ? ! » and inside « ».

import { RATING_ERROR_LABELS } from "../content/ui/rating-copy";
import type { Side } from "../core/state";
import type { JobError } from "../ext/job-error";
import type { UnlinkedOffer } from "../sw/question-offers";

const NB = "\u202F";

export const LISTS_COPY = {
  legacy: "Question enregistrée par une version précédente, sans ses titres.",
  requeue: "Reposer la question",
  hidden: "Écartée de l’accueil",
  search: "Chercher",
  submit: "Rechercher",
  field: "Titre à chercher",
  link: "Relier",
  searching: "Recherche\u2026",
  noResult: "Aucun résultat",
  emptyQuery: "Un titre à chercher",
};

const REASON_LINES: Record<UnlinkedOffer["reason"], string> = {
  "no-match": "Aucun titre correspondant trouvé",
  "not-in-catalogue": "Titre illisible sur le site",
  "none-chosen": "Aucun des titres proposés n’a été retenu",
};

export const reasonLine = (reason: UnlinkedOffer["reason"]): string =>
  REASON_LINES[reason];

/** The list the title is in: its side. */
export function unlinkedHeading(side: Side, title: string): string {
  const list = side === "naka" ? "Ma liste Naka" : "tes envies SensCritique";
  return `${title} — dans ${list}`;
}

/** After the colon: the lowercase labels of the rating block, never the capitalised status ones. */
export function searchErrorLine(error: JobError): string {
  return `Recherche impossible${NB}: ${RATING_ERROR_LABELS[error]}.`;
}

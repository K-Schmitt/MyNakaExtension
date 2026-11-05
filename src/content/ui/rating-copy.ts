// Every sentence of the rating block. French typography: U+202F before « : ; ? ! » and inside « ».

import type { RatingLabel } from "../../core/rating-cards";
import type { JobError } from "../../ext/job-error";
import type { LastFinish } from "../../ext/settings";
import { JOB_ERROR_LABELS } from "../../status/job-error-labels";

export type RatingAction = "plus-tard" | "ignorer" | "fermer";

const NB = "\u202F";
const quoted = (title: string): string => `«${NB}${title}${NB}»`;

export function filmHeading(title: string): string {
  return `Noter ${quoted(title)}`;
}

export function episodeHeading(
  title: string,
  season: number,
  episode: number,
): string {
  return `Noter ${quoted(title)}, saison ${season}, épisode ${episode}`;
}

export function seasonHeading(title: string, season: number): string {
  return `Noter la saison ${season} de ${quoted(title)}`;
}

export function seriesHeading(title: string): string {
  return `Noter la série ${quoted(title)}`;
}

export function currentLine(rating: number): string {
  return `Votre note actuelle${NB}: ${rating}`;
}

export function seasonStartLine(rating: number): string {
  return `Moyenne de vos épisodes${NB}: ${rating}`;
}

export function seriesStartLine(rating: number): string {
  return `Moyenne de vos saisons${NB}: ${rating}`;
}

export const SERIES_WARNING = `Noter la série la retire de vos envies SensCritique, et elle n'est pas finie sur Naka. Envoyer quand même${NB}?`;

export function errorLine(error: JobError): string {
  return `La note n'est pas partie${NB}: ${JOB_ERROR_LABELS[error]}`;
}

export const SENDING_LINE = "Envoi de la note\u2026";

export const UNREACHABLE_LINE = `La note n'est pas partie${NB}: l'extension ne répond pas.`;

export const NEEDS_CHOICE_LINE = `La note n'est pas partie${NB}: plusieurs titres correspondent sur SensCritique.`;

export const NOT_RATED_LINE = `La note n'est pas partie${NB}: ce titre n'a pas pu être noté.`;

/** A rate on a title with no card ran without making one: the title's last finish says why. */
export function notSentLine(last: LastFinish | undefined): string {
  if (last?.outcome === "failed" && last.error !== undefined) {
    return errorLine(last.error);
  }
  return last?.outcome === "needs-choice" ? NEEDS_CHOICE_LINE : NOT_RATED_LINE;
}

export function chosenLine(rating: number): string {
  return `Note choisie${NB}: ${rating}`;
}

export const ACTION_LABELS: Record<RatingAction, string> = {
  "plus-tard": "Plus tard",
  ignorer: "Ignorer",
  fermer: "Fermer",
};

export const SEND_LABEL = "Envoyer";
export const CANCEL_LABEL = "Annuler";

// The manual choice: rate another target of the same card.
export const OTHER_LABELS: Record<RatingLabel, string> = {
  film: "Noter le film",
  épisode: "Noter l'épisode",
  saison: "Noter la saison",
  série: "Noter la série",
};

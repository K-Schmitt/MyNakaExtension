// Every sentence of the rating block. French typography: U+202F before « : ; ? ! » and inside « ».

import type { RatingLabel } from "../../core/rating-cards";
import type { JobError } from "../../ext/job-error";
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

// Every sentence of the title page blocks. French typography: U+202F before « : ; ? ! » and inside « »,
// apostrophe ’. A rating that did not go out reuses the rating block's lines.

import type { JobError } from "../../ext/job-error";
import type { ProductLabel } from "../../sc/product-label";
import { frenchAverage } from "./fiche-numbers";
import { RATING_ERROR_LABELS } from "./rating-copy";

const NB = "\u202F";

export const PANEL_TITLE = "SensCritique";
export const MINE_LABEL = "Ta note";
export const LOADING_LINE = "Recherche sur SensCritique\u2026";
export const INFO_FAILED_LINE = "SensCritique n’a pas pu être lu.";
export const NOT_FOUND_LINE = "Pas trouvé sur SensCritique";
export const LINK_HEADING = "Relier à SensCritique";
export const LINKING_LINE = "Liaison en cours\u2026";
export const LINK_FAILED_LINE = "La liaison n’a pas abouti.";
export const NO_AVERAGE_LINE = "Pas encore de moyenne";
export const SERIES_CONFIRM = "SensCritique va retirer la série de tes envies.";

export function averageLine(average: number): string {
  return `${frenchAverage(average)} / 10`;
}

/** The SensCritique title a star rates, with its year when known. */
export function labelLine({ title, year }: ProductLabel): string {
  return year === undefined ? title : `${title} (${year})`;
}

/** The rating went out; the removal from « Ma liste » that follows a film's did not. */
export function sentWithErrorLine(error: JobError): string {
  return `Note envoyée, mais le retrait de Ma liste n’a pas abouti${NB}: ${RATING_ERROR_LABELS[error]}.`;
}

/** The name of an episode's stars: the SensCritique episode they rate. */
export function episodeStarsName(title: string): string {
  return `Noter «${NB}${title}${NB}» sur SensCritique`;
}

export function seasonFailedLine(season: number): string {
  return `Les notes de la saison ${season} n’ont pas pu être lues.`;
}

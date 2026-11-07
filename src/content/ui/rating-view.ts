// What the block shows for one label of a card. Pure: titles stay literal text, nothing is markup.
// `start` belongs to the label the caller asks for: the worker computes it for the card's first pending label.

import type { RatingCard, RatingLabel } from "../../core/rating-cards";
import {
  currentLine,
  episodeHeading,
  errorLine,
  filmHeading,
  type RatingAction,
  SERIES_WARNING,
  seasonHeading,
  seasonStartLine,
  seriesHeading,
  seriesStartLine,
} from "./rating-copy";

export type RatingView = {
  heading: string;
  current?: string;
  start?: string;
  warning?: string;
  choices: { value: number; marked: boolean }[]; // 1..10, marked = current, else start
  actions: RatingAction[];
  others: RatingLabel[]; // the card's other target labels: the manual choice
  notice?: string; // a neutral line: the chosen rating, or the sending cue
  error?: string;
  confirm?: boolean; // only the warning and the Envoyer / Annuler buttons are drawn
};

const CHOICES = 10;
const ACTIONS: RatingAction[] = ["plus-tard", "ignorer", "fermer"];
// A label not pending (rated already, or a view-only card) has nothing to put off or to ignore.
const CLOSE_ONLY: RatingAction[] = ["fermer"];

function headingOf(card: RatingCard, label: RatingLabel): string {
  const { title, season, episode } = card;
  if (label === "série") return seriesHeading(title);
  if (label === "saison" && season !== undefined) {
    return seasonHeading(title, season);
  }
  if (label === "épisode" && season !== undefined && episode !== undefined) {
    return episodeHeading(title, season, episode);
  }
  return filmHeading(title);
}

function startLineOf(label: RatingLabel, start?: number): string | undefined {
  if (start === undefined) return undefined;
  if (label === "saison") return seasonStartLine(start);
  if (label === "série") return seriesStartLine(start);
  return undefined;
}

function currentOf(card: RatingCard, label: RatingLabel): number | null {
  return card.targets.find((t) => t.label === label)?.current ?? null;
}

// The rating on SensCritique wins over the start: the stars show what is there.
function choicesOf(mark: number | undefined) {
  return Array.from({ length: CHOICES }, (_, i) => ({
    value: i + 1,
    marked: mark === i + 1,
  }));
}

export function ratingView(
  card: RatingCard,
  label: RatingLabel,
  start?: number,
): RatingView {
  const current = currentOf(card, label);
  const startLine = startLineOf(label, start);
  const failed = card.failed?.label === label ? card.failed.error : undefined;
  return {
    heading: headingOf(card, label),
    ...(current === null ? {} : { current: currentLine(current) }),
    ...(startLine === undefined ? {} : { start: startLine }),
    ...(label === "série" && !card.seriesFinished
      ? { warning: SERIES_WARNING }
      : {}),
    choices: choicesOf(current ?? start),
    actions: card.pending.includes(label) ? ACTIONS : CLOSE_ONLY,
    others: card.targets.map((t) => t.label).filter((l) => l !== label),
    ...(failed === undefined ? {} : { error: errorLine(failed) }),
  };
}

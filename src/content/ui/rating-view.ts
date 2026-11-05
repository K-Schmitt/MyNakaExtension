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
  choices: { value: number; marked: boolean }[]; // 1..10, marked = start or current
  actions: RatingAction[];
  others: RatingLabel[]; // the card's other target labels: the manual choice
  error?: string;
};

const CHOICES = 10;
const ACTIONS: RatingAction[] = ["plus-tard", "ignorer", "fermer"];

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

function choicesOf(marks: (number | null | undefined)[]) {
  return Array.from({ length: CHOICES }, (_, i) => ({
    value: i + 1,
    marked: marks.includes(i + 1),
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
    choices: choicesOf([start, current]),
    actions: ACTIONS,
    others: card.targets.map((t) => t.label).filter((l) => l !== label),
    ...(failed === undefined ? {} : { error: errorLine(failed) }),
  };
}

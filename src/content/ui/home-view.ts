// What the home row shows: the live card first, then the cards still to rate, newest first, each as a
// rating view that offers its choices and « Ignorer » only, then the open questions, in the worker's
// order. Pure: cards and question views in, views out.

import { wideUrl } from "../../core/image-urls";
import type { QuestionKey } from "../../core/questions";
import type { RatingCard } from "../../core/rating-cards";
import type { QuestionView } from "./question-view";
import { type RatingView, ratingView } from "./rating-view";
import { labelOf } from "./session-views";

// `view` is what the entry's send is showing now (sending, confirming, a failure); absent, the idle view.
export type HomeEntry = { card: RatingCard; start?: number; view?: RatingView };
export type HomeQuestion = { key: QuestionKey; view: QuestionView };
export type HomeView = {
  live?: HomeQuestion;
  entries: { key: string; view: RatingView; image?: string }[];
  questions: HomeQuestion[];
};

/** The row offers no « Plus tard », no « Fermer » and no other target: choices and « Ignorer ». */
export const rowView = (view: RatingView): RatingView => ({
  ...view,
  actions: view.actions.filter((action) => action === "ignorer"),
  others: [],
});

function viewOfEntry({ card, start, view }: HomeEntry): RatingView | undefined {
  if (view !== undefined) return rowView(view);
  const label = labelOf(card);
  return label === undefined
    ? undefined
    : rowView(ratingView(card, label, start));
}

const newestFirst = (a: HomeEntry, b: HomeEntry): number =>
  b.card.at - a.card.at;

function shownEntry(entry: HomeEntry): HomeView["entries"] {
  const view = viewOfEntry(entry);
  if (view === undefined) return [];
  const image = wideUrl(entry.card.image);
  return [
    { key: entry.card.key, view, ...(image === undefined ? {} : { image }) },
  ];
}

export function homeView(
  entries: HomeEntry[],
  questions: HomeQuestion[] = [],
  live?: HomeQuestion,
): HomeView {
  const shown = [...entries].sort(newestFirst).flatMap(shownEntry);
  // The live card stands for its question: the same key is not shown twice.
  const asked = questions.filter((q) => q.key !== live?.key);
  return {
    ...(live === undefined ? {} : { live }),
    entries: shown,
    questions: asked,
  };
}

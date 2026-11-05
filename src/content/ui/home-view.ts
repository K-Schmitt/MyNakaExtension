// What the home panel shows: the cards still to rate, newest first, each as a rating view that offers its
// choices and « Ignorer » only, then the open questions, in the worker's order. Pure: cards and question
// views in, views out.

import type { QuestionKey } from "../../core/questions";
import type { RatingCard } from "../../core/rating-cards";
import { HOME_HEADING, QUESTIONS_HEADING } from "./home-copy";
import type { QuestionView } from "./question-view";
import { type RatingView, ratingView } from "./rating-view";
import { labelOf } from "./session-views";

// `view` is what the entry's send is showing now (sending, confirming, a failure); absent, the idle view.
export type HomeEntry = { card: RatingCard; start?: number; view?: RatingView };
export type HomeView = {
  heading: string;
  folded: boolean;
  entries: { key: string; view: RatingView }[];
  questionsHeading: string;
  questions: { key: QuestionKey; view: QuestionView }[];
};

/** The panel offers no « Plus tard », no « Fermer » and no other target: choices and « Ignorer ». */
export const panelView = (view: RatingView): RatingView => ({
  ...view,
  actions: view.actions.filter((action) => action === "ignorer"),
  others: [],
});

function viewOfEntry({ card, start, view }: HomeEntry): RatingView | undefined {
  if (view !== undefined) return panelView(view);
  const label = labelOf(card);
  return label === undefined
    ? undefined
    : panelView(ratingView(card, label, start));
}

export type HomeQuestion = { key: QuestionKey; view: QuestionView };

const newestFirst = (a: HomeEntry, b: HomeEntry): number =>
  b.card.at - a.card.at;

export function homeView(
  entries: HomeEntry[],
  folded = false,
  questions: HomeQuestion[] = [],
): HomeView {
  const shown = [...entries].sort(newestFirst).flatMap((entry) => {
    const view = viewOfEntry(entry);
    return view === undefined ? [] : [{ key: entry.card.key, view }];
  });
  // The panel is headed by its first part; « Questions » is a sub-heading only when « À noter » comes first.
  const questionsFirst = shown.length === 0 && questions.length > 0;
  return {
    heading: questionsFirst ? QUESTIONS_HEADING : HOME_HEADING,
    folded,
    entries: shown,
    questionsHeading: QUESTIONS_HEADING,
    questions,
  };
}

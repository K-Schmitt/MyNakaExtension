// What the home panel shows: the cards still to rate, newest first, each as a rating view that offers its
// choices and « Ignorer » only. Pure: cards in, views out.

import type { RatingCard } from "../../core/rating-cards";
import { HOME_HEADING } from "./home-copy";
import { type RatingView, ratingView } from "./rating-view";
import { labelOf } from "./session-views";

// `view` is what the entry's send is showing now (sending, confirming, a failure); absent, the idle view.
export type HomeEntry = { card: RatingCard; start?: number; view?: RatingView };
export type HomeView = {
  heading: string;
  folded: boolean;
  entries: { key: string; view: RatingView }[];
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

const newestFirst = (a: HomeEntry, b: HomeEntry): number =>
  b.card.at - a.card.at;

export function homeView(entries: HomeEntry[], folded = false): HomeView {
  const shown = [...entries].sort(newestFirst).flatMap((entry) => {
    const view = viewOfEntry(entry);
    return view === undefined ? [] : [{ key: entry.card.key, view }];
  });
  return { heading: HOME_HEADING, folded, entries: shown };
}

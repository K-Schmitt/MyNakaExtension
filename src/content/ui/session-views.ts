// What a shown card looks like in each of its states (choosing, sending, confirming), for both blocks.
// Pure: a Session in, a RatingView out.

import type { ContentIds } from "../../core/finish-event";
import type { RatingCard, RatingLabel } from "../../core/rating-cards";
import { chosenLine, SENDING_LINE } from "./rating-copy";
import { type RatingView, ratingView } from "./rating-view";

// One shown card. `start` is the answer's, and belongs to the card's first pending label only.
export type Session = {
  ids: ContentIds;
  card: RatingCard;
  label: RatingLabel;
  start?: number;
  locked: boolean;
  confirming?: number;
  error?: string; // a line of the block's own: the worker did not answer, or no card came
  viewOnly?: true; // the card exists only in the view: the worker has none for the title
};

export const needsConfirm = ({ card, label }: Session): boolean =>
  label === "série" && !card.seriesFinished;

export function viewOf(s: Session): RatingView {
  const view = ratingView(
    s.card,
    s.label,
    s.label === s.card.pending[0] ? s.start : undefined,
  );
  return s.error === undefined ? view : { ...view, error: s.error };
}

// While a rating travels: no button, a cue, until the worker's card says where it went.
function sendingView(s: Session): RatingView {
  return {
    ...viewOf(s),
    choices: [],
    others: [],
    actions: [],
    notice: SENDING_LINE,
  };
}

function confirmView(s: Session): RatingView {
  return {
    ...viewOf(s),
    choices: [],
    others: [],
    actions: [],
    confirm: true,
    ...(s.confirming === undefined ? {} : { notice: chosenLine(s.confirming) }),
  };
}

export function viewFor(s: Session): RatingView {
  if (s.locked) return sendingView(s);
  return s.confirming === undefined ? viewOf(s) : confirmView(s);
}

export const failureOf = (
  card: RatingCard,
  label: RatingLabel,
): string | undefined =>
  card.failed?.label === label
    ? `${card.failed.error}@${card.failed.at}`
    : undefined;

// A failed label is shown again with its failure line; otherwise the first pending one.
export function labelOf(card: RatingCard): RatingLabel | undefined {
  const failed = card.failed?.label;
  if (failed !== undefined && card.pending.includes(failed)) return failed;
  return card.pending[0];
}

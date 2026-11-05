// Judges the worker's answer against the card as it was at the click: has the clicked label moved on?
// Pure of the session's drawing: the session hands in what to do (close, settle, unlock) as `JudgeActs`.

import type { RatingCard, RatingLabel } from "../../core/rating-cards";
import type { CardAnswer } from "../../sw/rating-answers";
import { notSentLine } from "./rating-copy";
import { failureOf, type Session } from "./session-views";

// The clicked label on the shown card, as it was at the click.
export type Snapshot = {
  cardless: boolean;
  pending: boolean;
  given: number | undefined;
  failure: string | undefined;
};

export const snapshotOf = ({ card, label, viewOnly }: Session): Snapshot => ({
  cardless: viewOnly === true,
  pending: card.pending.includes(label),
  given: card.given[label],
  failure: failureOf(card, label),
});

/** What the judge asks the session to do. `live` is false once the session moved on (a play). */
export type JudgeActs = {
  live(s: Session): boolean;
  absentIsDone: boolean;
  close(s: Session): void;
  settle(s: Session, answer: CardAnswer): void;
  unlock(s: Session): void;
};

// A failure on a label that did not leave `pending`: the block stays, unlocked, with its line.
function showFailure(
  acts: JudgeActs,
  s: Session,
  card: RatingCard,
  label: RatingLabel,
): void {
  s.card = card;
  s.label = label;
  delete s.viewOnly;
  acts.unlock(s);
}

// An answer with no card, the label no longer being sent. For a list, the card has nothing left to
// ask. For a view-only card, the rate job ran without making one: the line says why, the choices work
// again. For a shown real card, it is "not yet".
function absent(
  acts: JudgeActs,
  s: Session,
  at: Snapshot,
  answer: CardAnswer,
): boolean {
  if (acts.absentIsDone) {
    acts.close(s);
    return true;
  }
  if (!at.cardless) return false;
  s.error = notSentLine(answer.lastFinish);
  acts.unlock(s);
  return true;
}

// Moved on: the answer has a card where the clicked label left `pending`, or its given rating
// changed, or its failure changed, all against the card as it was at the click. A card unchanged on
// those three is "not yet"; no card is `absent`.
export function judge(
  acts: JudgeActs,
  s: Session,
  label: RatingLabel,
  at: Snapshot,
  answer: CardAnswer | undefined,
): boolean {
  if (!acts.live(s)) return true; // closed meanwhile (a play): the wait is over, nothing is drawn
  if (answer === undefined) return false;
  if (answer.sending?.includes(label)) return false; // the worker still has the rating to send
  const card = answer.card;
  if (!card) return absent(acts, s, at, answer);
  const left = at.pending && !card.pending.includes(label);
  const rated = card.given[label] !== at.given;
  const failed = failureOf(card, label) !== at.failure;
  if (!left && !rated && !failed) return false;
  if (failed && !left && !rated) showFailure(acts, s, card, label);
  else acts.settle(s, answer);
  return true;
}

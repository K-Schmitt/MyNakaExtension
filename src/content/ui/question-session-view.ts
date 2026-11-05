// What a shown question looks like in each of its states (choosing, sending, moot, failed), and the line
// of a last answer that did not go through. Pure: a Shown in, a QuestionView out.

import type { LastAnswer } from "../../ext/question-offer-schema";
import type { QuestionOffer } from "../../sw/question-offers";
import {
  MISMATCH_LINE,
  MOOT_LINE,
  notSentLine,
  REFUSED_LINE,
  SENDING_LINE,
  UNREACHABLE_LINE,
} from "./question-copy";
import {
  type QuestionAction,
  type QuestionView,
  questionView,
} from "./question-view";

export type Shown = {
  offer: QuestionOffer;
  actions: QuestionAction[];
  seq: number;
  locked: boolean;
  shownAt: number; // when the buttons were last drawn: the open, an unlock
  error?: string;
  mootNotice?: true; // the question is moot: the notice and « Fermer » only
};

export function viewOf(s: Shown): QuestionView {
  if (s.mootNotice === true) {
    return {
      ...questionView(s.offer, ["fermer"]),
      choices: [],
      notice: MOOT_LINE,
    };
  }
  const view = questionView(s.offer, s.actions);
  if (s.locked) {
    return {
      ...view,
      choices: [],
      actions: [],
      sending: true,
      notice: SENDING_LINE,
    };
  }
  return s.error === undefined ? view : { ...view, error: s.error };
}

// The line of a last answer that did not go through; `done` and `moot` are not failures.
export function failureLine(last: LastAnswer): string {
  if (last.outcome === "mismatch") return MISMATCH_LINE;
  if (last.outcome === "failed" && last.error !== undefined) {
    return notSentLine(last.error);
  }
  return last.outcome === "failed" ? UNREACHABLE_LINE : REFUSED_LINE;
}

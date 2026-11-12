// The handlers of an entry that is no longer on the row: a late click on a drawn button does nothing.

import type { QuestionHandlers } from "./question-render";
import type { RatingHandlers } from "./rating-render";

export const NO_HANDLERS: RatingHandlers = {
  onChoose: () => {},
  onAction: () => {},
  onOther: () => {},
  onConfirm: () => {},
};

export const NO_QUESTION_HANDLERS: QuestionHandlers = {
  onChoose: () => {},
  onAction: () => {},
};

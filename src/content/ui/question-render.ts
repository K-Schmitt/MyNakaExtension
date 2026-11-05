// Draws a QuestionView in the overlay's shadow root, through the rating block's pieces: every text goes
// through textContent, every button acts on a trusted click only. A view that is sending shows its line
// and no button.

import type { ElementLike, ShadowRootLike } from "./dom-like";
import { ACTION_LABELS } from "./question-copy";
import type {
  QuestionAction,
  QuestionChoice,
  QuestionView,
} from "./question-view";
import {
  BLOCK_CSS,
  BUTTON_CSS,
  button,
  ERROR_CSS,
  type Maker,
  row,
  textLine,
} from "./rating-render";

export type QuestionHandlers = {
  onChoose(choice: QuestionChoice): void;
  onAction(action: QuestionAction): void;
};

function lines(doc: Maker, view: QuestionView): ElementLike[] {
  return [
    textLine(doc, view.heading, "font-weight: 700;"),
    ...(view.question === undefined ? [] : [textLine(doc, view.question)]),
    ...(view.notice === undefined ? [] : [textLine(doc, view.notice)]),
    ...(view.error === undefined ? [] : [textLine(doc, view.error, ERROR_CSS)]),
  ];
}

function buttonRows(
  doc: Maker,
  view: QuestionView,
  handlers: QuestionHandlers,
): ElementLike[] {
  if (view.sending === true) return [];
  const choices = view.choices.map(({ choice, label }) =>
    button(doc, label, BUTTON_CSS, () => handlers.onChoose(choice)),
  );
  const actions = view.actions.map((action) =>
    button(doc, ACTION_LABELS[action], BUTTON_CSS, () =>
      handlers.onAction(action),
    ),
  );
  return [choices, actions]
    .filter((buttons) => buttons.length > 0)
    .map((buttons) => row(doc, buttons));
}

export function buildQuestionBlock(
  doc: Maker,
  view: QuestionView,
  handlers: QuestionHandlers,
): ElementLike {
  const block = doc.createElement("div");
  block.style.cssText = BLOCK_CSS;
  for (const el of [...lines(doc, view), ...buttonRows(doc, view, handlers)]) {
    block.appendChild(el);
  }
  return block;
}

/** Replaces whatever the root holds with the view. */
export function renderQuestion(
  doc: Maker,
  root: ShadowRootLike,
  view: QuestionView,
  handlers: QuestionHandlers,
): void {
  root.replaceChildren(buildQuestionBlock(doc, view, handlers));
}

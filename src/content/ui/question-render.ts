// Draws a QuestionView in the overlay's shadow root, through the rating block's pieces: every text goes
// through textContent, every button acts on a trusted click only. A view that is sending shows its line
// and no button. A choice that can lead to a site write (a candidate, « Retirer ») acts only while `watch`
// says it visible (D7); « Garder », « Aucun » and the actions write on no site and are not watched.

import type { ElementLike, ShadowRootLike } from "./dom-like";
import type { RowWatch } from "./draw-watch";
import { ACTION_LABELS } from "./question-copy";
import type {
  QuestionAction,
  QuestionChoice,
  QuestionView,
} from "./question-view";
import {
  BLOCK_CLASS,
  BUTTON_CLASS,
  button,
  ERROR_CLASS,
  type Maker,
  row,
  TITLE_CLASS,
  textLine,
  watchedButton,
} from "./rating-render";

export type QuestionHandlers = {
  onChoose(choice: QuestionChoice): void;
  onAction(action: QuestionAction): void;
};

/** A candidate links (and runs the finish that waited on it); « Retirer » unwishes or takes off a list. */
export function writesOnSite(choice: QuestionChoice): boolean {
  return choice.kind === "candidate" || choice.kind === "remove";
}

/** A choice's button, watched (D7) when the choice can lead to a site write. */
export function choiceButton(
  doc: Maker,
  { choice, label }: { choice: QuestionChoice; label: string },
  cls: string,
  handlers: Pick<QuestionHandlers, "onChoose">,
  watch: RowWatch,
): ElementLike {
  const fn = () => handlers.onChoose(choice);
  return writesOnSite(choice)
    ? watchedButton(doc, label, cls, watch, fn)
    : button(doc, label, cls, fn);
}

export function questionLines(doc: Maker, view: QuestionView): ElementLike[] {
  return [
    textLine(doc, view.heading, TITLE_CLASS),
    ...(view.question === undefined ? [] : [textLine(doc, view.question)]),
    ...(view.notice === undefined ? [] : [textLine(doc, view.notice)]),
    ...(view.error === undefined
      ? []
      : [textLine(doc, view.error, ERROR_CLASS)]),
  ];
}

function buttonRows(
  doc: Maker,
  view: QuestionView,
  handlers: QuestionHandlers,
  watch: RowWatch,
): ElementLike[] {
  if (view.sending === true) return [];
  const choices = view.choices.map((c) =>
    choiceButton(doc, c, BUTTON_CLASS, handlers, watch),
  );
  const actions = view.actions.map((action) =>
    button(doc, ACTION_LABELS[action], BUTTON_CLASS, () =>
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
  watch: RowWatch,
): ElementLike {
  const block = doc.createElement("div");
  block.className = BLOCK_CLASS;
  for (const el of [
    ...questionLines(doc, view),
    ...buttonRows(doc, view, handlers, watch),
  ]) {
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
  watch: RowWatch,
): void {
  root.replaceChildren(buildQuestionBlock(doc, view, handlers, watch));
}

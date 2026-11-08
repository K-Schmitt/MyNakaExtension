// A question of the home row as a tile. A removal: the title's picture on top, the heading and the
// question, the two choices, then the view's action in small. An ambiguity: the heading, then one button
// per candidate (a small poster and its label) in a list that scrolls inside the tile, and a footer below
// it, outside the list, holding « Aucun » and the actions, always visible. A sending view shows its
// lines and no button. Texts go through textContent; every button acts on a trusted click only.

import type { ElementLike } from "./dom-like";
import { ACTION_LABELS } from "./question-copy";
import { type QuestionHandlers, questionLines } from "./question-render";
import type { QuestionView } from "./question-view";
import { BUTTON_CLASS, button, type Maker, row } from "./rating-render";
import { artFrame } from "./tile-art";
import { ART_CLASS, SMALL_BUTTON_CLASS, tile } from "./tile-shell";
import { onTrustedClick } from "./trusted";

type Choice = QuestionView["choices"][number];

const CHOICES_CLASS = "mn-choices";
const FOOT_CLASS = "mn-choices-foot";
const CANDIDATE_CLASS = "mn-btn mn-choice";
const THUMB_CLASS = "mn-thumb";
const LABEL_CLASS = "mn-choice-label";

const isCandidate = ({ choice }: Choice): boolean =>
  choice.kind === "candidate";
const isRemoval = (view: QuestionView): boolean => view.kind === "removal";

function candidateButton(
  doc: Maker,
  { choice, label, image }: Choice,
  handlers: QuestionHandlers,
): ElementLike {
  const el = doc.createElement("button");
  el.className = CANDIDATE_CLASS;
  el.setAttribute("type", "button");
  el.appendChild(artFrame(doc, image, THUMB_CLASS));
  const text = doc.createElement("span");
  text.className = LABEL_CLASS;
  text.textContent = label;
  el.appendChild(text);
  onTrustedClick(el, () => handlers.onChoose(choice));
  return el;
}

const choiceButton = (
  doc: Maker,
  { choice, label }: Choice,
  handlers: QuestionHandlers,
): ElementLike =>
  button(doc, label, BUTTON_CLASS, () => handlers.onChoose(choice));

const actionButtons = (
  doc: Maker,
  view: QuestionView,
  handlers: QuestionHandlers,
): ElementLike[] =>
  view.actions.map((action) =>
    button(doc, ACTION_LABELS[action], SMALL_BUTTON_CLASS, () =>
      handlers.onAction(action),
    ),
  );

function ambiguityControls(
  doc: Maker,
  view: QuestionView,
  handlers: QuestionHandlers,
): ElementLike[] {
  const list = row(
    doc,
    view.choices
      .filter(isCandidate)
      .map((c) => candidateButton(doc, c, handlers)),
    CHOICES_CLASS,
  );
  const others = view.choices
    .filter((c) => !isCandidate(c))
    .map((c) => choiceButton(doc, c, handlers));
  const foot = row(
    doc,
    [...others, ...actionButtons(doc, view, handlers)],
    FOOT_CLASS,
  );
  return [list, foot];
}

function removalControls(
  doc: Maker,
  view: QuestionView,
  handlers: QuestionHandlers,
): ElementLike[] {
  const actions = actionButtons(doc, view, handlers);
  return [
    row(
      doc,
      view.choices.map((c) => choiceButton(doc, c, handlers)),
    ),
    ...(actions.length > 0 ? [row(doc, actions)] : []),
  ];
}

function controls(
  doc: Maker,
  view: QuestionView,
  handlers: QuestionHandlers,
): ElementLike[] {
  if (view.sending === true) return [];
  return isRemoval(view)
    ? removalControls(doc, view, handlers)
    : ambiguityControls(doc, view, handlers);
}

export function buildQuestionTile(
  doc: Maker,
  view: QuestionView,
  handlers: QuestionHandlers,
): ElementLike {
  const art = isRemoval(view)
    ? artFrame(doc, view.image, ART_CLASS)
    : undefined;
  return tile(doc, art, [
    ...questionLines(doc, view),
    ...controls(doc, view, handlers),
  ]);
}

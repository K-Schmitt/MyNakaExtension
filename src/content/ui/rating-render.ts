// Draws a RatingView in the overlay's shadow root. Every text goes through textContent; every button
// acts on a trusted click only.

import type { RatingLabel } from "../../core/rating-cards";
import type { DocLike, ElementLike, ShadowRootLike } from "./dom-like";
import {
  ACTION_LABELS,
  CANCEL_LABEL,
  OTHER_LABELS,
  type RatingAction,
  SEND_LABEL,
} from "./rating-copy";
import type { RatingView } from "./rating-view";
import { starRater } from "./star-rater";
import { onTrustedClick } from "./trusted";

export type RatingHandlers = {
  onChoose(value: number): void;
  onAction(action: RatingAction): void;
  onOther(label: RatingLabel): void;
  onConfirm(send: boolean): void;
};

export type Maker = Pick<DocLike, "createElement">;

export const BLOCK_CLASS = "mn-card";
export const BUTTON_CLASS = "mn-btn";
export const PRIMARY_CLASS = "mn-btn mn-btn--primary";
export const ERROR_CLASS = "mn-line mn-error";
export const WARNING_CLASS = "mn-line mn-warning";
export const TITLE_CLASS = "mn-line mn-title";
const ROW_CLASS = "mn-row";

export function textLine(
  doc: Maker,
  text: string,
  cls = "mn-line",
): ElementLike {
  const line = doc.createElement("div");
  line.textContent = text;
  line.className = cls;
  return line;
}

export function button(
  doc: Maker,
  text: string,
  cls: string,
  fn: () => void,
): ElementLike {
  const el = doc.createElement("button");
  el.textContent = text;
  el.className = cls;
  el.setAttribute("type", "button");
  onTrustedClick(el, fn);
  return el;
}

export function row(
  doc: Maker,
  buttons: ElementLike[],
  cls: string = ROW_CLASS,
): ElementLike {
  const el = doc.createElement("div");
  el.className = cls;
  for (const b of buttons) el.appendChild(b);
  return el;
}

function lines(doc: Maker, view: RatingView): ElementLike[] {
  return [
    textLine(doc, view.heading, TITLE_CLASS),
    ...(view.current === undefined ? [] : [textLine(doc, view.current)]),
    ...(view.start === undefined ? [] : [textLine(doc, view.start)]),
    ...(view.notice === undefined ? [] : [textLine(doc, view.notice)]),
    ...(view.error === undefined
      ? []
      : [textLine(doc, view.error, ERROR_CLASS)]),
    ...(view.warning === undefined
      ? []
      : [textLine(doc, view.warning, WARNING_CLASS)]),
  ];
}

function confirmRow(doc: Maker, handlers: RatingHandlers): ElementLike {
  return row(doc, [
    button(doc, SEND_LABEL, PRIMARY_CLASS, () => handlers.onConfirm(true)),
    button(doc, CANCEL_LABEL, BUTTON_CLASS, () => handlers.onConfirm(false)),
  ]);
}

function buttonRows(
  doc: Maker,
  view: RatingView,
  handlers: RatingHandlers,
): ElementLike[] {
  if (view.confirm === true) return [confirmRow(doc, handlers)];
  const others = view.others.map((label) =>
    button(doc, OTHER_LABELS[label], BUTTON_CLASS, () =>
      handlers.onOther(label),
    ),
  );
  const actions = view.actions.map((action) =>
    button(doc, ACTION_LABELS[action], BUTTON_CLASS, () =>
      handlers.onAction(action),
    ),
  );
  return [
    ...(view.choices.length > 0
      ? [starRater(doc, view.choices, handlers.onChoose)]
      : []),
    ...[others, actions]
      .filter((buttons) => buttons.length > 0)
      .map((buttons) => row(doc, buttons)),
  ];
}

export function buildBlock(
  doc: Maker,
  view: RatingView,
  handlers: RatingHandlers,
): ElementLike {
  const block = doc.createElement("div");
  block.className = BLOCK_CLASS;
  const rows = buttonRows(doc, view, handlers);
  for (const el of [...lines(doc, view), ...rows]) block.appendChild(el);
  return block;
}

/** Replaces whatever the root holds with the view. */
export function renderRating(
  doc: Maker,
  root: ShadowRootLike,
  view: RatingView,
  handlers: RatingHandlers,
): void {
  root.replaceChildren(buildBlock(doc, view, handlers));
}

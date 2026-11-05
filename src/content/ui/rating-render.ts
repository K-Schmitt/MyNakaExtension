// Draws a RatingView in the overlay's shadow root. Every text goes through textContent; every button
// acts on a trusted click only. The block remembers the view it shows, for the caller to query.

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
import { onTrustedClick } from "./trusted";

export type RatingHandlers = {
  onChoose(value: number): void;
  onAction(action: RatingAction): void;
  onOther(label: RatingLabel): void;
  onConfirm(send: boolean): void;
};

type Maker = Pick<DocLike, "createElement">;

const BLOCK_CSS =
  "font: 14px/1.4 system-ui, sans-serif; color: #fff; background: rgba(20, 20, 24, 0.92); padding: 12px; margin: 12px; border-radius: 8px; display: block;";
const ROW_CSS = "display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;";
const BUTTON_CSS =
  "font: inherit; color: #fff; background: #3a3a44; border: 1px solid #666; border-radius: 4px; padding: 4px 8px; cursor: pointer;";
const MARKED_CSS = `${BUTTON_CSS} background: #2f6fdb; border-color: #9cc0ff; font-weight: 700;`;
const WARNING_CSS = "color: #ffd479; margin-top: 8px;";
const ERROR_CSS = "color: #ff9c9c; margin-top: 8px;";

function textLine(doc: Maker, text: string, css = ""): ElementLike {
  const line = doc.createElement("div");
  line.textContent = text;
  line.style.cssText = css;
  return line;
}

function button(
  doc: Maker,
  text: string,
  css: string,
  fn: () => void,
): ElementLike {
  const el = doc.createElement("button");
  el.textContent = text;
  el.style.cssText = css;
  el.setAttribute("type", "button");
  onTrustedClick(el, fn);
  return el;
}

function row(doc: Maker, buttons: ElementLike[]): ElementLike {
  const el = doc.createElement("div");
  el.style.cssText = ROW_CSS;
  for (const b of buttons) el.appendChild(b);
  return el;
}

function choiceButton(
  doc: Maker,
  choice: RatingView["choices"][number],
  handlers: RatingHandlers,
): ElementLike {
  const el = button(
    doc,
    String(choice.value),
    choice.marked ? MARKED_CSS : BUTTON_CSS,
    () => handlers.onChoose(choice.value),
  );
  el.setAttribute("aria-pressed", String(choice.marked));
  return el;
}

function lines(doc: Maker, view: RatingView): ElementLike[] {
  return [
    textLine(doc, view.heading, "font-weight: 700;"),
    ...(view.current === undefined ? [] : [textLine(doc, view.current)]),
    ...(view.start === undefined ? [] : [textLine(doc, view.start)]),
    ...(view.notice === undefined ? [] : [textLine(doc, view.notice)]),
    ...(view.error === undefined ? [] : [textLine(doc, view.error, ERROR_CSS)]),
    ...(view.warning === undefined
      ? []
      : [textLine(doc, view.warning, WARNING_CSS)]),
  ];
}

function confirmRow(doc: Maker, handlers: RatingHandlers): ElementLike {
  return row(doc, [
    button(doc, SEND_LABEL, MARKED_CSS, () => handlers.onConfirm(true)),
    button(doc, CANCEL_LABEL, BUTTON_CSS, () => handlers.onConfirm(false)),
  ]);
}

function buttonRows(
  doc: Maker,
  view: RatingView,
  handlers: RatingHandlers,
): ElementLike[] {
  if (view.confirm === true) return [confirmRow(doc, handlers)];
  const others = view.others.map((label) =>
    button(doc, OTHER_LABELS[label], BUTTON_CSS, () => handlers.onOther(label)),
  );
  const actions = view.actions.map((action) =>
    button(doc, ACTION_LABELS[action], BUTTON_CSS, () =>
      handlers.onAction(action),
    ),
  );
  const choices = view.choices.map((c) => choiceButton(doc, c, handlers));
  return [choices, others, actions]
    .filter((buttons) => buttons.length > 0)
    .map((buttons) => row(doc, buttons));
}

function buildBlock(
  doc: Maker,
  view: RatingView,
  handlers: RatingHandlers,
): ElementLike {
  const block = doc.createElement("div");
  block.style.cssText = BLOCK_CSS;
  for (const el of [...lines(doc, view), ...buttonRows(doc, view, handlers)]) {
    block.appendChild(el);
  }
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

export function createRatingBlock(
  doc: Maker,
  root: ShadowRootLike,
  handlers: RatingHandlers,
) {
  let shown: RatingView | undefined;
  return {
    show(view: RatingView): void {
      renderRating(doc, root, view, handlers);
      shown = view;
    },
    hide(): void {
      root.replaceChildren();
      shown = undefined;
    },
    current(): RatingView | undefined {
      return shown;
    },
  };
}

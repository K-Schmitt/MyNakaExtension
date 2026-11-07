// Draws a HomeView in the overlay's shadow root: the heading with its fold button, then one rating block
// per entry. Texts go through textContent; every button acts on a trusted click only.

import type { ElementLike, ShadowRootLike } from "./dom-like";
import type { HomeHandlers } from "./home-block";
import { FOLD_LABEL, UNFOLD_LABEL } from "./home-copy";
import type { HomeView } from "./home-view";
import { buildQuestionBlock } from "./question-render";
import type { BlockLayout, Maker } from "./rating-render";
import { buildBlock, button, textLine } from "./rating-render";

const PANEL_CLASS = "mn-panel";
const HEAD_CLASS = "mn-panel-head";
const HEADING_CLASS = "mn-heading";
const SUBHEADING_CLASS = "mn-subheading";
const FOLD_CLASS = "mn-btn mn-btn--ghost";
// 360 px wide: the ten choices on two rows of five, never a lone « 10 » on a row of its own.
const PANEL_LAYOUT: BlockLayout = {
  choicesRow: "mn-row mn-row--grid5",
};

function header(doc: Maker, view: HomeView, onFold: () => void) {
  const head = doc.createElement("div");
  head.className = HEAD_CLASS;
  head.appendChild(textLine(doc, view.heading, HEADING_CLASS));
  const label = view.folded ? UNFOLD_LABEL : FOLD_LABEL;
  head.appendChild(button(doc, label, FOLD_CLASS, onFold));
  return head;
}

// « Questions » heads the panel itself when no card comes before it; otherwise it is a line of its own.
function appendQuestions(
  doc: Maker,
  panel: ElementLike,
  view: HomeView,
  handlers: HomeHandlers,
): void {
  if (view.questions.length === 0) return;
  if (view.entries.length > 0) {
    panel.appendChild(textLine(doc, view.questionsHeading, SUBHEADING_CLASS));
  }
  for (const { key, view: question } of view.questions) {
    panel.appendChild(
      buildQuestionBlock(doc, question, handlers.question(key)),
    );
  }
}

/** Replaces whatever the root holds with the panel. */
export function renderHome(
  doc: Maker,
  root: ShadowRootLike,
  view: HomeView,
  handlers: HomeHandlers,
): void {
  const panel = doc.createElement("div");
  panel.className = PANEL_CLASS;
  panel.appendChild(header(doc, view, handlers.onFold));
  if (!view.folded) {
    for (const { key, view: entry } of view.entries) {
      panel.appendChild(
        buildBlock(doc, entry, handlers.entry(key), PANEL_LAYOUT),
      );
    }
    appendQuestions(doc, panel, view, handlers);
  }
  root.replaceChildren(panel);
}

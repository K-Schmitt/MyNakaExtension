// Draws a HomeView in the overlay's shadow root: the heading with its fold button, then one rating block
// per entry. Texts go through textContent; every button acts on a trusted click only.

import type { ElementLike, ShadowRootLike } from "./dom-like";
import type { HomeHandlers } from "./home-block";
import { FOLD_LABEL, UNFOLD_LABEL } from "./home-copy";
import type { HomeView } from "./home-view";
import { buildQuestionBlock } from "./question-render";
import type { BlockLayout, Maker } from "./rating-render";
import {
  BLOCK_TEXT_CSS,
  BUTTON_CLASS,
  buildBlock,
  button,
  textLine,
} from "./rating-render";

// The panel's own style sheet. The panel declares the blocks' text, so that the fold button, whose
// `font: inherit` is the one of every block button, draws in the same font.
const PANEL_CSS = BLOCK_TEXT_CSS;
const HEAD_CSS =
  "display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 12px 12px 0;";
const HEADING_CSS = "font: 700 15px/1.4 system-ui, sans-serif; color: #fff;";
const SUBHEADING_CSS = `${HEADING_CSS} margin: 12px 12px 0;`;
// 360 px wide: the ten choices on two rows of five, never a lone « 10 » on a row of its own.
const PANEL_LAYOUT: BlockLayout = {
  choicesRow: "mn-row mn-row--grid5",
};

// Temporary (Task 5 migrates the panel): a heading line still styled inline.
function cssLine(doc: Maker, text: string, css: string): ElementLike {
  const line = textLine(doc, text, "");
  line.style.cssText = css;
  return line;
}

function header(doc: Maker, view: HomeView, onFold: () => void) {
  const head = doc.createElement("div");
  head.style.cssText = HEAD_CSS;
  head.appendChild(cssLine(doc, view.heading, HEADING_CSS));
  const label = view.folded ? UNFOLD_LABEL : FOLD_LABEL;
  head.appendChild(button(doc, label, BUTTON_CLASS, onFold));
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
    panel.appendChild(cssLine(doc, view.questionsHeading, SUBHEADING_CSS));
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
  panel.style.cssText = PANEL_CSS;
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

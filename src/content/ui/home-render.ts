// Draws a HomeView in the overlay's shadow root: the heading with its fold button, then one rating block
// per entry. Texts go through textContent; every button acts on a trusted click only.

import type { ShadowRootLike } from "./dom-like";
import type { HomeHandlers } from "./home-block";
import { FOLD_LABEL, UNFOLD_LABEL } from "./home-copy";
import type { HomeView } from "./home-view";
import type { BlockLayout, Maker } from "./rating-render";
import {
  BLOCK_TEXT_CSS,
  BUTTON_CSS,
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
// 360 px wide: the ten choices on two rows of five, never a lone « 10 » on a row of its own.
const PANEL_LAYOUT: BlockLayout = {
  choicesRow:
    "display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 8px;",
};

function header(doc: Maker, view: HomeView, onFold: () => void) {
  const head = doc.createElement("div");
  head.style.cssText = HEAD_CSS;
  head.appendChild(textLine(doc, view.heading, HEADING_CSS));
  const label = view.folded ? UNFOLD_LABEL : FOLD_LABEL;
  head.appendChild(button(doc, label, BUTTON_CSS, onFold));
  return head;
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
  }
  root.replaceChildren(panel);
}

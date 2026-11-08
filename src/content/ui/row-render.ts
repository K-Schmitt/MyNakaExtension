// Draws a HomeView in the row's shadow root: a header (title and subtitle), then a track holding the
// live card, the cards to rate and the questions, in that order. Texts go through textContent; every
// button acts on a trusted click only (the blocks' own buttons).

import type { ElementLike, ShadowRootLike } from "./dom-like";
import type { HomeHandlers } from "./home-block";
import { ROW_SUBTITLE, ROW_TITLE } from "./home-copy";
import type { HomeQuestion, HomeView } from "./home-view";
import { buildQuestionBlock } from "./question-render";
import { buildBlock, type Maker, textLine } from "./rating-render";

const HEAD_CLASS = "mn-head";
const TITLE_CLASS = "mn-head-title";
const SUBTITLE_CLASS = "mn-head-sub";
const TRACK_CLASS = "mn-track";

function header(doc: Maker): ElementLike {
  const head = doc.createElement("div");
  head.className = HEAD_CLASS;
  head.appendChild(textLine(doc, ROW_TITLE, TITLE_CLASS));
  head.appendChild(textLine(doc, ROW_SUBTITLE, SUBTITLE_CLASS));
  return head;
}

function questionCard(
  doc: Maker,
  { key, view }: HomeQuestion,
  handlers: HomeHandlers,
): ElementLike {
  return buildQuestionBlock(doc, view, handlers.question(key));
}

function track(
  doc: Maker,
  view: HomeView,
  handlers: HomeHandlers,
): ElementLike {
  const cards = doc.createElement("div");
  cards.className = TRACK_CLASS;
  if (view.live !== undefined) {
    cards.appendChild(questionCard(doc, view.live, handlers));
  }
  for (const { key, view: entry } of view.entries) {
    cards.appendChild(buildBlock(doc, entry, handlers.entry(key)));
  }
  for (const question of view.questions) {
    cards.appendChild(questionCard(doc, question, handlers));
  }
  return cards;
}

/** Replaces whatever the root holds with the row. */
export function renderRow(
  doc: Maker,
  root: ShadowRootLike,
  view: HomeView,
  handlers: HomeHandlers,
): void {
  root.replaceChildren(header(doc), track(doc, view, handlers));
}

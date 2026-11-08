// Draws a HomeView in the row's shadow root: a header (title and subtitle, then the carousel's two
// arrows), then a track holding the live card, the cards to rate and the questions, in that order, each
// as a tile. Texts go through textContent; every button acts on a trusted click only (the tiles' own
// buttons).

import { carryScroll, type SizeWatch, wireArrows } from "./carousel";
import type { ElementLike, ShadowRootLike, TrackLike } from "./dom-like";
import type { HomeHandlers } from "./home-block";
import { NEXT_LABEL, PREV_LABEL, ROW_SUBTITLE, ROW_TITLE } from "./home-copy";
import type { HomeQuestion, HomeView } from "./home-view";
import { buildQuestionTile } from "./question-tile";
import { type Maker, textLine } from "./rating-render";
import { buildRatingTile } from "./rating-tile";

const HEAD_CLASS = "mn-head";
const HEAD_TEXT_CLASS = "mn-head-text";
const TITLE_CLASS = "mn-head-title";
const SUBTITLE_CLASS = "mn-head-sub";
const ARROWS_CLASS = "mn-arrows";
const ARROW_CLASS = "mn-arrow";
const TRACK_CLASS = "mn-track";
const PREV_GLYPH = "\u2039";
const NEXT_GLYPH = "\u203A";

function arrow(doc: Maker, glyph: string, label: string): ElementLike {
  const el = doc.createElement("button");
  el.textContent = glyph;
  el.className = ARROW_CLASS;
  el.setAttribute("type", "button");
  el.setAttribute("aria-label", label);
  return el;
}

function header(doc: Maker, arrows: ElementLike[]): ElementLike {
  const text = doc.createElement("div");
  text.className = HEAD_TEXT_CLASS;
  text.appendChild(textLine(doc, ROW_TITLE, TITLE_CLASS));
  text.appendChild(textLine(doc, ROW_SUBTITLE, SUBTITLE_CLASS));
  const group = doc.createElement("div");
  group.className = ARROWS_CLASS;
  for (const a of arrows) group.appendChild(a);
  const head = doc.createElement("div");
  head.className = HEAD_CLASS;
  head.appendChild(text);
  head.appendChild(group);
  return head;
}

function questionCard(
  doc: Maker,
  { key, view }: HomeQuestion,
  handlers: HomeHandlers,
): ElementLike {
  return buildQuestionTile(doc, view, handlers.question(key));
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
  for (const { key, view: entry, image } of view.entries) {
    cards.appendChild(buildRatingTile(doc, entry, image, handlers.entry(key)));
  }
  for (const question of view.questions) {
    cards.appendChild(questionCard(doc, question, handlers));
  }
  return cards;
}

// The track is a `div` the document made: in the page it has the scroll fields the arrows read. The
// test fakes have none, so their arrows stay hidden (an unmeasured track moves nothing).
const asTrack = (el: ElementLike): TrackLike => el as unknown as TrackLike;

// The track each root shows now, so that a redraw (a lock, a card leaving) keeps the scroll position, and
// the stop of its size watch, so that a redraw stops watching the track it replaces.
const shownTracks = new WeakMap<
  ShadowRootLike,
  { track: TrackLike; unwatch: () => void }
>();

/** Replaces whatever the root holds with the row; `watchSize` re-measures the arrows on a resize. */
export function renderRow(
  doc: Maker,
  root: ShadowRootLike,
  view: HomeView,
  handlers: HomeHandlers,
  watchSize?: SizeWatch,
): void {
  const prev = arrow(doc, PREV_GLYPH, PREV_LABEL);
  const next = arrow(doc, NEXT_GLYPH, NEXT_LABEL);
  const cards = track(doc, view, handlers);
  const shown = shownTracks.get(root);
  shown?.unwatch();
  // Read before the old track leaves: a detached element scrolls nowhere.
  const left = shown?.track.scrollLeft;
  root.replaceChildren(header(doc, [prev, next]), cards);
  carryScroll(left, asTrack(cards));
  const unwatch = wireArrows(asTrack(cards), prev, next, watchSize);
  shownTracks.set(root, { track: asTrack(cards), unwatch });
}

// Draws a HomeView in the row's shadow root: a header (title and subtitle, then the carousel's two
// arrows), then a track holding the live card, the cards to rate and the questions, in that order, each
// as a tile. Texts go through textContent; every button acts on a trusted click only (the tiles' own
// buttons).

import { type ArrowPorts, carryScroll, wireArrows } from "./carousel";
import type { ElementLike, ShadowRootLike, TrackLike } from "./dom-like";
import type { RowWatch } from "./draw-watch";
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

// An h2, as Naka's own row titles (`h2.nh-h2`); the sheet resets its default margin.
function title(doc: Maker): ElementLike {
  const el = doc.createElement("h2");
  el.textContent = ROW_TITLE;
  el.className = TITLE_CLASS;
  return el;
}

function header(doc: Maker, arrows: ElementLike[]): ElementLike {
  const text = doc.createElement("div");
  text.className = HEAD_TEXT_CLASS;
  text.appendChild(title(doc));
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
  watch: RowWatch,
): ElementLike {
  return buildQuestionTile(doc, view, handlers.question(key), watch);
}

function track(
  doc: Maker,
  view: HomeView,
  handlers: HomeHandlers,
  watch: RowWatch,
): ElementLike {
  const cards = doc.createElement("div");
  cards.className = TRACK_CLASS;
  if (view.live !== undefined) {
    cards.appendChild(questionCard(doc, view.live, handlers, watch));
  }
  for (const { key, view: entry, image } of view.entries) {
    const tileHandlers = handlers.entry(key);
    cards.appendChild(buildRatingTile(doc, entry, image, tileHandlers, watch));
  }
  for (const question of view.questions) {
    cards.appendChild(questionCard(doc, question, handlers, watch));
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

/**
 * Replaces whatever the root holds with the row; `watch` guards the tiles' writing controls;
 * `arrows` re-measures them on a resize and sets their motion.
 */
export function renderRow(
  doc: Maker,
  root: ShadowRootLike,
  view: HomeView,
  handlers: HomeHandlers,
  watch: RowWatch,
  arrows?: ArrowPorts,
): void {
  const prev = arrow(doc, PREV_GLYPH, PREV_LABEL);
  const next = arrow(doc, NEXT_GLYPH, NEXT_LABEL);
  const cards = track(doc, view, handlers, watch);
  const shown = shownTracks.get(root);
  shown?.unwatch();
  // Read before the old track leaves: a detached element scrolls nowhere.
  const left = shown?.track.scrollLeft;
  root.replaceChildren(header(doc, [prev, next]), cards);
  carryScroll(left, asTrack(cards));
  const unwatch = wireArrows(asTrack(cards), prev, next, arrows);
  shownTracks.set(root, { track: asTrack(cards), unwatch });
}

/** Empties the root and stops the size watch of the track it showed. */
export function clearRow(root: ShadowRootLike): void {
  shownTracks.get(root)?.unwatch();
  shownTracks.delete(root);
  root.replaceChildren();
}

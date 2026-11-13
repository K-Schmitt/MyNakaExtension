// The ten-star rater: a radiogroup of buttons, then the marked value. Only a trusted click chooses;
// the arrow keys only move the focus (roving tabindex).

import type { DocLike, ElementLike } from "./dom-like";
import { onTrustedClick } from "./trusted";

export type Star = { value: number; marked: boolean };

type Maker = Pick<DocLike, "createElement">;

const STAR_GLYPH = "★";

// Two choices can be marked (the start and the current value): the stars show the highest one.
function shownIndex(stars: Star[]): number {
  return Math.max(
    0,
    stars.findLastIndex((s) => s.marked),
  );
}

function starButton(
  doc: Maker,
  star: Star,
  shown: boolean,
  onChoose: (value: number) => void,
): ElementLike {
  const el = doc.createElement("button");
  el.textContent = STAR_GLYPH;
  el.className = "mn-star";
  el.setAttribute("type", "button");
  el.setAttribute("role", "radio");
  el.setAttribute("aria-checked", String(shown && star.marked));
  el.setAttribute("aria-label", `${star.value} sur 10`);
  el.setAttribute("tabindex", shown ? "0" : "-1");
  onTrustedClick(el, () => onChoose(star.value));
  return el;
}

function moveFocus(buttons: ElementLike[], from: number, to: number): number {
  const next = Math.min(buttons.length - 1, Math.max(0, to));
  buttons.forEach((b, i) => {
    b.setAttribute("tabindex", i === next ? "0" : "-1");
  });
  if (next !== from) buttons[next]?.focus();
  return next;
}

// The focus step of an arrow key; 0 for any other key.
function arrowStep(key: string | undefined): number {
  if (key === "ArrowRight") return 1;
  if (key === "ArrowLeft") return -1;
  return 0;
}

// The stars take the arrows: their default action would also scroll the scroller around them (the home
// row's track, which then snaps to the next card). A modified arrow (Alt+arrow is back/forward) is the
// browser's.
function onArrows(
  group: ElementLike,
  buttons: ElementLike[],
  start: number,
): void {
  let current = start;
  buttons.forEach((b, i) => {
    b.addEventListener("focus", () => {
      current = i;
    });
  });
  group.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = arrowStep(event.key);
    if (step === 0) return;
    event.preventDefault();
    current = moveFocus(buttons, current, current + step);
  });
}

/** The group of stars plus the value line, wrapped in one row. */
export function starRater(
  doc: Maker,
  stars: Star[],
  onChoose: (value: number) => void,
): ElementLike {
  const start = shownIndex(stars);
  const group = doc.createElement("div");
  group.className = "mn-stars";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "Note");
  const buttons = stars.map((s, i) =>
    starButton(doc, s, i === start, onChoose),
  );
  for (const b of buttons) group.appendChild(b);
  onArrows(group, buttons, start);
  const marked = stars[start]?.marked ? stars[start] : undefined;
  const value = doc.createElement("span");
  value.className = "mn-stars-value";
  value.textContent = marked === undefined ? "" : `${marked.value}/10`;
  const wrap = doc.createElement("div");
  wrap.className = "mn-row mn-row--stars";
  wrap.appendChild(group);
  wrap.appendChild(value);
  return wrap;
}

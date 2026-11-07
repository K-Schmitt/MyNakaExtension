// The ten-star rater: a radiogroup of buttons, then the marked value. Only a trusted click chooses;
// the arrow keys only move the focus (roving tabindex).

import type { DocLike, ElementLike } from "./dom-like";
import { onTrustedClick } from "./trusted";

export type Star = { value: number; marked: boolean };

type Maker = Pick<DocLike, "createElement">;

const STAR_GLYPH = "★";

function startIndex(stars: Star[]): number {
  return Math.max(
    0,
    stars.findIndex((s) => s.marked),
  );
}

function starButton(
  doc: Maker,
  star: Star,
  tabStop: boolean,
  onChoose: (value: number) => void,
): ElementLike {
  const el = doc.createElement("button");
  el.textContent = STAR_GLYPH;
  el.className = "mn-star";
  el.setAttribute("type", "button");
  el.setAttribute("role", "radio");
  el.setAttribute("aria-checked", String(star.marked));
  el.setAttribute("aria-label", `${star.value} sur 10`);
  el.setAttribute("tabindex", tabStop ? "0" : "-1");
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

function onArrows(buttons: ElementLike[], start: number): void {
  let current = start;
  buttons.forEach((b, i) => {
    b.addEventListener("focus", () => {
      current = i;
    });
  });
  const group = buttons[0]?.parentNode as ElementLike | null;
  group?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight")
      current = moveFocus(buttons, current, current + 1);
    if (event.key === "ArrowLeft")
      current = moveFocus(buttons, current, current - 1);
  });
}

/** The group of stars plus the value line, wrapped in one row. */
export function starRater(
  doc: Maker,
  stars: Star[],
  onChoose: (value: number) => void,
): ElementLike {
  const start = startIndex(stars);
  const group = doc.createElement("div");
  group.className = "mn-stars";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "Note");
  const buttons = stars.map((s, i) =>
    starButton(doc, s, i === start, onChoose),
  );
  for (const b of buttons) group.appendChild(b);
  onArrows(buttons, start);
  const marked = stars.find((s) => s.marked);
  const value = doc.createElement("span");
  value.className = "mn-stars-value";
  value.textContent = marked === undefined ? "" : `${marked.value}/10`;
  const wrap = doc.createElement("div");
  wrap.className = "mn-row mn-row--stars";
  wrap.appendChild(group);
  wrap.appendChild(value);
  return wrap;
}

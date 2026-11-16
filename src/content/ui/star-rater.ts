// The ten-star rater: a radiogroup of buttons, then the marked value. Only a trusted click chooses;
// the arrow keys only move the focus (roving tabindex).

import type { DocLike, ElementLike } from "./dom-like";
import { onTrustedClick } from "./trusted";

export type Star = { value: number; marked: boolean };

type Maker = Pick<DocLike, "createElement">;

const STAR_GLYPH = "★";

// At most one choice is marked (the current value, else the start); the stars show it, else none.
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

const LIT_CLASS = "mn-star--lit";

// The preview is a class on the stars 1..k and an attribute on the group; no layout is read, nothing is sent.
function showPreview(group: ElementLike, buttons: ElementLike[], k: number) {
  buttons.forEach((b, i) => {
    b.className = i < k ? `mn-star ${LIT_CLASS}` : "mn-star";
  });
  group.setAttribute("data-previewing", "");
}

function clearPreview(group: ElementLike, buttons: ElementLike[]): void {
  for (const b of buttons) b.className = "mn-star";
  group.removeAttribute("data-previewing");
}

// A touch has no hover: its first tap rates. Moving the focus between stars blurs one and focuses the next
// at once, so the preview goes on; the group's `pointerleave` or a blur out of it returns to the rating.
function onPreview(group: ElementLike, buttons: ElementLike[]): void {
  buttons.forEach((b, i) => {
    b.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") return;
      showPreview(group, buttons, i + 1);
    });
    b.addEventListener("focus", () => showPreview(group, buttons, i + 1));
    b.addEventListener("blur", () => clearPreview(group, buttons));
  });
  group.addEventListener("pointerleave", () => clearPreview(group, buttons));
}

export type StarOptions = {
  /** Names the group (« Note » without). */
  name?: string;
  /** The hover preview. */
  preview?: true;
  /** Watches the group of stars; a click chooses only while the answer says it counts. */
  watch?: (group: ElementLike) => () => boolean;
};

/** The group of stars plus the value line, wrapped in one row. */
export function starRater(
  doc: Maker,
  stars: Star[],
  onChoose: (value: number) => void,
  { name, preview, watch }: StarOptions = {},
): ElementLike {
  const start = shownIndex(stars);
  const group = doc.createElement("div");
  group.className = "mn-stars";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", name ?? "Note");
  if (name !== undefined) group.setAttribute("title", name);
  const counts = watch?.(group);
  const choose = (value: number) => {
    if (counts === undefined || counts()) onChoose(value);
  };
  const buttons = stars.map((s, i) => starButton(doc, s, i === start, choose));
  for (const b of buttons) group.appendChild(b);
  onArrows(group, buttons, start);
  if (preview) onPreview(group, buttons);
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

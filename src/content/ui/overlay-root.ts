// The one element the extension adds to a Naka page. Its shadow root is closed, so the page's scripts
// cannot reach the block through the DOM. In fullscreen only the fullscreen element's subtree is drawn:
// the host moves into it (on Naka it is a div around the <video>) and back to body when it ends.

import { valuesOf } from "../../ext/field-checks";
import type { DocLike, NodeLike, ShadowRootLike } from "./dom-like";

export type Placement = "top-right" | "bottom-right";

// The rating blocks sit on the right, at most 40% wide, from 7% to at most 87% of the height. Naka's player
// has a bar of controls from 1% to 5% of the height and another from 95% to 99%, with the progress bar just
// above it (owner's probe of 2026-11-05). The home panel sits bottom right, 360 px wide and 60% of the
// height at most: the home page has no player. Every declaration is !important: an author rule marked
// !important must not hide or fade the host.
const COMMON_STYLE = [
  "all: initial",
  "position: fixed",
  "right: 0",
  "overflow: auto",
  "z-index: 2147483647",
];
const PLACED_STYLE: Record<Placement, string[]> = {
  "top-right": ["top: 7%", "max-width: 40%", "max-height: 80%"],
  "bottom-right": [
    "bottom: 0",
    "width: 360px",
    "max-width: 100%",
    "max-height: 60vh",
  ],
};
const hostCss = (placement: Placement): string =>
  [...COMMON_STYLE, ...PLACED_STYLE[placement]]
    .map((d) => `${d} !important;`)
    .join(" ");

type StoppedEvent =
  | "click"
  | "dblclick"
  | "auxclick"
  | "contextmenu"
  | "pointerdown"
  | "pointerup"
  | "mousedown"
  | "mouseup"
  | "touchstart"
  | "touchend"
  | "keydown"
  | "keyup"
  | "wheel";

// Input on the block must not reach Naka's player (a click toggles play, a double click fullscreen).
// The block's own handlers sit inside the shadow tree and run before this bubble-phase stop.
export const STOPPED_EVENTS = valuesOf<StoppedEvent>({
  click: true,
  dblclick: true,
  auxclick: true,
  contextmenu: true,
  pointerdown: true,
  pointerup: true,
  mousedown: true,
  mouseup: true,
  touchstart: true,
  touchend: true,
  keydown: true,
  keyup: true,
  wheel: true,
});

function targetOf(doc: DocLike): NodeLike {
  return doc.fullscreenElement ?? doc.body;
}

export function createOverlayRoot(
  doc: DocLike,
  placement: Placement = "top-right",
): {
  root: ShadowRootLike;
  /** Puts the host back under its target when the page removed it; does nothing when it is there. */
  attach(): void;
} {
  const host = doc.createElement("div");
  host.style.cssText = hostCss(placement);
  for (const type of STOPPED_EVENTS) {
    host.addEventListener(type, (event) => event.stopPropagation());
  }
  const root = host.attachShadow({ mode: "closed" });
  const place = (): void => {
    targetOf(doc).appendChild(host);
  };
  place();
  const attach = (): void => {
    if (host.parentNode !== targetOf(doc)) place();
  };
  doc.addEventListener("fullscreenchange", place);
  return { root, attach };
}

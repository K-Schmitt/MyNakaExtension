// The overlay over Naka's player, where the end, pause and removal blocks draw. Its shadow root is
// closed, so the page's scripts cannot reach the block through the DOM. In fullscreen only the
// fullscreen element's subtree is drawn: the host moves into it (on Naka it is a div around the <video>)
// and back to body when it ends.

import type { DocLike, NodeLike, ShadowRootLike } from "./dom-like";
import { STOPPED_EVENTS, stopAtHost } from "./input-stop";
import { attachSheet } from "./sheet";

export type Placement = "top-right";

// The rating blocks sit on the right, at most 40% wide, from 7% to at most 87% of the height. Naka's player
// has a bar of controls from 1% to 5% of the height and another from 95% to 99%, with the progress bar just
// above it (owner's probe of 2026-11-05). Every declaration is !important: an author rule marked
// !important must not hide or fade the host.
const COMMON_STYLE = [
  "all: initial",
  "color-scheme: dark",
  "position: fixed",
  "right: 0",
  "overflow: auto",
  "z-index: 2147483647",
];
const PLACED_STYLE: Record<Placement, string[]> = {
  "top-right": ["top: 7%", "max-width: 40%", "max-height: 80%"],
};
const hostCss = (placement: Placement): string =>
  [...COMMON_STYLE, ...PLACED_STYLE[placement]]
    .map((d) => `${d} !important;`)
    .join(" ");

function targetOf(doc: DocLike): NodeLike {
  return doc.fullscreenElement ?? doc.body;
}

export function createOverlayRoot(
  doc: DocLike,
  placement: Placement = "top-right",
  css = "",
): {
  root: ShadowRootLike;
  /** Puts the host back under its target when the page removed it; does nothing when it is there. */
  attach(): void;
} {
  const host = doc.createElement("div");
  host.style.cssText = hostCss(placement);
  stopAtHost(host, STOPPED_EVENTS);
  const shadow = host.attachShadow({ mode: "closed" });
  const root = css === "" ? shadow : attachSheet(doc, shadow, css);
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

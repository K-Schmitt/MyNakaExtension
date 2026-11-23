// The overlay over Naka's player, where the end, pause and removal blocks draw. Its shadow root is
// closed, so the page's scripts cannot reach the block through the DOM. In fullscreen only the
// fullscreen element's subtree is drawn: the host moves into it (on Naka it is a div around the <video>)
// and back to body when it ends.

import type { DocLike, NodeLike, ShadowRootLike } from "./dom-like";
import { STOPPED_EVENTS, stopAtHost } from "./input-stop";
import { attachSheet } from "./sheet";

// The rating blocks sit on the right, at most 40% wide, from 7% to at most 76% of the height (top 7% plus
// max-height 69%). Naka's bars take 1.7-6.4% and 90.8-98.3% of the height, and its "Lire maintenant" next
// card starts at 77.5% (to 87%): the column ends above it (probes of 2026-11-22). Every declaration is
// !important: an author rule marked !important must not hide or fade the host.
const HOST_STYLE = [
  "all: initial",
  "color-scheme: dark",
  "position: fixed",
  "right: 0",
  "overflow: auto",
  "z-index: 2147483647",
  "top: 7%",
  "max-width: 40%",
  "max-height: 69%",
];
const HOST_CSS = HOST_STYLE.map((d) => `${d} !important;`).join(" ");

/** Watches Naka's panels; calls back with true when one opens, false when none is open; returns its stop. */
export type PanelWatch = (onChange: (open: boolean) => void) => () => void;

export const NO_PANELS: PanelWatch = () => () => {};

const HIDDEN_CSS = `${HOST_CSS} display: none !important;`;

function targetOf(doc: DocLike): NodeLike {
  return doc.fullscreenElement ?? doc.body;
}

export function createOverlayRoot(
  doc: DocLike,
  css: string,
  panels: PanelWatch,
): {
  root: ShadowRootLike;
  /** Puts the host back under its target when the page removed it; does nothing when it is there. */
  attach(): void;
} {
  const host = doc.createElement("div");
  host.style.cssText = HOST_CSS;
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
  panels((open) => {
    host.style.cssText = open ? HIDDEN_CSS : HOST_CSS;
  });
  return { root, attach };
}

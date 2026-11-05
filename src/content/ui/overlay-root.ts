// The one element the extension adds to a Naka page. Its shadow root is closed, so the page's scripts
// cannot reach the block through the DOM. In fullscreen only the fullscreen element's subtree is drawn:
// the host moves into it (on Naka it is a div around the <video>) and back to body when it ends.

import { valuesOf } from "../../ext/field-checks";
import type { DocLike, NodeLike, ShadowRootLike } from "./dom-like";

// Top right, at most 40% wide, never lower than 80% of the height (the bottom 20% is Naka's controls).
// Every declaration is !important: an author rule marked !important must not hide or fade the host.
const HOST_STYLE = [
  "all: initial",
  "position: fixed",
  "top: 0",
  "right: 0",
  "max-width: 40%",
  "max-height: 80%",
  "overflow: auto",
  "z-index: 2147483647",
];
const HOST_CSS = HOST_STYLE.map((d) => `${d} !important;`).join(" ");

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

export function createOverlayRoot(doc: DocLike): {
  root: ShadowRootLike;
  detach(): void;
} {
  const host = doc.createElement("div");
  host.style.cssText = HOST_CSS;
  for (const type of STOPPED_EVENTS) {
    host.addEventListener(type, (event) => event.stopPropagation());
  }
  const root = host.attachShadow({ mode: "closed" });
  const place = (): void => {
    targetOf(doc).appendChild(host);
  };
  place();
  doc.addEventListener("fullscreenchange", place);
  return {
    root,
    detach() {
      doc.removeEventListener("fullscreenchange", place);
      host.remove();
    },
  };
}

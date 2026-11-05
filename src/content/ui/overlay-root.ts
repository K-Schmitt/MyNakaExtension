// The one element the extension adds to a Naka page. Its shadow root is closed, so the page's scripts
// cannot reach the block through the DOM. In fullscreen only the fullscreen element's subtree is drawn:
// the host moves into it (on Naka it is a div around the <video>) and back to body when it ends.

import type { DocLike, NodeLike, ShadowRootLike } from "./dom-like";

// Top right, at most 40% wide, never lower than 80% of the height (the bottom 20% is Naka's controls).
const HOST_CSS =
  "all: initial; position: fixed; top: 0; right: 0; max-width: 40%; max-height: 80%; overflow: auto; z-index: 2147483647;";

function targetOf(doc: DocLike): NodeLike {
  return doc.fullscreenElement ?? doc.body;
}

export function createOverlayRoot(doc: DocLike): {
  root: ShadowRootLike;
  detach(): void;
} {
  const host = doc.createElement("div");
  host.style.cssText = HOST_CSS;
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

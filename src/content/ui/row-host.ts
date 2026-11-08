// The element the home row lives in: a section among Naka's rows, with a closed shadow root so that the
// page's scripts cannot reach the cards through the DOM. Made detached; the row keeper puts it in place.
// Every declaration is !important: an author rule marked !important must not hide or restyle the host.

import type { DocLike, ElementLike, ShadowRootLike } from "./dom-like";
import { attachSheet } from "./sheet";

const HOST_STYLE = ["all: initial", "display: block", "margin: 0 0 24px"]
  .map((d) => `${d} !important;`)
  .join(" ");

export function createRowHost(
  doc: DocLike,
  sheet: string,
): { host: ElementLike; root: ShadowRootLike } {
  const host = doc.createElement("section");
  host.style.cssText = HOST_STYLE;
  const root = attachSheet(doc, host.attachShadow({ mode: "closed" }), sheet);
  return { host, root };
}

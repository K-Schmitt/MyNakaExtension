// The element the home row lives in: a section among Naka's rows, with a closed shadow root so that the
// page's scripts cannot reach the cards through the DOM, and input on the cards stays out of the page.
// Made detached; the row keeper puts it in place. Every declaration is !important: an author rule
// marked !important must not hide or restyle the host. The reset also resets `color-scheme`, so the host
// sets it back to dark, as the player overlay does: native parts (a list's scrollbar) stay dark.

import type { DocLike, ElementLike, ShadowRootLike } from "./dom-like";
import { ROW_STOPPED_EVENTS, stopAtHost } from "./input-stop";
import { attachSheet } from "./sheet";

const ROW_DECLARATIONS = [
  "all: initial",
  "color-scheme: dark",
  "display: block",
  "margin: 0 0 24px",
];

/** A detached host of this tag and these declarations (each made !important), its closed root holding the sheet. */
export function createClosedHost(
  doc: Pick<DocLike, "createElement">,
  tag: string,
  declarations: readonly string[],
  sheet: string,
): { host: ElementLike; root: ShadowRootLike } {
  const host = doc.createElement(tag);
  host.style.cssText = declarations.map((d) => `${d} !important;`).join(" ");
  stopAtHost(host, ROW_STOPPED_EVENTS);
  const root = attachSheet(doc, host.attachShadow({ mode: "closed" }), sheet);
  return { host, root };
}

export function createRowHost(
  doc: DocLike,
  sheet: string,
): { host: ElementLike; root: ShadowRootLike } {
  return createClosedHost(doc, "section", ROW_DECLARATIONS, sheet);
}

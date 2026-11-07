// A stylesheet for the shadow root that survives `replaceChildren` redraws. Preferred: an adopted
// constructable sheet (outside the child list). Fallback: one <style> node the wrapper puts first.

import type { DocLike, NodeLike, ShadowRootLike } from "./dom-like";

export type SheetMaker = (css: string) => unknown | undefined;

export const defaultSheetMaker: SheetMaker = (css) => {
  const Ctor = (globalThis as { CSSStyleSheet?: new () => CSSStyleSheet })
    .CSSStyleSheet;
  if (Ctor === undefined) return undefined;
  try {
    const sheet = new Ctor();
    sheet.replaceSync(css);
    return sheet;
  } catch {
    return undefined;
  }
};

function withStyleNode(root: ShadowRootLike, style: NodeLike): ShadowRootLike {
  return {
    appendChild: (child) => root.appendChild(child),
    replaceChildren: (...nodes) => root.replaceChildren(style, ...nodes),
  };
}

export function attachSheet(
  doc: Pick<DocLike, "createElement">,
  root: ShadowRootLike,
  css: string,
  make: SheetMaker = defaultSheetMaker,
): ShadowRootLike {
  const sheet = make(css);
  if (sheet !== undefined) {
    root.adoptedStyleSheets = [sheet];
    return root;
  }
  const style = doc.createElement("style");
  style.textContent = css;
  root.replaceChildren(style);
  return withStyleNode(root, style);
}

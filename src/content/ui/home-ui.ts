// Where the home panel draws: its own overlay root, bottom right, made on the first show so that a page
// that never has a panel gets no element from the extension. Before every draw the host is put back if
// the page removed it.

import { BLOCK_SHEET } from "./block-styles";
import type { DocLike } from "./dom-like";
import type { HomeHandlers } from "./home-block";
import { renderHome } from "./home-render";
import type { HomeView } from "./home-view";
import { createOverlayRoot } from "./overlay-root";

export function createHomeUi(doc: DocLike) {
  let overlay: ReturnType<typeof createOverlayRoot> | undefined;
  return {
    show(view: HomeView, handlers: HomeHandlers): void {
      overlay ??= createOverlayRoot(doc, "bottom-right", BLOCK_SHEET);
      overlay.attach();
      renderHome(doc, overlay.root, view, handlers);
    },
    hide(): void {
      overlay?.root.replaceChildren();
    },
  };
}

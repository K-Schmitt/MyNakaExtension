// The panel keeper's ports over the title page: the anchor is Naka's info panel (`div.dca-panel` in
// `aside.dcf-aside`), and the host's place is right after it. The row keeper's rule serves as is, the
// info panel standing for its anchor row: right after it is "keep", anywhere else moves it there. Without
// the info panel, nothing is placed. Moving the host where it already is does nothing, so the keeper
// cannot loop on its own insertion.

import type { EndTimer } from "./end-poll";
import type { KeeperPorts } from "./row-keeper";
import { REPRENDRE_WAIT_MS } from "./row-place";

const INFO_PANEL = "aside.dcf-aside div.dca-panel";

/** Watches the page for a redraw: a box's rewritten code is a text change. */
export function watchPage(doc: Document, onChange: () => void): () => void {
  const observer = new MutationObserver(() => onChange());
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return () => observer.disconnect();
}

export function createPanelPorts(
  doc: Document,
  host: HTMLElement,
  timer: EndTimer,
): KeeperPorts {
  return {
    snapshot() {
      const panel = doc.querySelector(INFO_PANEL);
      const siblings = [...(panel?.parentElement?.children ?? [])];
      if (panel === null || siblings.length === 0) return undefined;
      return {
        reprendre: siblings.indexOf(panel),
        host: siblings.indexOf(host),
        age: REPRENDRE_WAIT_MS,
      };
    },
    apply() {
      const panel = doc.querySelector(INFO_PANEL);
      if (panel !== null && panel.nextElementSibling !== host) {
        panel.after(host);
      }
    },
    detach() {
      host.remove();
    },
    watch: (onChange) => watchPage(doc, onChange),
    timer,
  };
}

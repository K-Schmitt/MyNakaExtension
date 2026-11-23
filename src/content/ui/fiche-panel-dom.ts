// The keepers' ports over Naka's « À propos » facts (`dl.nh-fiche-facts` in `section.nh-fiche-about`): our
// two rows stay its last children, in order, and the actions host stays right after it. The row keeper's
// rule serves as is: for the rows, Naka's last fact stands for its anchor; for the actions, the list does. Without the panel,
// nothing is placed. Putting a part where it already is does nothing, so a keeper cannot loop on its own
// insertion. Written against the slice of the DOM they use, so tests drive them on fakes.

import type { ElementLike } from "./dom-like";
import type { EndTimer } from "./end-poll";
import type { KeeperPorts } from "./row-keeper";
import { REPRENDRE_WAIT_MS } from "./row-place";

export type PanelElement = {
  readonly children: Iterable<object>;
  readonly parentElement: { readonly children: Iterable<object> } | null;
  readonly nextElementSibling: object | null;
  after(node: ElementLike): void;
  append(...nodes: ElementLike[]): void;
};

export type PanelPlace = {
  /** Naka's « À propos » facts, or null when the page shows none. */
  panel(): PanelElement | null;
  watch(onChange: () => void): () => void;
  timer: EndTimer;
};

export function actionsPorts(
  place: PanelPlace,
  host: ElementLike,
): KeeperPorts {
  return {
    snapshot() {
      const panel = place.panel();
      const siblings = [...(panel?.parentElement?.children ?? [])];
      if (panel === null || siblings.length === 0) return undefined;
      return {
        reprendre: siblings.indexOf(panel),
        host: siblings.indexOf(host),
        age: REPRENDRE_WAIT_MS,
      };
    },
    apply() {
      const panel = place.panel();
      if (panel !== null && panel.nextElementSibling !== host)
        panel.after(host);
    },
    detach() {
      host.remove();
    },
    watch: place.watch,
    timer: place.timer,
  };
}

/** The index of the first row when all of them follow each other in order, else -1. */
function rowsAt(children: object[], rows: readonly ElementLike[]): number {
  const first = children.indexOf(rows[0] as object);
  const inOrder = rows.every((row, i) => children[first + i] === row);
  return first >= 0 && inOrder ? first : -1;
}

export function rowsPorts(
  place: PanelPlace,
  rows: readonly ElementLike[],
): KeeperPorts {
  const ours = new Set<object>(rows);
  return {
    snapshot() {
      const panel = place.panel();
      if (panel === null) return undefined;
      const children = [...panel.children];
      return {
        reprendre: children.findLastIndex((child) => !ours.has(child)),
        host: rowsAt(children, rows),
        age: REPRENDRE_WAIT_MS,
      };
    },
    apply() {
      place.panel()?.append(...rows);
    },
    detach() {
      for (const row of rows) row.remove();
    },
    watch: place.watch,
    timer: place.timer,
  };
}

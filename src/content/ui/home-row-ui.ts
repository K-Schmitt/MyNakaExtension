// Where the home cards draw: a row of their own among Naka's rows, under « Reprendre la lecture ». The
// host is made on the first show, so that a page that never has cards gets no element from the
// extension; the keeper puts it back in place whenever Naka rebuilds its list. The page's parts come in
// through ports (home-row-page.ts binds them), so that the show/hide chain runs on test fakes.

import type { SizeWatch } from "./carousel";
import type { DocLike, ElementLike } from "./dom-like";
import type { HomeHandlers } from "./home-block";
import type { HomeView } from "./home-view";
import { createRowHost } from "./row-host";
import { createRowKeeper, type KeeperPorts } from "./row-keeper";
import { renderRow } from "./row-render";
import { ROW_SHEET } from "./row-styles";

export type HomeRowPorts = {
  doc: DocLike;
  /** The keeper's ports over the page's list, for the host just made. */
  keeper(host: ElementLike): KeeperPorts;
  watchSize: SizeWatch;
  /** Whether the system asks for reduced motion, now. */
  reducedMotion(): boolean;
};

function createRow(ports: HomeRowPorts) {
  const { host, root } = createRowHost(ports.doc, ROW_SHEET);
  return { root, keeper: createRowKeeper(ports.keeper(host)) };
}

export function createHomeRowUi(ports: HomeRowPorts): {
  show(view: HomeView, handlers: HomeHandlers): void;
  hide(): void;
} {
  let row: ReturnType<typeof createRow> | undefined;
  return {
    show(view, handlers) {
      row ??= createRow(ports);
      renderRow(ports.doc, row.root, view, handlers, {
        watchSize: ports.watchSize,
        reducedMotion: ports.reducedMotion,
      });
      row.keeper.start();
    },
    hide() {
      row?.root.replaceChildren();
      row?.keeper.stop();
    },
  };
}

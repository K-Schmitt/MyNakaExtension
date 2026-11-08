// Where the home cards draw: a row of their own among Naka's rows, under « Reprendre la lecture ». The
// host is made on the first show, so that a page that never has cards gets no element from the
// extension; the keeper puts it back in place whenever Naka rebuilds its list.

import type { HomeHandlers } from "./home-block";
import { createRowPorts } from "./home-row-dom";
import type { HomeView } from "./home-view";
import { createRowHost } from "./row-host";
import { createRowKeeper } from "./row-keeper";
import { renderRow } from "./row-render";
import { ROW_SHEET } from "./row-styles";

const pageTimer = {
  set: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clear: (handle: unknown) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function createRow(doc: Document) {
  const { host, root } = createRowHost(doc, ROW_SHEET);
  // The real document made it, so it is a real element: the DOM binding moves it among Naka's rows.
  const element = host as unknown as HTMLElement;
  const keeper = createRowKeeper(
    createRowPorts(doc, element, pageTimer, () => performance.now()),
  );
  return { root, keeper };
}

export function createHomeRowUi(doc: Document): {
  show(view: HomeView, handlers: HomeHandlers): void;
  hide(): void;
} {
  let row: ReturnType<typeof createRow> | undefined;
  return {
    show(view, handlers) {
      row ??= createRow(doc);
      renderRow(doc, row.root, view, handlers);
      row.keeper.start();
    },
    hide() {
      row?.root.replaceChildren();
      row?.keeper.stop();
    },
  };
}

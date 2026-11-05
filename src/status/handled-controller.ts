// The « Titres traités » list without the DOM: it asks the worker, shows the view, and sends « Oublier ».
// A forgotten title leaves the list at once; the next load shows what the worker holds (its job may still
// wait behind a sync).

import { idsOfKey } from "../core/finish-event";
import type { ToWorker } from "../ext/messages";
import {
  type HandledItem,
  type HandledView,
  toHandledView,
  viewOf,
} from "./handled-view";

export type HandledPorts = {
  send(message: ToWorker): Promise<unknown>;
  show(view: HandledView): void;
};

export type HandledController = {
  load(): Promise<void>;
  forget(key: string): Promise<void>;
};

async function ask(ports: HandledPorts): Promise<HandledView> {
  try {
    return toHandledView(await ports.send({ type: "handled-titles" }));
  } catch {
    return { kind: "none" };
  }
}

async function sendQuietly(ports: HandledPorts, message: ToWorker) {
  try {
    await ports.send(message);
  } catch {
    // The next load tells what the worker holds.
  }
}

export function createHandledController(
  ports: HandledPorts,
): HandledController {
  let items: HandledItem[] = [];
  const sending = new Set<string>();

  function display(view: HandledView): void {
    items = view.kind === "list" ? view.items : [];
    ports.show(view);
  }

  async function forget(key: string): Promise<void> {
    const ids = idsOfKey(key);
    if (ids === undefined || sending.has(key)) return;
    if (!items.some((item) => item.key === key)) return;
    sending.add(key);
    try {
      await sendQuietly(ports, { type: "forget-handled", ...ids });
    } finally {
      sending.delete(key);
    }
    display(viewOf(items.filter((item) => item.key !== key)));
  }

  return {
    load: async () => display(await ask(ports)),
    forget,
  };
}

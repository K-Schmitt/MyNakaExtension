// The « Titres traités » list without the DOM: it asks the worker, shows the view, and sends « Oublier » and « Annuler ».
// A forgotten title leaves the list at once; the next load shows what the worker holds (its job may still
// wait behind a sync). Only the latest load is shown, and a failed read after a good one keeps the list on
// screen (a worker restart is not an empty list), as the lists controller does.

import { idsOfKey } from "../core/finish-event";
import type { ToWorker } from "../ext/messages";
import {
  cancellingOf,
  type HandledItem,
  type HandledView,
  toHandledView,
  viewOf,
} from "./handled-view";
import { type PageTimer, POLL_MS } from "./page-timer";

export type HandledPorts = {
  send(message: ToWorker): Promise<unknown>;
  show(view: HandledView): void;
  /** A cancel settled: the question it puts back may be on the lists. */
  cancelled?(): void;
  timer?: PageTimer;
};

export type HandledController = {
  load(): Promise<void>;
  forget(key: string): Promise<void>;
  cancel(key: string): Promise<void>;
};

/** The worker's list, or undefined when the send rejected. */
async function ask(ports: HandledPorts): Promise<HandledView | undefined> {
  try {
    return toHandledView(await ports.send({ type: "handled-titles" }));
  } catch {
    return undefined;
  }
}

async function sendQuietly(ports: HandledPorts, message: ToWorker) {
  try {
    await ports.send(message);
  } catch {
    // The next load tells what the worker holds.
  }
}

// The cancel is acked while its job still waits in the worker's queue: ask again until the key leaves the
// `cancelling` set, so that whatever follows sees the state the job saved. A failed read ends the wait.
async function untilRun(ports: HandledPorts, key: string): Promise<void> {
  const { timer } = ports;
  if (timer === undefined) return;
  for (;;) {
    let raw: unknown;
    try {
      raw = await ports.send({ type: "handled-titles" });
    } catch {
      return;
    }
    if (!cancellingOf(raw).includes(key)) return;
    await new Promise<void>((resolve) => timer.set(resolve, POLL_MS));
  }
}

function without(lines: HandledItem[], key: string): HandledItem[] {
  return lines.filter((item) => item.key !== key);
}

export function createHandledController(
  ports: HandledPorts,
): HandledController {
  let items: HandledItem[] = [];
  let waiting: HandledItem[] = [];
  const sending = new Set<string>();
  let loads = 0;
  let loaded = false;

  function display(view: HandledView): void {
    items = view.kind === "list" ? view.items : [];
    waiting = view.kind === "list" ? view.waiting : [];
    ports.show(view);
  }

  async function load(): Promise<void> {
    loads += 1;
    const mine = loads;
    const view = await ask(ports);
    if (mine !== loads) return;
    if (view === undefined && loaded) return;
    loaded ||= view !== undefined;
    display(view ?? { kind: "none" });
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
    display(viewOf(without(items, key), waiting));
  }

  async function cancel(key: string): Promise<void> {
    const ids = idsOfKey(key);
    if (ids === undefined || sending.has(key)) return;
    if (!waiting.some((item) => item.key === key)) return;
    sending.add(key);
    try {
      await sendQuietly(ports, { type: "cancel-retry", ...ids });
    } finally {
      sending.delete(key);
    }
    display(viewOf(items, without(waiting, key)));
    await untilRun(ports, key);
    ports.cancelled?.();
  }

  return {
    load,
    forget,
    cancel,
  };
}

// The page's behaviour without the DOM: load, show, and the two buttons. Everything outside goes through Ports.

import type { ToWorker } from "../ext/messages";
import type { Mode } from "../ext/settings";
import type { StatusFormat } from "./status-format";
import {
  confirmText,
  LOADING_VIEW,
  type StatusView,
  toStatusView,
} from "./status-view";

export type Ports = {
  send(message: ToWorker): Promise<unknown>;
  confirm(text: string): boolean;
  show(view: StatusView): void;
  setBusy(busy: boolean): void;
  format: StatusFormat;
};

export type Controller = {
  load(): Promise<void>;
  resync(): Promise<void>;
  toggleMode(): Promise<void>;
};

// A rejected send (worker restarted, port closed) is an absent answer, which the view model words.
async function askStatus(ports: Ports): Promise<unknown> {
  try {
    return await ports.send({ type: "status" });
  } catch {
    return undefined;
  }
}

async function sendQuietly(ports: Ports, message: ToWorker): Promise<void> {
  try {
    await ports.send(message);
  } catch {
    // The answer to the next `status` tells what happened.
  }
}

export function createController(ports: Ports): Controller {
  let busy = false;
  let current: StatusView = LOADING_VIEW;

  async function reload(): Promise<void> {
    ports.show(LOADING_VIEW);
    current = toStatusView(await askStatus(ports), ports.format);
    ports.show(current);
  }

  // One action at a time: a click during an answer is ignored, and the buttons are disabled meanwhile.
  async function exclusive(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    ports.setBusy(true);
    try {
      await action();
    } finally {
      busy = false;
      ports.setBusy(false);
    }
  }

  async function switchTo(mode: Mode): Promise<void> {
    await sendQuietly(ports, { type: "set-mode", mode });
    await reload();
  }

  async function toggle(): Promise<void> {
    if (current.kind !== "ready" || current.mode === undefined) return;
    if (current.mode === "live") return switchTo("simulation");
    if (!ports.confirm(confirmText(current.previewCount))) return;
    return switchTo("live");
  }

  return {
    load: () => exclusive(reload),
    resync: () =>
      exclusive(async () => {
        await sendQuietly(ports, { type: "resync" });
        await reload();
      }),
    toggleMode: () => exclusive(toggle),
  };
}

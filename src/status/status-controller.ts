// The page's behaviour without the DOM: load, show, the two buttons, and the polls while the engine works.
// Everything outside goes through Ports.

import type { ToWorker } from "../ext/messages";
import type { Mode } from "../ext/settings";
import {
  SETTINGS_COPY,
  type SettingsDraft,
  type SettingsValues,
  sameValues,
  settingsMessage,
} from "./settings-view";
import type { StatusFormat } from "./status-format";
import { confirmText } from "./status-mode-copy";
import { LOADING_VIEW, type StatusView, toStatusView } from "./status-view";

// While a job runs or a mode change waits, the page asks again this often (Ruling 20).
export const POLL_MS = 5000;

export type PageTimer = {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

export type FocusTarget = "resync" | "switch" | "headline";

export type Ports = {
  send(message: ToWorker): Promise<unknown>;
  confirm(text: string): boolean;
  show(view: StatusView): void;
  setBusy(busy: boolean): void;
  focus(target: FocusTarget): void;
  /** The line under the settings (« Réglages enregistrés »), or "" for none. */
  note(text: string): void;
  format: StatusFormat;
  timer: PageTimer;
};

export type Controller = {
  load(): Promise<void>;
  resync(): Promise<void>;
  toggleMode(): Promise<void>;
  saveSettings(draft: SettingsDraft): Promise<void>;
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

const inProgress = (view: StatusView): boolean =>
  view.kind === "ready" && view.inProgress;

// The pressed button, unless the view now hides it: the switch shows only with a known mode.
function focusTarget(pressed: "resync" | "switch", view: StatusView) {
  const shown = view.kind === "ready" && view.switchLabel !== undefined;
  return pressed === "switch" && !shown ? "headline" : pressed;
}

export function createController(ports: Ports): Controller {
  let busy = false;
  let current: StatusView = LOADING_VIEW;
  let asked = 0;
  let poll: unknown;
  // The values of the last save, until an answer settles them (saved or not).
  let awaiting: SettingsValues | undefined;

  // One poll armed at most, and only while the engine works.
  function schedule(view: StatusView): void {
    if (poll !== undefined) ports.timer.clear(poll);
    poll = undefined;
    if (!inProgress(view)) return;
    poll = ports.timer.set(() => {
      poll = undefined;
      if (!busy) void refresh();
    }, POLL_MS);
  }

  // The line under the settings follows the answers. While the worker holds the change the values shown may
  // be the old ones: it is « saved » only once the marker is gone and the answer carries the saved values.
  function announce(view: StatusView): void {
    if (view.kind !== "ready" || view.settings === undefined) {
      awaiting = undefined;
      ports.note("");
      return;
    }
    if (view.settingsPending) {
      ports.note(SETTINGS_COPY.waiting);
      return;
    }
    if (awaiting === undefined) return;
    const kept = sameValues(view.settings.values, awaiting);
    awaiting = undefined;
    ports.note(kept ? SETTINGS_COPY.saved : "");
  }

  // Only the answer to the latest question is shown: an older one arriving late is dropped.
  // It returns the view it showed, or nothing when a newer question took over.
  async function refresh(): Promise<StatusView | undefined> {
    asked += 1;
    const question = asked;
    const view = toStatusView(await askStatus(ports), ports.format);
    if (question !== asked) return undefined;
    current = view;
    ports.show(view);
    announce(view);
    schedule(view);
    return view;
  }

  async function reload(): Promise<void> {
    ports.show(LOADING_VIEW);
    await refresh();
  }

  // One action at a time: a click during an answer is ignored, and the buttons are disabled meanwhile. A
  // poll due meanwhile asks nothing: the action's own answer arms the next one. Disabling the pressed
  // button drops its focus, so it gets it back once the buttons are enabled again (Ruling 19).
  async function exclusive(
    action: () => Promise<void>,
    pressed?: "resync" | "switch",
  ): Promise<void> {
    if (busy) return;
    busy = true;
    ports.setBusy(true);
    try {
      await action();
    } finally {
      busy = false;
      ports.setBusy(false);
      if (pressed !== undefined) ports.focus(focusTarget(pressed, current));
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

  // One question after the send shows the marker and arms the poll; the answers that follow settle the note.
  async function save(draft: SettingsDraft): Promise<void> {
    const message = settingsMessage(draft);
    if (message?.type !== "set-settings") return;
    awaiting = {
      ...message.thresholds,
      pauseFromPercent: message.pauseFromPercent,
    };
    await sendQuietly(ports, message);
    await refresh();
  }

  return {
    load: () => exclusive(reload),
    resync: () =>
      exclusive(async () => {
        await sendQuietly(ports, { type: "resync" });
        await reload();
      }, "resync"),
    toggleMode: () => exclusive(toggle, "switch"),
    saveSettings: (draft) => exclusive(() => save(draft)),
  };
}

// The status page's entry: binds the controller to the DOM, `chrome.runtime`, `window.confirm` and the clock.
// Everything shown goes through textContent: titles are remote catalogue text.

import { createHandledController } from "./handled-controller";
import { showHandled } from "./handled-dom";
import { createListsController } from "./lists-controller";
import { showLists } from "./lists-dom";
import {
  markEdited,
  markSaved,
  readDraft,
  showNote,
  showSettings,
  syncForm,
} from "./settings-dom";
import { createController, type FocusTarget } from "./status-controller";
import { localFormat } from "./status-format";
import { focusIdFor, tabFromHash } from "./status-tabs";
import { mountTabs } from "./status-tabs-dom";
import type { StatusView } from "./status-view";
import { createSyncEnd } from "./sync-end";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`status.html: missing #${id}`);
  return found as T;
}

function fill(list: HTMLElement, texts: string[]): void {
  list.replaceChildren(
    ...texts.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    }),
  );
}

// Whether an action is under way: the save button stays disabled meanwhile.
let busyNow = false;
// Whether the shown view says a mode change waits: the switch stays disabled meanwhile.
let switchLocked = false;
// Whether the shown view says a forget or a reset waits: both buttons stay disabled meanwhile.
let actionsLocked = false;

function syncSwitch(): void {
  element<HTMLButtonElement>("switch").disabled = busyNow || switchLocked;
}

function syncActions(): void {
  for (const id of ["forget", "reset"]) {
    element<HTMLButtonElement>(id).disabled = busyNow || actionsLocked;
  }
}

function render(view: StatusView): void {
  syncEnd.see(view);
  const ready = view.kind === "ready";
  showSettings(ready ? view.settings : undefined, busyNow);
  element("headline").textContent = ready ? view.headline : view.message;
  fill(element("lines"), ready ? view.lines : []);
  fill(element("preview"), ready ? view.preview : []);
  element("preview-section").hidden = !ready || view.preview.length === 0;
  fill(element("next"), ready ? view.next : []);
  element("next-section").hidden = !ready || view.next.length === 0;
  const toggle = element<HTMLButtonElement>("switch");
  toggle.hidden = !ready || view.mode === undefined;
  toggle.setAttribute("aria-checked", String(ready && view.simulationOn));
  const firstRun = element("first-run");
  firstRun.textContent = ready ? (view.firstRunLine ?? "") : "";
  firstRun.hidden = firstRun.textContent === "";
  switchLocked = ready && view.switchDisabled;
  syncSwitch();
  // Also shown on an unreadable state: the reset is the repair.
  element("data").hidden = !ready;
  actionsLocked = ready && view.actionsDisabled;
  syncActions();
}

// The pressed button gets its focus back; the headline takes it when that button is hidden (tabindex -1 in
// status.html), and the selected tab when the target sits in the other panel.
function focus(target: FocusTarget): void {
  element(focusIdFor(target, tabFromHash(window.location.hash))).focus();
}

function setBusy(busy: boolean): void {
  busyNow = busy;
  syncForm(busy);
  element<HTMLButtonElement>("resync").disabled = busy;
  syncSwitch();
  syncActions();
  element("status").setAttribute("aria-busy", String(busy));
}

const timer = {
  set: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clear: (handle: unknown) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

// The lists follow the sync the page shows as finished (or the reset, or the forget): both are asked again.
const syncEnd = createSyncEnd(
  () => void Promise.all([handled.load(), lists.load()]),
);

const controller = createController({
  send: (message) => chrome.runtime.sendMessage(message),
  confirm: (text) => window.confirm(text),
  show: render,
  setBusy,
  focus,
  note: showNote,
  format: localFormat(),
  timer,
});

const handled = createHandledController({
  send: (message) => chrome.runtime.sendMessage(message),
  show: (view) =>
    showHandled(
      view,
      (key) => void handled.forget(key),
      (key) => void handled.cancel(key),
    ),
  cancelled: () => void lists.load(),
  timer,
});

// The search field of a row just opened takes the focus on the next draw.
let focusKey: string | undefined;

const lists = createListsController({
  send: (message) => chrome.runtime.sendMessage(message),
  timer,
  show: (view) => {
    showLists(
      view,
      {
        onAction: (key, action) => {
          if (action.kind === "open-search") focusKey = key;
          void lists.act(key, action);
        },
        onType: (key, text) => lists.type(key, text),
      },
      focusKey,
    );
    focusKey = undefined;
  },
  answered: () => void handled.load(),
});

// Both lists are asked again once the click is answered; syncEnd asks them again when the poll sees the
// sync end, the read that shows what the sync changed.
element("resync").addEventListener(
  "click",
  () =>
    void controller
      .resync()
      .then(() => Promise.all([handled.load(), lists.load()])),
);
element("switch").addEventListener("click", () => void controller.toggleMode());
element("forget").addEventListener(
  "click",
  () => void controller.forgetBinding(),
);
element("reset").addEventListener("click", () => void controller.reset());
function onFormEdit(): void {
  markEdited();
  showNote("");
  syncForm(busyNow);
}

for (const id of [
  "film-threshold",
  "episode-threshold",
  "pause-any",
  "pause-from",
]) {
  element(id).addEventListener("change", onFormEdit);
}
element("pause-text").addEventListener("input", onFormEdit);
element("save-settings").addEventListener("click", () => {
  markSaved();
  void controller.saveSettings(readDraft());
});
mountTabs(document, window);
void controller.load();
void handled.load();
void lists.load();

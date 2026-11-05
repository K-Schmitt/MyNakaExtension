// The status page's entry: binds the controller to the DOM, `chrome.runtime`, `window.confirm` and the clock.
// Everything shown goes through textContent: titles are remote catalogue text.

import { readDraft, showNote, showSettings, syncForm } from "./settings-dom";
import { createController, type FocusTarget } from "./status-controller";
import { localFormat } from "./status-format";
import type { StatusView } from "./status-view";

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

function syncSwitch(): void {
  element<HTMLButtonElement>("switch").disabled = busyNow || switchLocked;
}

function render(view: StatusView): void {
  const ready = view.kind === "ready";
  showSettings(ready ? view.settings : undefined, busyNow);
  element("headline").textContent = ready ? view.headline : view.message;
  fill(element("lines"), ready ? view.lines : []);
  fill(element("preview"), ready ? view.preview : []);
  element("preview-section").hidden = !ready || view.preview.length === 0;
  const toggle = element<HTMLButtonElement>("switch");
  toggle.hidden = !ready || view.switchLabel === undefined;
  toggle.textContent = ready ? (view.switchLabel ?? "") : "";
  switchLocked = ready && view.switchDisabled;
  syncSwitch();
}

// The headline takes the focus when the pressed button is hidden (tabindex -1 in status.html).
function focus(target: FocusTarget): void {
  element(target).focus();
}

function setBusy(busy: boolean): void {
  busyNow = busy;
  syncForm(busy);
  element<HTMLButtonElement>("resync").disabled = busy;
  syncSwitch();
  element("status").setAttribute("aria-busy", String(busy));
}

const controller = createController({
  send: (message) => chrome.runtime.sendMessage(message),
  confirm: (text) => window.confirm(text),
  show: render,
  setBusy,
  focus,
  note: showNote,
  format: localFormat(),
  timer: {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
});

element("resync").addEventListener("click", () => void controller.resync());
element("switch").addEventListener("click", () => void controller.toggleMode());
function onFormEdit(): void {
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
element("save-settings").addEventListener(
  "click",
  () => void controller.saveSettings(readDraft()),
);
void controller.load();

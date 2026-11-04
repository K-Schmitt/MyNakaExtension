// The status page's entry: binds the controller to the DOM, `chrome.runtime`, `window.confirm` and the clock.
// Everything shown goes through textContent: titles are remote catalogue text.

import { createController } from "./status-controller";
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

function render(view: StatusView): void {
  const ready = view.kind === "ready";
  element("headline").textContent = ready ? view.headline : view.message;
  fill(element("lines"), ready ? view.lines : []);
  fill(element("preview"), ready ? view.preview : []);
  element("preview-section").hidden = !ready || view.preview.length === 0;
  const toggle = element<HTMLButtonElement>("switch");
  toggle.hidden = !ready || view.switchLabel === undefined;
  toggle.textContent = ready ? (view.switchLabel ?? "") : "";
}

function setBusy(busy: boolean): void {
  element<HTMLButtonElement>("resync").disabled = busy;
  element<HTMLButtonElement>("switch").disabled = busy;
  element("status").setAttribute("aria-busy", String(busy));
}

const controller = createController({
  send: (message) => chrome.runtime.sendMessage(message),
  confirm: (text) => window.confirm(text),
  show: render,
  setBusy,
  format: localFormat(),
  timer: {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
});

element("resync").addEventListener("click", () => void controller.resync());
element("switch").addEventListener("click", () => void controller.toggleMode());
void controller.load();

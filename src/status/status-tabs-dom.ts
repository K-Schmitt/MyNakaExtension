// Binds the tab buttons and panels of status.html. The ports below are the slice of the DOM used: the real
// `document` and the fakes of the tests both satisfy them. `hidden` goes through the attribute for that reason.

import { TAB_IDS, type TabId, tabAfterKey, tabFromHash } from "./status-tabs";

export type TabEvent = { key?: string; preventDefault(): void };

export interface TabElement {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: (event: TabEvent) => void): void;
  focus(): void;
}

export interface TabDoc {
  getElementById(id: string): TabElement | null;
}

export type TabWindow = { location: { hash: string } };

function byId(doc: TabDoc, id: string): TabElement {
  const found = doc.getElementById(id);
  if (found === null) throw new Error(`status.html: missing #${id}`);
  return found;
}

function show(doc: TabDoc, active: TabId): void {
  for (const id of TAB_IDS) {
    const selected = id === active;
    const tab = byId(doc, `tab-${id}`);
    tab.setAttribute("aria-selected", String(selected));
    tab.setAttribute("tabindex", selected ? "0" : "-1");
    const panel = byId(doc, `panel-${id}`);
    if (selected) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "");
  }
}

function select(doc: TabDoc, win: TabWindow, id: TabId): void {
  show(doc, id);
  win.location.hash = id === "reglages" ? "#reglages" : "";
}

function bindTab(doc: TabDoc, win: TabWindow, id: TabId): void {
  const tab = byId(doc, `tab-${id}`);
  tab.addEventListener("click", () => select(doc, win, id));
  tab.addEventListener("keydown", (event) => {
    const next = tabAfterKey(id, event.key ?? "");
    if (next === undefined) return;
    event.preventDefault();
    select(doc, win, next);
    byId(doc, `tab-${next}`).focus();
  });
}

export function mountTabs(doc: TabDoc, win: TabWindow): void {
  show(doc, tabFromHash(win.location.hash));
  for (const id of TAB_IDS) bindTab(doc, win, id);
}

// The two sections bound to the DOM: they draw the rows of the view and report the pressed buttons and the
// typed search text. No logic of its own. Titles are remote text: textContent and setAttribute only.

import type { QuestionKey } from "../core/questions";
import {
  LISTS_COPY,
  type ListRow,
  type ListsView,
  type RowAction,
  type RowButton,
} from "./lists-view";

export type ListsHandlers = {
  onAction(key: QuestionKey, action: RowAction): void;
  onType(key: QuestionKey, text: string): void;
};

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`status.html: missing #${id}`);
  return found as T;
}

function text(tag: "p" | "span", content: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = content;
  return node;
}

function button(
  spec: RowButton,
  key: QuestionKey,
  on: ListsHandlers,
): HTMLElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = spec.label;
  if (spec.aria !== undefined) node.setAttribute("aria-label", spec.aria);
  node.addEventListener("click", () => on.onAction(key, spec.action));
  return node;
}

function field(
  key: QuestionKey,
  query: string,
  on: ListsHandlers,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 200;
  input.value = query;
  input.dataset.key = key;
  input.setAttribute("aria-label", LISTS_COPY.field);
  input.addEventListener("input", () => on.onType(key, input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    on.onType(key, input.value);
    on.onAction(key, { kind: "search" });
  });
  return input;
}

function searchBox(row: ListRow, on: ListsHandlers): HTMLElement | undefined {
  const view = row.search;
  if (view === undefined) return undefined;
  const box = document.createElement("div");
  const submit = button(
    { label: LISTS_COPY.submit, action: { kind: "search" } },
    row.key,
    on,
  );
  box.append(field(row.key, view.query, on), " ", submit);
  if (view.fieldError !== undefined) box.append(text("p", view.fieldError));
  if (view.message !== undefined) box.append(text("p", view.message));
  const results = document.createElement("ul");
  for (const found of view.results) {
    const item = document.createElement("li");
    item.append(
      text("span", found.label),
      " ",
      button(found.relier, row.key, on),
    );
    results.append(item);
  }
  box.append(results);
  return box;
}

function line(row: ListRow, on: ListsHandlers): HTMLElement {
  const item = document.createElement("li");
  item.append(text("p", row.heading));
  if (row.question !== undefined) item.append(text("p", row.question));
  for (const content of row.lines) item.append(text("p", content));
  const buttons = document.createElement("p");
  for (const spec of row.buttons)
    buttons.append(button(spec, row.key, on), " ");
  item.append(buttons);
  const box = searchBox(row, on);
  if (box !== undefined) item.append(box);
  return item;
}

function fill(
  sectionId: string,
  listId: string,
  rows: ListRow[],
  on: ListsHandlers,
): void {
  element(sectionId).hidden = rows.length === 0;
  element(listId).replaceChildren(...rows.map((row) => line(row, on)));
}

// The field that had the focus keeps it across a redraw; a search just opened takes it.
function focusedKey(): string | undefined {
  const active = document.activeElement;
  return active instanceof HTMLInputElement ? active.dataset.key : undefined;
}

export function showLists(
  view: ListsView,
  on: ListsHandlers,
  focusKey?: QuestionKey,
): void {
  const had = focusKey ?? focusedKey();
  element("lists-note").textContent = view.note;
  fill("questions", "questions-list", view.questions, on);
  fill("unlinked", "unlinked-list", view.unlinked, on);
  if (had === undefined) return;
  const input = [
    ...document.querySelectorAll<HTMLInputElement>("#unlinked-list input"),
  ].find((i) => i.dataset.key === had);
  input?.focus();
}

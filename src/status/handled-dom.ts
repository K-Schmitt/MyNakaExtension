// The « Titres traités » section bound to the DOM: it fills the folded list from the view and reports the
// pressed « Oublier » and « Annuler ». No logic of its own. Titles are remote text: textContent and setAttribute only.

import {
  HANDLED_COPY,
  type HandledItem,
  type HandledView,
} from "./handled-view";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`status.html: missing #${id}`);
  return found as T;
}

function line(item: HandledItem, onForget: (key: string) => void): HTMLElement {
  const row = document.createElement("li");
  const label = document.createElement("span");
  label.textContent = item.label;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = HANDLED_COPY.forget;
  button.setAttribute("aria-label", `${HANDLED_COPY.forget} ${item.label}`);
  button.addEventListener("click", () => onForget(item.key));
  row.append(label, " ", button);
  return row;
}

function waitingLine(
  item: HandledItem,
  onCancel: (key: string) => void,
): HTMLElement {
  const row = document.createElement("li");
  const label = document.createElement("span");
  label.textContent = `${item.label} \u2014 ${HANDLED_COPY.waiting}`;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = HANDLED_COPY.cancel;
  button.setAttribute("aria-label", `${HANDLED_COPY.cancel} ${item.label}`);
  button.addEventListener("click", () => onCancel(item.key));
  row.append(label, " ", button);
  return row;
}

export function showHandled(
  view: HandledView,
  onForget: (key: string) => void,
  onCancel: (key: string) => void,
): void {
  element("handled").hidden = view.kind === "none";
  if (view.kind === "none") {
    element("handled-list").replaceChildren();
    return;
  }
  element("handled-heading").textContent = view.heading;
  element("handled-list").replaceChildren(
    ...view.waiting.map((item) => waitingLine(item, onCancel)),
    ...view.items.map((item) => line(item, onForget)),
  );
}

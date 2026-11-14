// A click the page's scripts made up (dispatchEvent, el.click()) has isTrusted false: it never acts.

import type { ClickEvent, ElementLike } from "./dom-like";

export type Clickable = {
  addEventListener(type: "click", listener: (event: ClickEvent) => void): void;
};

export function onTrustedClick(el: Clickable, fn: () => void): void {
  el.addEventListener("click", (event) => {
    if (event.isTrusted === true) fn();
  });
}

/** A trusted Enter, outside an input method's composition: `fn` runs and the key does nothing else. */
export function onTrustedEnter(
  el: Pick<ElementLike, "addEventListener">,
  fn: () => void,
): void {
  el.addEventListener("keydown", (event) => {
    if (event.isTrusted !== true || event.key !== "Enter") return;
    if (event.isComposing === true) return;
    event.preventDefault();
    fn();
  });
}

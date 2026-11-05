// A click the page's scripts made up (dispatchEvent, el.click()) has isTrusted false: it never acts.

import type { ClickEvent } from "./dom-like";

export type Clickable = {
  addEventListener(type: "click", listener: (event: ClickEvent) => void): void;
};

export function onTrustedClick(el: Clickable, fn: () => void): void {
  el.addEventListener("click", (event) => {
    if (event.isTrusted === true) fn();
  });
}

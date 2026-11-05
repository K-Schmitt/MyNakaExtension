// The slice of the DOM the rating block uses. The block is written against these shapes so that tests
// run on plain fakes (no DOM library) and so that a binding hands in `document` and nothing wider.

export type ClickEvent = { isTrusted: boolean };
export type EventLike = ClickEvent & { stopPropagation(): void };

export interface NodeLike {
  appendChild(child: NodeLike): unknown;
}

export interface ElementLike extends NodeLike {
  textContent: string | null;
  style: { cssText: string };
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: (event: EventLike) => void): void;
  attachShadow(init: { mode: "closed" }): ShadowRootLike;
  remove(): void;
}

export interface ShadowRootLike extends NodeLike {
  replaceChildren(...nodes: NodeLike[]): void;
}

export interface DocLike {
  body: NodeLike;
  fullscreenElement: NodeLike | null;
  createElement(tag: string): ElementLike;
  addEventListener(type: "fullscreenchange", listener: () => void): void;
  removeEventListener(type: "fullscreenchange", listener: () => void): void;
}

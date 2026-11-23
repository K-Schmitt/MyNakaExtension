// The slice of the DOM the rating block uses. The block is written against these shapes so that tests
// run on plain fakes (no DOM library) and so that a binding hands in `document` and nothing wider.

export type ClickEvent = { isTrusted: boolean };
export type EventLike = ClickEvent & {
  key?: string;
  pointerType?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  /** A key pressed while an input method composes a character. */
  isComposing?: boolean;
  stopPropagation(): void;
  preventDefault(): void;
};

export interface NodeLike {
  appendChild(child: NodeLike): unknown;
}

export interface ElementLike extends NodeLike {
  textContent: string | null;
  className: string;
  readonly parentNode: NodeLike | null;
  style: { cssText: string };
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: (event: EventLike) => void): void;
  attachShadow(init: { mode: "closed" }): ShadowRootLike;
  focus(): void;
  scrollIntoView(options: { behavior: "smooth"; block: "center" }): void;
  remove(): void;
}

export interface ShadowRootLike extends NodeLike {
  adoptedStyleSheets?: unknown[];
  /** The element of this tree that has the focus, if any. */
  readonly activeElement?: unknown;
  replaceChildren(...nodes: NodeLike[]): void;
}

export interface DocLike {
  body: NodeLike;
  fullscreenElement: NodeLike | null;
  createElement(tag: string): ElementLike;
  addEventListener(type: "fullscreenchange", listener: () => void): void;
}

/** The carousel's track: what the arrows read and move. A real `div` has all of it. */
export type TrackLike = {
  scrollLeft: number;
  readonly clientWidth: number;
  readonly scrollWidth: number;
  scrollBy(o: { left: number; behavior: "smooth" | "auto" }): void;
  addEventListener(type: "scroll" | "pointerenter", fn: () => void): void;
};

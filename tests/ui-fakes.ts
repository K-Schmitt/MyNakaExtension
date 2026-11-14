import type {
  DocLike,
  ElementLike,
  EventLike,
  NodeLike,
  ShadowRootLike,
} from "../src/content/ui/dom-like";

// Minimal DOM fakes: elements record their text, children, attributes and listeners; appendChild moves.
export class FakeNode implements NodeLike {
  parent: FakeNode | null = null;
  children: FakeNode[] = [];

  get parentNode(): FakeNode | null {
    return this.parent;
  }

  appendChild(child: NodeLike): void {
    const node = child as FakeNode;
    node.parent?.drop(node);
    node.parent = this;
    this.children.push(node);
  }

  drop(child: FakeNode): void {
    this.children = this.children.filter((c) => c !== child);
    child.parent = null;
  }

  /** Puts `child` right after `ref`, one of this node's children; moves it like appendChild. */
  insertAfter(child: FakeNode, ref: FakeNode): void {
    child.parent?.drop(child);
    child.parent = this;
    this.children.splice(this.children.indexOf(ref) + 1, 0, child);
  }

  get parentElement(): FakeElement | null {
    return this.parent instanceof FakeElement ? this.parent : null;
  }

  get nextElementSibling(): FakeElement | null {
    const siblings = this.parent?.children ?? [];
    const after = siblings.slice(siblings.indexOf(this) + 1);
    return (
      after.find((s): s is FakeElement => s instanceof FakeElement) ?? null
    );
  }

  after(...nodes: NodeLike[]): void {
    let at: FakeNode = this;
    for (const node of nodes) {
      this.parent?.insertAfter(node as FakeNode, at);
      at = node as FakeNode;
    }
  }

  append(...nodes: NodeLike[]): void {
    for (const node of nodes) this.appendChild(node);
  }
}

export class FakeShadow extends FakeNode implements ShadowRootLike {
  host: FakeElement | null = null;
  adoptedStyleSheets?: unknown[];

  replaceChildren(...nodes: NodeLike[]): void {
    for (const child of [...this.children]) this.drop(child);
    for (const node of nodes) this.appendChild(node);
  }
}

type Modifiers = {
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  pointerType?: string;
};

export class FakeElement extends FakeNode implements ElementLike {
  textContent: string | null = "";
  className = "";
  style = { cssText: "" };
  attributes: Record<string, string> = {};
  listeners: Record<string, ((event: EventLike) => void)[]> = {};
  shadowInit: { mode: string }[] = [];
  shadow = new FakeShadow();
  focusCount = 0;
  static focused: FakeElement | null = null;

  constructor(readonly tag: string) {
    super();
    this.shadow.host = this;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  addEventListener(type: string, listener: (event: EventLike) => void): void {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  attachShadow(init: { mode: "closed" }): ShadowRootLike {
    this.shadowInit.push(init);
    return this.shadow;
  }

  focus(): void {
    this.focusCount += 1;
    FakeElement.focused = this;
  }

  remove(): void {
    this.parent?.drop(this);
  }

  /**
   * Bubbles an event from here, through the shadow boundary; whether a listener stopped it or prevented its
   * default. As in the DOM, the path is fixed before any listener runs: a listener that redraws (detaching
   * this element) does not cut the event off from the ancestors it had.
   */
  private fire(
    type: string,
    isTrusted: unknown,
    key?: string,
    modifiers: Modifiers = {},
  ): { stopped: boolean; prevented: boolean } {
    const seen = { stopped: false, prevented: false };
    const event = {
      isTrusted,
      key,
      ...modifiers,
      stopPropagation: () => {
        seen.stopped = true;
      },
      preventDefault: () => {
        seen.prevented = true;
      },
    } as EventLike;
    for (const element of this.eventPath()) {
      if (seen.stopped) break;
      for (const listener of element.listeners[type] ?? []) listener(event);
    }
    return seen;
  }

  private eventPath(): FakeElement[] {
    const path: FakeElement[] = [];
    let node: FakeNode | null = this;
    while (node !== null) {
      if (node instanceof FakeElement) path.push(node);
      node = node.parent ?? (node instanceof FakeShadow ? node.host : null);
    }
    return path;
  }

  /** Bubbles an event from here, through the shadow boundary; true when nothing stopped it. */
  dispatch(type: string, isTrusted: unknown = true, key?: string): boolean {
    return !this.fire(type, isTrusted, key).stopped;
  }

  /** A pointer event of the given kind (« mouse », « touch »). */
  pointer(type: string, pointerType: string): void {
    this.fire(type, true, undefined, { pointerType });
  }

  /** A trusted keydown; true when a listener prevented its default action (a scroll, for an arrow). */
  press(key: string, modifiers: Modifiers = {}): boolean {
    return this.fire("keydown", true, key, modifiers).prevented;
  }

  click(isTrusted: boolean): void {
    this.dispatch("click", isTrusted);
  }
}

export class FakeDoc implements DocLike {
  body = new FakeNode();
  fullscreenElement: FakeNode | null = null;
  created: FakeElement[] = [];
  private listeners: (() => void)[] = [];

  createElement(tag: string): ElementLike {
    const el = new FakeElement(tag);
    this.created.push(el);
    return el;
  }

  addEventListener(_type: "fullscreenchange", listener: () => void): void {
    this.listeners.push(listener);
  }

  enterFullscreen(el: FakeNode | null): void {
    this.fullscreenElement = el;
    for (const listener of [...this.listeners]) listener();
  }
}

/** Every element below a node, depth first. */
export function descendants(node: FakeNode): FakeElement[] {
  return node.children.flatMap((c) => [
    ...(c instanceof FakeElement ? [c] : []),
    ...descendants(c),
  ]);
}

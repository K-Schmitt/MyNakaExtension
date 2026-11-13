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
}

export class FakeShadow extends FakeNode implements ShadowRootLike {
  host: FakeElement | null = null;
  adoptedStyleSheets?: unknown[];

  replaceChildren(...nodes: NodeLike[]): void {
    for (const child of [...this.children]) this.drop(child);
    for (const node of nodes) this.appendChild(node);
  }
}

type Modifiers = { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

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

  /** Bubbles an event from here, through the shadow boundary; whether a listener stopped it or prevented its default. */
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
    let node: FakeNode | null = this;
    while (node !== null && !seen.stopped) {
      if (node instanceof FakeElement) {
        for (const listener of node.listeners[type] ?? []) listener(event);
      }
      node = node.parent ?? (node instanceof FakeShadow ? node.host : null);
    }
    return seen;
  }

  /** Bubbles an event from here, through the shadow boundary; true when nothing stopped it. */
  dispatch(type: string, isTrusted: unknown = true, key?: string): boolean {
    return !this.fire(type, isTrusted, key).stopped;
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

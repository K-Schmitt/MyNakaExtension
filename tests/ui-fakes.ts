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

  replaceChildren(...nodes: NodeLike[]): void {
    for (const child of [...this.children]) this.drop(child);
    for (const node of nodes) this.appendChild(node);
  }
}

export class FakeElement extends FakeNode implements ElementLike {
  textContent: string | null = "";
  style = { cssText: "" };
  attributes: Record<string, string> = {};
  listeners: Record<string, ((event: EventLike) => void)[]> = {};
  shadowInit: { mode: string }[] = [];
  shadow = new FakeShadow();

  constructor(readonly tag: string) {
    super();
    this.shadow.host = this;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  addEventListener(type: string, listener: (event: EventLike) => void): void {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  attachShadow(init: { mode: "closed" }): ShadowRootLike {
    this.shadowInit.push(init);
    return this.shadow;
  }

  remove(): void {
    this.parent?.drop(this);
  }

  /** Bubbles an event from here, through the shadow boundary; true when nothing stopped it. */
  dispatch(type: string, isTrusted: unknown = true): boolean {
    let stopped = false;
    const event = {
      isTrusted,
      stopPropagation: () => {
        stopped = true;
      },
    } as EventLike;
    let node: FakeNode | null = this;
    while (node !== null && !stopped) {
      if (node instanceof FakeElement) {
        for (const listener of node.listeners[type] ?? []) listener(event);
      }
      node = node.parent ?? (node instanceof FakeShadow ? node.host : null);
    }
    return !stopped;
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

  removeEventListener(_type: "fullscreenchange", listener: () => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  listenerCount(): number {
    return this.listeners.length;
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

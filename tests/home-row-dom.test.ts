import { describe, expect, it } from "vitest";
import { createRowPorts } from "../src/content/ui/home-row-dom";
import { type ListSnapshot, rowMove } from "../src/content/ui/row-place";

// Just enough of the page for the DOM binding: a list of sections, their h2, their left edge.
class Box {
  parent: Box | null = null;
  children: Box[] = [];
  inserts = 0;
  style = {
    props: {} as Record<string, string>,
    setProperty(name: string, value: string, priority: string): void {
      this.props[name] = `${value} ${priority}`;
    },
  };
  constructor(
    readonly h2?: string,
    readonly left = 0,
    readonly h2Left = 0,
  ) {}
  get firstElementChild(): Box | null {
    return this.children[0] ?? null;
  }
  get nextElementSibling(): Box | null {
    const siblings = this.parent?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  querySelector(selector: string) {
    if (selector !== "h2" || this.h2 === undefined) return null;
    return {
      textContent: this.h2,
      getBoundingClientRect: () => ({ left: this.h2Left }),
    };
  }
  getBoundingClientRect() {
    return { left: this.left };
  }
  remove(): void {
    if (this.parent === null) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  put(node: Box, at: number): void {
    node.remove();
    node.parent = this;
    this.children.splice(at, 0, node);
    this.inserts += 1;
  }
  prepend(node: Box): void {
    this.put(node, 0);
  }
  after(node: Box): void {
    const parent = this.parent as Box;
    parent.put(node, parent.children.indexOf(this) + 1);
  }
}

function page(...sections: Box[]) {
  const list = new Box();
  for (const s of sections) list.put(s, list.children.length);
  list.inserts = 0;
  const state = { list: list as Box | null, t: 0 };
  const doc = {
    querySelector: (selector: string) =>
      selector === ".discover-page .dc-sections" ? state.list : null,
  };
  const host = new Box();
  const ports = createRowPorts(
    doc as unknown as Document,
    host as unknown as HTMLElement,
    { set: () => 0, clear: () => {} },
    () => state.t,
  );
  return { list, host, ports, state };
}

const reprendre = () => new Box("Reprendre la lecture", 0, 40);

describe("the home row's DOM ports", () => {
  it("snapshots nothing when the page has no list", () => {
    const { ports, state } = page();
    state.list = null;
    expect(ports.snapshot()).toBeUndefined();
  });

  it("finds « Reprendre » by its h2, ignoring case, and the host among the children", () => {
    const { ports, list, host } = page(
      new Box(),
      new Box("REPRENDRE LA LECTURE"),
    );
    expect(ports.snapshot()).toEqual({ reprendre: 1, host: -1, age: 0 });
    list.put(host, 0);
    expect(ports.snapshot()?.host).toBe(0);
  });

  it("measures the age from the first sighting of the current list node, and restarts with a new node", () => {
    const { ports, state } = page(new Box("Tendances"));
    state.t = 100;
    expect(ports.snapshot()?.age).toBe(0);
    state.t = 400;
    expect(ports.snapshot()?.age).toBe(300);
    state.list = new Box();
    state.t = 500;
    expect(ports.snapshot()?.age).toBe(0);
    state.t = 700;
    expect(ports.snapshot()?.age).toBe(200);
  });

  it("puts the host right after « Reprendre »; its own insertion snapshots as keep, a second apply moves nothing", () => {
    const { ports, list, host } = page(new Box(), reprendre(), new Box());
    ports.apply("after-reprendre");
    expect(list.children.indexOf(host)).toBe(2);
    expect(rowMove(ports.snapshot() as ListSnapshot)).toBe("keep");
    const inserts = list.inserts;
    ports.apply("after-reprendre");
    expect(list.inserts).toBe(inserts);
  });

  it("puts the host first for « top », once", () => {
    const { ports, list, host } = page(new Box(), new Box());
    ports.apply("top");
    expect(list.children[0]).toBe(host);
    const late = { ...(ports.snapshot() as ListSnapshot), age: 5000 };
    expect(rowMove(late)).toBe("keep");
    const inserts = list.inserts;
    ports.apply("top");
    expect(list.inserts).toBe(inserts);
  });

  it("pads the host by the offset of the « Reprendre » title in its section, 24 px without one", () => {
    const withTitle = page(new Box("Reprendre la lecture", 10, 50));
    withTitle.ports.apply("after-reprendre");
    expect(withTitle.host.style.props["padding-left"]).toBe("40px important");
    expect(withTitle.host.style.props["padding-right"]).toBe("40px important");
    const without = page(new Box());
    without.ports.apply("top");
    expect(without.host.style.props["padding-left"]).toBe("24px important");
    expect(without.host.style.props["padding-right"]).toBe("24px important");
  });

  it("detach takes the host out of the page", () => {
    const { ports, list, host } = page(reprendre());
    ports.apply("after-reprendre");
    ports.detach();
    expect(list.children).not.toContain(host);
  });
});

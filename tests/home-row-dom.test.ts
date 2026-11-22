import { describe, expect, it } from "vitest";
import { createRowPorts } from "../src/content/ui/home-row-dom";
import { type ListSnapshot, rowMove } from "../src/content/ui/row-place";
import { ROW_SHEET } from "../src/content/ui/row-styles";

type H2 = { text: string; id?: string; nh?: boolean; left?: number };
type Init = { h2?: H2; carousel?: boolean; left?: number };

// Just enough of the page for the DOM binding: a list of sections, their h2 (id, class), their left edge.
class Box {
  parent: Box | null = null;
  children: Box[] = [];
  inserts = 0;
  left: number;
  style = {
    props: {} as Record<string, string>,
    setProperty(name: string, value: string, priority: string): void {
      this.props[name] = `${value} ${priority}`;
    },
  };
  constructor(readonly init: Init = {}) {
    this.left = init.left ?? 0;
  }
  get firstElementChild(): Box | null {
    return this.children[0] ?? null;
  }
  get nextElementSibling(): Box | null {
    const siblings = this.parent?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  matches(selector: string): boolean {
    return selector === "section.nh-carousel" && this.init.carousel === true;
  }
  querySelector(selector: string): unknown {
    const h2 = this.init.h2;
    const own =
      h2 !== undefined &&
      (selector === "h2" ||
        (selector === "h2#cw-title" && h2.id === "cw-title") ||
        (selector === "h2.nh-h2" && h2.nh === true));
    if (own && h2 !== undefined) {
      return {
        textContent: h2.text,
        getBoundingClientRect: () => ({ left: h2.left ?? 0 }),
      };
    }
    for (const child of this.children) {
      const found = child.querySelector(selector);
      if (found !== null) return found;
    }
    return null;
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
      selector === "main.nh-shell-main > div.nh-home" ? state.list : null,
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

const reprendre = (left = 0, h2Left = 0) =>
  new Box({
    h2: {
      text: "Reprendre la lecture",
      id: "cw-title",
      nh: true,
      left: h2Left,
    },
    left,
  });
const carousel = () => new Box({ carousel: true });

describe("the home row's DOM ports", () => {
  it("snapshots nothing when the page has no list", () => {
    const { ports, state } = page();
    state.list = null;
    expect(ports.snapshot()).toBeUndefined();
  });

  it("finds « Reprendre » by h2#cw-title, and by its text as a fallback", () => {
    const byId = page(new Box(), reprendre());
    expect(byId.ports.snapshot()).toEqual({ reprendre: 1, host: -1, age: 0 });
    const byText = page(
      new Box(),
      new Box({ h2: { text: "REPRENDRE LA LECTURE" } }),
    );
    expect(byText.ports.snapshot()?.reprendre).toBe(1);
    byText.list.put(byText.host, 0);
    expect(byText.ports.snapshot()?.host).toBe(0);
  });

  it("counts rows after the carousel: the host right after it snapshots as host 0", () => {
    const { ports, list, host } = page(carousel(), reprendre(), new Box());
    expect(ports.snapshot()).toEqual({ reprendre: 0, host: -1, age: 0 });
    list.put(host, 1);
    const snap = ports.snapshot() as ListSnapshot;
    expect(snap.host).toBe(0);
    expect(snap.reprendre).toBe(1);
  });

  it("measures the age from the first sighting of the current list node, and restarts with a new node", () => {
    const { ports, state } = page(new Box({ h2: { text: "Tendances" } }));
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

  it("puts the host right after « Reprendre », after the carousel; a second apply moves nothing", () => {
    const { ports, list, host } = page(carousel(), reprendre(), new Box());
    ports.apply("after-reprendre");
    expect(list.children.indexOf(host)).toBe(2);
    expect(rowMove(ports.snapshot() as ListSnapshot)).toBe("keep");
    const inserts = list.inserts;
    ports.apply("after-reprendre");
    expect(list.inserts).toBe(inserts);
  });

  it("puts the host right after the carousel for « top », once", () => {
    const { ports, list, host } = page(carousel(), new Box(), new Box());
    ports.apply("top");
    expect(list.children[1]).toBe(host);
    const late = { ...(ports.snapshot() as ListSnapshot), age: 5000 };
    expect(rowMove(late)).toBe("keep");
    const inserts = list.inserts;
    ports.apply("top");
    expect(list.inserts).toBe(inserts);
  });

  it("puts the host first without a carousel, padded 24 px without any title", () => {
    const { ports, list, host } = page(new Box(), new Box());
    ports.apply("top");
    expect(list.children[0]).toBe(host);
    expect(host.style.props["padding-left"]).toBe("24px important");
    expect(host.style.props["padding-right"]).toBe("24px important");
    const inserts = list.inserts;
    ports.apply("top");
    expect(list.inserts).toBe(inserts);
  });

  it("pads the host by the « Reprendre » title's offset from the list's left edge (303 px)", () => {
    const { ports, host } = page(reprendre(255, 303));
    ports.apply("after-reprendre");
    expect(host.style.props["padding-left"]).toBe("303px important");
    expect(host.style.props["padding-right"]).toBe("303px important");
  });

  it("measures the gutter on the first h2.nh-h2 without « Reprendre »", () => {
    const { ports, host, list } = page(
      new Box({ h2: { text: "Tendances", nh: true, left: 120 } }),
    );
    list.left = 20;
    ports.apply("top");
    expect(host.style.props["padding-left"]).toBe("100px important");
    expect(host.style.props["padding-right"]).toBe("100px important");
  });

  it("detach takes the host out of the page", () => {
    const { ports, list, host } = page(reprendre());
    ports.apply("after-reprendre");
    ports.detach();
    expect(list.children).not.toContain(host);
  });
});

describe("the row title's style", () => {
  it("uses Naka's display font at 32 px", () => {
    expect(ROW_SHEET).toContain(
      "font:700 32px/1.2 var(--font-display, var(--mn-font))",
    );
    expect(ROW_SHEET).toContain("letter-spacing:-0.64px");
  });
});

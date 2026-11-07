import { describe, expect, it } from "vitest";
import { attachSheet, defaultSheetMaker } from "../src/content/ui/sheet";
import { FakeDoc, type FakeElement, FakeNode, FakeShadow } from "./ui-fakes";

const CSS = ".mn-card { color: red; }";

describe("attachSheet, adopted path", () => {
  it("adopts the sheet once and keeps it through two redraws", () => {
    const doc = new FakeDoc();
    const root = new FakeShadow();
    const sheet = { made: true };
    const made: string[] = [];
    const out = attachSheet(doc, root, CSS, (css) => {
      made.push(css);
      return sheet;
    });
    expect(out).toBe(root);
    expect(made).toEqual([CSS]);
    expect(root.adoptedStyleSheets).toEqual([sheet]);
    out.replaceChildren(new FakeNode());
    out.replaceChildren(new FakeNode());
    expect(root.adoptedStyleSheets).toEqual([sheet]);
    expect(doc.created).toHaveLength(0);
  });
});

describe("attachSheet, adoption refused", () => {
  it("falls back to the style node when the setter throws", () => {
    const doc = new FakeDoc();
    const root = new FakeShadow();
    Object.defineProperty(root, "adoptedStyleSheets", {
      set() {
        throw new Error("refused");
      },
    });
    const out = attachSheet(doc, root, CSS, () => ({ made: true }));
    const a = new FakeNode();
    out.replaceChildren(a);
    const style = root.children[0] as FakeElement;
    expect(style.tag).toBe("style");
    expect(style.textContent).toBe(CSS);
    expect(root.children).toEqual([style, a]);
  });
});

describe("attachSheet, fallback path", () => {
  it("keeps one style node first through redraws and hide", () => {
    const doc = new FakeDoc();
    const root = new FakeShadow();
    const out = attachSheet(doc, root, CSS, () => undefined);
    const a = new FakeNode();
    const b = new FakeNode();
    out.replaceChildren(a);
    const style = root.children[0] as FakeElement;
    expect(root.children).toEqual([style, a]);
    out.replaceChildren(b);
    expect(root.children).toEqual([style, b]);
    expect(style.textContent).toBe(CSS);
    expect(doc.created.filter((e) => e.tag === "style")).toEqual([style]);
    out.replaceChildren();
    expect(root.children).toEqual([style]);
  });

  it("appendChild delegates to the root", () => {
    const doc = new FakeDoc();
    const root = new FakeShadow();
    const out = attachSheet(doc, root, CSS, () => undefined);
    const a = new FakeNode();
    out.appendChild(a);
    expect(root.children.at(-1)).toBe(a);
  });
});

describe("defaultSheetMaker", () => {
  it("returns undefined where CSSStyleSheet is absent", () => {
    expect(defaultSheetMaker(CSS)).toBeUndefined();
  });
});

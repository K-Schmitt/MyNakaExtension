import { describe, expect, it, vi } from "vitest";
import {
  createOverlayRoot,
  STOPPED_EVENTS,
} from "../src/content/ui/overlay-root";
import { renderRating } from "../src/content/ui/rating-render";
import { ratingView } from "../src/content/ui/rating-view";
import { episodeCard } from "./rating-fixtures";
import { descendants, FakeDoc, type FakeElement, FakeNode } from "./ui-fakes";

const EXPECTED = [
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "touchstart",
  "touchend",
  "keydown",
  "keyup",
  "wheel",
];

function hostOf(doc: FakeDoc): FakeElement {
  const host = doc.created[0];
  if (host === undefined) throw new Error("no host created");
  return host;
}

describe("createOverlayRoot", () => {
  it("attaches the host to body when nothing is fullscreen", () => {
    const doc = new FakeDoc();
    createOverlayRoot(doc);
    expect(hostOf(doc).parent).toBe(doc.body);
  });

  it("attaches the host to the fullscreen element when there is one", () => {
    const doc = new FakeDoc();
    const player = new FakeNode();
    doc.fullscreenElement = player;
    createOverlayRoot(doc);
    expect(hostOf(doc).parent).toBe(player);
  });

  it("moves into the fullscreen element, then back to body, on fullscreenchange", () => {
    const doc = new FakeDoc();
    const player = new FakeNode();
    createOverlayRoot(doc);
    doc.enterFullscreen(player);
    expect(hostOf(doc).parent).toBe(player);
    doc.enterFullscreen(null);
    expect(hostOf(doc).parent).toBe(doc.body);
  });

  it("opens a closed shadow root and returns it", () => {
    const doc = new FakeDoc();
    const { root } = createOverlayRoot(doc);
    expect(hostOf(doc).shadowInit).toEqual([{ mode: "closed" }]);
    expect(root).toBe(hostOf(doc).shadow);
  });

  it("styles the host: reset, right, above everything, between Naka's top bar (5%) and its bottom bar (95%)", () => {
    const doc = new FakeDoc();
    createOverlayRoot(doc);
    const css = hostOf(doc).style.cssText;
    expect(css).toContain("all: initial");
    expect(css).toContain("z-index: 2147483647");
    expect(css).not.toContain("top: 0");
    expect(css).toContain("top: 7%");
    expect(css).toContain("right: 0");
    expect(css).toContain("max-width: 40%");
    expect(css).toContain("max-height: 80%");
    expect(css).toContain("color-scheme: dark !important");
  });

  it("the bottom right placement keeps the reset, the z-index and the stopped events", () => {
    const doc = new FakeDoc();
    createOverlayRoot(doc, "bottom-right");
    const css = hostOf(doc).style.cssText;
    expect(css).toContain("all: initial");
    expect(css).toContain("z-index: 2147483647");
    expect(css).toContain("bottom: 0");
    expect(css).toContain("width: 360px");
    expect(css).toContain("max-height: 60vh");
    expect(css).not.toContain("top: 0");
    for (const d of css.split(";").filter((x) => x.trim() !== "")) {
      expect(d, d).toMatch(/ !important$/);
    }
    expect(hostOf(doc).dispatch("click")).toBe(false);
  });

  it("lists the input events it keeps from the page", () => {
    expect([...STOPPED_EVENTS].sort()).toEqual([...EXPECTED].sort());
  });

  it.each(EXPECTED)("stops %s at the host", (type) => {
    const doc = new FakeDoc();
    createOverlayRoot(doc);
    const reached = hostOf(doc).dispatch(type);
    expect(reached).toBe(false);
  });

  it("a click on an inner rating button runs its handler once, and stops at the host", () => {
    const doc = new FakeDoc();
    const { root } = createOverlayRoot(doc);
    const onChoose = vi.fn();
    renderRating(doc, root, ratingView(episodeCard(), "saison", 8), {
      onChoose,
      onAction: vi.fn(),
      onOther: vi.fn(),
      onConfirm: vi.fn(),
    });
    const eight = descendants(hostOf(doc).shadow).find(
      (el) => el.tag === "button" && el.attributes["aria-label"] === "8 sur 10",
    );
    expect(eight?.dispatch("click", true)).toBe(false);
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(8);
  });

  it("attach puts the host back when the page removed it, and leaves it alone otherwise", () => {
    const doc = new FakeDoc();
    const overlay = createOverlayRoot(doc);
    const added = vi.spyOn(doc.body, "appendChild");
    overlay.attach();
    expect(added).not.toHaveBeenCalled();
    hostOf(doc).remove();
    overlay.attach();
    expect(hostOf(doc).parent).toBe(doc.body);
  });

  it("every declaration of the host style is important", () => {
    const doc = new FakeDoc();
    createOverlayRoot(doc);
    const declarations = hostOf(doc)
      .style.cssText.split(";")
      .map((d) => d.trim())
      .filter((d) => d !== "");
    expect(declarations.length).toBeGreaterThan(5);
    for (const d of declarations) expect(d, d).toMatch(/ !important$/);
  });

  it("keeps the sheet when the host moves", () => {
    const doc = new FakeDoc();
    const player = new FakeNode();
    const { root } = createOverlayRoot(
      doc,
      "top-right",
      ".mn-card { color: red; }",
    );
    root.replaceChildren(new FakeNode());
    doc.enterFullscreen(player);
    root.replaceChildren(new FakeNode());
    doc.enterFullscreen(null);
    root.replaceChildren(new FakeNode());
    const style = hostOf(doc).shadow.children[0] as FakeElement;
    expect(style.tag).toBe("style");
    expect(style.textContent).toBe(".mn-card { color: red; }");
    expect(hostOf(doc).shadow.children).toHaveLength(2);
    expect(hostOf(doc).parent).toBe(doc.body);
  });
});

import { describe, expect, it, vi } from "vitest";
import { STOPPED_EVENTS } from "../src/content/ui/input-stop";
import { createOverlayRoot, NO_PANELS } from "../src/content/ui/overlay-root";
import { renderRating } from "../src/content/ui/rating-render";
import { ratingView } from "../src/content/ui/rating-view";
import { episodeCard } from "./rating-fixtures";
import {
  COUNTS,
  descendants,
  FakeDoc,
  type FakeElement,
  FakeNode,
} from "./ui-fakes";

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
    createOverlayRoot(doc, "", NO_PANELS);
    expect(hostOf(doc).parent).toBe(doc.body);
  });

  it("attaches the host to the fullscreen element when there is one", () => {
    const doc = new FakeDoc();
    const player = new FakeNode();
    doc.fullscreenElement = player;
    createOverlayRoot(doc, "", NO_PANELS);
    expect(hostOf(doc).parent).toBe(player);
  });

  it("moves into the fullscreen element, then back to body, on fullscreenchange", () => {
    const doc = new FakeDoc();
    const player = new FakeNode();
    createOverlayRoot(doc, "", NO_PANELS);
    doc.enterFullscreen(player);
    expect(hostOf(doc).parent).toBe(player);
    doc.enterFullscreen(null);
    expect(hostOf(doc).parent).toBe(doc.body);
  });

  it("opens a closed shadow root and returns it", () => {
    const doc = new FakeDoc();
    const { root } = createOverlayRoot(doc, "", NO_PANELS);
    expect(hostOf(doc).shadowInit).toEqual([{ mode: "closed" }]);
    expect(root).toBe(hostOf(doc).shadow);
  });

  it("styles the host: reset, right, above everything, from 7% to 76% of the height (max-height 69%)", () => {
    const doc = new FakeDoc();
    createOverlayRoot(doc, "", NO_PANELS);
    const css = hostOf(doc).style.cssText;
    expect(css).toContain("all: initial");
    expect(css).toContain("z-index: 2147483647");
    expect(css).not.toContain("top: 0");
    expect(css).toContain("top: 7%");
    expect(css).toContain("right: 0");
    expect(css).toContain("max-width: 40%");
    expect(css).toContain("max-height: 69%");
    expect(css).toContain("color-scheme: dark !important");
  });

  it("lists the input events it keeps from the page", () => {
    expect([...STOPPED_EVENTS].sort()).toEqual([...EXPECTED].sort());
  });

  it.each(EXPECTED)("stops %s at the host", (type) => {
    const doc = new FakeDoc();
    createOverlayRoot(doc, "", NO_PANELS);
    const reached = hostOf(doc).dispatch(type);
    expect(reached).toBe(false);
  });

  it("a click on an inner rating button runs its handler once, and stops at the host", () => {
    const doc = new FakeDoc();
    const { root } = createOverlayRoot(doc, "", NO_PANELS);
    const onChoose = vi.fn();
    renderRating(
      doc,
      root,
      ratingView(episodeCard(), "saison", 8),
      {
        onChoose,
        onAction: vi.fn(),
        onOther: vi.fn(),
        onConfirm: vi.fn(),
      },
      COUNTS,
    );
    const eight = descendants(hostOf(doc).shadow).find(
      (el) => el.tag === "button" && el.attributes["aria-label"] === "8 sur 10",
    );
    expect(eight?.dispatch("click", true)).toBe(false);
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(8);
  });

  it("attach puts the host back when the page removed it, and leaves it alone otherwise", () => {
    const doc = new FakeDoc();
    const overlay = createOverlayRoot(doc, "", NO_PANELS);
    const added = vi.spyOn(doc.body, "appendChild");
    overlay.attach();
    expect(added).not.toHaveBeenCalled();
    hostOf(doc).remove();
    overlay.attach();
    expect(hostOf(doc).parent).toBe(doc.body);
  });

  it("hides the host while a panel is open and shows the same root again once it closes", () => {
    const doc = new FakeDoc();
    let notify: (open: boolean) => void = () => {};
    const { root } = createOverlayRoot(doc, "", (onChange) => {
      notify = onChange;
      return () => {};
    });
    const child = new FakeNode();
    root.replaceChildren(child);
    notify(true);
    expect(hostOf(doc).style.cssText).toContain("display: none !important");
    expect(hostOf(doc).shadow).toBe(root);
    expect(hostOf(doc).shadow.children).toContain(child);
    notify(false);
    expect(hostOf(doc).style.cssText).not.toContain("display: none");
    expect(hostOf(doc).shadow.children).toContain(child);
    expect(hostOf(doc).shadow).toBe(root);
  });

  it("keeps the hidden state through attach() and a fullscreen move", () => {
    const doc = new FakeDoc();
    const player = new FakeNode();
    let notify: (open: boolean) => void = () => {};
    const overlay = createOverlayRoot(doc, "", (onChange) => {
      notify = onChange;
      return () => {};
    });
    notify(true);
    hostOf(doc).remove();
    overlay.attach();
    expect(hostOf(doc).style.cssText).toContain("display: none !important");
    doc.enterFullscreen(player);
    expect(hostOf(doc).parent).toBe(player);
    expect(hostOf(doc).style.cssText).toContain("display: none !important");
  });

  it("every declaration of the hidden style is important", () => {
    const doc = new FakeDoc();
    createOverlayRoot(doc, "", (onChange) => {
      onChange(true);
      return () => {};
    });
    const declarations = hostOf(doc)
      .style.cssText.split(";")
      .map((d) => d.trim())
      .filter((d) => d !== "");
    expect(declarations.at(-1)).toBe("display: none !important");
    for (const d of declarations) expect(d, d).toMatch(/ !important$/);
  });

  it("every declaration of the host style is important", () => {
    const doc = new FakeDoc();
    createOverlayRoot(doc, "", NO_PANELS);
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
      ".mn-card { color: red; }",
      NO_PANELS,
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

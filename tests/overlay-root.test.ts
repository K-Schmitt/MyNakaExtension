import { describe, expect, it, vi } from "vitest";
import {
  createOverlayRoot,
  STOPPED_EVENTS,
} from "../src/content/ui/overlay-root";
import { createRatingBlock } from "../src/content/ui/rating-render";
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

  it("styles the host: reset, top right, above everything, not past 80% of the height", () => {
    const doc = new FakeDoc();
    createOverlayRoot(doc);
    const css = hostOf(doc).style.cssText;
    expect(css).toContain("all: initial");
    expect(css).toContain("z-index: 2147483647");
    expect(css).toContain("top: 0");
    expect(css).toContain("right: 0");
    expect(css).toContain("max-width: 40%");
    expect(css).toContain("max-height: 80%");
  });

  it("detach removes the host and stops listening", () => {
    const doc = new FakeDoc();
    const { detach } = createOverlayRoot(doc);
    detach();
    expect(hostOf(doc).parent).toBeNull();
    expect(doc.listenerCount()).toBe(0);
    doc.enterFullscreen(new FakeNode());
    expect(hostOf(doc).parent).toBeNull();
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
    const block = createRatingBlock(doc, root, {
      onChoose,
      onAction: vi.fn(),
      onOther: vi.fn(),
      onConfirm: vi.fn(),
    });
    block.show(ratingView(episodeCard(), "saison", 8));
    const eight = descendants(hostOf(doc).shadow).find(
      (el) => el.tag === "button" && el.textContent === "8",
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
});

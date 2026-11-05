import { describe, expect, it, vi } from "vitest";
import type { HomeHandlers } from "../src/content/ui/home-block";
import { createHomeUi } from "../src/content/ui/home-ui";
import { homeView } from "../src/content/ui/home-view";
import { filmCard } from "./rating-fixtures";
import { descendants, FakeDoc, type FakeElement } from "./ui-fakes";

const handlersOf = () => {
  const entry = {
    onChoose: vi.fn(),
    onAction: vi.fn(),
    onOther: vi.fn(),
    onConfirm: vi.fn(),
  };
  const handlers: HomeHandlers = {
    entry: vi.fn(() => entry),
    onFold: vi.fn(),
  };
  return { handlers, entry };
};

const hostOf = (doc: FakeDoc): FakeElement => {
  const host = doc.created[0];
  if (host === undefined) throw new Error("no host");
  return host;
};

const buttons = (doc: FakeDoc, text: string): FakeElement[] =>
  descendants(hostOf(doc).shadow).filter(
    (el) => el.tag === "button" && el.textContent === text,
  );

const FILM = filmCard({ title: "<b>Un film</b>" });

describe("the home panel's drawing", () => {
  it("creates no element before the first show", () => {
    const doc = new FakeDoc();
    createHomeUi(doc);
    expect(doc.created).toEqual([]);
  });

  it("sits bottom right, 360 px wide, 60vh high at most, every declaration important", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    createHomeUi(doc).show(homeView([{ card: FILM }]), handlers);
    const css = hostOf(doc).style.cssText;
    expect(css).toContain("bottom: 0 !important");
    expect(css).toContain("right: 0 !important");
    expect(css).toContain("width: 360px !important");
    expect(css).toContain("max-height: 60vh !important");
    expect(css).toContain("overflow: auto !important");
    expect(css).not.toContain("top: 0");
  });

  it("draws the heading and the title as text, never as markup", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    createHomeUi(doc).show(homeView([{ card: FILM }]), handlers);
    const texts = descendants(hostOf(doc).shadow).map((el) => el.textContent);
    expect(texts).toContain("À noter");
    expect(texts.some((t) => t?.includes("<b>Un film</b>"))).toBe(true);
  });

  it("a trusted click on a choice reaches that entry's handler; a forged one does not", () => {
    const doc = new FakeDoc();
    const { handlers, entry } = handlersOf();
    createHomeUi(doc).show(homeView([{ card: FILM }]), handlers);
    const [eight] = buttons(doc, "8");
    eight?.click(false);
    expect(entry.onChoose).not.toHaveBeenCalled();
    eight?.click(true);
    expect(entry.onChoose).toHaveBeenCalledWith(8);
    expect(handlers.entry).toHaveBeenCalledWith(FILM.key);
  });

  it("Réduire folds on a trusted click only, and offers no other action", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    createHomeUi(doc).show(homeView([{ card: FILM }]), handlers);
    const [fold] = buttons(doc, "Réduire");
    fold?.click(false);
    expect(handlers.onFold).not.toHaveBeenCalled();
    fold?.click(true);
    expect(handlers.onFold).toHaveBeenCalledTimes(1);
    expect(buttons(doc, "Ignorer")).toHaveLength(1);
    expect(buttons(doc, "Plus tard")).toHaveLength(0);
    expect(buttons(doc, "Fermer")).toHaveLength(0);
  });

  it("folded, it draws the heading and the unfold button, no entry", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    createHomeUi(doc).show(homeView([{ card: FILM }], true), handlers);
    expect(buttons(doc, "Développer")).toHaveLength(1);
    expect(buttons(doc, "8")).toHaveLength(0);
  });

  it("the fold button looks like the other buttons: same declarations, and the block's font to inherit", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    createHomeUi(doc).show(homeView([{ card: FILM }]), handlers);
    const [fold] = buttons(doc, "Réduire");
    const [ignore] = buttons(doc, "Ignorer");
    expect(fold?.style.cssText).toBe(ignore?.style.cssText);
    expect(fold?.style.cssText).toContain("font: inherit;");
    // `font: inherit` takes the nearest declared font: the panel's, for the fold button; the block's, for
    // the entry's buttons. Both must declare the same one.
    const fontOf = (el: FakeElement | undefined): string | undefined => {
      for (let node = el?.parent; node instanceof Object; node = node.parent) {
        const css = (node as FakeElement).style?.cssText ?? "";
        const font = css.match(/font: [^;]+;/)?.[0];
        if (font !== undefined) return font;
      }
      return undefined;
    };
    expect(fontOf(fold)).toBe("font: 14px/1.4 system-ui, sans-serif;");
    expect(fontOf(ignore)).toBe(fontOf(fold));
  });

  it("the ten choices sit in a 5-column grid: two equal rows, never a lone 10", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    createHomeUi(doc).show(homeView([{ card: FILM }]), handlers);
    const choices = Array.from(
      { length: 10 },
      (_, i) => buttons(doc, String(i + 1))[0],
    );
    const row = choices[0]?.parent as FakeElement | null;
    expect(choices.every((b) => b?.parent === row)).toBe(true);
    const css = row?.style.cssText ?? "";
    expect(css).toContain("display: grid;");
    expect(css).toContain("grid-template-columns: repeat(5, 1fr);");
    expect(css).not.toContain("flex");
  });

  it("hide empties the panel", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    const ui = createHomeUi(doc);
    ui.show(homeView([{ card: FILM }]), handlers);
    ui.hide();
    expect(hostOf(doc).shadow.children).toEqual([]);
  });

  it("keeps the input events from the page, like the rating blocks", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    createHomeUi(doc).show(homeView([{ card: FILM }]), handlers);
    expect(hostOf(doc).dispatch("click")).toBe(false);
    expect(hostOf(doc).dispatch("wheel")).toBe(false);
  });
});

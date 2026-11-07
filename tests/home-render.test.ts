import { describe, expect, it, vi } from "vitest";
import type { HomeHandlers } from "../src/content/ui/home-block";
import { createHomeUi } from "../src/content/ui/home-ui";
import { homeView } from "../src/content/ui/home-view";
import { questionView } from "../src/content/ui/question-view";
import type { AmbiguityOffer } from "../src/sw/question-offers";
import { filmCard } from "./rating-fixtures";
import { descendants, FakeDoc, type FakeElement } from "./ui-fakes";

const handlersOf = () => {
  const entry = {
    onChoose: vi.fn(),
    onAction: vi.fn(),
    onOther: vi.fn(),
    onConfirm: vi.fn(),
  };
  const question = { onChoose: vi.fn(), onAction: vi.fn() };
  const handlers: HomeHandlers = {
    entry: vi.fn(() => entry),
    question: vi.fn(() => question),
    onFold: vi.fn(),
  };
  return { handlers, entry, question };
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

const OFFER: AmbiguityOffer = {
  kind: "ambiguity",
  key: "ambiguity:naka:1",
  side: "naka",
  id: 1,
  title: "<b>Dune</b>",
  candidates: [{ id: 10, title: "Dune", year: 2021, type: "film" }],
};
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

  it("the panel, its head and headings are drawn by classes, with no inline style", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    const view = questionView(OFFER, ["ecarter"]);
    createHomeUi(doc).show(
      homeView([{ card: FILM }], false, [{ key: OFFER.key, view }]),
      handlers,
    );
    const all = descendants(hostOf(doc).shadow);
    const byClass = (cls: string) => all.filter((el) => el.className === cls);
    const panel = byClass("mn-panel");
    expect(panel).toHaveLength(1);
    expect(byClass("mn-panel-head")).toHaveLength(1);
    expect(byClass("mn-heading").map((el) => el.textContent)).toEqual([
      "À noter",
    ]);
    expect(byClass("mn-subheading").map((el) => el.textContent)).toEqual([
      "Questions",
    ]);
    expect(panel[0]?.style.cssText ?? "").toBe("");
    expect(all.filter((el) => (el.style?.cssText ?? "") !== "")).toEqual([]);
  });

  it("the fold button is a ghost button inside the panel, whose class declares the font", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    createHomeUi(doc).show(homeView([{ card: FILM }]), handlers);
    const [fold] = buttons(doc, "Réduire");
    expect(fold?.className).toBe("mn-btn mn-btn--ghost");
    expect((fold?.parent?.parent as FakeElement | null)?.className).toBe(
      "mn-panel",
    );
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
    expect(row?.className).toBe("mn-row mn-row--grid5");
  });

  it("hide empties the panel", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    const ui = createHomeUi(doc);
    ui.show(homeView([{ card: FILM }]), handlers);
    ui.hide();
    // Only the stylesheet's <style> node is left (Node has no adopted sheets).
    expect(
      hostOf(doc).shadow.children.map((c) => (c as FakeElement).tag),
    ).toEqual(["style"]);
  });

  it("keeps the input events from the page, like the rating blocks", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    createHomeUi(doc).show(homeView([{ card: FILM }]), handlers);
    expect(hostOf(doc).dispatch("click")).toBe(false);
    expect(hostOf(doc).dispatch("wheel")).toBe(false);
  });

  it("draws the questions after the cards under « Questions »; a trusted click reaches that question's handler", () => {
    const doc = new FakeDoc();
    const { handlers, question } = handlersOf();
    const view = questionView(OFFER, ["ecarter"]);
    createHomeUi(doc).show(
      homeView([{ card: FILM }], false, [{ key: OFFER.key, view }]),
      handlers,
    );
    const texts = descendants(hostOf(doc).shadow).map((el) => el.textContent);
    expect(texts.indexOf("À noter")).toBeLessThan(texts.indexOf("Questions"));
    expect(texts.some((t) => t?.includes("<b>Dune</b>"))).toBe(true);
    const [skip] = buttons(doc, "Écarter");
    skip?.click(false);
    expect(question.onAction).not.toHaveBeenCalled();
    skip?.click(true);
    expect(question.onAction).toHaveBeenCalledWith("ecarter");
    expect(handlers.question).toHaveBeenCalledWith(OFFER.key);
  });

  it("with no card, « Questions » heads the panel and « À noter » is not drawn", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    const view = questionView(OFFER, ["ecarter"]);
    createHomeUi(doc).show(
      homeView([], false, [{ key: OFFER.key, view }]),
      handlers,
    );
    const texts = descendants(hostOf(doc).shadow).map((el) => el.textContent);
    expect(texts.filter((t) => t === "Questions")).toHaveLength(1);
    expect(texts).not.toContain("À noter");
    expect(buttons(doc, "Réduire")).toHaveLength(1);
  });

  it("folded, the questions are not drawn either", () => {
    const doc = new FakeDoc();
    const { handlers } = handlersOf();
    const view = questionView(OFFER, ["ecarter"]);
    createHomeUi(doc).show(
      homeView([{ card: FILM }], true, [{ key: OFFER.key, view }]),
      handlers,
    );
    expect(buttons(doc, "Écarter")).toHaveLength(0);
  });
});

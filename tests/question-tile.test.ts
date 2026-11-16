import { describe, expect, it, vi } from "vitest";
import { NONE_LABEL } from "../src/content/ui/question-copy";
import { viewOf } from "../src/content/ui/question-session-view";
import { buildQuestionTile } from "../src/content/ui/question-tile";
import {
  type QuestionView,
  questionView,
} from "../src/content/ui/question-view";
import type { AmbiguityOffer, RemovalOffer } from "../src/sw/question-offers";
import { COUNTS, descendants, FakeDoc, type FakeElement } from "./ui-fakes";

const AMBIG: AmbiguityOffer = {
  kind: "ambiguity",
  key: "ambiguity:naka:3",
  side: "naka",
  id: 3,
  title: "Dune",
  candidates: [
    {
      id: 30,
      title: "Dune",
      year: 2021,
      type: "film",
      image: { posterPath: "/dune.jpg" },
    },
    { id: 31, title: "Dune", year: 1984, type: "film" },
  ],
};
const REMOVAL: RemovalOffer = {
  kind: "removal",
  key: "removal:sc:5:50",
  removeFrom: "sc",
  pair: { nakaId: 5, scId: 50 },
  title: "Dune",
  image: { backdropPath: "/back.jpg" },
};

function tile(view: QuestionView) {
  const h = { onChoose: vi.fn(), onAction: vi.fn() };
  const el = buildQuestionTile(new FakeDoc(), view, h, COUNTS) as FakeElement;
  const buttons = descendants(el).filter((d) => d.tag === "button");
  return { el, h, buttons };
}

const byClass = (el: FakeElement, cls: string): FakeElement | undefined =>
  descendants(el).find((d) => d.className === cls);
const isInside = (el: FakeElement, box: FakeElement | undefined): boolean =>
  box !== undefined && descendants(box).includes(el);

describe("buildQuestionTile, an ambiguity", () => {
  it("puts one button per candidate in the scrolling list, each with a thumbnail and its label", () => {
    const { el } = tile(questionView(AMBIG, ["ecarter"]));
    const list = byClass(el, "mn-choices");
    const candidates = (list?.children ?? []) as FakeElement[];
    expect(candidates.map((b) => b.tag)).toEqual(["button", "button"]);
    const [first, second] = candidates;
    const [thumb, label] = (first?.children ?? []) as FakeElement[];
    expect(thumb?.className).toBe("mn-thumb");
    expect(
      (thumb?.children[0] as FakeElement | undefined)?.attributes.src,
    ).toBe("https://image.tmdb.org/t/p/w92/dune.jpg");
    expect(label?.textContent).toBe("Dune (2021, film)");
    const [emptyThumb] = (second?.children ?? []) as FakeElement[];
    expect(emptyThumb?.className).toBe("mn-thumb");
    expect(emptyThumb?.children).toHaveLength(0);
  });

  it("pins « Aucun » and the actions in a footer outside the list", () => {
    const { el, buttons } = tile(questionView(AMBIG, ["ecarter"]));
    const list = byClass(el, "mn-choices");
    const none = buttons.find((b) => b.textContent === NONE_LABEL);
    const skip = buttons.find((b) => b.textContent === "Écarter");
    const foot = byClass(el, "mn-choices-foot");
    expect(none && isInside(none, foot)).toBe(true);
    expect(skip && isInside(skip, foot)).toBe(true);
    expect(none && isInside(none, list)).toBe(false);
    expect(foot && isInside(foot, list)).toBe(false);
  });

  it("routes a trusted click to its choice, a forged one to nothing", () => {
    const { buttons, h } = tile(questionView(AMBIG, ["ecarter"]));
    const [first] = buttons;
    first?.click(false);
    expect(h.onChoose).not.toHaveBeenCalled();
    first?.click(true);
    buttons.find((b) => b.textContent === NONE_LABEL)?.click(true);
    buttons.find((b) => b.textContent === "Écarter")?.click(true);
    expect(h.onChoose.mock.calls).toEqual([
      [{ kind: "candidate", id: 30 }],
      [{ kind: "none" }],
    ]);
    expect(h.onAction).toHaveBeenCalledWith("ecarter");
  });

  it("a sending view has no button", () => {
    const view = {
      ...questionView(AMBIG, ["ecarter"]),
      sending: true as const,
    };
    expect(tile(view).buttons).toEqual([]);
  });
});

describe("buildQuestionTile, a removal", () => {
  it("art, heading, question, the two choices, then the view's action", () => {
    const { el, buttons } = tile(questionView(REMOVAL, ["ecarter"]));
    const [art] = el.children as FakeElement[];
    expect(el.className).toBe("mn-tile");
    expect(art?.className).toBe("mn-art");
    expect((art?.children[0] as FakeElement | undefined)?.attributes.src).toBe(
      "https://image.tmdb.org/t/p/w780/back.jpg",
    );
    const lines = descendants(el)
      .filter((d) => d.className.startsWith("mn-line"))
      .map((d) => d.textContent);
    expect(lines).toEqual([
      "«\u202FDune\u202F» a quitté Ma liste Naka.",
      "Retirer aussi de tes envies SensCritique\u202F?",
    ]);
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Retirer aussi de tes envies SensCritique",
      "Non",
      "Écarter",
    ]);
    expect(byClass(el, "mn-choices")).toBeUndefined();
  });

  it("« Plus tard » when the view says so", () => {
    const { buttons, h } = tile(questionView(REMOVAL, ["plus-tard"]));
    expect(buttons.map((b) => b.textContent).at(-1)).toBe("Plus tard");
    buttons[0]?.click(false);
    expect(h.onChoose).not.toHaveBeenCalled();
    buttons[0]?.click(true);
    expect(h.onChoose).toHaveBeenCalledWith({ kind: "remove" });
  });

  it("a sending view has no button, and keeps its notice", () => {
    const view: QuestionView = {
      ...questionView(REMOVAL, ["ecarter"]),
      sending: true,
      notice: "Envoi de la réponse\u2026",
    };
    const { el, buttons } = tile(view);
    expect(buttons).toEqual([]);
    expect(descendants(el).map((d) => d.textContent)).toContain(
      "Envoi de la réponse\u2026",
    );
  });

  it.each([
    ["sending", { locked: true }],
    ["moot", { mootNotice: true as const }],
  ])("keeps its picture and its layout while %s", (_state, over) => {
    const view = viewOf({
      offer: REMOVAL,
      actions: ["plus-tard"],
      seq: 0,
      locked: false,
      shownAt: 0,
      ...over,
    });
    const { el } = tile(view);
    const [art] = el.children as FakeElement[];
    expect(art?.className).toBe("mn-art");
    expect(byClass(el, "mn-choices")).toBeUndefined();
    expect(byClass(el, "mn-choices-foot")).toBeUndefined();
  });
});

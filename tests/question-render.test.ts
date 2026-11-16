import { describe, expect, it, vi } from "vitest";
import { renderQuestion } from "../src/content/ui/question-render";
import {
  type QuestionView,
  questionView,
} from "../src/content/ui/question-view";
import type { AmbiguityOffer, RemovalOffer } from "../src/sw/question-offers";
import {
  COUNTS,
  descendants,
  FakeDoc,
  type FakeElement,
  FakeShadow,
} from "./ui-fakes";

const NB = "\u202F";
const OFFER: AmbiguityOffer = {
  kind: "ambiguity",
  key: "ambiguity:naka:3",
  side: "naka",
  id: 3,
  title: "<img src=x onerror=1>",
  candidates: [{ id: 30, title: "Dune", year: 2021, type: "film" }],
};
const REMOVAL: RemovalOffer = {
  kind: "removal",
  key: "removal:sc:5:50",
  removeFrom: "sc",
  pair: { nakaId: 5, scId: 50 },
  title: "Dune",
};

function setup(view: QuestionView) {
  const doc = new FakeDoc();
  const root = new FakeShadow();
  const handlers = { onChoose: vi.fn(), onAction: vi.fn() };
  renderQuestion(doc, root, view, handlers, COUNTS);
  const all = descendants(root);
  const buttons = all.filter((el) => el.tag === "button");
  return { root, handlers, all, buttons };
}

describe("the question block", () => {
  it("draws the title as text, never as markup", () => {
    const { all, root } = setup(questionView(OFFER, ["fermer"]));
    expect(
      all.some((el) => el.textContent?.includes("<img src=x onerror=1>")),
    ).toBe(true);
    expect(all.some((el) => el.tag === "img")).toBe(false);
    expect(root.children.length).toBe(1);
  });

  it("draws a button per choice and per action", () => {
    const { buttons } = setup(questionView(OFFER, ["plus-tard", "fermer"]));
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Dune (2021, film)",
      "Aucun de ceux-là",
      "Plus tard",
      "Fermer",
    ]);
  });

  it("draws the question line of a removal", () => {
    const { all } = setup(questionView(REMOVAL, []));
    expect(
      all.some(
        (el) =>
          el.textContent === `Retirer aussi de tes envies SensCritique${NB}?`,
      ),
    ).toBe(true);
  });

  it("acts on a trusted click only", () => {
    const { buttons, handlers } = setup(questionView(OFFER, ["fermer"]));
    buttons[0]?.click(false);
    expect(handlers.onChoose).not.toHaveBeenCalled();
    buttons[0]?.click(true);
    expect(handlers.onChoose).toHaveBeenCalledWith({
      kind: "candidate",
      id: 30,
    });
    buttons[2]?.click(true);
    expect(handlers.onAction).toHaveBeenCalledWith("fermer");
    buttons[2]?.click(false);
    expect(handlers.onAction).toHaveBeenCalledTimes(1);
  });

  it("draws the line and no buttons for a view that is sending", () => {
    const view: QuestionView = {
      ...questionView(OFFER, ["fermer"]),
      sending: true,
      notice: "Envoi de la réponse\u2026",
    };
    const { buttons, all } = setup(view);
    expect(buttons).toEqual([]);
    expect(
      all.some((el) => el.textContent === "Envoi de la réponse\u2026"),
    ).toBe(true);
  });

  it("draws the error line", () => {
    const view: QuestionView = { ...questionView(OFFER, []), error: "boom" };
    expect(setup(view).all.some((el) => el.textContent === "boom")).toBe(true);
  });

  it("draws a card, a title line and plain buttons in rows", () => {
    const { root, buttons } = setup(questionView(OFFER, ["fermer"]));
    const card = root.children[0] as FakeElement;
    expect(card.className).toBe("mn-card");
    expect((card.children[0] as FakeElement).className).toBe(
      "mn-line mn-title",
    );
    expect(buttons.map((b) => b.className)).toEqual([
      "mn-btn",
      "mn-btn",
      "mn-btn",
    ]);
    expect((buttons[0]?.parent as FakeElement | null)?.className).toBe(
      "mn-row",
    );
  });
});

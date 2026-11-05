import { describe, expect, it } from "vitest";
import { questionView } from "../src/content/ui/question-view";
import type { AmbiguityOffer, RemovalOffer } from "../src/sw/question-offers";

const NB = "\u202F";
const ambiguity = (over: Partial<AmbiguityOffer> = {}): AmbiguityOffer => ({
  kind: "ambiguity",
  key: "ambiguity:naka:3",
  side: "naka",
  id: 3,
  title: "Dune",
  candidates: [
    { id: 30, title: "Dune", year: 2021, type: "film" },
    { id: 31, title: "Dune", type: "serie" },
  ],
  ...over,
});
const removal = (over: Partial<RemovalOffer> = {}): RemovalOffer => ({
  kind: "removal",
  key: "removal:sc:5:50",
  removeFrom: "sc",
  pair: { nakaId: 5, scId: 50 },
  title: "Dune",
  ...over,
});

describe("questionView", () => {
  it("lists the candidates, then none, then the actions given", () => {
    const view = questionView(ambiguity(), ["plus-tard", "fermer"]);
    expect(view.heading).toBe(
      `Quel titre SensCritique correspond à «${NB}Dune${NB}»${NB}?`,
    );
    expect(view.question).toBeUndefined();
    expect(view.choices).toEqual([
      { choice: { kind: "candidate", id: 30 }, label: "Dune (2021, film)" },
      { choice: { kind: "candidate", id: 31 }, label: "Dune (série)" },
      { choice: { kind: "none" }, label: "Aucun de ceux-là" },
    ]);
    expect(view.actions).toEqual(["plus-tard", "fermer"]);
    expect(view.sending).toBeUndefined();
  });

  it("asks a removal with remove and keep", () => {
    const view = questionView(removal(), ["fermer"]);
    expect(view.heading).toBe(`«${NB}Dune${NB}» a quitté Ma liste Naka.`);
    expect(view.question).toBe(
      `Retirer aussi de vos envies SensCritique${NB}?`,
    );
    expect(view.choices).toEqual([
      {
        choice: { kind: "remove" },
        label: "Retirer aussi de vos envies SensCritique",
      },
      { choice: { kind: "keep" }, label: "Non" },
    ]);
  });

  it("keeps a hostile title as the literal text", () => {
    const title = "<img src=x onerror=1>";
    const view = questionView(ambiguity({ title }), []);
    expect(view.heading).toContain(title);
    expect(questionView(removal({ title }), []).heading).toContain(title);
  });

  it("shows (titre inconnu) for an empty title", () => {
    expect(questionView(removal({ title: "" }), []).heading).toBe(
      `«${NB}(titre inconnu)${NB}» a quitté Ma liste Naka.`,
    );
  });
});

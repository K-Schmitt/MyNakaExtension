import { describe, expect, it } from "vitest";
import type { HomeHandlers } from "../src/content/ui/home-block";
import { homeView } from "../src/content/ui/home-view";
import { questionView } from "../src/content/ui/question-view";
import { renderRow } from "../src/content/ui/row-render";
import { ROW_SHEET } from "../src/content/ui/row-styles";
import type { AmbiguityOffer, RemovalOffer } from "../src/sw/question-offers";
import { themeCss } from "../src/ui/theme-tokens";
import { filmCard } from "./rating-fixtures";
import { descendants, FakeDoc, type FakeElement, FakeShadow } from "./ui-fakes";

const codePoints = (text: string | null): number[] =>
  [...(text ?? "")].map((c) => c.codePointAt(0) ?? 0);

const AMBIG: AmbiguityOffer = {
  kind: "ambiguity",
  key: "ambiguity:naka:1",
  side: "naka",
  id: 1,
  title: "Question posée",
  candidates: [{ id: 10, title: "Dune", year: 2021, type: "film" }],
};
const LIVE: RemovalOffer = {
  kind: "removal",
  key: "removal:sc:1:2",
  removeFrom: "sc",
  pair: { nakaId: 1, scId: 2 },
  title: "Carte en direct",
};

const HANDLERS: HomeHandlers = {
  entry: () => ({
    onChoose: () => {},
    onAction: () => {},
    onOther: () => {},
    onConfirm: () => {},
  }),
  question: () => ({ onChoose: () => {}, onAction: () => {} }),
};

function drawn() {
  const doc = new FakeDoc();
  const root = new FakeShadow();
  const view = homeView(
    [
      { card: filmCard({ key: "movie:1", title: "Ancien", at: 100 }) },
      { card: filmCard({ key: "movie:2", title: "Récent", at: 200 }) },
    ],
    [{ key: AMBIG.key, view: questionView(AMBIG, ["ecarter"]) }],
    { key: LIVE.key, view: questionView(LIVE, ["fermer"]) },
  );
  renderRow(doc, root, view, HANDLERS);
  return root;
}

const texts = (el: FakeElement): string =>
  descendants(el)
    .map((d) => d.textContent ?? "")
    .join(" ");

describe("renderRow", () => {
  it("draws one header, titled « À traiter », with its subtitle", () => {
    const root = drawn();
    const [head, track] = root.children as FakeElement[];
    expect(root.children).toHaveLength(2);
    const lines = descendants(head as FakeElement).map((d) => d.textContent);
    expect(lines.map(codePoints)).toEqual([
      codePoints("À traiter"),
      codePoints("Notes et questions pour SensCritique"),
    ]);
    expect(track?.className).toBe("mn-track");
  });

  it("puts the live card first, then the entries newest first, then the questions", () => {
    const [, track] = drawn().children as FakeElement[];
    const cards = (track as FakeElement).children as FakeElement[];
    expect(cards).toHaveLength(4);
    expect(texts(cards[0] as FakeElement)).toContain("Carte en direct");
    expect(texts(cards[1] as FakeElement)).toContain("Récent");
    expect(texts(cards[2] as FakeElement)).toContain("Ancien");
    expect(texts(cards[3] as FakeElement)).toContain("Question posée");
  });

  it("has no fold button", () => {
    const all = descendants(drawn()).map((d) => d.textContent);
    expect(all).not.toContain("Réduire");
    expect(all).not.toContain("Développer");
  });

  it("replaces what the root held", () => {
    const doc = new FakeDoc();
    const root = new FakeShadow();
    renderRow(doc, root, homeView([]), HANDLERS);
    renderRow(doc, root, homeView([]), HANDLERS);
    expect(root.children).toHaveLength(2);
  });
});

describe("ROW_SHEET", () => {
  it("starts with the theme tokens scoped to the host, then holds the track's rule", () => {
    expect(ROW_SHEET.startsWith(themeCss(":host"))).toBe(true);
    expect(ROW_SHEET).toContain(".mn-track{");
    expect(ROW_SHEET).toContain(".mn-card{");
  });
});

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
    const lines = descendants(head as FakeElement)
      .filter((d) => ["mn-head-title", "mn-head-sub"].includes(d.className))
      .map((d) => d.textContent);
    expect(lines.map(codePoints)).toEqual([
      codePoints("À traiter"),
      codePoints("Notes et questions pour SensCritique"),
    ]);
    expect(track?.className).toBe("mn-track");
  });

  it("the title is an h2, like Naka's row titles, with the UA margin reset", () => {
    const root = drawn();
    const title = descendants(root.children[0] as FakeElement).find(
      (d) => d.className === "mn-head-title",
    );
    expect(title?.tag).toBe("h2");
    expect(ROW_SHEET).toMatch(/\.mn-head-title\{margin:0;/);
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

  it("draws every card as a tile, an entry with its image on top", () => {
    const doc = new FakeDoc();
    const root = new FakeShadow();
    const image = "https://image.tmdb.org/t/p/w780/back.jpg";
    const view = homeView(
      [
        {
          card: filmCard({
            key: "movie:1",
            image: { backdropPath: "/back.jpg" },
          }),
        },
      ],
      [{ key: AMBIG.key, view: questionView(AMBIG, ["ecarter"]) }],
      { key: LIVE.key, view: questionView(LIVE, ["fermer"]) },
    );
    renderRow(doc, root, view, HANDLERS);
    const [, track] = root.children as FakeElement[];
    const cards = (track as FakeElement).children as FakeElement[];
    expect(cards.map((c) => c.className)).toEqual([
      "mn-tile",
      "mn-tile mn-tile--poster",
      "mn-tile",
    ]);
    const [, entry] = cards;
    const [art] = (entry as FakeElement).children as FakeElement[];
    expect((art?.children[0] as FakeElement | undefined)?.attributes.src).toBe(
      image,
    );
  });

  it("puts the arrows ‹ and › in the header, labelled, hidden before any layout", () => {
    const [head] = drawn().children as FakeElement[];
    const arrows = descendants(head as FakeElement).filter(
      (d) => d.tag === "button",
    );
    expect(
      arrows.map((a) => [a.textContent, a.attributes["aria-label"]]),
    ).toEqual([
      ["\u2039", "Précédent"],
      ["\u203A", "Suivant"],
    ]);
    expect(arrows.map((a) => a.attributes.hidden)).toEqual(["", ""]);
  });

  it("a redraw keeps the track where the owner had scrolled it", () => {
    const doc = new FakeDoc();
    const root = new FakeShadow();
    const view = homeView([{ card: filmCard({ key: "movie:1" }) }]);
    renderRow(doc, root, view, HANDLERS);
    const [, first] = root.children as FakeElement[];
    (first as unknown as { scrollLeft: number }).scrollLeft = 624;
    renderRow(doc, root, view, HANDLERS);
    const [, second] = root.children as FakeElement[];
    expect(second).not.toBe(first);
    expect((second as unknown as { scrollLeft: number }).scrollLeft).toBe(624);
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

// Handlers that record which key each click was routed to.
function recording() {
  const calls: string[] = [];
  const handlers: HomeHandlers = {
    entry: (key) => ({
      onChoose: (value) => calls.push(`entry ${key} choose ${value}`),
      onAction: (action) => calls.push(`entry ${key} ${action}`),
      onOther: () => calls.push(`entry ${key} other`),
      onConfirm: () => calls.push(`entry ${key} confirm`),
    }),
    question: (key) => ({
      onChoose: (choice) => calls.push(`question ${key} choose ${choice.kind}`),
      onAction: (action) => calls.push(`question ${key} ${action}`),
    }),
  };
  return { calls, handlers };
}

function drawnWith(handlers: HomeHandlers) {
  const root = new FakeShadow();
  const view = homeView(
    [{ card: filmCard({ key: "movie:7", title: "<b>Un film</b>", at: 100 }) }],
    [{ key: AMBIG.key, view: questionView(AMBIG, ["ecarter"]) }],
    { key: LIVE.key, view: questionView(LIVE, ["fermer"]) },
  );
  renderRow(new FakeDoc(), root, view, handlers);
  const [, track] = root.children as FakeElement[];
  return { root, cards: (track as FakeElement).children as FakeElement[] };
}

const buttonsOf = (card: FakeElement, text?: string): FakeElement[] =>
  descendants(card).filter(
    (el) =>
      el.tag === "button" && (text === undefined || el.textContent === text),
  );
const starOf = (card: FakeElement, n: number): FakeElement | undefined =>
  descendants(card).find((el) => el.attributes["aria-label"] === `${n} sur 10`);

describe("renderRow routes each click to its own card's key", () => {
  it("the live card: a forged click does nothing, a trusted one reaches the live key", () => {
    const { calls, handlers } = recording();
    const [live] = drawnWith(handlers).cards;
    const [remove] = buttonsOf(live as FakeElement);
    remove?.click(false);
    expect(calls).toEqual([]);
    remove?.click(true);
    expect(calls).toEqual([`question ${LIVE.key} choose remove`]);
  });

  it("an entry: a forged star does nothing, a trusted one reaches the entry's key", () => {
    const { calls, handlers } = recording();
    const [, entry] = drawnWith(handlers).cards;
    const eight = starOf(entry as FakeElement, 8);
    eight?.click(false);
    expect(calls).toEqual([]);
    eight?.click(true);
    expect(calls).toEqual(["entry movie:7 choose 8"]);
  });

  it("a question: a forged « Écarter » does nothing, a trusted one reaches the question's key", () => {
    const { calls, handlers } = recording();
    const [, , question] = drawnWith(handlers).cards;
    const [skip] = buttonsOf(question as FakeElement, "Écarter");
    skip?.click(false);
    expect(calls).toEqual([]);
    skip?.click(true);
    expect(calls).toEqual([`question ${AMBIG.key} ecarter`]);
  });

  it("draws a title as text, never as markup", () => {
    const { handlers } = recording();
    const texts = descendants(drawnWith(handlers).root).map(
      (d) => d.textContent,
    );
    expect(texts.some((t) => t?.includes("<b>Un film</b>"))).toBe(true);
    expect(
      descendants(drawnWith(handlers).root).some((d) => d.tag === "b"),
    ).toBe(false);
  });
});

describe("ROW_SHEET", () => {
  it("starts with the theme tokens scoped to the host, then holds the track's rule", () => {
    expect(ROW_SHEET.startsWith(themeCss(":host"))).toBe(true);
    expect(ROW_SHEET).toContain(".mn-track{");
    expect(ROW_SHEET).toContain(".mn-card{");
  });

  it("lays a rating tile's poster over the whole tile, its lines on a dark fade at the bottom", () => {
    expect(ROW_SHEET).toContain(".mn-tile--poster{position:relative;}");
    expect(ROW_SHEET).toContain(
      ".mn-tile--poster .mn-art{position:absolute;inset:0;aspect-ratio:auto;height:100%;}",
    );
    expect(ROW_SHEET).toContain(
      ".mn-tile--poster .mn-tile-body{position:relative;flex:0 0 auto;margin-top:auto;",
    );
  });

  it("holds the tile, art, choice list and track values of the layout", () => {
    expect(ROW_SHEET).toContain("width:200px;height:280px;");
    expect(ROW_SHEET).toContain("aspect-ratio:20 / 9;");
    expect(ROW_SHEET).toContain("-webkit-line-clamp:2;");
    expect(ROW_SHEET).toContain(".mn-tile{font-size:13px;line-height:18px;}");
    expect(ROW_SHEET).toContain("object-fit:cover;");
    expect(ROW_SHEET).toContain("width:24px;height:36px;");
    expect(ROW_SHEET).toContain(".mn-tile .mn-star{font-size:14px;");
    expect(ROW_SHEET).toContain("overflow-y:auto;overscroll-behavior:contain;");
    expect(ROW_SHEET).toContain(
      "overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;",
    );
    expect(ROW_SHEET).toContain("gap:12px;");
  });

  it("ends with the reduced-motion rule, so it overrides the buttons' and arrows' own transitions", () => {
    const rule =
      "@media (prefers-reduced-motion: reduce){.mn-btn,.mn-arrow{transition:none;}}";
    expect(ROW_SHEET.endsWith(rule)).toBe(true);
    expect(ROW_SHEET.indexOf(rule)).toBe(ROW_SHEET.lastIndexOf(rule));
  });
});

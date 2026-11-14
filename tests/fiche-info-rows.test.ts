import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FicheInfo } from "../src/ext/fiche-answers";
import {
  FILM_PATH,
  ficheEvent,
  linked,
  SERIES_PATH,
  seasonEvent,
  seriesEvent,
  settle,
} from "./fiche-controller-fakes";
import {
  checked,
  deepParts,
  FILM_ROWS,
  fakeUi,
  SERIES_ROWS,
  starsOf,
  texts,
} from "./fiche-ui-world";
import { FakeElement } from "./ui-fakes";

const product = (over: Partial<NonNullable<FicheInfo["product"]>> = {}) => ({
  state: "linked" as const,
  product: {
    id: 55,
    average: 6.9,
    mine: 7,
    label: { title: "Solaris", year: 1972 },
    canUndo: false,
    canRemove: true,
    protected: false,
    ...over,
  },
});

async function film(info: FicheInfo = product()) {
  const t = fakeUi(FILM_PATH);
  t.controller.event(ficheEvent());
  t.ofType("fiche-info")[0]?.answer(info);
  await settle();
  return t;
}

async function series() {
  const t = fakeUi(SERIES_PATH);
  t.controller.event(seriesEvent());
  t.ofType("fiche-info")[0]?.answer(linked(66, 5));
  await settle();
  return t;
}

/** The label of each of the panel's rows, in order: the first span's text. */
const rowLabels = (panel: FakeElement) =>
  panel.children.map((row) => (row.children[0] as FakeElement).textContent);

/** The title's stars, in the « Ta note » row. */
const titleStars = (t: ReturnType<typeof fakeUi>) =>
  starsOf(deepParts(t.kept.ours()[1] as FakeElement));

const valueSpan = (row: FakeElement | undefined) =>
  row?.children[1] as FakeElement | undefined;

describe("the SensCritique rows in Naka's info panel", () => {
  it.each([
    ["a film's 4-row panel", film, FILM_ROWS],
    ["a series' 6-row panel", series, SERIES_ROWS],
  ])(
    "on %s, they are the last two children, after « Note TMDB »",
    async (_n, open, naka) => {
      const t = await open();
      const panel = t.kept.panel();
      expect(rowLabels(panel)).toEqual([...naka, "SensCritique", "Ta note"]);
      expect(t.kept.ours()).toEqual(panel.children.slice(-2));
    },
  );

  it("copies Naka's row shape: div.dcf-info-row, a label span, a value span", async () => {
    const t = await film();
    for (const row of t.kept.ours()) {
      expect(row.tag).toBe("div");
      expect(row.className).toBe("dcf-info-row");
      expect(row.children.map((c) => (c as FakeElement).tag)).toEqual([
        "span",
        "span",
      ]);
    }
  });

  it("shows the average « 6,9 / 10 », and ten stars with the owner's rating", async () => {
    const t = await film();
    const [average, mine] = t.kept.ours();
    expect(valueSpan(average)?.textContent).toBe("6,9 / 10");
    const stars = deepParts(valueSpan(mine) as FakeElement);
    expect(starsOf(stars)).toHaveLength(10);
    expect(checked(stars)).toEqual(["7 sur 10"]);
  });

  it("names the stars after the SensCritique title they rate", async () => {
    const t = await film();
    const group = deepParts(t.kept.ours()[1] as FakeElement).find(
      (el) => el.attributes.role === "radiogroup",
    );
    expect(group?.attributes["aria-label"]).toBe(
      "Noter «\u202FSolaris (1972)\u202F» sur SensCritique",
    );
  });

  it("shows « — » without an average, and before the worker answers", async () => {
    const t = await film(product({ average: null }));
    expect(valueSpan(t.kept.ours()[0])?.textContent).toBe("—");
    const early = fakeUi(FILM_PATH);
    early.controller.event(ficheEvent());
    const [average, mine] = early.kept.ours();
    expect(valueSpan(average)?.textContent).toBe("—");
    expect(texts(deepParts(valueSpan(mine) as FakeElement))).toEqual(["—"]);
  });

  it("puts the stars in a closed host, and stops input at the rows", async () => {
    const t = await film();
    const [average, mine] = t.kept.ours() as FakeElement[];
    const host = valueSpan(mine)?.children[0] as FakeElement;
    expect(host.shadowInit).toEqual([{ mode: "closed" }]);
    const panelClicks: unknown[] = [];
    t.kept.panel().addEventListener("click", (e) => panelClicks.push(e));
    (average as FakeElement).click(true);
    starsOf(deepParts(mine as FakeElement))[2]?.click(true);
    expect(panelClicks).toEqual([]);
  });

  it("keeps the series' stars (and the focus on them) while the episode ratings come in", async () => {
    const t = fakeUi(SERIES_PATH);
    t.page.shown = 1;
    t.controller.event(seriesEvent());
    t.controller.event(seasonEvent(1));
    t.ofType("fiche-info")[0]?.answer(linked(66, 5));
    await settle();
    t.ofType("fiche-season")[0]?.answer({
      episodes: [{ episode: 1, productId: 101, average: 7 }],
    });
    await settle();
    const before = titleStars(t)[4];
    before?.focus();
    t.ofType("fiche-mine")[0]?.answer({ mine: 6, average: null });
    await settle();
    expect(t.last()?.episodes.get(1)?.mine).toBe(6);
    expect(titleStars(t)[4]).toBe(before);
    expect(FakeElement.focused).toBe(before);
  });

  it("keeps the stars through an undo on its way and its ending", async () => {
    const t = await film(product({ canUndo: true }));
    const before = titleStars(t)[2];
    t.controller.undo();
    expect(t.last()?.pending).toBe("undo");
    expect(titleStars(t)[2]).toBe(before);
    t.ofType("fiche-undo")[0]?.answer({ refused: "expired" });
    await settle();
    expect(t.last()?.outcome?.kind).toBe("undo-refused");
    expect(titleStars(t)[2]).toBe(before);
  });

  it("builds the stars again when the rating or the product changes", async () => {
    const t = await film(product({ canUndo: true }));
    const first = titleStars(t)[2];
    t.controller.undo();
    t.ofType("fiche-undo")[0]?.answer({ ok: true, maListe: "none" });
    await settle();
    t.ofType("fiche-info")[1]?.answer(product({ mine: 6 }));
    await settle();
    const second = titleStars(t)[2];
    expect(second).not.toBe(first);
    expect(checked(deepParts(t.kept.ours()[1] as FakeElement))).toEqual([
      "6 sur 10",
    ]);
    t.controller.undo();
    t.ofType("fiche-undo")[1]?.answer({ ok: true, maListe: "none" });
    await settle();
    t.ofType("fiche-info")[2]?.answer(product({ id: 56, mine: 6 }));
    await settle();
    expect(titleStars(t)[2]).not.toBe(second);
  });

  it("sends the rating on a trusted star click only", async () => {
    const t = await film();
    const stars = () => starsOf(deepParts(t.kept.ours()[1] as FakeElement));
    stars()[7]?.click(false);
    expect(t.ofType("fiche-rate")).toEqual([]);
    stars()[7]?.click(true);
    expect(t.ofType("fiche-rate").map((c) => c.msg.type)).toEqual([
      "fiche-rate",
    ]);
  });

  it("are back once each after Naka redraws the aside, the actions right after the panel", async () => {
    const t = await film();
    t.kept.redraw();
    expect(t.kept.ours()).toEqual([]);
    t.pageChanged();
    t.pageChanged();
    const panel = t.kept.panel();
    expect(rowLabels(panel)).toEqual([...FILM_ROWS, "SensCritique", "Ta note"]);
    const after = t.kept.aside.children;
    expect(after.indexOf(t.kept.actions() as FakeElement)).toBe(
      after.indexOf(panel) + 1,
    );
    const hosts = after.filter((c) => (c as FakeElement).shadowInit?.length);
    expect(hosts).toHaveLength(1);
  });

  it("go back to the end when Naka adds a row after them", async () => {
    const t = await film();
    const panel = t.kept.panel();
    const late = panel.children[0] as FakeElement;
    panel.appendChild(late);
    t.pageChanged();
    expect(panel.children.slice(-2)).toEqual(t.kept.ours());
    expect(panel.children).toHaveLength(FILM_ROWS.length + 2);
  });

  it("come off with the actions when the tab leaves the title page", async () => {
    const t = await film();
    t.controller.path("/");
    expect(t.kept.ours()).toEqual([]);
    expect(t.kept.actions()).toBeUndefined();
    expect(t.watching()).toBe(false);
  });

  it("leave no separate block: the step 7 panel modules are gone", () => {
    expect(existsSync("src/content/ui/fiche-panel.ts")).toBe(false);
    expect(existsSync("src/content/ui/fiche-panel-block.ts")).toBe(false);
  });
});

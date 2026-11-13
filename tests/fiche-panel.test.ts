import { describe, expect, it } from "vitest";
import type { FicheView } from "../src/content/fiche-view";
import type { FicheHandlers } from "../src/content/ui/fiche-handlers";
import { createFichePanel } from "../src/content/ui/fiche-panel";
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
  buttonNamed,
  checked,
  fakeUi,
  idleKeeper,
  panelParts,
  starsOf,
  texts,
} from "./fiche-ui-world";
import { FakeDoc, type FakeElement } from "./ui-fakes";

const NB = "\u202F";

async function film(info: FicheInfo = linked(55, 7)) {
  const t = fakeUi(FILM_PATH);
  t.controller.event(ficheEvent());
  t.ofType("fiche-info")[0]?.answer(info);
  await settle();
  return { ...t, parts: () => panelParts(t.kept) };
}

async function series() {
  const t = fakeUi(SERIES_PATH);
  t.controller.event(seriesEvent());
  t.ofType("fiche-info")[0]?.answer(linked(66, null));
  await settle();
  return { ...t, parts: () => panelParts(t.kept) };
}

const star = (parts: FakeElement[], value: number) =>
  starsOf(parts).find((s) => s.attributes["aria-label"] === `${value} sur 10`);

describe("the title page panel", () => {
  it("shows a loading line until the worker answers", () => {
    const t = fakeUi(FILM_PATH);
    t.controller.event(ficheEvent());
    const parts = panelParts(t.kept);
    expect(texts(parts)).toEqual([
      "SensCritique",
      "Recherche sur SensCritique\u2026",
    ]);
    expect(starsOf(parts)).toEqual([]);
  });

  it("shows a linked film's average, the title it rates, then ten stars with the owner's rating marked", async () => {
    const t = await film({
      state: "linked",
      product: {
        id: 55,
        average: 6.9,
        mine: 7,
        label: { title: "Solaris", year: 1972 },
      },
    });
    const parts = t.parts();
    const shown = texts(parts);
    expect(shown.slice(0, 4)).toEqual([
      "SensCritique",
      "6,9 / 10",
      "Solaris (1972)",
      "Ta note",
    ]);
    expect(starsOf(parts)).toHaveLength(10);
    expect(checked(parts)).toEqual(["7 sur 10"]);
    const average = parts.findIndex((p) => p.textContent === "6,9 / 10");
    const firstStar = parts.indexOf(starsOf(parts)[0] as FakeElement);
    expect(average).toBeLessThan(firstStar);
  });

  it("puts the panel in a closed shadow root", async () => {
    const t = await film();
    expect(t.kept.host?.shadowInit).toEqual([{ mode: "closed" }]);
  });

  it("says when SensCritique has no average", async () => {
    const t = await film({
      state: "matched",
      product: {
        id: 55,
        average: null,
        mine: null,
        label: { title: "Solaris" },
      },
    });
    expect(texts(t.parts())).toContain("Pas encore de moyenne");
    expect(checked(t.parts())).toEqual([]);
  });

  it("sends a film's rating on a trusted star click", async () => {
    const t = await film();
    star(t.parts(), 8)?.click(true);
    expect(t.ofType("fiche-rate").map((c) => c.msg)).toEqual([
      {
        type: "fiche-rate",
        contentId: 5,
        target: "film",
        productId: 55,
        rating: 8,
      },
    ]);
    expect(texts(t.parts())).toContain("Envoi de la note\u2026");
    t.ofType("fiche-rate")[0]?.answer({ ok: true });
    await settle();
    expect(checked(t.parts())).toEqual(["8 sur 10"]);
  });

  it("sends nothing on a forged star click", async () => {
    const t = await film();
    star(t.parts(), 8)?.click(false);
    expect(t.ofType("fiche-rate")).toEqual([]);
  });

  it("asks a series' confirmation first: « Annuler » sends nothing", async () => {
    const t = await series();
    star(t.parts(), 6)?.click(true);
    const parts = t.parts();
    expect(texts(parts)).toContain(
      "SensCritique va retirer la série de tes envies.",
    );
    expect(starsOf(parts)).toEqual([]);
    buttonNamed(parts, "Annuler")?.click(true);
    expect(t.ofType("fiche-rate")).toEqual([]);
    expect(starsOf(t.parts())).toHaveLength(10);
  });

  it("sends a series' rating on « Envoyer », a trusted click only", async () => {
    const t = await series();
    star(t.parts(), 6)?.click(true);
    buttonNamed(t.parts(), "Envoyer")?.click(false);
    expect(t.ofType("fiche-rate")).toEqual([]);
    buttonNamed(t.parts(), "Envoyer")?.click(true);
    expect(t.ofType("fiche-rate").map((c) => c.msg)).toEqual([
      {
        type: "fiche-rate",
        contentId: 6,
        target: "série",
        productId: 66,
        rating: 6,
      },
    ]);
  });

  it("says a rating went out when a later step failed, with that step's error", async () => {
    const t = await film();
    star(t.parts(), 9)?.click(true);
    t.ofType("fiche-rate")[0]?.answer({ sent: true, error: "naka-session" });
    await settle();
    expect(texts(t.parts())).toContain(
      `Note envoyée, mais le retrait de Ma liste n’a pas abouti${NB}: reconnectez-vous sur Naka.`,
    );
    expect(checked(t.parts())).toEqual(["9 sur 10"]);
  });

  it("shows the error line of a rating that did not go out", async () => {
    const t = await film();
    star(t.parts(), 9)?.click(true);
    t.ofType("fiche-rate")[0]?.answer({ error: "finish-limit" });
    await settle();
    expect(texts(t.parts())).toContain(
      `La note n'est pas partie${NB}: trop de fins de visionnage en une heure, réessayez plus tard.`,
    );
    t.controller.rateTitle(4);
    t.ofType("fiche-rate")[1]?.answer(undefined);
    await settle();
    expect(texts(t.parts())).toContain(
      `La note n'est pas partie${NB}: ce titre n'a pas pu être noté.`,
    );
  });

  it("says when SensCritique could not be read", async () => {
    const t = fakeUi(FILM_PATH);
    t.controller.event(ficheEvent());
    t.ofType("fiche-info")[0]?.answer(undefined);
    await settle();
    expect(texts(panelParts(t.kept))).toEqual([
      "SensCritique",
      "SensCritique n’a pas pu être lu.",
    ]);
  });

  it("says a title is not on SensCritique", async () => {
    const t = await film({ state: "notfound" });
    expect(texts(t.parts())).toEqual([
      "SensCritique",
      "Pas trouvé sur SensCritique",
    ]);
  });

  it("offers the candidates with their posters; a trusted choice sends fiche-link, then shows the block", async () => {
    const t = await film({
      state: "choose",
      candidates: [
        {
          id: 70,
          title: "Solaris",
          year: 1972,
          type: "film",
          image: { posterPath: "/sol.jpg" },
        },
        { id: 71, title: "Solaris", year: 2002, type: "film" },
      ],
    });
    const parts = t.parts();
    expect(texts(parts)).toContain("Relier à SensCritique");
    const choices = parts.filter((p) =>
      p.className.split(" ").includes("mn-choice"),
    );
    expect(choices.map((c) => texts(c.children as FakeElement[]))).toEqual([
      ["Solaris (1972, film)"],
      ["Solaris (2002, film)"],
    ]);
    const poster = parts.find((p) => p.tag === "img");
    expect(poster?.attributes.src).toBe(
      "https://image.tmdb.org/t/p/w92/sol.jpg",
    );
    choices[1]?.click(false);
    expect(t.ofType("fiche-link")).toEqual([]);
    choices[1]?.click(true);
    expect(t.ofType("fiche-link").map((c) => c.msg)).toEqual([
      { type: "fiche-link", contentId: 5, productId: 71 },
    ]);
    t.ofType("fiche-link")[0]?.answer({ ok: true });
    await settle();
    t.ofType("fiche-info")[1]?.answer(linked(71, null));
    await settle();
    expect(texts(t.parts())).toContain("6,9 / 10");
    expect(starsOf(t.parts())).toHaveLength(10);
  });

  it("shows a line for the shown season whose read failed, apart from the outcome", async () => {
    const t = fakeUi(SERIES_PATH);
    t.page.shown = 2;
    t.controller.event(seriesEvent());
    t.controller.event(seasonEvent(2));
    t.ofType("fiche-info")[0]?.answer(linked(66));
    await settle();
    t.ofType("fiche-season")[0]?.answer(undefined);
    await settle();
    expect(texts(panelParts(t.kept))).toContain(
      "Les notes de la saison 2 n’ont pas pu être lues.",
    );
    expect(starsOf(panelParts(t.kept))).toHaveLength(10);
  });

  it("takes the panel down when the tab leaves the title page", async () => {
    const t = await film();
    t.controller.path("/");
    expect(panelParts(t.kept)).toEqual([]);
    expect(t.kept.detached).toBe(1);
  });
});

describe("the panel between two views", () => {
  const noop = () => {};
  const handlers: FicheHandlers = {
    rateTitle: noop,
    confirmSeries: noop,
    cancelSeries: noop,
    rateEpisode: noop,
    link: noop,
  };
  // A fresh object every time: equal views are equal by value, never the same object.
  const filmView = (mine: number | null, episodes = 0): FicheView => ({
    mediaType: "movie",
    info: linked(55, mine),
    episodes: new Map(
      Array.from({ length: episodes }, (_, i) => [
        i + 1,
        { productId: 100 + i, average: 7 },
      ]),
    ),
  });

  function panel() {
    const doc = new FakeDoc();
    const shown = createFichePanel({ doc, keeper: idleKeeper });
    const built = () =>
      doc.created.filter((el) => el.className === "mn-fiche").length;
    return { shown, built };
  }

  it("builds the block once for two equal views, whatever the episodes", () => {
    const t = panel();
    t.shown.show(filmView(7), handlers);
    t.shown.show(filmView(7, 3), handlers);
    expect(t.built()).toBe(1);
  });

  it("builds it again when the shown rating changes", () => {
    const t = panel();
    t.shown.show(filmView(7), handlers);
    t.shown.show(filmView(8), handlers);
    expect(t.built()).toBe(2);
  });

  it("builds it again when a write starts, ends or fails", () => {
    const t = panel();
    t.shown.show(filmView(7), handlers);
    t.shown.show({ ...filmView(7), pending: "rating" }, handlers);
    t.shown.show(
      { ...filmView(7), outcome: { kind: "not-sent", error: "sc-session" } },
      handlers,
    );
    expect(t.built()).toBe(3);
  });

  it("builds it again for a season line, or other handlers", () => {
    const t = panel();
    t.shown.show(filmView(7), handlers);
    t.shown.show({ ...filmView(7), season: 2, seasonFailed: true }, handlers);
    t.shown.show(
      { ...filmView(7), season: 2, seasonFailed: true },
      {
        ...handlers,
      },
    );
    expect(t.built()).toBe(3);
  });

  it("builds it again when the season changes, its line staying", () => {
    const t = panel();
    t.shown.show({ ...filmView(7), season: 2, seasonFailed: true }, handlers);
    t.shown.show({ ...filmView(7), season: 3, seasonFailed: true }, handlers);
    expect(t.built()).toBe(2);
  });

  it("compares a field of the view it does not name yet", () => {
    const t = panel();
    t.shown.show(filmView(7), handlers);
    const later = { ...filmView(7), later: "drawn" } as FicheView;
    t.shown.show(later, handlers);
    expect(t.built()).toBe(2);
  });

  it("builds it again after it was taken down", () => {
    const t = panel();
    t.shown.show(filmView(7), handlers);
    t.shown.hide();
    t.shown.show(filmView(7), handlers);
    expect(t.built()).toBe(2);
  });

  it("keeps the series' stars (and the focus on them) while the episode ratings come in", async () => {
    const t = fakeUi(SERIES_PATH);
    t.page.shown = 1;
    t.controller.event(seriesEvent());
    t.controller.event(seasonEvent(1));
    t.ofType("fiche-info")[0]?.answer(linked(66));
    await settle();
    t.ofType("fiche-season")[0]?.answer({
      episodes: [{ episode: 1, productId: 101, average: 7 }],
    });
    await settle();
    const before = starsOf(panelParts(t.kept))[4];
    t.ofType("fiche-mine")[0]?.answer({ mine: 6, average: null });
    await settle();
    expect(t.last()?.episodes.get(1)?.mine).toBe(6);
    expect(starsOf(panelParts(t.kept))[4]).toBe(before);
  });
});

import { describe, expect, it } from "vitest";
import { createFicheController } from "../src/content/fiche-controller";
import {
  FILM_PATH,
  fakePorts,
  ficheEvent,
  linked,
  SERIES_PATH,
  seasonEvent,
  seasonOf,
  seriesEvent,
  settle,
} from "./fiche-controller-fakes";

const TAB = { ok: true, dejaVu: "tab" };
type Fake = ReturnType<typeof fakePorts>;
const rateMsg = (t: Fake) => t.ofType("fiche-rate")[0]?.msg;

async function filmWith(vuFilm: boolean | undefined) {
  const t = fakePorts();
  t.page.vuFilm = vuFilm;
  const controller = createFicheController(t.ports);
  controller.path(FILM_PATH);
  controller.event(ficheEvent());
  t.ofType("fiche-info")[0]?.answer(linked(55));
  await settle();
  return { ...t, controller };
}

async function episodesShown(vu: [number, boolean][]) {
  const t = fakePorts();
  t.page.shown = 2;
  for (const [n, on] of vu) t.page.vuRows.set(n, on);
  const controller = createFicheController(t.ports);
  controller.path(SERIES_PATH);
  controller.event(seriesEvent());
  t.ofType("fiche-info")[0]?.answer(linked(66));
  await settle();
  controller.event(seasonEvent(2));
  t.ofType("fiche-season")[0]?.answer(seasonOf(3, 4));
  await settle();
  return { ...t, controller };
}

describe("a film rating and Naka's « Déjà vu » button", () => {
  it("sends vuByTab when the button is off", async () => {
    const t = await filmWith(false);
    t.controller.rateTitle(8);
    expect(rateMsg(t)).toMatchObject({ vuByTab: true });
  });

  it("does not send vuByTab when the button is on, or off screen", async () => {
    for (const state of [true, undefined]) {
      const t = await filmWith(state);
      t.controller.rateTitle(8);
      expect(rateMsg(t)).not.toHaveProperty("vuByTab");
    }
  });

  it("clicks the button once after the answer « tab »", async () => {
    const t = await filmWith(false);
    t.controller.rateTitle(8);
    t.ofType("fiche-rate")[0]?.answer(TAB);
    await settle();
    expect(t.page.vuLog).toEqual(["note:5::", "click:film"]);
  });

  it("notes the ids watched before clicking", async () => {
    const t = await filmWith(false);
    t.controller.rateTitle(8);
    t.ofType("fiche-rate")[0]?.answer(TAB);
    await settle();
    expect(t.page.vuLog[0]).toBe("note:5::");
    expect(t.page.vuLog[1]).toBe("click:film");
  });

  it("does not click a « Déjà vu » that is already on", async () => {
    const t = await filmWith(false);
    t.controller.rateTitle(8);
    t.page.vuFilm = true;
    t.ofType("fiche-rate")[0]?.answer(TAB);
    await settle();
    expect(t.page.vuLog).toEqual([]);
  });

  it("does not click when the worker did not answer « tab »", async () => {
    const t = await filmWith(false);
    t.controller.rateTitle(8);
    t.ofType("fiche-rate")[0]?.answer({ ok: true });
    await settle();
    expect(t.page.vuLog).toEqual([]);
  });

  it("does not click once the address names another page", async () => {
    const t = await filmWith(false);
    t.controller.rateTitle(8);
    t.page.path = "/content/movie/1";
    t.ofType("fiche-rate")[0]?.answer(TAB);
    await settle();
    expect(t.page.vuLog).toEqual([]);
  });
});

describe("an episode rating and its row's « Vu » button", () => {
  it("sends vuByTab when the row's button is off", async () => {
    const t = await episodesShown([[3, false]]);
    t.controller.rateEpisode(3, 9);
    expect(rateMsg(t)).toMatchObject({ episode: 3, vuByTab: true });
  });

  it("clicks the episode row's « Vu » after its rating, noting the episode first", async () => {
    const t = await episodesShown([[3, false]]);
    t.controller.rateEpisode(3, 9);
    t.ofType("fiche-rate")[0]?.answer(TAB);
    await settle();
    expect(t.page.vuLog).toEqual(["note:6:2:3", "click:3"]);
  });

  it("does not click a row that is already on", async () => {
    const t = await episodesShown([[3, false]]);
    t.controller.rateEpisode(3, 9);
    t.page.vuRows.set(3, true);
    t.ofType("fiche-rate")[0]?.answer(TAB);
    await settle();
    expect(t.page.vuLog).toEqual([]);
  });

  it("does not click after the season changed", async () => {
    const t = await episodesShown([[3, false]]);
    t.controller.rateEpisode(3, 9);
    t.page.shown = 3;
    t.ofType("fiche-rate")[0]?.answer(TAB);
    await settle();
    expect(t.page.vuLog).toEqual([]);
  });

  it("does not click when the row is gone", async () => {
    const t = await episodesShown([[3, false]]);
    t.controller.rateEpisode(3, 9);
    t.page.vuRows.delete(3);
    t.ofType("fiche-rate")[0]?.answer(TAB);
    await settle();
    expect(t.page.vuLog).toEqual([]);
  });
});

describe("a series rating", () => {
  it("sends no vuByTab and never reads a « Déjà vu » button", async () => {
    const t = await episodesShown([]);
    t.page.vuFilm = false;
    t.page.vuReads.length = 0;
    t.controller.rateTitle(7);
    t.controller.confirmSeries();
    expect(rateMsg(t)).not.toHaveProperty("vuByTab");
    t.ofType("fiche-rate")[0]?.answer({ ok: true, dejaVu: "tab" });
    await settle();
    expect(t.page.vuReads).toEqual([]);
    expect(t.page.vuLog).toEqual([]);
  });
});

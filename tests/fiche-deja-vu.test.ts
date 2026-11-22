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

  it("sends vuByTab when the button is already on: the worker writes nothing", async () => {
    const t = await filmWith(true);
    t.controller.rateTitle(8);
    expect(rateMsg(t)).toMatchObject({ vuByTab: true });
    t.ofType("fiche-rate")[0]?.answer(TAB);
    await settle();
    expect(t.page.vuLog).toEqual([]);
  });

  it("does not send vuByTab when the button is off screen", async () => {
    const t = await filmWith(undefined);
    t.controller.rateTitle(8);
    expect(rateMsg(t)).not.toHaveProperty("vuByTab");
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

  it("sends vuByTab when the row's button is already on", async () => {
    const t = await episodesShown([[3, true]]);
    t.controller.rateEpisode(3, 9);
    expect(rateMsg(t)).toMatchObject({ episode: 3, vuByTab: true });
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

describe("a film rating and the state of the « Déjà vu » button", () => {
  it.each([
    [true, { vuByTab: true, dejaVuOn: true }],
    [false, { vuByTab: true, dejaVuOn: false }],
  ])("sends the lit state (%s) with vuByTab", async (lit, fields) => {
    const t = await filmWith(lit);
    t.controller.rateTitle(8);
    expect(rateMsg(t)).toMatchObject(fields);
  });

  it("reads the button once and sends neither field when it is off screen", async () => {
    const t = await filmWith(undefined);
    t.page.vuReads.length = 0;
    t.controller.rateTitle(8);
    expect(rateMsg(t)).not.toHaveProperty("vuByTab");
    expect(rateMsg(t)).not.toHaveProperty("dejaVuOn");
    expect(t.page.vuReads).toEqual([undefined]);
  });

  it("sends only vuByTab for an episode", async () => {
    const t = await episodesShown([[3, false]]);
    t.controller.rateEpisode(3, 9);
    expect(rateMsg(t)).toMatchObject({ episode: 3, vuByTab: true });
    expect(rateMsg(t)).not.toHaveProperty("dejaVuOn");
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

describe("an undo and Naka's « Déjà vu » button", () => {
  const filmUndone = async (vuFilm: boolean | undefined, answer: unknown) => {
    const t = await filmWith(vuFilm);
    t.controller.undo();
    t.ofType("fiche-undo")[0]?.answer(answer);
    await settle();
    return t;
  };
  const UNDO_TAB = { ok: true, maListe: "none", dejaVu: "tab" };

  it("the button on screen: sends vuByTab, and clicks a lit button once on « tab »", async () => {
    const t = await filmUndone(true, UNDO_TAB);
    expect(t.ofType("fiche-undo")[0]?.msg).toMatchObject({ vuByTab: true });
    expect(t.page.vuLog).toEqual(["click:film"]);
  });

  it("never notes the ids: the click is not a finish to hide", async () => {
    const t = await filmUndone(true, UNDO_TAB);
    expect(t.page.vuLog.some((entry) => entry.startsWith("note"))).toBe(false);
  });

  it("a partial undo that left the « Déjà vu » to the tab: one click", async () => {
    const t = await filmUndone(true, {
      partial: { done: [{ kind: "dejaVu" }], failed: { kind: "localRestore" } },
      maListe: "none",
      dejaVu: "tab",
      error: "unavailable",
    });
    expect(t.page.vuLog).toEqual(["click:film"]);
  });

  it("the button already off when the answer comes: no click", async () => {
    const t = await filmUndone(false, UNDO_TAB);
    expect(t.page.vuLog).toEqual([]);
  });

  it("the button gone when the answer comes: no click", async () => {
    const t = await filmWith(true);
    t.controller.undo();
    t.page.vuFilm = undefined;
    t.ofType("fiche-undo")[0]?.answer(UNDO_TAB);
    await settle();
    expect(t.page.vuLog).toEqual([]);
  });

  it("the visit moved on: no click", async () => {
    const t = await filmWith(true);
    t.controller.undo();
    t.page.path = "/content/movie/1";
    t.ofType("fiche-undo")[0]?.answer(UNDO_TAB);
    await settle();
    expect(t.page.vuLog).toEqual([]);
  });

  it("no button: no vuByTab, and no click on a « tab » nobody asked for", async () => {
    const t = await filmWith(undefined);
    t.controller.undo();
    expect(t.ofType("fiche-undo")[0]?.msg).not.toHaveProperty("vuByTab");
    t.page.vuFilm = true;
    t.ofType("fiche-undo")[0]?.answer(UNDO_TAB);
    await settle();
    expect(t.page.vuLog).toEqual([]);
  });

  it("an answer without « tab »: no click", async () => {
    const t = await filmUndone(true, { ok: true, maListe: "none" });
    expect(t.page.vuLog).toEqual([]);
  });

  it("a series' undo sends no vuByTab", async () => {
    const t = fakePorts();
    const controller = createFicheController(t.ports);
    controller.path(SERIES_PATH);
    controller.event(seriesEvent());
    t.ofType("fiche-info")[0]?.answer(linked(66));
    await settle();
    t.page.vuFilm = true;
    controller.undo();
    expect(t.ofType("fiche-undo")[0]?.msg).not.toHaveProperty("vuByTab");
  });
});

describe("a removal and Naka's « Déjà vu » button", () => {
  const REMOVE_TAB = { ok: true, dejaVu: "tab" };
  const filmRemoved = async (vuFilm: boolean | undefined, answer: unknown) => {
    const t = await filmWith(vuFilm);
    t.controller.remove();
    t.ofType("fiche-remove")[0]?.answer(answer);
    await settle();
    return t;
  };

  it("the button on screen: sends vuByTab, and clicks a lit button once on « tab »", async () => {
    const t = await filmRemoved(true, REMOVE_TAB);
    expect(t.ofType("fiche-remove")[0]?.msg).toMatchObject({ vuByTab: true });
    expect(t.page.vuLog).toEqual(["click:film"]);
  });

  it("no button: no vuByTab", async () => {
    const t = await filmWith(undefined);
    t.controller.remove();
    expect(t.ofType("fiche-remove")[0]?.msg).not.toHaveProperty("vuByTab");
  });

  it("a series' removal sends no vuByTab", async () => {
    const t = fakePorts();
    const controller = createFicheController(t.ports);
    controller.path(SERIES_PATH);
    controller.event(seriesEvent());
    t.ofType("fiche-info")[0]?.answer(linked(66));
    await settle();
    t.page.vuFilm = true;
    controller.remove();
    expect(t.ofType("fiche-remove")[0]?.msg).not.toHaveProperty("vuByTab");
  });
});

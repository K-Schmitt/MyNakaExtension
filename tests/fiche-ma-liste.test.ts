import { describe, expect, it } from "vitest";
import { createFicheController } from "../src/content/fiche-controller";
import {
  FILM_PATH,
  fakePorts,
  ficheEvent,
  linked,
  SERIES_PATH,
  seriesEvent,
  settle,
} from "./fiche-controller-fakes";

/** A film page whose « Ma liste » button is in this state (undefined: not on screen). */
async function filmWith(maListe: boolean | undefined) {
  const t = fakePorts();
  t.page.maListe = maListe;
  const controller = createFicheController(t.ports);
  controller.path(FILM_PATH);
  controller.event(ficheEvent());
  t.ofType("fiche-info")[0]?.answer(linked(55));
  await settle();
  return { ...t, controller };
}

async function filmRated(maListe: boolean | undefined, answer: unknown) {
  const t = await filmWith(maListe);
  t.controller.rateTitle(8);
  t.ofType("fiche-rate")[0]?.answer(answer);
  await settle();
  return t;
}

async function filmUndone(maListe: boolean | undefined, answer: unknown) {
  const t = await filmWith(maListe);
  t.controller.undo();
  t.ofType("fiche-undo")[0]?.answer(answer);
  await settle();
  return t;
}

const rateMsgs = (t: ReturnType<typeof fakePorts>) =>
  t.ofType("fiche-rate").map((call) => call.msg);
const undoMsgs = (t: ReturnType<typeof fakePorts>) =>
  t.ofType("fiche-undo").map((call) => call.msg);
const BY_TAB = { ok: true, maListe: "tab" };

describe("a film rating and Naka's « Ma liste » button", () => {
  it("the button on screen and active: sends its state, then clicks it once on « tab »", async () => {
    const t = await filmRated(true, BY_TAB);
    expect(rateMsgs(t)).toEqual([
      {
        type: "fiche-rate",
        contentId: 5,
        target: "film",
        productId: 55,
        rating: 8,
        inMaListe: true,
        listByTab: true,
      },
    ]);
    expect(t.page.clicks).toBe(1);
    expect(t.page.maListe).toBe(false);
  });

  it("the button on screen and inactive: sends inMaListe false, and no click", async () => {
    const t = await filmRated(false, BY_TAB);
    expect(rateMsgs(t)[0]).toMatchObject({
      inMaListe: false,
      listByTab: true,
    });
    expect(t.page.clicks).toBe(0);
  });

  it("no button: neither field sent (the worker's client call), and no click", async () => {
    const t = await filmRated(undefined, { ok: true });
    expect(rateMsgs(t)[0]).not.toHaveProperty("inMaListe");
    expect(rateMsgs(t)[0]).not.toHaveProperty("listByTab");
    expect(t.page.clicks).toBe(0);
  });

  it("already inactive when the answer comes: no click", async () => {
    const t = await filmWith(true);
    t.controller.rateTitle(8);
    t.page.maListe = false;
    t.ofType("fiche-rate")[0]?.answer(BY_TAB);
    await settle();
    expect(t.page.clicks).toBe(0);
  });

  it("gone from the screen when the answer comes: no click", async () => {
    const t = await filmWith(true);
    t.controller.rateTitle(8);
    t.page.maListe = undefined;
    t.ofType("fiche-rate")[0]?.answer(BY_TAB);
    await settle();
    expect(t.page.clicks).toBe(0);
  });

  it.each([
    ["simulation (no « tab »)", { ok: true }],
    ["sent with an error", { sent: true, error: "naka-session" }],
    ["not sent", { error: "sc-session" }],
    ["lost", undefined],
  ])("an answer %s: no click", async (_n, answer) => {
    const t = await filmRated(true, answer);
    expect(t.page.clicks).toBe(0);
    expect(t.page.maListe).toBe(true);
  });

  it("the visit over before the answer: no click", async () => {
    const t = await filmWith(true);
    t.controller.rateTitle(8);
    t.controller.path("/content/movie/9999");
    t.ofType("fiche-rate")[0]?.answer(BY_TAB);
    await settle();
    expect(t.page.clicks).toBe(0);
  });

  it("a series rating: no « Ma liste » field and no click", async () => {
    const t = fakePorts();
    t.page.maListe = true;
    const controller = createFicheController(t.ports);
    controller.path(SERIES_PATH);
    controller.event(seriesEvent());
    t.ofType("fiche-info")[0]?.answer(linked(66));
    await settle();
    controller.rateTitle(7);
    controller.confirmSeries();
    expect(rateMsgs(t)[0]).not.toHaveProperty("listByTab");
    t.ofType("fiche-rate")[0]?.answer(BY_TAB);
    await settle();
    expect(t.page.clicks).toBe(0);
  });
});

describe("an undo and Naka's « Ma liste » button", () => {
  it("the button on screen: sends listByTab, then clicks it once when inactive", async () => {
    const t = await filmUndone(false, BY_TAB);
    expect(undoMsgs(t)).toEqual([
      { type: "fiche-undo", contentId: 5, productId: 55, listByTab: true },
    ]);
    expect(t.page.clicks).toBe(1);
    expect(t.page.maListe).toBe(true);
  });

  it("the button already active: no click", async () => {
    const t = await filmUndone(true, BY_TAB);
    expect(t.page.clicks).toBe(0);
  });

  it("no button: no listByTab, and no click", async () => {
    const t = await filmUndone(undefined, { ok: true, maListe: "client" });
    expect(undoMsgs(t)).toEqual([
      { type: "fiche-undo", contentId: 5, productId: 55 },
    ]);
    expect(t.page.clicks).toBe(0);
  });

  it("a partial undo whose « Ma liste » step was done by the tab: one click", async () => {
    const t = await filmUndone(false, {
      partial: {
        done: [{ kind: "maListe" }],
        failed: { kind: "localRestore" },
      },
      maListe: "tab",
      error: "unavailable",
    });
    expect(t.page.clicks).toBe(1);
  });

  it.each([
    ["by the client", { ok: true, maListe: "client" }],
    ["by nobody (simulation)", { ok: true, maListe: "none" }],
    [
      "partial before « Ma liste »",
      {
        partial: { done: [], failed: { kind: "undone" } },
        maListe: "none",
        error: "unavailable",
      },
    ],
    ["refused", { refused: "expired" }],
    ["not sent", { error: "sc-session" }],
    ["lost", undefined],
  ])("an undo answered %s: no click", async (_n, answer) => {
    const t = await filmUndone(false, answer);
    expect(t.page.clicks).toBe(0);
  });

  it("sends nothing while a rating is on its way", async () => {
    const t = await filmWith(false);
    t.controller.rateTitle(8);
    t.controller.undo();
    expect(undoMsgs(t)).toEqual([]);
  });
});

describe("a « tab » answer the tab did not ask for", () => {
  it("a film rated without the button, the button shown before a « tab » answer: no click", async () => {
    const t = await filmWith(undefined);
    t.controller.rateTitle(8);
    expect(rateMsgs(t)[0]).not.toHaveProperty("listByTab");
    t.page.maListe = true;
    t.ofType("fiche-rate")[0]?.answer(BY_TAB);
    await settle();
    expect(t.page.clicks).toBe(0);
  });

  it("an undo sent without listByTab gets no click on « tab »", async () => {
    const t = await filmWith(undefined);
    t.controller.undo();
    t.page.maListe = false;
    t.ofType("fiche-undo")[0]?.answer(BY_TAB);
    await settle();
    expect(t.page.clicks).toBe(0);
  });
});

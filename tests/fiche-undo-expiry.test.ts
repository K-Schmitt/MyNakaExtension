import { describe, expect, it } from "vitest";
import { createFicheController } from "../src/content/fiche-controller";
import { UNDO_WINDOW_MS } from "../src/core/fiche-undo";
import type { FicheInfo, FicheProduct } from "../src/ext/fiche-answers";
import {
  FILM_PATH,
  fakePorts,
  ficheEvent,
  linked,
  settle,
} from "./fiche-controller-fakes";

const withFlags = (over: Partial<FicheProduct>): FicheInfo => {
  const info = linked(55, 7);
  return { ...info, product: { ...(info.product as FicheProduct), ...over } };
};

async function filmShown(info: FicheInfo) {
  const t = fakePorts();
  const controller = createFicheController(t.ports);
  controller.path(FILM_PATH);
  controller.event(ficheEvent());
  t.ofType("fiche-info")[0]?.answer(info);
  await settle();
  return { ...t, controller };
}

const shownProduct = (t: ReturnType<typeof fakePorts>) =>
  t.last()?.info?.product;
const live = (t: ReturnType<typeof fakePorts>) =>
  t.timers.filter((timer) => !timer.cleared);

describe("« Annuler » once its ten minutes are over on the same page", () => {
  it("stops offering it when the worker's record times out, « Retirer la note » kept", async () => {
    // Arrange
    const t = await filmShown(
      withFlags({ canUndo: true, canRemove: true, undoLeftMs: 120_000 }),
    );
    expect(live(t).map((timer) => timer.ms)).toEqual([120_000]);

    // Act
    live(t)[0]?.fire();

    // Assert
    expect(shownProduct(t)).toMatchObject({ canUndo: false, canRemove: true });
    expect(shownProduct(t)?.undoLeftMs).toBeUndefined();
  });

  it("times out a rating's « Annuler » at the time its panel gives", async () => {
    // Arrange
    const t = await filmShown(linked(55, 7));
    expect(t.timers).toEqual([]);

    // Act
    t.controller.rateTitle(8);
    t.ofType("fiche-rate")[0]?.answer({
      ok: true,
      panel: {
        canUndo: true,
        canRemove: true,
        protected: false,
        undoLeftMs: UNDO_WINDOW_MS,
      },
    });
    await settle();
    live(t)[0]?.fire();

    // Assert
    expect(t.timers.map((timer) => timer.ms)).toEqual([UNDO_WINDOW_MS]);
    expect(shownProduct(t)).toMatchObject({ mine: 8, canUndo: false });
  });

  it("without the worker's time, never offers it past the whole window", async () => {
    const t = await filmShown(withFlags({ canUndo: true }));
    expect(live(t).map((timer) => timer.ms)).toEqual([UNDO_WINDOW_MS]);
  });

  it("sets no timer when « Annuler » is not offered", async () => {
    const t = await filmShown(withFlags({ canRemove: true }));
    expect(t.timers).toEqual([]);
  });

  it("stops the timer when the visit ends, and a late one changes nothing", async () => {
    // Arrange
    const t = await filmShown(withFlags({ canUndo: true, undoLeftMs: 5000 }));
    const timer = t.timers[0];

    // Act
    t.controller.path("/");
    timer?.fire();

    // Assert
    expect(timer?.cleared).toBe(true);
    expect(t.last()).toBeUndefined();
  });

  it("replaces the timer with the one of a new answer", async () => {
    // Arrange
    const t = await filmShown(withFlags({ canUndo: true, undoLeftMs: 5000 }));
    t.controller.undo();
    t.ofType("fiche-undo")[0]?.answer({ ok: true, maListe: "none" });
    await settle();

    // Act
    t.ofType("fiche-info")[1]?.answer(withFlags({ canRemove: true }));
    await settle();
    t.timers[0]?.fire();

    // Assert
    expect(t.timers[0]?.cleared).toBe(true);
    expect(live(t)).toEqual([]);
    expect(shownProduct(t)).toMatchObject({ canUndo: false, canRemove: true });
  });
});

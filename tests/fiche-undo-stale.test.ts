// « Annuler » and « Retirer la note » on the tab when the visit ends while they are on their way: an answer
// of the old page changes nothing on the new one (fiche-undo-writes).
import { describe, expect, it } from "vitest";
import { createFicheController } from "../src/content/fiche-controller";
import type { FicheInfo } from "../src/ext/fiche-answers";
import {
  FILM_PATH,
  fakePorts,
  ficheEvent,
  SERIES_PATH,
  settle,
} from "./fiche-controller-fakes";

const undoable = (): FicheInfo => ({
  state: "linked",
  product: {
    id: 55,
    average: 6.9,
    mine: 7,
    label: { title: "Solaris" },
    canUndo: true,
    canRemove: true,
    protected: false,
  },
});

async function film(info: FicheInfo = undoable()) {
  const t = fakePorts();
  const controller = createFicheController(t.ports);
  controller.path(FILM_PATH);
  controller.event(ficheEvent());
  t.ofType("fiche-info")[0]?.answer(info);
  await settle();
  return { ...t, controller };
}

describe("an undo or a removal answered once the visit is over", () => {
  it("an undo answered after the page changed: no info asked again, no render of the old page", async () => {
    // Arrange
    const t = await film();
    t.controller.undo();
    t.controller.path(SERIES_PATH);
    const renders = t.views.length;

    // Act
    t.ofType("fiche-undo")[0]?.answer({ ok: true, maListe: "none" });
    await settle();

    // Assert
    expect(t.ofType("fiche-info")).toHaveLength(1);
    expect(t.views).toHaveLength(renders);
  });

  it("a removal answered after the page changed: no info asked again", async () => {
    const t = await film();
    t.controller.remove();
    t.controller.path(SERIES_PATH);
    t.ofType("fiche-remove")[0]?.answer({ ok: true });
    await settle();
    expect(t.ofType("fiche-info")).toHaveLength(1);
  });

  it("an info read again that comes back after the page changed: no « Annuler » timer, no render", async () => {
    // Arrange
    const t = await film();
    t.controller.undo();
    t.ofType("fiche-undo")[0]?.answer({ ok: true, maListe: "none" });
    await settle();
    t.controller.path(SERIES_PATH);
    const renders = t.views.length;
    const timers = t.timers.filter((timer) => !timer.cleared).length;

    // Act
    t.ofType("fiche-info")[1]?.answer(undoable());
    await settle();

    // Assert
    expect(t.timers.filter((timer) => !timer.cleared)).toHaveLength(timers);
    expect(t.views).toHaveLength(renders);
  });
});

describe("an undo or a removal with no product shown", () => {
  it("sends neither on a title SensCritique did not find", async () => {
    const t = await film({ state: "notfound" });
    t.controller.undo();
    t.controller.remove();
    expect(t.ofType("fiche-undo")).toEqual([]);
    expect(t.ofType("fiche-remove")).toEqual([]);
  });
});

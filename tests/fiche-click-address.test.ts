import { describe, expect, it } from "vitest";
import { createFicheController } from "../src/content/fiche-controller";
import type { FicheInfo } from "../src/ext/fiche-answers";
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

// The address is polled once a second: right after Naka moved to another title, our rows can still show the
// previous title's stars in the new panel. A click then names a title the owner is no longer looking at: it
// sends nothing, and the controller moves to the address at once.

const NEXT = "/content/movie/9999";
const WRITES = ["fiche-rate", "fiche-undo", "fiche-remove", "fiche-link"];

const offering = (over: Partial<NonNullable<FicheInfo["product"]>>) => {
  const info = linked(55, 7);
  return { ...info, product: { ...info.product, ...over } } as FicheInfo;
};

async function filmShowing(info: FicheInfo) {
  const t = fakePorts();
  const controller = createFicheController(t.ports);
  controller.path(FILM_PATH);
  controller.event(ficheEvent());
  t.ofType("fiche-info")[0]?.answer(info);
  await settle();
  t.page.path = NEXT;
  return { ...t, controller };
}

async function seriesShowing() {
  const t = fakePorts();
  t.page.shown = 1;
  const controller = createFicheController(t.ports);
  controller.path(SERIES_PATH);
  controller.event(seriesEvent());
  t.ofType("fiche-info")[0]?.answer(linked(66));
  await settle();
  controller.event(seasonEvent(1));
  t.ofType("fiche-season")[0]?.answer(seasonOf(1));
  await settle();
  t.page.path = NEXT;
  return { ...t, controller };
}

const writes = (t: ReturnType<typeof fakePorts>) =>
  t.calls.filter((call) => WRITES.includes(call.msg.type));

describe("a title page click after the address changed", () => {
  it.each([
    ["a star of the panel", (c: Ctl) => c.rateTitle(8), {}],
    ["« Annuler »", (c: Ctl) => c.undo(), { canUndo: true }],
    ["« Retirer la note »", (c: Ctl) => c.remove(), { canRemove: true }],
  ] as const)(
    "%s sends nothing, and the visit moves to the new title",
    async (_n, click, over) => {
      // Arrange
      const t = await filmShowing(offering(over));
      const shown = t.views.length;

      // Act
      click(t.controller);

      // Assert
      expect(writes(t)).toEqual([]);
      expect(t.announced).toEqual([FILM_PATH, NEXT]);
      expect(t.views.length).toBeGreaterThan(shown);
      expect(t.last()?.info).toBeUndefined();
    },
  );

  it("an episode's star sends nothing, and the visit moves to the new title", async () => {
    // Arrange
    const t = await seriesShowing();

    // Act
    t.controller.rateEpisode(1, 8);

    // Assert
    expect(writes(t)).toEqual([]);
    expect(t.announced).toEqual([SERIES_PATH, NEXT]);
  });

  it("a series' « Envoyer » sends nothing once the address changed", async () => {
    // Arrange
    const t = await seriesShowing();
    t.page.path = SERIES_PATH;
    t.controller.rateTitle(7);
    t.page.path = NEXT;

    // Act
    t.controller.confirmSeries();

    // Assert
    expect(writes(t)).toEqual([]);
    expect(t.announced).toEqual([SERIES_PATH, NEXT]);
  });

  it("the same address: the click still sends its write", async () => {
    // Arrange
    const t = await filmShowing(linked(55, 7));
    t.page.path = FILM_PATH;

    // Act
    t.controller.rateTitle(8);

    // Assert
    expect(writes(t).map((call) => call.msg.type)).toEqual(["fiche-rate"]);
  });
});

type Ctl = ReturnType<typeof createFicheController>;

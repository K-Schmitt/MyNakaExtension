import { describe, expect, it } from "vitest";
import { createFicheController } from "../src/content/fiche-controller";
import type { FicheInfo } from "../src/ext/fiche-answers";
import {
  type Call,
  fakePorts,
  linked,
  SERIES_PATH,
  seasonEvent,
  seasonOf,
  seriesEvent,
  settle,
} from "./fiche-controller-fakes";

const withFlags = (over: Partial<NonNullable<FicheInfo["product"]>>) => {
  const info = linked(66, 7);
  return { ...info, product: { ...info.product, ...over } } as FicheInfo;
};

/**
 * What the worker issued to the tab, as fiche-registry keeps it: every fiche-info answer resets it to its
 * title, every fiche-season answer adds its episodes. A fiche-rate of anything else is refused.
 */
function issuedModel() {
  let issued = new Set<number>();
  return {
    info(call: Call | undefined, answer: FicheInfo | undefined) {
      issued = new Set(answer?.product ? [answer.product.id] : []);
      call?.answer(answer);
    },
    season(call: Call | undefined, numbers: number[]) {
      if (call === undefined) return;
      for (const n of numbers) issued.add(100 + n);
      call.answer(seasonOf(...numbers));
    },
    accepts: (productId: number) => issued.has(productId),
  };
}

/** A series rated 7, season 1 shown with episodes 1 and 2, « Annuler » offered. */
async function seriesWithSeason(
  flags: Parameters<typeof withFlags>[0] = { canUndo: true },
) {
  const t = fakePorts();
  t.page.shown = 1;
  const controller = createFicheController(t.ports);
  const worker = issuedModel();
  controller.path(SERIES_PATH);
  controller.event(seriesEvent());
  worker.info(t.ofType("fiche-info")[0], withFlags(flags));
  await settle();
  controller.event(seasonEvent(1));
  worker.season(t.ofType("fiche-season")[0], [1, 2]);
  await settle();
  return { ...t, controller, worker };
}

const lastRate = (t: ReturnType<typeof fakePorts>) => {
  const rates = t.calls.flatMap((call) =>
    call.msg.type === "fiche-rate" ? [call.msg] : [],
  );
  return rates[rates.length - 1];
};

describe("the panel read again after « Annuler » or « Retirer la note » on a series", () => {
  it.each([
    ["« Annuler »", "undo", { ok: true, maListe: "none" }],
    ["« Retirer la note »", "remove", { ok: true }],
  ] as const)(
    "reads the shown season again after %s, so an episode's star is one the worker issued",
    async (_n, action, answer) => {
      // Arrange
      const t = await seriesWithSeason();
      if (action === "undo") t.controller.undo();
      else t.controller.remove();
      t.ofType(action === "undo" ? "fiche-undo" : "fiche-remove")[0]?.answer(
        answer,
      );
      await settle();
      t.worker.info(t.ofType("fiche-info")[1], withFlags({ canRemove: true }));
      await settle();

      // Act
      t.worker.season(t.ofType("fiche-season")[1], [1, 2]);
      await settle();
      t.controller.rateEpisode(2, 8);

      // Assert
      const msg = lastRate(t);
      expect(msg).toMatchObject({ target: "épisode", productId: 102 });
      expect(t.worker.accepts(msg?.productId ?? 0)).toBe(true);
    },
  );

  it("a failed read again shows the read failure with « Réessayer », and no star of the old page", async () => {
    // Arrange
    const t = await seriesWithSeason();
    t.controller.undo();
    t.ofType("fiche-undo")[0]?.answer({ ok: true, maListe: "none" });
    await settle();

    // Act
    t.worker.info(t.ofType("fiche-info")[1], undefined);
    await settle();

    // Assert
    expect(t.last()?.info).toBeUndefined();
    expect(t.last()?.outcome).toEqual({ kind: "failed" });
    expect(t.last()?.episodes.size).toBe(0);
    expect(t.last()?.pending).toBeUndefined();
  });

  it("« Réessayer » after that failure reads the title, then its shown season again", async () => {
    // Arrange
    const t = await seriesWithSeason();
    t.controller.undo();
    t.ofType("fiche-undo")[0]?.answer({ ok: true, maListe: "none" });
    await settle();
    t.worker.info(t.ofType("fiche-info")[1], undefined);
    await settle();

    // Act
    t.controller.retry();
    t.worker.info(t.ofType("fiche-info")[2], withFlags({ canRemove: true }));
    await settle();
    t.worker.season(t.ofType("fiche-season")[1], [1, 2]);
    await settle();
    t.controller.rateTitle(9);
    t.controller.confirmSeries();

    // Assert
    expect(lastRate(t)).toMatchObject({ target: "série", productId: 66 });
    expect(t.worker.accepts(66)).toBe(true);
    expect(t.ofType("fiche-season")).toHaveLength(2);
  });

  it("shows no protected line from the old page after a lost read again", async () => {
    // Arrange
    const t = await seriesWithSeason({ protected: true });
    t.controller.remove();
    t.ofType("fiche-remove")[0]?.answer({ refused: "protected" });
    await settle();

    // Act
    t.worker.info(t.ofType("fiche-info")[1], undefined);
    await settle();

    // Assert
    expect(t.last()?.info?.product?.protected).toBeUndefined();
  });
});

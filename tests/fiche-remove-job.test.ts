import { describe, expect, it } from "vitest";
import type { FicheUndo } from "../src/core/fiche-undo";
import type { FicheRemoveMessage } from "../src/ext/fiche-messages";
import type { Settings } from "../src/ext/settings";
import type { ProductState } from "../src/sc/sc-client";
import { answerWorld, BOUND, NOW, type WorldOpts } from "./answer-world";
import { filmTitle, linkedTo, seriesTitle, TAB } from "./fiche-fixtures";
import { filmCard, target } from "./rating-fixtures";

const LIVE: Settings = { mode: "live", binding: BOUND };
const PAIR = { nakaId: 5, scId: 2005 };
const RATED: Partial<ProductState> = {
  rating: 8,
  isDone: true,
  dateDone: "2024-03-02",
  isWished: false,
  isReviewed: false,
  isRecommended: false,
};
const remove = (
  over: Partial<FicheRemoveMessage> = {},
): FicheRemoveMessage => ({
  type: "fiche-remove",
  contentId: 5,
  productId: 2005,
  ...over,
});
const filmOf5 = filmCard({
  key: "movie:5",
  contentId: 5,
  targets: [target("film", 8, 2005)],
  pending: [],
  given: { film: 8 },
});

function world(product: Partial<ProductState>, o: WorldOpts = {}) {
  const w = answerWorld({
    state: { ...linkedTo(2005), settled: [PAIR], handled: ["movie:5"] },
    settings: LIVE,
    playlist: () => [5],
    product: () => product,
    ...o,
  });
  w.area.data.set("ratings", [filmOf5]);
  return w;
}

describe("fiche-remove", () => {
  it("a rated film: ProductUndone alone; the link, lists and handled mark kept; the card has no rating", async () => {
    // Arrange
    const w = world(RATED);
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    const state = w.state();

    // Act
    const answer = await w.jobs.ficheRemove(TAB, remove());

    // Assert
    expect(answer).toEqual({ ok: true });
    expect(w.sk.calls).toEqual(["productState:2005", "unmarkDone:2005"]);
    expect(w.writes()).toEqual(["unmarkDone:2005"]);
    expect(w.state()).toEqual(state);
    expect(w.cards()).toEqual([
      { ...filmOf5, targets: [target("film", null, 2005)], given: {} },
    ]);
  });

  it("a rated series: ProductUndone, and every card's série target unrated", async () => {
    // Arrange
    const episode = filmCard({
      key: "tv:5:S1E1",
      contentId: 5,
      season: 1,
      episode: 1,
      targets: [target("épisode", 7, 11), target("série", 8, 13)],
      pending: [],
      given: { épisode: 7, série: 8 },
    });
    const w = world(RATED, { state: linkedTo(13) });
    w.area.data.set("ratings", [episode]);
    await w.registry.open(TAB, 5, seriesTitle(13), []);

    // Act
    const answer = await w.jobs.ficheRemove(TAB, remove({ productId: 13 }));

    // Assert
    expect(answer).toEqual({ ok: true });
    expect(w.writes()).toEqual(["unmarkDone:13"]);
    expect(w.cards()).toEqual([
      {
        ...episode,
        targets: [target("épisode", 7, 11), target("série", null, 13)],
        given: { épisode: 7 },
      },
    ]);
  });

  it.each([
    ["reviewed", { isReviewed: true }],
    ["recommended", { isRecommended: true }],
  ])(
    "a %s title: refused, with the state read and no write",
    async (_, flag) => {
      const w = world({ ...RATED, ...flag });
      await w.registry.open(TAB, 5, filmTitle(2005), []);
      expect(await w.jobs.ficheRemove(TAB, remove())).toEqual({
        refused: "protected",
      });
      expect(w.sk.calls).toEqual(["productState:2005"]);
      expect(w.writes()).toEqual([]);
      expect(w.cards()).toEqual([filmOf5]);
    },
  );

  it("an unrated title: refused, nothing written", async () => {
    const w = world({ ...RATED, rating: null });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRemove(TAB, remove())).toEqual({
      refused: "unrated",
    });
    expect(w.writes()).toEqual([]);
  });

  it("a product not issued to the tab as the title: rejects with no request", async () => {
    const w = world(RATED);
    await expect(w.jobs.ficheRemove(TAB, remove())).rejects.toThrow();
    await w.registry.open(TAB, 5, filmTitle(77), [2005]);
    await expect(w.jobs.ficheRemove(TAB, remove())).rejects.toThrow();
    expect(w.network()).toEqual([]);
  });

  it("another account bound: its code, no write, the card kept", async () => {
    const w = world(RATED, { username: "intruder" });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRemove(TAB, remove())).toEqual({
      error: "other-account",
    });
    expect(w.writes()).toEqual([]);
    expect(w.cards()).toEqual([filmOf5]);
  });

  it("a ProductUndone that fails: its code, the card kept", async () => {
    const w = world(RATED, {
      sc: {
        unmarkDone: async () => {
          throw new Error("down");
        },
      },
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRemove(TAB, remove())).toEqual({
      error: "unavailable",
    });
    expect(w.cards()).toEqual([filmOf5]);
  });
});

describe("fiche-remove and Naka's « Déjà vu »", () => {
  const unwatched = (w: ReturnType<typeof world>) =>
    w.nk.calls.filter((c) => c.startsWith("markUnwatched"));

  it('a film with vuByTab: answered dejaVu "tab", no client call', async () => {
    const w = world(RATED);
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRemove(TAB, remove({ vuByTab: true }))).toEqual({
      ok: true,
      dejaVu: "tab",
    });
    expect(unwatched(w)).toEqual([]);
  });

  it("a film without vuByTab: the client marks it unwatched once", async () => {
    const w = world(RATED);
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRemove(TAB, remove())).toEqual({ ok: true });
    expect(unwatched(w)).toEqual(["markUnwatched:5"]);
  });

  it("the binding check and the « non vu » write go through one pinned Naka tab", async () => {
    let queries = 0;
    const w = world(RATED, {
      tabs: (real) => ({
        query: (url) => {
          queries += 1;
          return real.query(url);
        },
        send: (id, msg) => real.send(id, msg),
      }),
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRemove(TAB, remove())).toEqual({ ok: true });
    expect(unwatched(w)).toEqual(["markUnwatched:5"]);
    expect(queries).toBe(1);
  });

  it("the client fails: removed with its error, cards unrated, record forgotten", async () => {
    const w = world(RATED, {
      naka: {
        markUnwatched: async () => {
          throw new Error("down");
        },
      },
    });
    w.area.data.set("ficheUndo", {
      contentId: 5,
      productId: 2005,
      role: "film",
      at: NOW - 1000,
      before: {
        rating: 6,
        isDone: true,
        dateDone: "2024-03-02",
        isWished: false,
        inMaListe: null,
        dejaVuOn: null,
      },
      local: { handled: false, settled: false, cards: [] },
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRemove(TAB, remove())).toEqual({
      removed: true,
      error: "unavailable",
    });
    expect(w.cards()).toEqual([
      { ...filmOf5, targets: [target("film", null, 2005)], given: {} },
    ]);
    expect(w.area.data.get("ficheUndo")).toBeNull();
  });

  it("simulation: no Naka call, no tab", async () => {
    const w = world(RATED, {
      settings: { mode: "simulation", binding: BOUND },
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRemove(TAB, remove({ vuByTab: true }))).toEqual({
      ok: true,
    });
    expect(unwatched(w)).toEqual([]);
  });

  it("a series: no Naka call, even with vuByTab", async () => {
    const w = world(RATED, { state: linkedTo(13) });
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    expect(
      await w.jobs.ficheRemove(TAB, remove({ productId: 13, vuByTab: true })),
    ).toEqual({ ok: true });
    expect(unwatched(w)).toEqual([]);
  });

  it("a refusal or an SC failure: no Naka call", async () => {
    const refused = world({ ...RATED, isReviewed: true });
    await refused.registry.open(TAB, 5, filmTitle(2005), []);
    await refused.jobs.ficheRemove(TAB, remove({ vuByTab: true }));
    expect(unwatched(refused)).toEqual([]);
    const failing = world(RATED, {
      sc: {
        unmarkDone: async () => {
          throw new Error("down");
        },
      },
    });
    await failing.registry.open(TAB, 5, filmTitle(2005), []);
    await failing.jobs.ficheRemove(TAB, remove());
    expect(unwatched(failing)).toEqual([]);
  });
});

describe("fiche-remove and the undo record", () => {
  const record = (contentId: number, productId: number): FicheUndo => ({
    contentId,
    productId,
    role: "film",
    at: NOW - 1000,
    before: {
      rating: 6,
      isDone: true,
      dateDone: "2024-03-02",
      isWished: false,
      inMaListe: null,
      dejaVuOn: null,
    },
    local: { handled: false, settled: false, cards: [] },
  });
  const stored = (w: ReturnType<typeof world>) => w.area.data.get("ficheUndo");

  it("a removal that went out clears the record of this title", async () => {
    // Arrange
    const w = world(RATED);
    w.area.data.set("ficheUndo", record(5, 2005));
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    // Act
    const answer = await w.jobs.ficheRemove(TAB, remove());

    // Assert
    expect(answer).toEqual({ ok: true });
    expect(stored(w)).toBeNull();
  });

  it("a removal that went out leaves the record of another title", async () => {
    const w = world(RATED);
    w.area.data.set("ficheUndo", record(9, 99));
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    await w.jobs.ficheRemove(TAB, remove());
    expect(stored(w)).toEqual(record(9, 99));
  });

  it("a refused removal leaves the record of this title", async () => {
    const w = world(RATED, { username: "intruder" });
    w.area.data.set("ficheUndo", record(5, 2005));
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    await w.jobs.ficheRemove(TAB, remove());
    expect(stored(w)).toEqual(record(5, 2005));
  });
});

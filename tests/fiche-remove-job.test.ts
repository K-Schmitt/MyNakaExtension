import { describe, expect, it } from "vitest";
import type { FicheRemoveMessage } from "../src/ext/fiche-messages";
import type { Settings } from "../src/ext/settings";
import type { ProductState } from "../src/sc/sc-client";
import { answerWorld, BOUND, type WorldOpts } from "./answer-world";
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

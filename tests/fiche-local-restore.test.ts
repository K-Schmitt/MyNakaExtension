// The extension's own state of a title put back by « Annuler » (restoreLocal) and taken off by « Retirer la
// note » (unrateCards), over the real store in memory.
import { describe, expect, it } from "vitest";
import type { FicheUndo, UndoLocal } from "../src/core/fiche-undo";
import type { RatingCard } from "../src/core/rating-cards";
import { emptyState, type SyncState } from "../src/core/state";
import { restoreLocal, unrateCards } from "../src/sw/fiche-local-restore";
import { episodeCard, filmCard, target } from "./rating-fixtures";
import { memoryStore } from "./sw-fakes";

const PAIR = { nakaId: 5, scId: 2005 };
const KEY = "movie:5";

const filmRecord = (local: Partial<UndoLocal> = {}): FicheUndo => ({
  contentId: 5,
  productId: 2005,
  role: "film",
  at: 0,
  before: {
    rating: null,
    isDone: false,
    dateDone: null,
    isWished: false,
    inMaListe: null,
    dejaVuOn: null,
  },
  local: { handled: false, settled: false, cards: [], ...local },
});

function storeWith(state: SyncState, cards: RatingCard[] = []) {
  const { area, store } = memoryStore();
  area.data.set("state", structuredClone(state));
  area.data.set("ratings", structuredClone(cards));
  return {
    area,
    store,
    state: () => area.data.get("state") as SyncState,
    cards: () => area.data.get("ratings") as RatingCard[],
    saves: (key: string) => area.sets.filter((s) => key in s).length,
  };
}

const film5 = (over: Partial<RatingCard> = {}) =>
  filmCard({
    key: KEY,
    contentId: 5,
    targets: [target("film", 8, 2005)],
    pending: [],
    given: { film: 8 },
    ...over,
  });

describe("restoreLocal: the sync state as it was", () => {
  it("a pair settled before, unsettled since (a retry): settled again", async () => {
    // Arrange
    const s = storeWith(emptyState());

    // Act
    await restoreLocal(s.store, filmRecord({ settled: true }));

    // Assert
    expect(s.state().settled).toEqual([PAIR]);
  });

  it("a film handled before, not handled now: handled again", async () => {
    const s = storeWith(emptyState());
    await restoreLocal(s.store, filmRecord({ handled: true }));
    expect(s.state().handled).toEqual([KEY]);
  });

  it("a film handled since, with its stored title: both taken off, the other titles kept", async () => {
    // Arrange
    const state: SyncState = {
      ...emptyState(),
      handled: ["movie:9", KEY],
      handledTitles: { "movie:9": "Autre", [KEY]: "Solaris" },
    };
    const s = storeWith(state);

    // Act
    await restoreLocal(s.store, filmRecord());

    // Assert
    expect(s.state().handled).toEqual(["movie:9"]);
    expect(s.state().handledTitles).toEqual({ "movie:9": "Autre" });
  });

  it("a state already as it was: not saved", async () => {
    const s = storeWith({ ...emptyState(), settled: [PAIR], handled: [KEY] });
    await restoreLocal(s.store, filmRecord({ settled: true, handled: true }));
    expect(s.saves("state")).toBe(0);
  });
});

describe("restoreLocal: the cards as they were", () => {
  it("the kept card replaces the title's card, another title's card stays as it is", async () => {
    // Arrange
    const other = filmCard();
    const kept = film5({ targets: [target("film", null, 2005)], given: {} });
    const s = storeWith(emptyState(), [other, film5()]);

    // Act
    await restoreLocal(s.store, filmRecord({ cards: [kept] }));

    // Assert
    expect(s.cards()).toEqual([other, kept]);
  });

  it("cards already as they were: not saved", async () => {
    const other = filmCard();
    const s = storeWith(emptyState(), [other]);
    await restoreLocal(s.store, filmRecord());
    expect(s.saves("ratings")).toBe(0);
  });
});

describe("unrateCards: « Retirer la note » on the cards", () => {
  it("no card of the title: nothing saved", async () => {
    const s = storeWith(emptyState(), [filmCard()]);
    await unrateCards(s.store, { role: "film", contentId: 5, productId: 2005 });
    expect(s.saves("ratings")).toBe(0);
  });

  it("the title's card loses its rating, another title's card stays as it is", async () => {
    // Arrange
    const other = filmCard({
      given: { film: 7 },
      targets: [target("film", 7, 21)],
    });
    const s = storeWith(emptyState(), [other, film5()]);

    // Act
    await unrateCards(s.store, { role: "film", contentId: 5, productId: 2005 });

    // Assert
    expect(s.cards()).toEqual([
      other,
      film5({ targets: [target("film", null, 2005)], given: {} }),
    ]);
  });

  it("a series: only the série target naming the product is unrated", async () => {
    // Arrange
    const card = episodeCard({
      targets: [
        target("épisode", 7, 11),
        target("saison", 6, 12),
        target("série", 8, 13),
      ],
      given: { épisode: 7, série: 8 },
      pending: [],
    });
    const s = storeWith(emptyState(), [card]);

    // Act
    await unrateCards(s.store, { role: "série", contentId: 5, productId: 13 });

    // Assert
    expect(s.cards()).toEqual([
      {
        ...card,
        targets: [
          target("épisode", 7, 11),
          target("saison", 6, 12),
          target("série", null, 13),
        ],
        given: { épisode: 7 },
      },
    ]);
  });
});

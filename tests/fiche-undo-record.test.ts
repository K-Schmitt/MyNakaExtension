import { describe, expect, it } from "vitest";
import { type FicheUndo, UNDO_WINDOW_MS } from "../src/core/fiche-undo";
import { contentKeyOf } from "../src/core/finish-event";
import type {
  FicheRateMessage,
  FicheUndoMessage,
} from "../src/ext/fiche-messages";
import type { Settings } from "../src/ext/settings";
import type { ProductState } from "../src/sc/sc-client";
import { ScUnavailableError } from "../src/sc/sc-errors";
import { answerWorld, BOUND, NOW, type WorldOpts } from "./answer-world";
import { filmTitle, linkedTo, seriesTitle, TAB } from "./fiche-fixtures";
import { filmCard, target } from "./rating-fixtures";

const LIVE: Settings = { mode: "live", binding: BOUND };
const FILM_URL = "https://www.senscritique.com/film/solaris/2005";
const UNSEEN: ProductState = {
  isDone: false,
  isWished: false,
  universe: 1,
  rating: null,
  average: null,
  dateDone: null,
  isReviewed: false,
  isRecommended: false,
  url: undefined,
};
const SEEN: Partial<ProductState> = {
  rating: 6,
  isDone: true,
  dateDone: "2024-03-02",
  isWished: false,
  url: FILM_URL,
};

const rate = (over: Partial<FicheRateMessage> = {}): FicheRateMessage => ({
  type: "fiche-rate",
  contentId: 5,
  target: "film",
  productId: 2005,
  rating: 8,
  ...over,
});
const seriesRate = () => rate({ target: "série", productId: 13 });
const episodeRate = () =>
  rate({ target: "épisode", productId: 11, season: 1, episode: 1 });

// Content 5, linked to the film 2005, in « Ma liste ».
function world(o: WorldOpts = {}) {
  return answerWorld({
    state: linkedTo(2005),
    settings: LIVE,
    playlist: () => [5],
    product: () => SEEN,
    ...o,
  });
}

type World = ReturnType<typeof world>;
const stored = (w: World) => w.area.data.get("ficheUndo");

const filmRecord = (over: Partial<FicheUndo> = {}): FicheUndo => ({
  contentId: 5,
  productId: 2005,
  role: "film",
  at: NOW,
  before: {
    rating: 6,
    isDone: true,
    dateDone: "2024-03-02",
    isWished: false,
    inMaListe: true,
  },
  local: { handled: false, settled: false, cards: [] },
  ...over,
});

describe("fiche-rate keeps what a film rating changes", () => {
  it("stores the before-state, with « Ma liste » from the message, before any SensCritique write", async () => {
    // Arrange
    const kept: unknown[] = [];
    const w: World = world({
      sc: {
        markDone: async () => {
          kept.push(stored(w));
        },
        rate: async () => {
          kept.push(stored(w));
        },
      },
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    // Act
    const answer = await w.jobs.ficheRate(TAB, rate({ inMaListe: true }));

    // Assert
    expect(kept.length).toBeGreaterThan(0);
    for (const at of kept) expect(at).toEqual(filmRecord());
    expect(w.sk.calls[0]).toBe("productState:2005");
    expect(answer).toEqual({
      ok: true,
      panel: {
        canUndo: true,
        undoLeftMs: UNDO_WINDOW_MS,
        canRemove: true,
        protected: false,
        url: FILM_URL,
      },
    });
  });

  it("offers « Annuler » for what is left of the window once the rating answers", async () => {
    // Arrange: the ProductRate takes 4 seconds.
    let clock = NOW;
    const w = world({
      sc: {
        rate: async () => {
          clock += 4000;
        },
      },
    });
    w.jobDeps.now = () => clock;
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    // Act
    const answer = await w.jobs.ficheRate(TAB, rate({ inMaListe: true }));

    // Assert
    expect(stored(w)).toMatchObject({ at: NOW });
    expect(answer).toMatchObject({
      panel: { canUndo: true, undoLeftMs: UNDO_WINDOW_MS - 4000 },
    });
  });

  it("without « Ma liste » in the message, the film not listed: kept as unknown", async () => {
    const w = world({ playlist: () => [99] });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    await w.jobs.ficheRate(TAB, rate());
    expect(stored(w)).toEqual(
      filmRecord({ before: { ...filmRecord().before, inMaListe: null } }),
    );
  });

  it("without « Ma liste » in the message, the film removed by the client: kept as listed (R10)", async () => {
    const w = world();
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    await w.jobs.ficheRate(TAB, rate());
    expect(stored(w)).toEqual(
      filmRecord({ before: { ...filmRecord().before, inMaListe: true } }),
    );
  });

  it("replaces an older record, of another title", async () => {
    const w = world();
    w.area.data.set("ficheUndo", filmRecord({ contentId: 9, productId: 99 }));
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    await w.jobs.ficheRate(TAB, rate({ inMaListe: false }));
    expect(stored(w)).toEqual(
      filmRecord({ before: { ...filmRecord().before, inMaListe: false } }),
    );
  });

  it("a protected title: the panel offers no removal", async () => {
    const w = world({ product: () => ({ ...SEEN, isReviewed: true }) });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual({
      ok: true,
      panel: {
        canUndo: true,
        undoLeftMs: UNDO_WINDOW_MS,
        canRemove: false,
        protected: true,
        url: FILM_URL,
      },
    });
  });

  it("a failed state read: still rated, no record kept (an older one cleared), no undo offered", async () => {
    // Arrange: only the first read (the before-state) fails; the finish's own pre-check reads again.
    let reads = 0;
    const w = world({
      sc: {
        productState: async () => {
          reads += 1;
          if (reads === 1) throw new ScUnavailableError("x");
          return { ...UNSEEN, ...SEEN };
        },
      },
    });
    w.area.data.set("ficheUndo", filmRecord({ at: NOW - 1000 }));
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    // Act
    const answer = await w.jobs.ficheRate(TAB, rate({ inMaListe: true }));

    // Assert
    expect(w.sk.calls.filter((c) => c.startsWith("rate:"))).toEqual([
      "rate:2005:8",
    ]);
    expect(stored(w)).toBeNull();
    expect(answer).toEqual({
      ok: true,
      panel: { canUndo: false, canRemove: false, protected: false },
    });
  });

  it("a failed local read: still rated, no record kept, no undo offered", async () => {
    // Arrange: the store fails once, on the local read right after the before-state.
    let failNext = false;
    let reads = 0;
    const w: World = world({
      sc: {
        productState: async () => {
          reads += 1;
          if (reads === 1) failNext = true;
          return { ...UNSEEN, ...SEEN };
        },
      },
    });
    const { store } = w.jobDeps;
    const loadRatings = store.loadRatings.bind(store);
    store.loadRatings = async () => {
      if (!failNext) return loadRatings();
      failNext = false;
      throw new Error("storage");
    };
    w.area.data.set("ficheUndo", filmRecord({ at: NOW - 1000 }));
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    // Act
    const answer = await w.jobs.ficheRate(TAB, rate({ inMaListe: true }));

    // Assert
    expect(w.sk.calls.filter((c) => c.startsWith("rate:"))).toEqual([
      "rate:2005:8",
    ]);
    expect(stored(w)).toBeNull();
    expect(answer).toEqual({
      ok: true,
      panel: {
        canUndo: false,
        canRemove: true,
        protected: false,
        url: FILM_URL,
      },
    });
  });

  it("a list removal that fails after the rating: answered as sent, with the panel", async () => {
    const w = world({
      playlist: () => {
        throw new Error("down");
      },
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual({
      sent: true,
      error: "unavailable",
      panel: {
        canUndo: true,
        undoLeftMs: UNDO_WINDOW_MS,
        canRemove: true,
        protected: false,
        url: FILM_URL,
      },
    });
  });

  it("a rating that did not go out: its error answered without a panel", async () => {
    const w = world({ username: "intruder" });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual({
      error: "other-account",
    });
  });
});

describe("fiche-rate keeps what a series rating changes", () => {
  it("stores the record as a « série », « Ma liste » unknown", async () => {
    const w = world({
      state: linkedTo(13),
      product: () => ({ ...SEEN, rating: null, url: undefined }),
    });
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    expect(await w.jobs.ficheRate(TAB, seriesRate())).toEqual({
      ok: true,
      panel: {
        canUndo: true,
        undoLeftMs: UNDO_WINDOW_MS,
        canRemove: true,
        protected: false,
      },
    });
    expect(stored(w)).toEqual(
      filmRecord({
        productId: 13,
        role: "série",
        before: { ...filmRecord().before, rating: null, inMaListe: null },
      }),
    );
  });

  it("an episode's rating keeps nothing and leaves the record as it was", async () => {
    const w = world({ state: linkedTo(13) });
    const older = filmRecord({ productId: 13, role: "série" });
    w.area.data.set("ficheUndo", older);
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    await w.registry.issue(TAB, 5, [11]);
    expect(await w.jobs.ficheRate(TAB, episodeRate())).toEqual({ ok: true });
    expect(w.sk.calls).not.toContain("productState:11");
    expect(stored(w)).toEqual(older);
  });
});

/** The record of an earlier rating, still live. */
const earlier = () =>
  filmRecord({
    at: NOW - 60_000,
    before: { ...filmRecord().before, rating: 3 },
  });

describe("a rating refused before any SensCritique write keeps the earlier « Annuler »", () => {
  it("a film refused by the binding: the earlier record is saved again", async () => {
    const w = world({ username: "intruder" });
    w.area.data.set("ficheUndo", earlier());
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    const answer = await w.jobs.ficheRate(TAB, rate({ inMaListe: true }));

    expect(answer).toEqual({ error: "other-account" });
    expect(w.writes()).toEqual([]);
    expect(stored(w)).toEqual(earlier());
  });

  it("a film rated: the new record replaces the earlier one", async () => {
    const w = world();
    w.area.data.set("ficheUndo", earlier());
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    await w.jobs.ficheRate(TAB, rate({ inMaListe: true }));

    expect(stored(w)).toEqual(filmRecord());
  });

  it("a film rated whose list removal failed: the new record is kept", async () => {
    const w = world({
      playlist: () => {
        throw new Error("down");
      },
    });
    w.area.data.set("ficheUndo", earlier());
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    const answer = await w.jobs.ficheRate(TAB, rate({ inMaListe: true }));

    expect(answer).toMatchObject({ sent: true, error: "unavailable" });
    expect(stored(w)).toEqual(filmRecord());
  });

  it("a series refused by the binding: the earlier record is saved again", async () => {
    const w = world({ state: linkedTo(13), username: "intruder" });
    w.area.data.set("ficheUndo", earlier());
    await w.registry.open(TAB, 5, seriesTitle(13), []);

    const answer = await w.jobs.ficheRate(TAB, seriesRate());

    expect(answer).toEqual({ error: "other-account" });
    expect(w.writes()).toEqual([]);
    expect(stored(w)).toEqual(earlier());
  });

  it("a series rated: the new record replaces the earlier one", async () => {
    const w = world({ state: linkedTo(13) });
    w.area.data.set("ficheUndo", earlier());
    await w.registry.open(TAB, 5, seriesTitle(13), []);

    await w.jobs.ficheRate(TAB, seriesRate());

    expect(stored(w)).toMatchObject({ productId: 13, role: "série", at: NOW });
  });
});

describe("fiche-rate keeps what a series rating changes, before its ProductRate", () => {
  it("stores the series' record before the ProductRate", async () => {
    const kept: unknown[] = [];
    const w: World = world({
      state: linkedTo(13),
      sc: {
        rate: async () => {
          kept.push(stored(w));
        },
      },
    });
    await w.registry.open(TAB, 5, seriesTitle(13), []);

    await w.jobs.ficheRate(TAB, seriesRate());

    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ productId: 13, role: "série", at: NOW });
  });

  it("a failed state read: the series is still rated, no record kept, no undo offered", async () => {
    const w = world({
      state: linkedTo(13),
      sc: {
        productState: async () => {
          throw new ScUnavailableError("x");
        },
      },
    });
    w.area.data.set("ficheUndo", earlier());
    await w.registry.open(TAB, 5, seriesTitle(13), []);

    const answer = await w.jobs.ficheRate(TAB, seriesRate());

    expect(w.sk.calls.filter((c) => c.startsWith("rate:"))).toEqual([
      "rate:13:8",
    ]);
    expect(stored(w)).toBeNull();
    expect(answer).toEqual({
      ok: true,
      panel: { canUndo: false, canRemove: false, protected: false },
    });
  });
});

/** The live record of an earlier rating of another title. */
const otherTitle = () =>
  filmRecord({ contentId: 9, productId: 99, at: NOW - 60_000 });
const failingRate = {
  rate: async () => {
    throw new ScUnavailableError("x");
  },
};
const undoFilm = (): FicheUndoMessage => ({
  type: "fiche-undo",
  contentId: 5,
  productId: 2005,
});
const filmCardOf5 = () =>
  filmCard({
    key: contentKeyOf({ contentId: 5 }),
    contentId: 5,
    targets: [target("film", null, 2005)],
  });

describe("D9: the earlier record comes back only when nothing was written", () => {
  it("a film with no card whose finish wrote, then its ProductRate threw: this film's record kept, « Annuler » undoes the finish", async () => {
    // Arrange: SensCritique follows the finish's writes (out of the wishes, then « vu »).
    let now: Partial<ProductState> = { ...UNSEEN, isWished: true };
    const w = world({
      product: () => now,
      sc: {
        ...failingRate,
        unwish: async () => {
          now = { ...now, isWished: false };
        },
        markDone: async () => {
          now = { ...now, isDone: true, dateDone: "2026-11-05" };
        },
        unmarkDone: async () => {
          now = { ...now, isDone: false, dateDone: null };
        },
        wish: async () => {
          now = { ...now, isWished: true };
        },
      },
    });
    w.area.data.set("ficheUndo", otherTitle());
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    // Act
    const answer = await w.jobs.ficheRate(TAB, rate({ inMaListe: true }));

    // Assert: the finish wrote, the rating did not go out, this film's record stays and the panel offers it.
    expect(answer).toEqual({
      error: "unavailable",
      panel: {
        canUndo: true,
        undoLeftMs: UNDO_WINDOW_MS,
        canRemove: false,
        protected: false,
      },
    });
    expect(w.writes()).toEqual([
      "unwish:2005",
      "markDone:2005:2026-11-05",
      "rate:2005:8",
    ]);
    expect(stored(w)).toEqual(
      filmRecord({
        before: {
          rating: null,
          isDone: false,
          dateDone: null,
          isWished: true,
          inMaListe: true,
        },
      }),
    );

    // Act: « Annuler »
    const mark = w.sk.calls.length;
    const undone = await w.jobs.ficheUndo(TAB, undoFilm());

    // Assert: « pas vu » and the wish are back, the title unfinished.
    expect(undone).toMatchObject({ ok: true });
    expect(w.sk.calls.slice(mark)).toEqual([
      "productState:2005",
      "unmarkDone:2005",
      "wish:2005",
    ]);
    expect(now).toMatchObject({ isDone: false, isWished: true });
    expect(w.state().handled).toEqual([]);
    expect(w.state().settled).toEqual([]);
    expect(w.cards()).toEqual([]);
  });

  it("a film already seen whose finish wrote only its sync state, then its ProductRate threw: this film's record kept", async () => {
    // Arrange: seen, not wished: the finish settles the pair and marks the title handled, nothing on SensCritique.
    const w = world({ sc: failingRate });
    w.area.data.set("ficheUndo", otherTitle());
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    // Act
    const answer = await w.jobs.ficheRate(TAB, rate({ inMaListe: true }));

    // Assert
    expect(answer).toMatchObject({
      error: "unavailable",
      panel: { canUndo: true },
    });
    expect(w.writes()).toEqual(["rate:2005:8"]);
    expect(w.state().settled).toEqual([{ nakaId: 5, scId: 2005 }]);
    expect(stored(w)).toEqual(filmRecord());
  });

  it("a film with a card whose ProductRate threw: nothing else went out, the earlier record is back", async () => {
    const w = world({ sc: failingRate });
    w.area.data.set("ratings", [filmCardOf5()]);
    w.area.data.set("ficheUndo", otherTitle());
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    const answer = await w.jobs.ficheRate(TAB, rate({ inMaListe: true }));

    expect(answer).toEqual({ error: "unavailable" });
    expect(w.writes()).toEqual(["rate:2005:8"]);
    expect(stored(w)).toEqual(otherTitle());
  });

  it("a film refused by the hour's budget: nothing written, the earlier record is back", async () => {
    const w = world({
      settings: { ...LIVE, finishWindow: { from: NOW, count: 30 } },
    });
    w.area.data.set("ficheUndo", otherTitle());
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    const answer = await w.jobs.ficheRate(TAB, rate({ inMaListe: true }));

    expect(answer).toEqual({ error: "finish-limit" });
    expect(w.writes()).toEqual([]);
    expect(stored(w)).toEqual(otherTitle());
  });

  it("a film whose finish could not read its state: nothing written, the earlier record is back", async () => {
    // Arrange: the before-state is read; the finish's own read fails, before its first write.
    let reads = 0;
    const w = world({
      sc: {
        productState: async () => {
          reads += 1;
          if (reads > 1) throw new ScUnavailableError("x");
          return { ...UNSEEN, ...SEEN };
        },
      },
    });
    w.area.data.set("ficheUndo", otherTitle());
    await w.registry.open(TAB, 5, filmTitle(2005), []);

    const answer = await w.jobs.ficheRate(TAB, rate({ inMaListe: true }));

    expect(answer).toEqual({ error: "unavailable" });
    expect(w.writes()).toEqual([]);
    expect(w.state().settled).toEqual([]);
    expect(stored(w)).toEqual(otherTitle());
  });

  it("a series whose ProductRate threw: nothing else went out, the earlier record is back", async () => {
    const w = world({ state: linkedTo(13), sc: failingRate });
    w.area.data.set("ficheUndo", otherTitle());
    await w.registry.open(TAB, 5, seriesTitle(13), []);

    const answer = await w.jobs.ficheRate(TAB, seriesRate());

    expect(answer).toEqual({ error: "unavailable" });
    expect(w.writes()).toEqual(["rate:13:8"]);
    expect(stored(w)).toEqual(otherTitle());
  });
});

import { describe, expect, it } from "vitest";
import { type FicheUndo, UNDO_WINDOW_MS } from "../src/core/fiche-undo";
import type { RatingCard } from "../src/core/rating-cards";
import type { RetryFinish } from "../src/core/retry-finishes";
import type { SyncState } from "../src/core/state";
import type {
  FicheRateMessage,
  FicheUndoMessage,
} from "../src/ext/fiche-messages";
import type { Settings } from "../src/ext/settings";
import type { ProductState } from "../src/sc/sc-client";
import { answerWorld, BOUND, NOW, type WorldOpts } from "./answer-world";
import { filmTitle, linkedTo, seriesTitle, TAB } from "./fiche-fixtures";
import { filmCard, target } from "./rating-fixtures";

const LIVE: Settings = { mode: "live", binding: BOUND };
const SIMULATION: Settings = { mode: "simulation", binding: BOUND };
const PAIR = { nakaId: 5, scId: 2005 };
const BLANK: ProductState = {
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

const rate = (over: Partial<FicheRateMessage> = {}): FicheRateMessage => ({
  type: "fiche-rate",
  contentId: 5,
  target: "film",
  productId: 2005,
  rating: 8,
  ...over,
});
const undo = (over: Partial<FicheUndoMessage> = {}): FicheUndoMessage => ({
  type: "fiche-undo",
  contentId: 5,
  productId: 2005,
  ...over,
});

/** What SensCritique says now: the test moves it from the before-state to the rated state. */
type Sc = { now: Partial<ProductState> };

function world(sc: Sc, o: WorldOpts = {}) {
  return answerWorld({
    state: linkedTo(2005),
    settings: LIVE,
    playlist: () => [5],
    product: () => ({ ...BLANK, ...sc.now }),
    ...o,
  });
}

type World = ReturnType<typeof world>;
const stored = (w: World) => w.area.data.get("ficheUndo");
const local = (w: World) => ({
  mapping: w.state().mapping,
  settled: w.state().settled,
  handled: w.state().handled,
  cards: w.cards(),
});

/** Rates the film from its page with SensCritique in `before`, then makes SensCritique show `after`. */
async function rated(
  w: World,
  sc: Sc,
  after: Partial<ProductState>,
  msg = rate({ inMaListe: true }),
): Promise<{ sc: number; nk: number }> {
  await w.registry.open(TAB, 5, filmTitle(2005), []);
  expect(await w.jobs.ficheRate(TAB, msg)).toMatchObject({ ok: true });
  sc.now = { ...sc.now, ...after };
  return { sc: w.sk.calls.length, nk: w.nk.calls.length };
}

const RATED_SEEN = { rating: 8, isDone: true, isWished: false };

describe("fiche-undo, end to end after a film rating (one test per row of undoSteps)", () => {
  it("not seen, wished, in « Ma liste »: undone, wished, listed again, the title unfinished", async () => {
    // Arrange
    const sc: Sc = { now: { isWished: true } };
    let list = [5];
    const w = world(sc, {
      playlist: () => list,
      naka: {
        removeFromPlaylist: async (id) => {
          list = list.filter((listed) => listed !== id);
        },
      },
    });
    const mark = await rated(w, sc, RATED_SEEN);
    expect(w.state().settled).toEqual([PAIR]);
    expect(list).toEqual([]);

    // Act
    const answer = await w.jobs.ficheUndo(TAB, undo());

    // Assert
    expect(answer).toEqual({ ok: true, maListe: "client" });
    expect(w.sk.calls.slice(mark.sc)).toEqual([
      "productState:2005",
      "unmarkDone:2005",
      "wish:2005",
    ]);
    expect(w.nk.calls.slice(mark.nk)).toContain("addToPlaylist:5");
    expect(local(w)).toEqual({
      mapping: [PAIR],
      settled: [],
      handled: [],
      cards: [],
    });
    expect(stored(w)).toBeNull();
  });

  it("seen with a rating of 6: only rate(6); seen, settled and handled stay, the card shows 6 again", async () => {
    // Arrange: finished earlier, with its card rated 6.
    const card = filmCard({
      key: "movie:5",
      contentId: 5,
      targets: [target("film", 6, 2005)],
      pending: [],
    });
    const state: SyncState = {
      ...linkedTo(2005),
      settled: [PAIR],
      handled: ["movie:5"],
    };
    const sc: Sc = { now: { rating: 6, isDone: true, dateDone: "2024-03-02" } };
    const w = world(sc, { state, playlist: () => [] });
    w.area.data.set("ratings", [card]);
    const mark = await rated(w, sc, { rating: 8 }, rate({ inMaListe: false }));
    expect(w.cards()[0]?.given).toEqual({ film: 8 });

    // Act
    const answer = await w.jobs.ficheUndo(TAB, undo());

    // Assert
    expect(answer).toEqual({ ok: true, maListe: "none" });
    expect(w.sk.calls.slice(mark.sc)).toEqual([
      "productState:2005",
      "rate:2005:6",
    ]);
    expect(w.nk.calls.slice(mark.nk)).not.toContain("addToPlaylist:5");
    expect(local(w)).toEqual({
      mapping: [PAIR],
      settled: [PAIR],
      handled: ["movie:5"],
      cards: [{ ...card, given: {} }],
    });
  });

  it("seen without a rating, its date known, never handled: undone, seen on that date; the local state as before the rating", async () => {
    // Arrange: seen on SensCritique only; the rating's finish handles, settles and makes a card.
    const sc: Sc = { now: { isDone: true, dateDone: "2024-03-02" } };
    const w = world(sc, { playlist: () => [] });
    const earlier = local(w);
    const mark = await rated(w, sc, { rating: 8 }, rate({ inMaListe: false }));
    expect(local(w)).not.toEqual(earlier);

    // Act
    const answer = await w.jobs.ficheUndo(TAB, undo());

    // Assert
    expect(answer).toEqual({ ok: true, maListe: "none" });
    expect(w.sk.calls.slice(mark.sc)).toEqual([
      "productState:2005",
      "unmarkDone:2005",
      "markDone:2005:2024-03-02",
    ]);
    expect(local(w)).toEqual(earlier);
    expect(local(w)).toEqual({
      mapping: [PAIR],
      settled: [],
      handled: [],
      cards: [],
    });
  });

  it("not seen on SensCritique but held locally: handled, its waiting finish and its card all kept as they were", async () => {
    // Arrange
    const card = filmCard({
      key: "movie:5",
      contentId: 5,
      targets: [target("film", null, 2005)],
    });
    const waiting: RetryFinish = {
      key: "movie:5",
      pair: PAIR,
      evicted: [],
      question: {
        kind: "ambiguity",
        side: "naka",
        id: 5,
        title: "Titre 5",
        candidateIds: [2005],
      },
      at: NOW - 5000,
    };
    const state: SyncState = {
      ...linkedTo(2005),
      handled: ["movie:5"],
      retryFinishes: [waiting],
    };
    const sc: Sc = { now: {} };
    const w = world(sc, { state, playlist: () => [] });
    w.area.data.set("ratings", [card]);
    const earlier = { ...local(w), retry: w.state().retryFinishes };
    const mark = await rated(w, sc, RATED_SEEN, rate({ inMaListe: false }));
    expect(w.cards()[0]?.given).toEqual({ film: 8 });

    // Act
    const answer = await w.jobs.ficheUndo(TAB, undo());

    // Assert
    expect(answer).toEqual({ ok: true, maListe: "none" });
    expect(w.sk.calls.slice(mark.sc)).toEqual([
      "productState:2005",
      "unmarkDone:2005",
    ]);
    expect({ ...local(w), retry: w.state().retryFinishes }).toEqual(earlier);
    expect(w.cards()).toEqual([card]);
  });

  it("seen without a rating nor a date: undone then marked seen without a date", async () => {
    // Arrange
    const sc: Sc = { now: { isDone: true } };
    const w = world(sc, { playlist: () => [] });
    const mark = await rated(w, sc, { rating: 8 }, rate({ inMaListe: false }));

    // Act
    const answer = await w.jobs.ficheUndo(TAB, undo());

    // Assert
    expect(answer).toEqual({ ok: true, maListe: "none" });
    expect(w.sk.calls.slice(mark.sc)).toEqual([
      "productState:2005",
      "unmarkDone:2005",
      "markDoneWithoutDate:2005",
    ]);
  });

  it("a row needing undone, the title now reviewed: refused, with the state read and no write", async () => {
    // Arrange
    const sc: Sc = { now: { isWished: true } };
    const w = world(sc);
    const mark = await rated(w, sc, { ...RATED_SEEN, isReviewed: true });
    const before = local(w);

    // Act
    const answer = await w.jobs.ficheUndo(TAB, undo());

    // Assert
    expect(answer).toEqual({ refused: "protected" });
    expect(w.sk.calls.slice(mark.sc)).toEqual(["productState:2005"]);
    expect(w.nk.calls.slice(mark.nk)).toEqual([]);
    expect(local(w)).toEqual(before);
    expect(stored(w)).not.toBeNull();
  });

  it("a row needing undone, the title now recommended: refused the same way", async () => {
    const sc: Sc = { now: {} };
    const w = world(sc, { playlist: () => [] });
    const mark = await rated(w, sc, { ...RATED_SEEN, isRecommended: true });
    expect(await w.jobs.ficheUndo(TAB, undo())).toEqual({
      refused: "protected",
    });
    expect(w.sk.calls.slice(mark.sc)).toEqual(["productState:2005"]);
  });
});

describe("fiche-undo, end to end after a series rating", () => {
  const seriesWorld = (sc: Sc, cards: RatingCard[]) => {
    const w = world(sc, { state: linkedTo(13), playlist: () => [] });
    w.area.data.set("ratings", cards);
    return w;
  };
  const episode = filmCard({
    key: "tv:5:S1E1",
    contentId: 5,
    season: 1,
    episode: 1,
    targets: [target("épisode", 7, 11), target("série", null, 13)],
    pending: ["série"],
    given: { épisode: 7 },
    seriesFinished: true,
  });
  const seriesRate = rate({ target: "série", productId: 13 });

  it("not seen before: undone, the pair unsettled, every card's série target as it was", async () => {
    // Arrange
    const sc: Sc = { now: {} };
    const w = seriesWorld(sc, [episode]);
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    await w.jobs.ficheRate(TAB, seriesRate);
    sc.now = RATED_SEEN;
    const mark = w.sk.calls.length;
    expect(w.state().settled).toEqual([{ nakaId: 5, scId: 13 }]);

    // Act
    const answer = await w.jobs.ficheUndo(
      TAB,
      undo({ productId: 13, listByTab: true }),
    );

    // Assert
    expect(answer).toEqual({ ok: true, maListe: "none" });
    expect(w.sk.calls.slice(mark)).toEqual([
      "productState:13",
      "unmarkDone:13",
    ]);
    expect(w.state().settled).toEqual([]);
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 13 }]);
    expect(w.cards()).toEqual([episode]);
  });

  it("not seen but rated before: undone, then the old rating", async () => {
    const sc: Sc = { now: { rating: 4 } };
    const w = seriesWorld(sc, []);
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    await w.jobs.ficheRate(TAB, seriesRate);
    sc.now = RATED_SEEN;
    const mark = w.sk.calls.length;
    expect(await w.jobs.ficheUndo(TAB, undo({ productId: 13 }))).toEqual({
      ok: true,
      maListe: "none",
    });
    expect(w.sk.calls.slice(mark)).toEqual([
      "productState:13",
      "unmarkDone:13",
      "rate:13:4",
    ]);
  });
});

describe("fiche-undo: a step that fails stops the sequence", () => {
  it("fails at step 2 of 4: names the step done and the one failed; nothing after it; the record kept", async () => {
    // Arrange: undone, wish, maListe, localRestore.
    const sc: Sc = { now: { isWished: true } };
    const w = world(sc, {
      sc: {
        wish: async () => {
          throw new Error("down");
        },
      },
    });
    const mark = await rated(w, sc, RATED_SEEN);
    const before = local(w);
    const record = stored(w);

    // Act
    const answer = await w.jobs.ficheUndo(TAB, undo());

    // Assert
    expect(answer).toEqual({
      partial: { done: [{ kind: "undone" }], failed: { kind: "wish" } },
      maListe: "none",
      error: "unavailable",
    });
    expect(w.nk.calls.slice(mark.nk)).not.toContain("addToPlaylist:5");
    expect(local(w)).toEqual(before);
    expect(stored(w)).toEqual(record);
  });

  it("a retry after a failure at wish skips what is back: no second ProductUndone, nor « vu »", async () => {
    // Arrange: SensCritique as the fakes change it; the first wish fails.
    const sc: Sc = {
      now: { isDone: true, dateDone: "2024-03-02", isWished: true },
    };
    let wishes = 0;
    const w = world(sc, {
      playlist: () => [],
      sc: {
        unmarkDone: async () => {
          sc.now = { ...sc.now, isDone: false, rating: null, dateDone: null };
        },
        markDone: async (_id, date) => {
          sc.now = { ...sc.now, isDone: true, dateDone: date };
        },
        wish: async () => {
          wishes += 1;
          if (wishes === 1) throw new Error("down");
          sc.now = { ...sc.now, isWished: true };
        },
      },
    });
    const earlier = local(w);
    await rated(
      w,
      sc,
      { rating: 8, isWished: false },
      rate({ inMaListe: false }),
    );
    const first = await w.jobs.ficheUndo(TAB, undo());
    const mark = w.sk.calls.length;

    // Act
    const retry = await w.jobs.ficheUndo(TAB, undo());

    // Assert
    expect(first).toEqual({
      partial: {
        done: [{ kind: "undone" }, { kind: "markDone", date: "2024-03-02" }],
        failed: { kind: "wish" },
      },
      maListe: "none",
      error: "unavailable",
    });
    expect(retry).toEqual({ ok: true, maListe: "none" });
    expect(w.sk.calls.slice(mark)).toEqual(["productState:2005", "wish:2005"]);
    expect(local(w)).toEqual(earlier);
    expect(stored(w)).toBeNull();
  });

  it("a record that cannot be cleared after every step ran: still answered ok", async () => {
    const sc: Sc = { now: {} };
    const w = world(sc, { playlist: () => [] });
    await rated(w, sc, RATED_SEEN, rate({ inMaListe: false }));
    const set = w.area.set;
    w.area.set = async (items) => {
      if ("ficheUndo" in items) throw new Error("storage");
      await set(items);
    };
    expect(await w.jobs.ficheUndo(TAB, undo())).toEqual({
      ok: true,
      maListe: "none",
    });
  });

  it("the binding of another account: answered with its code before any write, the record kept", async () => {
    const sc: Sc = { now: { isWished: true } };
    const w = world(sc);
    const mark = await rated(w, sc, RATED_SEEN);
    w.area.data.set("settings", {
      ...LIVE,
      binding: { ...BOUND, scUsername: "x" },
    });
    expect(await w.jobs.ficheUndo(TAB, undo())).toEqual({
      error: "other-account",
    });
    expect(w.sk.calls.slice(mark.sc)).toEqual(["productState:2005"]);
    expect(stored(w)).not.toBeNull();
  });
});

describe("fiche-undo: « Ma liste »", () => {
  const record: FicheUndo = {
    contentId: 5,
    productId: 2005,
    role: "film",
    at: NOW - 1000,
    before: {
      rating: null,
      isDone: false,
      dateDone: null,
      isWished: false,
      inMaListe: true,
      dejaVuOn: null,
    },
    local: { handled: false, settled: false, cards: [] },
  };
  const ready = async (settings: Settings) => {
    const w = world({ now: RATED_SEEN }, { settings, playlist: () => [] });
    w.area.data.set("ficheUndo", record);
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    return w;
  };

  it("in simulation: no « Ma liste » read nor write, every other step runs", async () => {
    const w = await ready(SIMULATION);
    expect(await w.jobs.ficheUndo(TAB, undo())).toEqual({
      ok: true,
      maListe: "none",
    });
    expect(w.sk.calls).toContain("unmarkDone:2005");
    expect(w.nk.calls).not.toContain("playlistIds");
    expect(w.nk.calls).not.toContain("addToPlaylist:5");
    expect(stored(w)).toBeNull();
  });

  it("the button on screen (listByTab): answered « tab », and no client call", async () => {
    const w = await ready(LIVE);
    expect(await w.jobs.ficheUndo(TAB, undo({ listByTab: true }))).toEqual({
      ok: true,
      maListe: "tab",
    });
    expect(w.nk.calls).not.toContain("addToPlaylist:5");
    expect(w.nk.calls).not.toContain("playlistIds");
  });

  it("no button: the client adds the film", async () => {
    const w = await ready(LIVE);
    expect(await w.jobs.ficheUndo(TAB, undo())).toEqual({
      ok: true,
      maListe: "client",
    });
    expect(w.nk.calls).toContain("addToPlaylist:5");
  });

  it("no button, the film already listed again: no add", async () => {
    const w = world({ now: RATED_SEEN }, { playlist: () => [5] });
    w.area.data.set("ficheUndo", record);
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheUndo(TAB, undo())).toEqual({
      ok: true,
      maListe: "none",
    });
    expect(w.nk.calls).not.toContain("addToPlaylist:5");
  });
});

describe("fiche-undo: « Ma liste » when the button was not on screen at the rating", () => {
  /** « Ma liste » as the client changes it: the film listed, then removed by the rating. */
  function listedWorld(sc: Sc, o: WorldOpts = {}) {
    let list = [5];
    const w = world(sc, {
      playlist: () => list,
      naka: {
        removeFromPlaylist: async (id) => {
          list = list.filter((listed) => listed !== id);
        },
        addToPlaylist: async (id) => {
          list = [...list, id];
        },
      },
      ...o,
    });
    return { w, list: () => list };
  }
  const inMaListe = (w: World) =>
    (stored(w) as FicheUndo | null)?.before.inMaListe;

  it("removed by the client: the record says it was listed, and the undo adds it back", async () => {
    // Arrange
    const sc: Sc = { now: { isWished: true } };
    const { w, list } = listedWorld(sc);
    const mark = await rated(w, sc, RATED_SEEN, rate());
    expect(list()).toEqual([]);

    // Act
    const answer = await w.jobs.ficheUndo(TAB, undo());

    // Assert
    expect(answer).toEqual({ ok: true, maListe: "client" });
    expect(w.nk.calls.slice(mark.nk)).toContain("addToPlaylist:5");
    expect(list()).toEqual([5]);
  });

  it("removed by the client: the stored record holds inMaListe true", async () => {
    const sc: Sc = { now: { isWished: true } };
    const { w } = listedWorld(sc);
    await rated(w, sc, RATED_SEEN, rate());
    expect(inMaListe(w)).toBe(true);
  });

  it("absent from « Ma liste »: inMaListe stays null, and the undo adds nothing", async () => {
    const sc: Sc = { now: { isWished: true } };
    const w = world(sc, { playlist: () => [99] });
    const mark = await rated(w, sc, RATED_SEEN, rate());
    expect(inMaListe(w)).toBeNull();
    expect(await w.jobs.ficheUndo(TAB, undo())).toEqual({
      ok: true,
      maListe: "none",
    });
    expect(w.nk.calls.slice(mark.nk)).not.toContain("addToPlaylist:5");
  });

  it("in simulation: no removal, inMaListe stays null", async () => {
    const sc: Sc = { now: { isWished: true } };
    const { w, list } = listedWorld(sc, { settings: SIMULATION });
    await rated(w, sc, RATED_SEEN, rate());
    expect(list()).toEqual([5]);
    expect(inMaListe(w)).toBeNull();
  });

  it("the tab's own reading is kept: inMaListe false stays false", async () => {
    const sc: Sc = { now: { isWished: true } };
    const { w } = listedWorld(sc);
    await rated(w, sc, RATED_SEEN, rate({ inMaListe: false }));
    expect(inMaListe(w)).toBe(false);
  });

  it("no record kept (the state read failed): none is written by the removal", async () => {
    const sc: Sc = { now: { isWished: true } };
    let reads = 0;
    const { w, list } = listedWorld(sc, {
      sc: {
        productState: async () => {
          reads += 1;
          if (reads === 1) throw new Error("down");
          return { ...BLANK, ...sc.now };
        },
      },
    });
    await rated(w, sc, RATED_SEEN, rate());
    expect(list()).toEqual([]);
    expect(stored(w)).toBeNull();
  });
});

describe("fiche-undo: refused before any request", () => {
  const record: FicheUndo = {
    contentId: 5,
    productId: 2005,
    role: "film",
    at: NOW,
    before: {
      rating: 6,
      isDone: true,
      dateDone: null,
      isWished: false,
      inMaListe: null,
      dejaVuOn: null,
    },
    local: { handled: false, settled: false, cards: [] },
  };

  it("an expired record (10 minutes old)", async () => {
    const w = world({ now: RATED_SEEN });
    w.area.data.set("ficheUndo", { ...record, at: NOW - UNDO_WINDOW_MS });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheUndo(TAB, undo())).toEqual({ refused: "expired" });
    expect(w.network()).toEqual([]);
  });

  it("no record, or one of another product", async () => {
    const w = world({ now: RATED_SEEN });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheUndo(TAB, undo())).toEqual({ refused: "expired" });
    w.area.data.set("ficheUndo", { ...record, productId: 99 });
    expect(await w.jobs.ficheUndo(TAB, undo())).toEqual({ refused: "expired" });
    expect(w.network()).toEqual([]);
  });

  it("a product not issued to the tab as the title: rejects", async () => {
    const w = world({ now: RATED_SEEN });
    w.area.data.set("ficheUndo", record);
    await expect(w.jobs.ficheUndo(TAB, undo())).rejects.toThrow();
    await w.registry.open(TAB, 5, filmTitle(77), [2005]);
    await expect(w.jobs.ficheUndo(TAB, undo())).rejects.toThrow();
    expect(w.network()).toEqual([]);
    expect(stored(w)).toEqual(record);
  });

  it("a record of the film for a title issued as a series: refused", async () => {
    const w = world({ now: RATED_SEEN });
    w.area.data.set("ficheUndo", record);
    await w.registry.open(TAB, 5, seriesTitle(2005), []);
    expect(await w.jobs.ficheUndo(TAB, undo())).toEqual({ refused: "expired" });
    expect(w.network()).toEqual([]);
  });
});

describe("fiche-undo: « Déjà vu »", () => {
  const dejaVuRecord = (dejaVuOn: boolean | null): FicheUndo => ({
    contentId: 5,
    productId: 2005,
    role: "film",
    at: NOW - 1000,
    before: {
      rating: null,
      isDone: false,
      dateDone: null,
      isWished: false,
      inMaListe: null,
      dejaVuOn,
    },
    local: { handled: false, settled: false, cards: [] },
  });
  const ready = async (
    settings: Settings,
    dejaVuOn: boolean | null,
    o: WorldOpts = {},
    settled = false,
  ) => {
    const w = world({ now: RATED_SEEN }, { settings, ...o });
    const record = dejaVuRecord(dejaVuOn);
    w.area.data.set("ficheUndo", {
      ...record,
      local: { ...record.local, settled },
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    return w;
  };

  it("the button on screen (vuByTab): answered « tab », and no client call", async () => {
    const w = await ready(LIVE, false);
    expect(await w.jobs.ficheUndo(TAB, undo({ vuByTab: true }))).toEqual({
      ok: true,
      maListe: "none",
      dejaVu: "tab",
    });
    expect(w.nk.calls.some((c) => c.startsWith("markUnwatched"))).toBe(false);
  });

  it("no button: the client marks the film unwatched once, and no « tab » is answered", async () => {
    const w = await ready(LIVE, false);
    expect(await w.jobs.ficheUndo(TAB, undo())).toEqual({
      ok: true,
      maListe: "none",
    });
    expect(w.nk.calls.filter((c) => c.startsWith("markUnwatched"))).toEqual([
      "markUnwatched:5",
    ]);
  });

  it("in simulation: no Naka write, no « tab »", async () => {
    const w = await ready(SIMULATION, false);
    expect(await w.jobs.ficheUndo(TAB, undo({ vuByTab: true }))).toEqual({
      ok: true,
      maListe: "none",
    });
    expect(w.nk.calls.some((c) => c.startsWith("markUnwatched"))).toBe(false);
  });

  it("the client fails: partial at « Déjà vu », the record kept", async () => {
    const w = await ready(LIVE, false, {
      naka: {
        markUnwatched: async () => {
          throw new Error("down");
        },
      },
    });
    const answer = await w.jobs.ficheUndo(TAB, undo());
    expect(answer).toMatchObject({
      partial: { failed: { kind: "dejaVu" } },
      error: "unavailable",
    });
    expect(answer).not.toHaveProperty("dejaVu");
    expect(stored(w)).not.toBeNull();
  });

  it("localRestore fails after a « tab » step: the partial still carries « tab »", async () => {
    const w = await ready(LIVE, false, {}, true);
    const set = w.area.set;
    w.area.set = async (items) => {
      if (Object.keys(items).some((key) => key !== "ficheUndo")) {
        throw new Error("storage");
      }
      await set(items);
    };
    const answer = await w.jobs.ficheUndo(TAB, undo({ vuByTab: true }));
    expect(answer).toMatchObject({
      partial: { failed: { kind: "localRestore" } },
      dejaVu: "tab",
    });
  });

  it("an old record (dejaVuOn null): no Naka call", async () => {
    const w = await ready(LIVE, null);
    expect(await w.jobs.ficheUndo(TAB, undo({ vuByTab: true }))).toEqual({
      ok: true,
      maListe: "none",
    });
    expect(w.nk.calls.some((c) => c.startsWith("markUnwatched"))).toBe(false);
  });

  it("a button already lit before the rating (true): no step, no « tab » answer", async () => {
    const w = await ready(LIVE, true);
    // The button is on screen on the real path: the tab sends vuByTab.
    const answer = await w.jobs.ficheUndo(TAB, undo({ vuByTab: true }));
    expect(answer).toEqual({ ok: true, maListe: "none" });
    expect(answer).not.toHaveProperty("dejaVu");
    expect(w.nk.calls.some((c) => c.startsWith("markUnwatched"))).toBe(false);
  });
});

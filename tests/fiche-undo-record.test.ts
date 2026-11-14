import { describe, expect, it } from "vitest";
import type { FicheUndo } from "../src/core/fiche-undo";
import type { FicheRateMessage } from "../src/ext/fiche-messages";
import type { Settings } from "../src/ext/settings";
import type { ProductState } from "../src/sc/sc-client";
import { ScUnavailableError } from "../src/sc/sc-errors";
import { answerWorld, BOUND, NOW, type WorldOpts } from "./answer-world";
import { filmTitle, linkedTo, seriesTitle, TAB } from "./fiche-fixtures";

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
      panel: { canUndo: true, canRemove: true, url: FILM_URL },
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
      panel: { canUndo: true, canRemove: false, url: FILM_URL },
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
      panel: { canUndo: false, canRemove: false },
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
      panel: { canUndo: true, canRemove: true, url: FILM_URL },
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
      panel: { canUndo: true, canRemove: true },
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

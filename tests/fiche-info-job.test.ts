import { describe, expect, it, vi } from "vitest";
import type { FicheUndo } from "../src/core/fiche-undo";
import { MAX_CANDIDATES } from "../src/core/questions";
import { UNIVERSE } from "../src/sc/sc-queries";
import { answerWorld, NOW, type WorldOpts } from "./answer-world";
import {
  filmTitle,
  info,
  linkedTo,
  mine,
  nakaSays,
  nakaSolaris,
  OTHER_TAB,
  solaris,
  TAB,
} from "./fiche-fixtures";
import { seriesItem } from "./sw-fakes";

const LABEL = { title: "Solaris", year: 1972 };
// Rated 7 with nothing to lose, no undo record, no page.
const FLAGS = { canUndo: false, canRemove: true };
const rated = (universe: number = UNIVERSE.film) => ({
  product: () => ({ rating: 7, average: 6.9, universe, label: LABEL }),
});
const world = (o: WorldOpts = {}) =>
  answerWorld({ naka: nakaSays(), ...rated(), ...o });
const two = { search: async () => [solaris(11, 1972), solaris(12, 2002)] };

describe("fiche-info", () => {
  it("a linked film: linked, with the average, the owner's rating and the label; Naka read once, SC once", async () => {
    const w = world({ state: linkedTo(2005) });
    const answer = await w.jobs.ficheInfo(TAB, info());
    expect(answer).toEqual({
      state: "linked",
      product: { id: 2005, average: 6.9, mine: 7, label: LABEL, ...FLAGS },
    });
    expect(w.nk.calls).toEqual(["contentById:5"]);
    expect(w.sk.calls).toEqual(["productState:2005"]);
    expect(w.limited).toEqual(["limit:naka", "limit:sc"]);
    expect(w.writes()).toEqual([]);
  });

  it.each([
    ["no label", undefined],
    ["an empty title", { title: "" }],
  ])("a product with %s: notfound, not issued", async (_n, label) => {
    const w = world({
      state: linkedTo(2005),
      product: () => ({ universe: UNIVERSE.film, label }),
    });
    expect(await w.jobs.ficheInfo(TAB, info())).toEqual({
      state: "notfound",
    });
    await expect(w.jobs.ficheMine(TAB, mine())).rejects.toThrow();
  });

  it("a label longer than an answer may carry is cut to 200 characters", async () => {
    const w = world({
      state: linkedTo(2005),
      product: () => ({ universe: 1, label: { title: "x".repeat(300) } }),
    });
    const answer = await w.jobs.ficheInfo(TAB, info());
    expect(answer.product?.label?.title).toHaveLength(200);
  });

  it("a display-only link (ficheLinks) is linked too, with no search", async () => {
    const w = world();
    w.area.data.set("ficheLinks", { "5": 2006 });
    const answer = await w.jobs.ficheInfo(TAB, info());
    expect(answer).toMatchObject({ state: "linked", product: { id: 2006 } });
    expect(w.sk.calls).toEqual(["productState:2006"]);
  });

  it("the mapping wins over a display-only link", async () => {
    const w = world({ state: linkedTo(2005) });
    w.area.data.set("ficheLinks", { "5": 2006 });
    const answer = await w.jobs.ficheInfo(TAB, info());
    expect(answer).toMatchObject({ product: { id: 2005 } });
  });

  it("unreadable ficheLinks count as no links: the title is searched", async () => {
    const w = world({ sc: { search: async () => [solaris(11, 1972)] } });
    w.area.data.set("ficheLinks", { x: 1 });
    const answer = await w.jobs.ficheInfo(TAB, info());
    expect(answer).toMatchObject({ state: "matched", product: { id: 11 } });
  });

  it("a title found once by search: matched, and nothing written to the mapping", async () => {
    const w = world({ sc: two });
    const answer = await w.jobs.ficheInfo(TAB, info());
    expect(answer).toEqual({
      state: "matched",
      product: { id: 11, average: 6.9, mine: 7, label: LABEL, ...FLAGS },
    });
    expect(w.sk.calls).toEqual(["search:movie:Solaris", "productState:11"]);
    expect(w.limited).toEqual(["limit:naka", "limit:sc", "limit:sc"]);
    expect(w.state().mapping).toEqual([]);
    expect(w.stateSaves()).toBe(0);
    expect(w.area.data.has("ficheLinks")).toBe(false);
    expect(w.writes()).toEqual([]);
  });

  it("the search uses Naka's own title and year, never the message's", async () => {
    const w = world({ sc: two });
    const forged = info({
      title: "Autre chose",
      originalTitle: "X",
      year: 2002,
    });
    const answer = await w.jobs.ficheInfo(TAB, forged);
    expect(w.sk.calls[0]).toBe("search:movie:Solaris");
    expect(answer).toMatchObject({ state: "matched", product: { id: 11 } });
  });

  it("a series searches the series universe only", async () => {
    const w = world({
      naka: nakaSays({ mediaType: "tv", title: "Serie 12" }),
      sc: { search: async () => [seriesItem(12)] },
    });
    const answer = await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    expect(w.sk.calls[0]).toBe("search:tvShow:Serie 12");
    expect(answer).toMatchObject({ state: "choose" });
  });

  it("two close candidates: choose, with both, and no product read", async () => {
    const w = world({
      naka: nakaSays({ releaseDate: "1987-01-01" }),
      sc: two,
    });
    const answer = await w.jobs.ficheInfo(TAB, info());
    expect(answer).toEqual({
      state: "choose",
      candidates: [
        { id: 11, title: "Solaris", year: 1972, type: "film" },
        { id: 12, title: "Solaris", year: 2002, type: "film" },
      ],
    });
    expect(w.sk.calls).toEqual(["search:movie:Solaris"]);
  });

  it(`choose lists at most ${MAX_CANDIDATES} candidates`, async () => {
    const many = Array.from({ length: 30 }, (_, i) => solaris(100 + i, 1972));
    const w = world({ sc: { search: async () => many } });
    const answer = await w.jobs.ficheInfo(TAB, info());
    expect(answer.candidates).toHaveLength(MAX_CANDIDATES);
  });

  it("none: notfound, after Naka's original title was searched too", async () => {
    const w = world({ naka: nakaSays({ originalTitle: "Солярис" }) });
    const answer = await w.jobs.ficheInfo(TAB, info());
    expect(answer).toEqual({ state: "notfound" });
    expect(w.sk.calls).toEqual([
      "search:movie:Solaris",
      "search:movie:Солярис",
    ]);
  });

  it.each([
    ["another TMDB id", info({ tmdbId: 1234 })],
    ["another media type", info({ mediaType: "tv" })],
  ])(
    "Naka's content has %s than the message: notfound, no SC request, nothing issued",
    async (_n, msg) => {
      const w = world({ state: linkedTo(2005) });
      expect(await w.jobs.ficheInfo(TAB, msg)).toEqual({ state: "notfound" });
      expect(w.sk.calls).toEqual([]);
      await expect(w.jobs.ficheMine(TAB, mine())).rejects.toThrow();
    },
  );

  it("Naka knows no such content: notfound, nothing issued", async () => {
    const w = world({
      state: linkedTo(2005),
      naka: { contentById: async () => undefined },
    });
    expect(await w.jobs.ficheInfo(TAB, info())).toEqual({ state: "notfound" });
    expect(w.sk.calls).toEqual([]);
  });

  it.each([
    ["linked", { state: linkedTo(2005) }, 2005],
    ["matched", { sc: two }, 11],
  ])(
    "a %s product of another universe than the title: notfound, not issued",
    async (_n, o, id) => {
      const w = world({ ...o, ...rated(UNIVERSE.serie) });
      expect(await w.jobs.ficheInfo(TAB, info())).toEqual({
        state: "notfound",
      });
      await expect(
        w.jobs.ficheMine(TAB, mine({ productId: id })),
      ).rejects.toThrow();
    },
  );

  it("issues the product to the asking tab: its own rating can then be read", async () => {
    const w = world({ state: linkedTo(2005) });
    await w.jobs.ficheInfo(TAB, info());
    expect(await w.jobs.ficheMine(TAB, mine())).toEqual({
      mine: 7,
      average: 6.9,
    });
  });

  it("issues the candidates of a choice", async () => {
    const w = world({ naka: nakaSays({ releaseDate: undefined }), sc: two });
    await w.jobs.ficheInfo(TAB, info());
    await expect(
      w.jobs.ficheMine(TAB, mine({ productId: 12 })),
    ).resolves.toEqual({ mine: 7, average: 6.9 });
  });

  it("a new fiche-info resets the tab: the candidates of the earlier choice are no longer issued", async () => {
    const w = world({ naka: nakaSays({ releaseDate: undefined }), sc: two });
    await w.jobs.ficheInfo(TAB, info());
    w.area.data.set("ficheLinks", { "5": 11 });
    await w.jobs.ficheInfo(TAB, info());
    await expect(
      w.jobs.ficheMine(TAB, mine({ productId: 12 })),
    ).rejects.toThrow();
    await expect(
      w.jobs.ficheMine(TAB, mine({ productId: 11 })),
    ).resolves.toEqual({ mine: 7, average: 6.9 });
  });

  it("a new fiche-info forgets the tab's products before its Naka read", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let hold = false;
    const w = world({
      state: linkedTo(2005),
      naka: {
        contentById: async () => {
          if (hold) await held;
          return nakaSolaris();
        },
      },
    });
    await w.jobs.ficheInfo(TAB, info());
    hold = true;
    const second = w.jobs.ficheInfo(TAB, info());
    await vi.waitFor(() => expect(w.nk.calls).toHaveLength(2));
    expect(await w.registry.has(TAB, 5, 2005)).toBe(false);
    release();
    await second;
    expect(await w.registry.has(TAB, 5, 2005)).toBe(true);
  });

  it("a failed product read rejects, and issues nothing", async () => {
    const w = world({
      state: linkedTo(2005),
      sc: {
        productState: async () => {
          throw new Error("down");
        },
      },
    });
    await expect(w.jobs.ficheInfo(TAB, info())).rejects.toThrow();
    await expect(w.jobs.ficheMine(TAB, mine())).rejects.toThrow();
  });
});

// Naka's reads of content 5 wait until released; content 6 (TMDB 9006) answers at once.
function heldNaka() {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const naka = {
    contentById: async (id: number) => {
      if (id !== 5) return nakaSolaris({ contentId: id, tmdbId: 9000 + id });
      await held;
      return nakaSolaris();
    },
  };
  return { naka, release: () => release() };
}

const searches = (calls: readonly string[]) =>
  calls.filter((call) => call.startsWith("search:"));

describe("one fiche-info in flight per tab", () => {
  it("two overlapping from one tab: one SC search, the older answers notfound, the newer its match", async () => {
    const h = heldNaka();
    const w = world({ naka: h.naka, sc: two });
    const older = w.jobs.ficheInfo(TAB, info());
    const newer = w.jobs.ficheInfo(TAB, info());
    h.release();
    expect(await older).toEqual({ state: "notfound" });
    expect(await newer).toMatchObject({
      state: "matched",
      product: { id: 11 },
    });
    expect(searches(w.sk.calls)).toEqual(["search:movie:Solaris"]);
    expect(w.limited).toEqual(["limit:naka", "limit:sc", "limit:sc"]);
    expect(await w.registry.has(TAB, 5, 11)).toBe(true);
  });

  it("the newest wins: an older read that ends last writes nothing to the registry", async () => {
    const h = heldNaka();
    const w = world({ naka: h.naka });
    w.area.data.set("ficheLinks", { "5": 2005, "6": 2006 });
    const older = w.jobs.ficheInfo(TAB, info());
    await vi.waitFor(() => expect(w.nk.calls).toEqual(["contentById:5"]));
    const newer = w.jobs.ficheInfo(TAB, info({ contentId: 6, tmdbId: 9006 }));
    expect(await newer).toMatchObject({ product: { id: 2006 } });
    h.release();
    expect(await older).toEqual({ state: "notfound" });
    expect(w.sk.calls).toEqual(["productState:2006"]);
    expect(await w.registry.titleOf(TAB, 6)).toEqual(filmTitle(2006));
    expect(await w.registry.titleOf(TAB, 5)).toBeUndefined();
  });

  it("another tab's fiche-info is unaffected", async () => {
    const h = heldNaka();
    const w = world({ naka: h.naka, sc: two });
    const mine = w.jobs.ficheInfo(TAB, info());
    const other = w.jobs.ficheInfo(OTHER_TAB, info());
    h.release();
    expect(await mine).toMatchObject({ state: "matched" });
    expect(await other).toMatchObject({ state: "matched" });
    expect(searches(w.sk.calls)).toHaveLength(2);
    expect(await w.registry.has(TAB, 5, 11)).toBe(true);
    expect(await w.registry.has(OTHER_TAB, 5, 11)).toBe(true);
  });

  it("a fiche-info after the tab's last one ended runs in full", async () => {
    const w = world({ sc: two });
    await w.jobs.ficheInfo(TAB, info());
    expect(await w.jobs.ficheInfo(TAB, info())).toMatchObject({
      state: "matched",
    });
    expect(searches(w.sk.calls)).toHaveLength(2);
  });
});

describe("fiche-info: the panel's flags", () => {
  const URL = "https://www.senscritique.com/film/solaris/2005";
  const undo = (over: Partial<FicheUndo> = {}): FicheUndo => ({
    contentId: 5,
    productId: 2005,
    role: "film",
    at: NOW - 60_000,
    before: {
      rating: null,
      isDone: false,
      dateDone: null,
      isWished: false,
      inMaListe: null,
    },
    local: { handled: false, settled: false, cards: [] },
    ...over,
  });
  const flagsOf = async (w: ReturnType<typeof world>) => {
    const product = (await w.jobs.ficheInfo(TAB, info())).product;
    return {
      canUndo: product?.canUndo,
      canRemove: product?.canRemove,
      url: product?.url,
    };
  };

  it("a live record of this title and product: undo offered, with the product's page", async () => {
    const w = world({
      state: linkedTo(2005),
      product: () => ({ rating: 7, universe: 1, label: LABEL, url: URL }),
    });
    w.area.data.set("ficheUndo", undo());
    expect(await flagsOf(w)).toEqual({
      canUndo: true,
      canRemove: true,
      url: URL,
    });
  });

  it.each([
    ["of another title", undo({ contentId: 9 })],
    ["of another product of this title", undo({ productId: 2006 })],
    ["ten minutes old", undo({ at: NOW - 600_000 })],
    ["from the future", undo({ at: NOW + 1 })],
  ])("a record %s: no undo", async (_n, record) => {
    const w = world({ state: linkedTo(2005) });
    w.area.data.set("ficheUndo", record);
    expect((await flagsOf(w)).canUndo).toBe(false);
  });

  it("no record, no page: no undo, no link", async () => {
    const w = world({ state: linkedTo(2005) });
    expect(await flagsOf(w)).toEqual({
      canUndo: false,
      canRemove: true,
      url: undefined,
    });
  });

  it.each([
    ["no rating", { rating: null }, false],
    ["a critique", { isReviewed: true }, false],
    ["a recommendation", { isRecommended: true }, false],
    ["a rating and nothing to lose", {}, true],
  ])("removal with %s: %s", async (_n, over, removable) => {
    const w = world({
      state: linkedTo(2005),
      product: () => ({ rating: 7, universe: 1, label: LABEL, ...over }),
    });
    expect((await flagsOf(w)).canRemove).toBe(removable);
  });
});

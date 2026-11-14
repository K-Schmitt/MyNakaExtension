import { describe, expect, it, vi } from "vitest";
import type {
  FicheLinkMessage,
  FicheSearchMessage,
} from "../src/ext/fiche-messages";
import { ficheSearchJob } from "../src/sw/fiche-search-job";
import type { TabTurn } from "../src/sw/fiche-tab-turns";
import { answerWorld, type WorldOpts } from "./answer-world";
import {
  filmTitle,
  nakaSays,
  nakaSolaris,
  OTHER_TAB,
  solaris,
  TAB,
} from "./fiche-fixtures";
import { filmItem, seriesItem } from "./sw-fakes";

const search = (
  over: Partial<FicheSearchMessage> = {},
): FicheSearchMessage => ({
  type: "fiche-search",
  contentId: 5,
  query: "Solaris",
  ...over,
});
const link = (productId: number): FicheLinkMessage => ({
  type: "fiche-link",
  contentId: 5,
  productId,
});
const two = { search: async () => [solaris(11, 1972), solaris(12, 2002)] };
const searches = (calls: readonly string[]) =>
  calls.filter((call) => call.startsWith("search:"));

// The tab shows content 5's page, with nothing issued (fiche-info answered notfound).
async function pageWorld(o: WorldOpts = {}) {
  const w = answerWorld({ naka: nakaSays(), ...o });
  await w.registry.open(TAB, 5, undefined, []);
  return w;
}

describe("fiche-search: the results", () => {
  it("answers SensCritique's results as candidates, searched with the typed query in the title's universe", async () => {
    const w = await pageWorld({ sc: two });

    const answer = await w.jobs.ficheSearch(TAB, search({ query: "Solaris" }));

    expect(answer).toEqual({
      candidates: [
        { id: 11, title: "Solaris", year: 1972, type: "film" },
        { id: 12, title: "Solaris", year: 2002, type: "film" },
      ],
    });
    expect(w.nk.calls).toEqual(["contentById:5"]);
    expect(w.sk.calls).toEqual(["search:movie:Solaris"]);
    expect(w.limited).toEqual(["limit:naka", "limit:sc"]);
  });

  it("issues the results as candidates of the tab's page: fiche-link accepts them", async () => {
    const w = await pageWorld({ sc: two });

    await w.jobs.ficheSearch(TAB, search());

    expect(await w.registry.issuedAs(TAB, 5, 11, "candidate")).toBe(true);
    expect(await w.jobs.ficheLink(TAB, link(12))).toEqual({ ok: true });
    expect(w.area.data.get("ficheLinks")).toEqual({ "5": 12 });
  });

  it("is a read: nothing written to either site or to the state", async () => {
    const w = await pageWorld({ sc: two });

    await w.jobs.ficheSearch(TAB, search());

    expect(w.writes()).toEqual([]);
    expect(w.stateSaves()).toBe(0);
    expect(w.area.data.has("ficheLinks")).toBe(false);
  });

  it("keeps the candidates fiche-info issued to the page", async () => {
    const w = answerWorld({ naka: nakaSays(), sc: two });
    await w.registry.open(TAB, 5, undefined, [30]);

    await w.jobs.ficheSearch(TAB, search());

    expect(await w.registry.issuedAs(TAB, 5, 30, "candidate")).toBe(true);
    expect(await w.registry.issuedAs(TAB, 5, 11, "candidate")).toBe(true);
  });

  it("a series' page searches the series universe", async () => {
    const w = await pageWorld({
      naka: nakaSays({ mediaType: "tv", title: "Dark" }),
      sc: { search: async () => [seriesItem(12)] },
    });

    const answer = await w.jobs.ficheSearch(TAB, search({ query: "Dark" }));

    expect(w.sk.calls).toEqual(["search:tvShow:Dark"]);
    expect(answer.candidates.map((c) => c.id)).toEqual([12]);
  });

  it("a result of another universe is filtered out, and not issued", async () => {
    const w = await pageWorld({
      sc: { search: async () => [seriesItem(12), solaris(11, 1972)] },
    });

    const answer = await w.jobs.ficheSearch(TAB, search());

    expect(answer.candidates.map((c) => c.id)).toEqual([11]);
    expect(await w.registry.has(TAB, 5, 12)).toBe(false);
    await expect(w.jobs.ficheLink(TAB, link(12))).rejects.toThrow();
  });

  it("keeps the first 10 results, in SensCritique's order, and issues only those", async () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => filmItem(i + 1));
    const w = await pageWorld({ sc: { search: async () => fifteen } });

    const answer = await w.jobs.ficheSearch(TAB, search());

    expect(answer.candidates.map((c) => c.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(await w.registry.has(TAB, 5, 10)).toBe(true);
    expect(await w.registry.has(TAB, 5, 11)).toBe(false);
  });

  it("each product once: a result listed twice is one candidate", async () => {
    const twice = {
      search: async () => [solaris(11, 1972), solaris(11, 1972)],
    };
    const w = await pageWorld({ sc: twice });

    const answer = await w.jobs.ficheSearch(TAB, search());

    expect(answer.candidates.map((c) => c.id)).toEqual([11]);
  });

  it("no result: no candidates", async () => {
    const w = await pageWorld({ sc: { search: async () => [] } });

    expect(await w.jobs.ficheSearch(TAB, search())).toEqual({
      candidates: [],
    });
  });

  it("a content Naka no longer has: no candidates, and no SensCritique request", async () => {
    const w = await pageWorld({ naka: { contentById: async () => undefined } });

    expect(await w.jobs.ficheSearch(TAB, search())).toEqual({
      candidates: [],
    });
    expect(w.sk.calls).toEqual([]);
  });

  it("a failed SensCritique search rejects, and issues nothing", async () => {
    const w = await pageWorld({
      sc: {
        search: async () => {
          throw new Error("down");
        },
      },
    });

    await expect(w.jobs.ficheSearch(TAB, search())).rejects.toThrow();
    await expect(w.jobs.ficheLink(TAB, link(11))).rejects.toThrow();
  });
});

describe("fiche-search: only for the tab's page", () => {
  it("a search for another content than the tab's page is refused, with no request", async () => {
    const w = await pageWorld({ sc: two });

    await expect(
      w.jobs.ficheSearch(TAB, search({ contentId: 6 })),
    ).rejects.toThrow();
    expect(w.network()).toEqual([]);
    expect(w.limited).toEqual([]);
  });

  it("a tab with no title page is refused, with no request", async () => {
    const w = await pageWorld({ sc: two });

    await expect(w.jobs.ficheSearch(OTHER_TAB, search())).rejects.toThrow();
    expect(w.network()).toEqual([]);
  });

  it("the results are issued to the asking tab only", async () => {
    const w = await pageWorld({ sc: two });
    await w.registry.open(OTHER_TAB, 5, filmTitle(2005), []);

    await w.jobs.ficheSearch(TAB, search());

    expect(await w.registry.has(OTHER_TAB, 5, 11)).toBe(false);
  });
});

// Naka's reads wait until released.
function heldNaka() {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const naka = {
    contentById: async () => {
      await held;
      return nakaSolaris();
    },
  };
  return { naka, release: () => release() };
}

describe("one fiche-search in flight per tab", () => {
  it("a superseded search answers no candidates, sends no SensCritique request and takes no SC slot", async () => {
    const h = heldNaka();
    const w = await pageWorld({ naka: h.naka, sc: two });
    const older = w.jobs.ficheSearch(TAB, search({ query: "Solaris 1972" }));
    await vi.waitFor(() => expect(w.nk.calls).toHaveLength(1));

    const newer = w.jobs.ficheSearch(TAB, search({ query: "Solaris" }));
    h.release();

    expect(await older).toEqual({ candidates: [] });
    expect(await newer).toMatchObject({ candidates: [{ id: 11 }, { id: 12 }] });
    expect(searches(w.sk.calls)).toEqual(["search:movie:Solaris"]);
    expect(w.limited).toEqual(["limit:naka", "limit:naka", "limit:sc"]);
  });

  it("a search superseded after its SC read issues nothing", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const w = await pageWorld({
      sc: {
        search: async (q) => {
          if (q === "Old") {
            await held;
            return [solaris(11, 1972)];
          }
          return [solaris(12, 2002)];
        },
      },
    });
    const older = w.jobs.ficheSearch(TAB, search({ query: "Old" }));
    await vi.waitFor(() => expect(w.sk.calls).toHaveLength(1));

    const newer = await w.jobs.ficheSearch(TAB, search({ query: "New" }));
    release();

    expect(await older).toEqual({ candidates: [] });
    expect(newer.candidates.map((c) => c.id)).toEqual([12]);
    expect(await w.registry.has(TAB, 5, 11)).toBe(false);
    expect(await w.registry.has(TAB, 5, 12)).toBe(true);
  });

  it("a search superseded once its read was checked issues nothing", async () => {
    let read = false;
    let checks = 0;
    const w = await pageWorld({
      sc: {
        search: async () => {
          read = true;
          return [solaris(11, 1972)];
        },
      },
    });
    // Live for its reads and the check of their answer; a newer search starts right after.
    const turn: TabTurn = {
      live: () => {
        if (!read) return true;
        checks += 1;
        return checks === 1;
      },
      end: () => undefined,
    };
    const asker = { registry: w.registry, tabId: TAB };

    const answer = await ficheSearchJob(w.jobDeps, asker, search(), turn);

    expect(answer).toEqual({ candidates: [] });
    expect(await w.registry.has(TAB, 5, 11)).toBe(false);
  });

  it("another tab's search is unaffected", async () => {
    const h = heldNaka();
    const w = await pageWorld({ naka: h.naka, sc: two });
    await w.registry.open(OTHER_TAB, 5, undefined, []);
    const mine = w.jobs.ficheSearch(TAB, search());
    const other = w.jobs.ficheSearch(OTHER_TAB, search());
    h.release();

    expect((await mine).candidates).toHaveLength(2);
    expect((await other).candidates).toHaveLength(2);
    expect(searches(w.sk.calls)).toHaveLength(2);
  });

  it("a search after the tab's last one ended runs in full", async () => {
    const w = await pageWorld({ sc: two });
    await w.jobs.ficheSearch(TAB, search());

    expect((await w.jobs.ficheSearch(TAB, search())).candidates).toHaveLength(
      2,
    );
    expect(searches(w.sk.calls)).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";
import { MAX_CANDIDATES } from "../src/core/questions";
import { answerWorld } from "./answer-world";
import { info, linkedTo, mine, solaris, TAB } from "./fiche-fixtures";
import { seriesItem } from "./sw-fakes";

const rated = () => ({ product: () => ({ rating: 7, average: 6.9 }) });

describe("fiche-info", () => {
  it("a linked film: linked, with the average and the owner's rating, one read through the SC limiter", async () => {
    const w = answerWorld({ state: linkedTo(2005), ...rated() });
    const answer = await w.jobs.ficheInfo(TAB, info());
    expect(answer).toEqual({
      state: "linked",
      product: { id: 2005, average: 6.9, mine: 7 },
    });
    expect(w.sk.calls).toEqual(["productState:2005"]);
    expect(w.limited).toEqual(["limit:sc"]);
    expect(w.writes()).toEqual([]);
  });

  it("a display-only link (ficheLinks) is linked too, with no search", async () => {
    const w = answerWorld(rated());
    w.area.data.set("ficheLinks", { "5": 2006 });
    const answer = await w.jobs.ficheInfo(TAB, info());
    expect(answer).toMatchObject({ state: "linked", product: { id: 2006 } });
    expect(w.sk.calls).toEqual(["productState:2006"]);
  });

  it("the mapping wins over a display-only link", async () => {
    const w = answerWorld({ state: linkedTo(2005), ...rated() });
    w.area.data.set("ficheLinks", { "5": 2006 });
    const answer = await w.jobs.ficheInfo(TAB, info());
    expect(answer).toMatchObject({ product: { id: 2005 } });
  });

  it("unreadable ficheLinks count as no links: the title is searched", async () => {
    const w = answerWorld({
      sc: { search: async () => [solaris(11, 1972)] },
    });
    w.area.data.set("ficheLinks", { x: 1 });
    const answer = await w.jobs.ficheInfo(TAB, info({ year: 1972 }));
    expect(answer).toMatchObject({ state: "matched", product: { id: 11 } });
  });

  it("a title found once by search: matched, and nothing written to the mapping", async () => {
    const w = answerWorld({
      sc: { search: async () => [solaris(11, 1972), solaris(12, 2002)] },
      ...rated(),
    });
    const answer = await w.jobs.ficheInfo(TAB, info({ year: 1972 }));
    expect(answer).toEqual({
      state: "matched",
      product: { id: 11, average: 6.9, mine: 7 },
    });
    expect(w.sk.calls).toEqual(["search:movie:Solaris", "productState:11"]);
    expect(w.limited).toEqual(["limit:sc", "limit:sc"]);
    expect(w.state().mapping).toEqual([]);
    expect(w.stateSaves()).toBe(0);
    expect(w.area.data.has("ficheLinks")).toBe(false);
    expect(w.writes()).toEqual([]);
  });

  it("a series searches the series universe only", async () => {
    const w = answerWorld({ sc: { search: async () => [seriesItem(12)] } });
    const answer = await w.jobs.ficheInfo(
      TAB,
      info({ mediaType: "tv", title: "Serie 12" }),
    );
    expect(w.sk.calls[0]).toBe("search:tvShow:Serie 12");
    expect(answer).toMatchObject({ state: "choose" });
  });

  it("two close candidates: choose, with both, and no product read", async () => {
    const w = answerWorld({
      sc: { search: async () => [solaris(11, 1972), solaris(12, 2002)] },
    });
    const answer = await w.jobs.ficheInfo(TAB, info({ year: 1987 }));
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
    const w = answerWorld({ sc: { search: async () => many } });
    const answer = await w.jobs.ficheInfo(TAB, info({ year: 1972 }));
    expect(answer.candidates).toHaveLength(MAX_CANDIDATES);
  });

  it("none: notfound, after the original title was searched too", async () => {
    const w = answerWorld();
    const answer = await w.jobs.ficheInfo(
      TAB,
      info({ originalTitle: "Солярис" }),
    );
    expect(answer).toEqual({ state: "notfound" });
    expect(w.sk.calls).toEqual([
      "search:movie:Solaris",
      "search:movie:Солярис",
    ]);
    expect(w.limited).toEqual(["limit:sc", "limit:sc"]);
  });

  it("issues the product to the asking tab: its own rating can then be read", async () => {
    const w = answerWorld({ state: linkedTo(2005), ...rated() });
    await w.jobs.ficheInfo(TAB, info());
    expect(await w.jobs.ficheMine(TAB, mine())).toEqual({ mine: 7 });
  });

  it("issues the candidates of a choice", async () => {
    const w = answerWorld({
      sc: { search: async () => [solaris(11, 1972), solaris(12, 2002)] },
    });
    await w.jobs.ficheInfo(TAB, info());
    await expect(
      w.jobs.ficheMine(TAB, mine({ productId: 12 })),
    ).resolves.toEqual({ mine: null });
  });

  it("a failed product read rejects, and issues nothing", async () => {
    const w = answerWorld({
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

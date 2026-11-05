import { describe, expect, it } from "vitest";
import type { TabsPort } from "../src/sw/naka-proxy";
import { answerWorld } from "./answer-world";
import { MARKER, strings } from "./naka-bridge-fakes";
import { filmItem, nakaItem, seriesItem } from "./sw-fakes";

const search = (side: "naka" | "sc", query = "cowboy bebop") =>
  ({ type: "search-titles", side, query }) as const;

const noTab = (): TabsPort => ({
  query: async () => [],
  send: async () => ({}),
});

describe("search-titles", () => {
  it("side naka, « cowboy bebop »: both SensCritique universes, once each, through the SC limiter, no Naka call", async () => {
    const w = answerWorld({
      sc: {
        search: async (_q, universe) =>
          universe === "movie" ? [filmItem(11)] : [seriesItem(12)],
      },
    });
    const answer = await w.jobs.searchTitles(search("naka"));
    expect(w.sk.calls).toEqual([
      "search:movie:cowboy bebop",
      "search:tvShow:cowboy bebop",
    ]);
    expect(w.limited).toEqual(["limit:sc", "limit:sc"]);
    expect(w.nk.calls).toEqual([]);
    expect(w.traffic.sent).toEqual([]);
    expect(answer).toEqual({
      candidates: [
        { id: 11, title: "Film 11", year: 2001, type: "film" },
        { id: 12, title: "Serie 12", type: "serie" },
      ],
    });
  });

  it("side sc: one Naka search through the tab and the Naka limiter, no SensCritique call", async () => {
    const w = answerWorld({
      naka: { search: async () => [nakaItem(31), nakaItem(32, "tv")] },
    });
    const answer = await w.jobs.searchTitles(search("sc"));
    expect(w.nk.calls).toEqual(["search:cowboy bebop"]);
    expect(w.limited).toEqual(["limit:naka"]);
    expect(w.sk.calls).toEqual([]);
    expect(answer).toMatchObject({
      candidates: [
        { id: 31, type: "film" },
        { id: 32, type: "serie" },
      ],
    });
  });

  it("side sc with no Naka tab: { error: no-naka-tab }, nothing else", async () => {
    const w = answerWorld({ tabs: noTab });
    expect(await w.jobs.searchTitles(search("sc"))).toEqual({
      error: "no-naka-tab",
    });
  });

  it("40 results are cut to 20", async () => {
    const forty = Array.from({ length: 40 }, (_, i) => filmItem(100 + i));
    const w = answerWorld({
      sc: { search: async (_q, u) => (u === "movie" ? forty : []) },
    });
    const answer = await w.jobs.searchTitles(search("naka"));
    expect("candidates" in answer && answer.candidates).toHaveLength(20);
    expect(
      "candidates" in answer && answer.candidates.map((c) => c.id),
    ).toEqual(forty.slice(0, 20).map((i) => i.productId));
  });

  it("the same product listed twice is one candidate", async () => {
    const w = answerWorld({ sc: { search: async () => [filmItem(11)] } });
    const answer = await w.jobs.searchTitles(search("naka"));
    expect(
      "candidates" in answer && answer.candidates.map((c) => c.id),
    ).toEqual([11]);
  });

  it("a failure is a code, with none of the error's text; storage is never written", async () => {
    const w = answerWorld({
      sc: {
        search: async () => {
          throw new Error(`HTTP 500 ${MARKER}`);
        },
      },
    });
    const answer = await w.jobs.searchTitles(search("naka"));
    expect(answer).toEqual({ error: "unavailable" });
    expect(strings(answer).join()).not.toContain(MARKER);
    expect(w.area.sets).toEqual([]);
  });

  it("a query the checker refuses is an answer with a code, with no site call", async () => {
    const w = answerWorld();
    const answer = await w.jobs.searchTitles(search("naka", "   "));
    expect(answer).toEqual({ error: "unavailable" });
    expect(w.network()).toEqual([]);
  });

  it("a success writes nothing and carries no secret", async () => {
    const w = answerWorld({ sc: { search: async () => [filmItem(11)] } });
    const answer = await w.jobs.searchTitles(search("naka"));
    expect(w.area.sets).toEqual([]);
    expect(strings(answer).join()).not.toContain(MARKER);
  });
});

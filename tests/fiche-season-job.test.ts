import { describe, expect, it } from "vitest";
import type { ScEpisode } from "../src/sc/season-episodes";
import { answerWorld } from "./answer-world";
import { info, linkedTo, mine, season, solaris, TAB } from "./fiche-fixtures";

const episode = (n: number, average: number | null = 7.4): ScEpisode => ({
  productId: 3100 + n,
  season: 2,
  episode: n,
  title: `Épisode ${n}`,
  average,
});

const seriesWorld = (episodes: ScEpisode[]) =>
  answerWorld({
    state: linkedTo(3000),
    sc: { seasonInfo: async () => ({ seasonProductId: 3099, episodes }) },
  });

describe("fiche-season", () => {
  it("before fiche-info (series not issued): no episodes, no request", async () => {
    const w = seriesWorld([episode(1)]);
    expect(await w.jobs.ficheSeason(TAB, season())).toEqual({ episodes: [] });
    expect(w.sk.calls).toEqual([]);
    expect(w.limited).toEqual([]);
  });

  it("after fiche-info: one season read through the SC limiter, each episode with its average", async () => {
    const w = seriesWorld([episode(1), episode(2, null)]);
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    const answer = await w.jobs.ficheSeason(TAB, season());
    expect(answer).toEqual({
      episodes: [
        { episode: 1, productId: 3101, average: 7.4 },
        { episode: 2, productId: 3102, average: null },
      ],
    });
    expect(w.sk.calls).toEqual(["productState:3000", "seasonInfo:3000:2"]);
    expect(w.limited).toEqual(["limit:sc", "limit:sc"]);
    expect(w.writes()).toEqual([]);
  });

  it("issues each episode product to the tab", async () => {
    const w = seriesWorld([episode(1)]);
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    await w.jobs.ficheSeason(TAB, season());
    await expect(
      w.jobs.ficheMine(TAB, mine({ productId: 3101 })),
    ).resolves.toEqual({ mine: null });
  });

  it("a choice issues no title: no season read", async () => {
    const w = answerWorld({
      sc: { search: async () => [solaris(11, 1972), solaris(12, 2002)] },
    });
    await w.jobs.ficheInfo(TAB, info());
    expect(await w.jobs.ficheSeason(TAB, season())).toEqual({ episodes: [] });
    expect(w.sk.calls).toEqual(["search:movie:Solaris"]);
  });

  it("another content of the same tab gets no episodes", async () => {
    const w = seriesWorld([episode(1)]);
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    const answer = await w.jobs.ficheSeason(TAB, season({ contentId: 6 }));
    expect(answer).toEqual({ episodes: [] });
  });

  it("at most 500 episodes", async () => {
    const many = Array.from({ length: 600 }, (_, i) => episode(i + 1));
    const w = seriesWorld(many);
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    const answer = await w.jobs.ficheSeason(TAB, season());
    expect(answer.episodes).toHaveLength(500);
  });
});

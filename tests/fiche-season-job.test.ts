import { describe, expect, it, vi } from "vitest";
import { parseSeasonAnswer } from "../src/ext/fiche-answers";
import { UNIVERSE } from "../src/sc/sc-queries";
import type { ScEpisode } from "../src/sc/season-episodes";
import { NotIssuedError } from "../src/sw/fiche-mine-job";
import { answerWorld } from "./answer-world";
import {
  info,
  linkedTo,
  mine,
  nakaSays,
  OTHER_TAB,
  season,
  solaris,
  TAB,
} from "./fiche-fixtures";

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
    naka: nakaSays({ mediaType: "tv" }),
    product: () => ({ universe: UNIVERSE.serie, label: { title: "Dark" } }),
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
        { episode: 1, productId: 3101, average: 7.4, title: "Épisode 1" },
        { episode: 2, productId: 3102, average: null, title: "Épisode 2" },
      ],
    });
    expect(w.sk.calls).toEqual(["productState:3000", "seasonInfo:3000:2"]);
    expect(w.limited).toEqual(["limit:naka", "limit:sc", "limit:sc"]);
    expect(w.writes()).toEqual([]);
  });

  it("issues each episode product to the tab", async () => {
    const w = seriesWorld([episode(1)]);
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    await w.jobs.ficheSeason(TAB, season());
    await expect(
      w.jobs.ficheMine(TAB, mine({ productId: 3101 })),
    ).resolves.toEqual({ mine: null, average: null });
  });

  it("a choice issues no title: no season read", async () => {
    const w = answerWorld({
      naka: nakaSays({ releaseDate: undefined }),
      sc: { search: async () => [solaris(11, 1972), solaris(12, 2002)] },
    });
    await w.jobs.ficheInfo(TAB, info());
    expect(await w.jobs.ficheSeason(TAB, season())).toEqual({ episodes: [] });
    expect(w.sk.calls).toEqual(["search:movie:Solaris"]);
  });

  it("a film's title page: no episodes, no season read", async () => {
    const w = answerWorld({
      state: linkedTo(2005),
      naka: nakaSays(),
      product: () => ({ label: { title: "Solaris" } }),
      sc: { seasonInfo: async () => ({ seasonProductId: 1, episodes: [] }) },
    });
    await w.jobs.ficheInfo(TAB, info());
    expect(await w.registry.titleOf(TAB, 5)).toMatchObject({ productId: 2005 });
    expect(await w.jobs.ficheSeason(TAB, season())).toEqual({ episodes: [] });
    expect(w.sk.calls).toEqual(["productState:2005"]);
  });

  it("another content of the same tab gets no episodes", async () => {
    const w = seriesWorld([episode(1)]);
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    const answer = await w.jobs.ficheSeason(TAB, season({ contentId: 6 }));
    expect(answer).toEqual({ episodes: [] });
  });

  it("carries each episode's SensCritique title, capped at 200 characters, none when SC has none", async () => {
    const long = { ...episode(1), title: "x".repeat(300) };
    const untitled = { ...episode(2), title: "" };
    const w = seriesWorld([long, untitled]);
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    const [first, second] = (await w.jobs.ficheSeason(TAB, season())).episodes;
    expect(first?.title).toBe("x".repeat(200));
    expect(second).toEqual({ episode: 2, productId: 3102, average: 7.4 });
  });

  it("at most 500 episodes", async () => {
    const many = Array.from({ length: 600 }, (_, i) => episode(i + 1));
    const w = seriesWorld(many);
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    const answer = await w.jobs.ficheSeason(TAB, season());
    expect(answer.episodes).toHaveLength(500);
  });

  it("a failed read of the tab's current season rejects, and issues no episode", async () => {
    const w = answerWorld({
      state: linkedTo(3000),
      naka: nakaSays({ mediaType: "tv" }),
      product: () => ({ universe: UNIVERSE.serie, label: { title: "Dark" } }),
      sc: {
        seasonInfo: async () => {
          throw new Error("season read 4242");
        },
      },
    });
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    await expect(w.jobs.ficheSeason(TAB, season())).rejects.toThrow(
      "season read 4242",
    );
    await expect(
      w.jobs.ficheMine(TAB, mine({ productId: 3101 })),
    ).rejects.toThrow();
  });

  it("leaves out an episode the tab cannot read (number 0, a product id that is no id): the others still show and stay issued", async () => {
    const zero = { ...episode(0), productId: 3100 };
    const badId = { ...episode(3), productId: 1.5 };
    const w = seriesWorld([zero, episode(1), badId, episode(2)]);
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    const answer = await w.jobs.ficheSeason(TAB, season());
    expect(parseSeasonAnswer(answer).episodes.map((e) => e.episode)).toEqual([
      1, 2,
    ]);
    await expect(
      w.jobs.ficheMine(TAB, mine({ productId: 3101 })),
    ).resolves.toEqual({ mine: null, average: null });
    await expect(
      w.jobs.ficheMine(TAB, mine({ productId: 3100 })),
    ).rejects.toThrow(NotIssuedError);
  });
});

// Season s, episode n is SensCritique product 3100 + 10 s + n; season 1's read waits until released.
function heldSeasons() {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let hold = false;
  const seasonInfo = async (_id: number, s: number) => {
    if (hold && s === 1) await held;
    const episodes = [1, 2].map((n) => ({ ...episode(n), season: s }));
    return {
      episodes: episodes.map((found) => ({
        ...found,
        productId: 3100 + 10 * s + found.episode,
      })),
    };
  };
  const world = answerWorld({
    state: linkedTo(3000),
    naka: nakaSays({ mediaType: "tv" }),
    product: () => ({ universe: UNIVERSE.serie, label: { title: "Dark" } }),
    sc: { seasonInfo },
  });
  return { w: world, hold: () => (hold = true), release: () => release() };
}

const seasonReads = (calls: readonly string[]) =>
  calls.filter((call) => call.startsWith("seasonInfo:"));
const ids = (answer: { episodes: { productId: number }[] }) =>
  answer.episodes.map((found) => found.productId);

describe("one fiche-season in flight per tab", () => {
  it("two overlapping from one tab: one SC request, the older answers no episodes, the newest wins", async () => {
    const { w } = heldSeasons();
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    const older = w.jobs.ficheSeason(TAB, season({ season: 1 }));
    const newer = w.jobs.ficheSeason(TAB, season({ season: 3 }));
    expect(await older).toEqual({ episodes: [] });
    expect(ids(await newer)).toEqual([3131, 3132]);
    expect(seasonReads(w.sk.calls)).toEqual(["seasonInfo:3000:3"]);
    await expect(
      w.jobs.ficheMine(TAB, mine({ productId: 3111 })),
    ).rejects.toThrow();
    await expect(
      w.jobs.ficheMine(TAB, mine({ productId: 3131 })),
    ).resolves.toEqual({ mine: null, average: null });
  });

  it("an older read that ends after the newer one issues nothing", async () => {
    const h = heldSeasons();
    await h.w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    h.hold();
    const older = h.w.jobs.ficheSeason(TAB, season({ season: 1 }));
    await vi.waitFor(() =>
      expect(seasonReads(h.w.sk.calls)).toEqual(["seasonInfo:3000:1"]),
    );
    expect(ids(await h.w.jobs.ficheSeason(TAB, season({ season: 3 })))).toEqual(
      [3131, 3132],
    );
    h.release();
    expect(await older).toEqual({ episodes: [] });
    await expect(
      h.w.jobs.ficheMine(TAB, mine({ productId: 3111 })),
    ).rejects.toThrow();
  });

  it("another tab's season is unaffected", async () => {
    const { w } = heldSeasons();
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    await w.jobs.ficheInfo(OTHER_TAB, info({ mediaType: "tv" }));
    const mineRead = w.jobs.ficheSeason(TAB, season({ season: 1 }));
    const other = w.jobs.ficheSeason(OTHER_TAB, season({ season: 3 }));
    expect(ids(await mineRead)).toEqual([3111, 3112]);
    expect(ids(await other)).toEqual([3131, 3132]);
  });

  it("a season after the tab's last one ended runs in full", async () => {
    const { w } = heldSeasons();
    await w.jobs.ficheInfo(TAB, info({ mediaType: "tv" }));
    await w.jobs.ficheSeason(TAB, season({ season: 1 }));
    expect(ids(await w.jobs.ficheSeason(TAB, season({ season: 3 })))).toEqual([
      3131, 3132,
    ]);
    expect(seasonReads(w.sk.calls)).toHaveLength(2);
  });
});

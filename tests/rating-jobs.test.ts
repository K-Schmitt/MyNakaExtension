import { describe, expect, it } from "vitest";
import type { FinishedMessage } from "../src/content/playback-tracker";
import type { RatingCard } from "../src/core/rating-cards";
import { emptyState } from "../src/core/state";
import { JobRejected } from "../src/ext/job-error";
import type { Settings } from "../src/ext/settings";
import {
  type NakaClient,
  type NakaItem,
  NakaUnavailableError,
} from "../src/naka/naka-client";
import type { ScClient } from "../src/sc/sc-client";
import {
  ScUnauthenticatedError,
  ScUnavailableError,
} from "../src/sc/sc-errors";
import type { ScWishItem } from "../src/sc/wishlist-page";
import { createJobQueue } from "../src/sw/job-queue";
import { createJobs } from "../src/sw/jobs";
import { createRouter } from "../src/sw/router";
import { tabRunning } from "./naka-bridge-fakes";
import { episodeCard, filmCard } from "./rating-fixtures";
import { countingLimiter, fakeNaka, fakeSc, memoryStore } from "./sw-fakes";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const BOUND = { scUsername: "owner", nakaAccount: "77" };

// Film 3 (SensCritique 1003) and series 7 (1007). A season's episodes are 5001..; its season product is 5007.
const FILM = 3;
const SERIES = 7;

const sc = (id: number, universe = 1): ScWishItem => ({
  productId: id,
  title: universe === 4 ? `Serie ${id - 1000}` : `Film ${id - 1000}`,
  url: universe === 4 ? `/serie/x/${id}` : `/film/x/${id}`,
  universe,
  year: 2000 + (id - 1000),
});

type Opts = {
  /** What Naka says of series 7. */
  numberOfSeasons?: number;
  episodesPerSeason?: number;
  /** The owner's current rating per SensCritique product. */
  rated?: Record<number, number>;
  sc?: Partial<ScClient>;
  naka?: Partial<NakaClient>;
  settings?: Settings;
  username?: { current: string };
  nakaAccount?: () => string | undefined;
  ratings?: unknown;
};

function catalogue(o: Opts): Map<number, NakaItem> {
  const series: NakaItem = {
    contentId: SERIES,
    tmdbId: 9007,
    mediaType: "tv",
    title: "Serie 7",
    releaseDate: "2007-01-01",
    ...(o.numberOfSeasons === undefined
      ? {}
      : { numberOfSeasons: o.numberOfSeasons }),
  };
  const film: NakaItem = {
    contentId: FILM,
    tmdbId: 9003,
    mediaType: "movie",
    title: "Film 3",
    releaseDate: "2003-01-01",
  };
  return new Map([
    [FILM, film],
    [SERIES, series],
  ]);
}

function world(o: Opts = {}) {
  const { area, store } = memoryStore();
  if (o.settings) area.data.set("settings", o.settings);
  if (o.ratings !== undefined) area.data.set("ratings", o.ratings);
  const items = catalogue(o);
  const nk = fakeNaka({
    contentById: async (id) => items.get(id),
    ...o.naka,
  });
  const perSeason = o.episodesPerSeason ?? 3;
  const sk = fakeSc({
    search: async (q, universe) => {
      if (universe === "movie" && q === "Film 3") return [sc(1003)];
      if (universe === "tvShow" && q === "Serie 7") return [sc(1007, 4)];
      return [];
    },
    productState: async (id) => ({
      isDone: false,
      isWished: false,
      universe: id >= 5000 ? 32 : id === 1007 ? 4 : 1,
      rating: o.rated?.[id] ?? null,
    }),
    seasonInfo: async (id, season) => ({
      seasonProductId: 4000 + id,
      episodes: Array.from({ length: perSeason }, (_, i) => ({
        productId: 5001 + i,
        season,
        episode: i + 1,
        title: `Episode ${i + 1}`,
      })),
    }),
    ...o.sc,
  });
  const username = o.username ?? { current: "owner" };
  const traffic = { sent: [] as unknown[], returned: [] as unknown[] };
  const tabs = tabRunning(
    nk.client,
    o.nakaAccount ?? (() => "77"),
    traffic,
  ).tabs;
  const slots: string[] = [];
  const jobs = createJobs({
    store,
    tabs,
    sc: sk.client,
    scUsername: async () => username.current,
    limiters: {
      naka: countingLimiter(slots, "naka"),
      sc: countingLimiter(slots, "sc"),
    },
    now: () => NOW,
    today: () => "2026-11-04",
    timer: { set: () => 0, clear: () => undefined },
  });
  return {
    jobs,
    area,
    nk,
    sk,
    username,
    slots,
    cards: (): RatingCard[] =>
      (area.data.get("ratings") as RatingCard[] | undefined) ?? [],
    settings: () => area.data.get("settings") as Settings,
  };
}

const finished = (over: Partial<FinishedMessage> = {}): FinishedMessage => ({
  type: "finished",
  source: "threshold",
  progress: 0.95,
  contentId: FILM,
  ...over,
});

const episode = (season: number, ep: number): FinishedMessage =>
  finished({ contentId: SERIES, progress: 0.85, season, episode: ep });

const ratesOf = (calls: string[]) => calls.filter((c) => c.startsWith("rate:"));
const writesOf = (calls: string[]) =>
  calls.filter((c) => /^(wish|unwish|markDone|unmarkDone|rate):/.test(c));

const rate = (
  label: "film" | "épisode" | "saison" | "série",
  rating: number,
  ids: { contentId: number; season?: number; episode?: number } = {
    contentId: FILM,
  },
) => ({ type: "rate" as const, ...ids, label, rating });

const SERIES_E = { contentId: SERIES, season: 3, episode: 3 };

describe("the finish creates the rating card", () => {
  it("a film finish keeps a card with the film target, pending, from the one content read", async () => {
    const w = world();
    await w.jobs.finishJob(finished());
    expect(w.cards()).toEqual([
      {
        key: "movie:3",
        contentId: 3,
        title: "Film 3",
        at: NOW,
        targets: [{ label: "film", productId: 1003, current: null }],
        pending: ["film"],
        given: {},
        seriesFinished: false,
      },
    ]);
    expect(w.nk.calls).toEqual(["contentById:3"]);
  });

  it("the last episode of a 3-season series, with Naka's count 3, finishes the series: épisode, saison and série are asked", async () => {
    const w = world({ numberOfSeasons: 3 });
    await w.jobs.finishJob(episode(3, 3));
    const [card] = w.cards();
    expect(card).toMatchObject({
      key: "tv:7:S3E3",
      contentId: 7,
      title: "Serie 7",
      season: 3,
      episode: 3,
      seriesFinished: true,
      pending: ["épisode", "saison", "série"],
    });
    expect(card?.targets.map((t) => [t.label, t.productId])).toEqual([
      ["épisode", 5003],
      ["saison", 5007],
      ["série", 1007],
    ]);
    expect(w.nk.calls).toEqual(["contentById:7", "availableSeasons:7"]);
  });

  it("with no season count from Naka the series is not finished: épisode and saison only, and the série is never read", async () => {
    const w = world();
    await w.jobs.finishJob(episode(3, 3));
    expect(w.cards()[0]).toMatchObject({
      seriesFinished: false,
      pending: ["épisode", "saison"],
    });
    expect(w.sk.calls).not.toContain("productState:1007");
  });

  it("the last episode of a season before the last asks the saison, not the série", async () => {
    const w = world({ numberOfSeasons: 3 });
    await w.jobs.finishJob(episode(2, 3));
    expect(w.cards()[0]).toMatchObject({
      seriesFinished: false,
      pending: ["épisode", "saison"],
    });
    expect(w.sk.calls).not.toContain("productState:1007");
  });

  it("an episode in the middle of a season asks only the épisode, and reads no saison nor série", async () => {
    const w = world({ numberOfSeasons: 3 });
    await w.jobs.finishJob(episode(3, 2));
    expect(w.cards()[0]).toMatchObject({ pending: ["épisode"] });
    expect(w.sk.calls).not.toContain("productState:5007");
    expect(w.sk.calls).not.toContain("productState:1007");
  });

  it("reads the saison and the série once each, and a rating the owner already gave is not asked again", async () => {
    const w = world({ numberOfSeasons: 3, rated: { 5007: 8, 1007: 9 } });
    await w.jobs.finishJob(episode(3, 3));
    expect(w.sk.calls.filter((c) => c === "productState:5007")).toHaveLength(1);
    expect(w.sk.calls.filter((c) => c === "productState:1007")).toHaveLength(1);
    const [card] = w.cards();
    expect(card?.pending).toEqual(["épisode"]);
    expect(card?.targets.map((t) => t.current)).toEqual([null, 8, 9]);
  });

  it("a finish that is not done makes no card", async () => {
    const w = world({ sc: { search: async () => [] } });
    await w.jobs.finishJob(finished());
    expect(w.area.ops).not.toContain("set:ratings");
  });

  it("the finish is recorded before the ratings are saved", async () => {
    const w = world();
    await w.jobs.finishJob(finished());
    const sets = w.area.ops.filter((op) => op.startsWith("set:"));
    const ratings = sets.indexOf("set:ratings");
    const lastSettings = sets.lastIndexOf("set:settings");
    expect(ratings).toBeGreaterThan(-1);
    expect(lastSettings).toBeLessThan(ratings);
    expect(w.settings().lastFinish).toMatchObject({ outcome: "done" });
  });

  it("a ratings save that fails leaves the finish recorded", async () => {
    const w = world();
    const real = w.area.set;
    w.area.set = async (items) => {
      if ("ratings" in items) throw new Error("quota");
      return real(items);
    };
    await w.jobs.finishJob(finished());
    expect(w.settings().lastFinish).toMatchObject({ outcome: "done" });
    expect(w.area.data.get("state")).toMatchObject({ handled: ["movie:3"] });
    expect(w.area.data.has("ratings")).toBe(false);
  });

  it("unreadable stored ratings are left untouched, and the finish is recorded", async () => {
    const w = world({ ratings: "garbage" });
    await w.jobs.finishJob(finished());
    expect(w.settings().lastFinish).toMatchObject({ outcome: "done" });
    expect(w.area.data.get("ratings")).toBe("garbage");
  });

  const failing = (...ids: number[]) => ({
    productState: async (id: number) => {
      if (ids.includes(id)) throw new ScUnavailableError("boom");
      return { isDone: false, isWished: false, universe: 32, rating: null };
    },
  });

  it("a saison read that fails drops only the saison: the card is kept with the épisode asked", async () => {
    const w = world({ numberOfSeasons: 3, sc: failing(5007) });
    await w.jobs.finishJob(episode(3, 3));
    expect(w.settings().lastFinish).toMatchObject({ outcome: "done" });
    const [card] = w.cards();
    expect(card?.pending).toEqual(["épisode", "série"]);
    expect(card?.targets.map((t) => [t.label, t.current])).toEqual([
      ["épisode", null],
      ["saison", null],
      ["série", null],
    ]);
  });

  it("a série read that fails drops only the série", async () => {
    const w = world({ numberOfSeasons: 3, sc: failing(1007) });
    await w.jobs.finishJob(episode(3, 3));
    expect(w.cards()[0]?.pending).toEqual(["épisode", "saison"]);
  });

  it("both reads failing leave the épisode asked, and the card saved", async () => {
    const w = world({ numberOfSeasons: 3, sc: failing(5007, 1007) });
    await w.jobs.finishJob(episode(3, 3));
    expect(w.cards()[0]?.pending).toEqual(["épisode"]);
    expect(w.cards()[0]?.targets).toHaveLength(3);
  });
});

describe("the season list of Naka decides the ends", () => {
  const seasons = (
    list: number[],
    counts: Record<number, number>,
  ): Partial<NakaClient> => ({
    availableSeasons: async () => ({ seasons: list, episodeCounts: counts }),
  });

  it("E16 of season 1 with {1: 16} ends the season even when SensCritique lists an E17", async () => {
    const w = world({
      episodesPerSeason: 17,
      naka: seasons([1, 2], { 1: 16, 2: 10 }),
    });
    await w.jobs.finishJob(episode(1, 16));
    expect(w.cards()[0]).toMatchObject({
      seriesFinished: false,
      pending: ["épisode", "saison"],
    });
    expect(w.sk.calls).toContain("productState:5007");
  });

  it("E22 of season 7 with seasons up to 7 finishes the series, with no numberOfSeasons from the catalogue", async () => {
    const w = world({
      episodesPerSeason: 22,
      naka: seasons([1, 2, 3, 4, 5, 6, 7], { 7: 22 }),
    });
    await w.jobs.finishJob(episode(7, 22));
    expect(w.cards()[0]).toMatchObject({
      seriesFinished: true,
      pending: ["épisode", "saison", "série"],
    });
  });

  it("the list beats a stale numberOfSeasons: season 2 of 3 is not the end of the series", async () => {
    const w = world({
      numberOfSeasons: 2,
      naka: seasons([1, 2, 3], { 2: 3 }),
    });
    await w.jobs.finishJob(episode(2, 3));
    expect(w.cards()[0]).toMatchObject({
      seriesFinished: false,
      pending: ["épisode", "saison"],
    });
  });

  it("a gap in the list: the last season is the highest, not the count", async () => {
    const w = world({ naka: seasons([1, 2, 4], { 4: 3 }) });
    await w.jobs.finishJob(episode(4, 3));
    expect(w.cards()[0]?.seriesFinished).toBe(true);
    const gap = world({ naka: seasons([1, 2, 4], { 2: 3 }) });
    await gap.jobs.finishJob(episode(2, 3));
    expect(gap.cards()[0]?.seriesFinished).toBe(false);
  });

  it("an episode before the count of its season is not the end of the season", async () => {
    const w = world({
      episodesPerSeason: 3,
      naka: seasons([1], { 1: 16 }),
    });
    await w.jobs.finishJob(episode(1, 3));
    expect(w.cards()[0]?.pending).toEqual(["épisode"]);
  });

  it("a list that has no count for the season falls back to SensCritique's last episode", async () => {
    const w = world({ naka: seasons([1, 2], { 1: 16 }) });
    await w.jobs.finishJob(episode(2, 3));
    expect(w.cards()[0]).toMatchObject({
      seriesFinished: true,
      pending: ["épisode", "saison", "série"],
    });
  });

  it("the call goes through the Naka limiter, after the content read", async () => {
    const w = world({ naka: seasons([1], { 1: 3 }) });
    await w.jobs.finishJob(episode(1, 3));
    expect(w.nk.calls).toEqual(["contentById:7", "availableSeasons:7"]);
    expect(w.slots.filter((s) => s === "limit:naka")).toHaveLength(2);
  });

  it("a call that fails keeps the card, the record and Naka's numberOfSeasons", async () => {
    const w = world({
      numberOfSeasons: 3,
      naka: {
        availableSeasons: async () => {
          throw new NakaUnavailableError("Naka seasons: HTTP 500", 500);
        },
      },
    });
    await w.jobs.finishJob(episode(3, 3));
    expect(w.settings().lastFinish).toMatchObject({ outcome: "done" });
    expect(w.cards()[0]).toMatchObject({
      seriesFinished: true,
      pending: ["épisode", "saison", "série"],
    });
  });

  it("an unreachable tab for that call keeps the card too", async () => {
    const w = world({
      numberOfSeasons: 3,
      naka: {
        availableSeasons: async () => {
          throw new JobRejected("naka-session");
        },
      },
    });
    await w.jobs.finishJob(episode(2, 3));
    expect(w.settings().lastFinish).toMatchObject({ outcome: "done" });
    expect(w.cards()[0]?.pending).toEqual(["épisode", "saison"]);
  });

  it("no call for a film", async () => {
    const w = world({ naka: seasons([1], { 1: 3 }) });
    await w.jobs.finishJob(finished());
    expect(w.nk.calls).toEqual(["contentById:3"]);
    expect(w.cards()).toHaveLength(1);
  });

  it("no call when the finish does not end done", async () => {
    const w = world({
      sc: { search: async () => [] },
      naka: seasons([1], { 1: 3 }),
    });
    await w.jobs.finishJob(episode(1, 3));
    expect(w.nk.calls).toEqual(["contentById:7"]);
    expect(w.area.ops).not.toContain("set:ratings");
  });
});

describe("rate", () => {
  it("with a card: exactly one sc.rate, no unwish, no wish; the card is updated and saved", async () => {
    const w = world();
    await w.jobs.finishJob(finished());
    w.sk.calls.length = 0;
    await w.jobs.rate(rate("film", 7));
    expect(w.sk.calls).toEqual(["rate:1003:7"]);
    expect(w.cards()[0]).toMatchObject({
      pending: [],
      given: { film: 7 },
      targets: [{ label: "film", productId: 1003, current: 7 }],
    });
    expect(w.cards()[0]).not.toHaveProperty("failed");
  });

  it("with a card, it does not run a finish again: no content read, no slot of the hour's budget", async () => {
    const w = world();
    await w.jobs.finishJob(finished());
    const window = w.settings().finishWindow;
    w.nk.calls.length = 0;
    w.area.ops.length = 0;
    await w.jobs.rate(rate("film", 7));
    expect(w.nk.calls).toEqual([]);
    expect(w.area.ops).not.toContain("get:state");
    expect(w.settings().finishWindow).toEqual(window);
  });

  it("a title already rated can be rated again, whatever the card's pending", async () => {
    const w = world();
    await w.jobs.finishJob(finished());
    await w.jobs.rate(rate("film", 7));
    await w.jobs.rate(rate("film", 9));
    expect(ratesOf(w.sk.calls)).toEqual(["rate:1003:7", "rate:1003:9"]);
    expect(w.cards()[0]?.given).toEqual({ film: 9 });
  });

  it("rating a série, on a card that says the series is finished, sends ProductRate and nothing else", async () => {
    const w = world({ numberOfSeasons: 3 });
    await w.jobs.finishJob(episode(3, 3));
    w.sk.calls.length = 0;
    await w.jobs.rate(rate("série", 9, SERIES_E));
    expect(w.sk.calls).toEqual(["rate:1007:9"]);
    expect(writesOf(w.sk.calls).some((c) => c.startsWith("unwish"))).toBe(
      false,
    );
  });

  it("épisode and saison ratings call only the rating of their own product", async () => {
    const w = world({ numberOfSeasons: 3 });
    await w.jobs.finishJob(episode(3, 3));
    w.sk.calls.length = 0;
    await w.jobs.rate(rate("épisode", 6, SERIES_E));
    await w.jobs.rate(rate("saison", 8, SERIES_E));
    expect(w.sk.calls).toEqual(["rate:5003:6", "rate:5007:8"]);
    expect(w.cards()[0]).toMatchObject({
      given: { épisode: 6, saison: 8 },
      pending: ["série"],
    });
  });

  it("a label that is not among the card's targets rates nothing", async () => {
    const w = world();
    await w.jobs.finishJob(finished());
    w.sk.calls.length = 0;
    await w.jobs.rate(rate("série", 7));
    await w.jobs.rate(rate("saison", 7));
    await w.jobs.rate(rate("épisode", 7));
    expect(w.sk.calls).toEqual([]);
    expect(w.cards()[0]?.given).toEqual({});
  });

  it("an épisode with no card: the explicit finish runs, then the épisode is rated", async () => {
    const w = world({ numberOfSeasons: 3 });
    await w.jobs.rate(
      rate("épisode", 7, { contentId: SERIES, season: 1, episode: 2 }),
    );
    expect(writesOf(w.sk.calls)).toEqual([
      "markDone:5002:2026-11-04",
      "rate:5002:7",
    ]);
    expect(w.cards()[0]).toMatchObject({
      key: "tv:7:S1E2",
      given: { épisode: 7 },
    });
    expect(w.settings().lastFinish).toMatchObject({
      key: "tv:7:S1E2",
      outcome: "done",
    });
  });

  it("the pause case with the saison read failing: markDone, then exactly one rate on the épisode, card kept", async () => {
    const w = world({
      numberOfSeasons: 3,
      sc: {
        productState: async (id) => {
          if (id === 5007) throw new ScUnavailableError("boom");
          return { isDone: false, isWished: false, universe: 32, rating: null };
        },
      },
    });
    await w.jobs.rate(rate("épisode", 7, SERIES_E));
    expect(writesOf(w.sk.calls)).toEqual([
      "markDone:5003:2026-11-04",
      "rate:5003:7",
    ]);
    expect(w.cards()[0]).toMatchObject({
      key: "tv:7:S3E3",
      given: { épisode: 7 },
    });
  });

  it("a film with no card: the explicit finish runs, then the film is rated", async () => {
    const w = world();
    await w.jobs.rate(rate("film", 8));
    expect(writesOf(w.sk.calls)).toEqual([
      "markDone:1003:2026-11-04",
      "rate:1003:8",
    ]);
  });

  it("the explicit finish ends needs-choice: no sc.rate, and no card", async () => {
    const twin = { ...sc(2003), title: "Film 3", year: 2003 };
    const w = world({
      sc: {
        search: async (_q, universe) =>
          universe === "movie" ? [sc(1003), twin] : [],
      },
    });
    await w.jobs.rate(rate("film", 8));
    expect(ratesOf(w.sk.calls)).toEqual([]);
    expect(writesOf(w.sk.calls)).toEqual([]);
    expect(w.settings().lastFinish?.outcome).toBe("needs-choice");
    expect(w.area.data.has("ratings")).toBe(false);
  });

  it("the explicit finish ends not-found: no sc.rate, and no card", async () => {
    const w = world({ sc: { search: async () => [] } });
    await w.jobs.rate(rate("film", 8));
    expect(writesOf(w.sk.calls)).toEqual([]);
    expect(w.settings().lastFinish?.outcome).toBe("not-found");
    expect(w.area.data.has("ratings")).toBe(false);
  });

  it("a saison or a série with no card: nothing at all, not even a finish", async () => {
    const w = world({ numberOfSeasons: 3 });
    await w.jobs.rate(rate("saison", 7, SERIES_E));
    await w.jobs.rate(rate("série", 7, SERIES_E));
    expect(w.sk.calls).toEqual([]);
    expect(w.nk.calls).toEqual([]);
    expect(w.area.sets).toEqual([]);
  });

  it("a label that does not fit its ids (a film label with an episode, an épisode label with none) runs no finish", async () => {
    const w = world();
    await w.jobs.rate(
      rate("film", 7, { contentId: SERIES, season: 1, episode: 1 }),
    );
    await w.jobs.rate(rate("épisode", 7, { contentId: FILM }));
    expect(w.sk.calls).toEqual([]);
    expect(w.nk.calls).toEqual([]);
  });

  it("a content already handled whose card is gone is rated from a card rebuilt read-only (Ruling L2)", async () => {
    const w = world();
    await w.jobs.finishJob(finished());
    w.area.data.delete("ratings");
    w.sk.calls.length = 0;
    await expect(w.jobs.rate(rate("film", 7))).resolves.toBeUndefined();
    expect(writesOf(w.sk.calls)).toEqual(["rate:1003:7"]);
  });

  it("a forged sequence of 50 rates for keys never finished sends no ProductRate", async () => {
    const w = world({ numberOfSeasons: 3 });
    for (let id = 1; id <= 25; id += 1) {
      const ids = { contentId: 100 + id, season: 3, episode: 3 };
      await w.jobs.rate(rate("saison", 10, ids));
      await w.jobs.rate(rate("série", 10, ids));
    }
    expect(w.sk.calls).toEqual([]);
    expect(w.nk.calls).toEqual([]);
  });

  it("an expired SensCritique session is stored as the card's failure, and the label stays pending", async () => {
    const w = world({
      sc: {
        rate: async () => {
          throw new ScUnauthenticatedError();
        },
      },
    });
    await w.jobs.finishJob(finished());
    await w.jobs.rate(rate("film", 7));
    expect(w.cards()[0]).toMatchObject({
      pending: ["film"],
      given: {},
      failed: { label: "film", error: "sc-session", at: NOW },
    });
    expect(w.cards()[0]?.targets[0]?.current).toBeNull();
  });

  it("an unavailable SensCritique is stored as unavailable, never as the error's text", async () => {
    const w = world({
      sc: {
        rate: async () => {
          throw new ScUnavailableError("SensCritique ProductRate: HTTP 500");
        },
      },
    });
    await w.jobs.finishJob(finished());
    await w.jobs.rate(rate("film", 7));
    expect(w.cards()[0]?.failed).toEqual({
      label: "film",
      error: "unavailable",
      at: NOW,
    });
    expect(JSON.stringify(w.area.data.get("ratings"))).not.toContain("HTTP");
  });

  it("a later success clears the failure of its label", async () => {
    let fail = true;
    const w = world({
      sc: {
        rate: async () => {
          if (fail) throw new ScUnavailableError("x");
        },
      },
    });
    await w.jobs.finishJob(finished());
    await w.jobs.rate(rate("film", 7));
    fail = false;
    await w.jobs.rate(rate("film", 7));
    expect(w.cards()[0]).not.toHaveProperty("failed");
    expect(w.cards()[0]?.given).toEqual({ film: 7 });
  });
});

describe("rate: the binding is checked before the write (Plan 3)", () => {
  it("another SensCritique account: no ProductRate, the failure is stored", async () => {
    const w = world({ settings: { mode: "live", binding: BOUND } });
    await w.jobs.finishJob(finished());
    w.username.current = "intruder";
    w.sk.calls.length = 0;
    await w.jobs.rate(rate("film", 7));
    expect(w.sk.calls).toEqual([]);
    expect(w.cards()[0]).toMatchObject({
      pending: ["film"],
      given: {},
      failed: { label: "film", error: "other-account", at: NOW },
    });
  });

  it("another Naka account: no ProductRate, the failure is stored", async () => {
    let account = "77";
    const w = world({
      settings: { mode: "live", binding: BOUND },
      nakaAccount: () => account,
    });
    await w.jobs.finishJob(finished());
    account = "88";
    w.sk.calls.length = 0;
    await w.jobs.rate(rate("film", 7));
    expect(w.sk.calls).toEqual([]);
    expect(w.cards()[0]?.failed).toMatchObject({ error: "other-account" });
  });

  it("a logged-out Naka tab: no ProductRate, naka-session is stored", async () => {
    let account: string | undefined = "77";
    const w = world({ nakaAccount: () => account });
    await w.jobs.finishJob(finished());
    account = undefined;
    w.sk.calls.length = 0;
    await w.jobs.rate(rate("film", 7));
    expect(w.sk.calls).toEqual([]);
    expect(w.cards()[0]?.failed).toMatchObject({ error: "naka-session" });
  });

  it("the same accounts rate", async () => {
    const w = world({ settings: { mode: "live", binding: BOUND } });
    await w.jobs.finishJob(finished());
    await w.jobs.rate(rate("film", 7));
    expect(ratesOf(w.sk.calls)).toEqual(["rate:1003:7"]);
  });

  it("simulation mode rates too (ratings write in both modes)", async () => {
    const w = world({ settings: { mode: "simulation" } });
    await w.jobs.finishJob(finished());
    await w.jobs.rate(rate("film", 7));
    expect(ratesOf(w.sk.calls)).toEqual(["rate:1003:7"]);
  });
});

describe("rate a handled title that has no card (Ruling L2)", () => {
  const FILM_PAIR = { nakaId: FILM, scId: 1003 };
  const SERIES_PAIR = { nakaId: SERIES, scId: 1007 };
  const LAST: Settings["lastFinish"] = {
    at: 1,
    key: "movie:3",
    outcome: "done",
  };
  // Finished under Plan 3, or before its card existed: handled, mapped, no card.
  function handled(
    o: Opts,
    keys: string[],
    mapping = [FILM_PAIR, SERIES_PAIR],
  ) {
    const w = world({ settings: { mode: "live", lastFinish: LAST }, ...o });
    w.area.data.set("state", {
      ...emptyState(),
      mapping,
      settled: [FILM_PAIR],
      handled: keys,
    });
    return w;
  }
  const markDones = (calls: string[]) =>
    calls.filter((c) => c.startsWith("markDone"));

  it("a handled film: one ProductRate on its mapped product, no markDone, no unwish, lastFinish unchanged, and a card with the rating", async () => {
    const w = handled({}, ["movie:3"]);
    await w.jobs.rate(rate("film", 8));
    expect(writesOf(w.sk.calls)).toEqual(["rate:1003:8"]);
    expect(w.settings().lastFinish).toEqual(LAST);
    expect(w.settings().finishWindow).toBeUndefined();
    expect(w.cards()).toEqual([
      {
        key: "movie:3",
        contentId: 3,
        title: "Film 3",
        at: NOW,
        targets: [{ label: "film", productId: 1003, current: 8 }],
        pending: [],
        given: { film: 8 },
        seriesFinished: false,
      },
    ]);
  });

  it("its reads: one Naka content read first, through the Naka limiter, then the product's state", async () => {
    const w = handled({}, ["movie:3"]);
    await w.jobs.rate(rate("film", 8));
    expect(w.nk.calls).toEqual(["contentById:3"]);
    expect(w.slots).toEqual(["limit:naka"]);
    expect(w.sk.calls).toEqual(["productState:1003", "rate:1003:8"]);
  });

  it("a handled episode: one seasonInfo, then one ProductRate on the episode product, no markDone", async () => {
    const w = handled({}, ["tv:7:S1E2"]);
    await w.jobs.rate(
      rate("épisode", 7, { contentId: SERIES, season: 1, episode: 2 }),
    );
    expect(w.sk.calls).toEqual([
      "seasonInfo:1007:1",
      "productState:5002",
      "rate:5002:7",
    ]);
    expect(markDones(w.sk.calls)).toEqual([]);
    expect(w.cards()[0]).toMatchObject({
      key: "tv:7:S1E2",
      contentId: 7,
      title: "Serie 7",
      season: 1,
      episode: 2,
      targets: [{ label: "épisode", productId: 5002, current: 7 }],
      given: { épisode: 7 },
      seriesFinished: false,
    });
  });

  it("the owner's current rating is kept on the card's target until the rate", async () => {
    const w = handled(
      {
        sc: {
          rate: async () => {
            throw new ScUnavailableError("x");
          },
        },
        rated: { 1003: 6 },
      },
      ["movie:3"],
    );
    await w.jobs.rate(rate("film", 8));
    expect(w.cards()[0]).toMatchObject({
      targets: [{ label: "film", productId: 1003, current: 6 }],
      pending: ["film"],
      failed: { label: "film", error: "unavailable" },
    });
  });

  it("checkBinding throwing other-account: zero ProductRate, and a card with the failure", async () => {
    const w = handled({ username: { current: "intruder" } }, ["movie:3"]);
    w.area.data.set("settings", { mode: "live", binding: BOUND });
    await w.jobs.rate(rate("film", 8));
    expect(ratesOf(w.sk.calls)).toEqual([]);
    expect(writesOf(w.sk.calls)).toEqual([]);
    expect(w.cards()[0]).toMatchObject({
      key: "movie:3",
      pending: ["film"],
      given: {},
      failed: { label: "film", error: "other-account", at: NOW },
    });
  });

  it("a forged rate for a key that is NOT handled takes 4a's path: the explicit finish, its budget, then the rate", async () => {
    const w = handled({}, []);
    await w.jobs.rate(rate("film", 8));
    expect(writesOf(w.sk.calls)).toEqual([
      "markDone:1003:2026-11-04",
      "rate:1003:8",
    ]);
    expect(w.settings().lastFinish).toMatchObject({
      key: "movie:3",
      outcome: "done",
    });
    expect(w.settings().finishWindow?.count).toBe(1);
  });

  it("a handled key with no mapping: zero ProductRate, nothing stored", async () => {
    const w = handled({}, ["movie:3"], []);
    await w.jobs.rate(rate("film", 8));
    expect(w.sk.calls).toEqual([]);
    expect(w.area.data.has("ratings")).toBe(false);
  });

  it("a handled key rated with a saison or a série label: nothing at all", async () => {
    const w = handled({}, ["tv:7:S1E2"]);
    const ids = { contentId: SERIES, season: 1, episode: 2 };
    await w.jobs.rate(rate("saison", 7, ids));
    await w.jobs.rate(rate("série", 7, ids));
    expect(w.sk.calls).toEqual([]);
    expect(w.nk.calls).toEqual([]);
    expect(w.area.data.has("ratings")).toBe(false);
  });

  it("a product of the wrong universe: zero ProductRate, nothing stored", async () => {
    const film = handled({}, ["movie:3"], [{ nakaId: FILM, scId: 1007 }]);
    await film.jobs.rate(rate("film", 8));
    const episodeOfFilm = handled(
      {
        sc: {
          productState: async () => ({
            isDone: true,
            isWished: false,
            universe: 1,
            rating: null,
          }),
        },
      },
      ["tv:7:S1E2"],
    );
    await episodeOfFilm.jobs.rate(
      rate("épisode", 7, { contentId: SERIES, season: 1, episode: 2 }),
    );
    for (const w of [film, episodeOfFilm]) {
      expect(ratesOf(w.sk.calls)).toEqual([]);
      expect(w.area.data.has("ratings")).toBe(false);
    }
  });

  it("an episode SensCritique does not list, or a Naka content of the other kind: nothing stored", async () => {
    const missing = handled({ episodesPerSeason: 1 }, ["tv:7:S1E2"]);
    await missing.jobs.rate(
      rate("épisode", 7, { contentId: SERIES, season: 1, episode: 2 }),
    );
    const otherKind = handled({}, ["movie:7"]);
    await otherKind.jobs.rate(rate("film", 7, { contentId: SERIES }));
    for (const w of [missing, otherKind]) {
      expect(ratesOf(w.sk.calls)).toEqual([]);
      expect(w.area.data.has("ratings")).toBe(false);
    }
    expect(otherKind.sk.calls).toEqual([]);
  });

  it("Naka not knowing the content: nothing stored, nothing thrown", async () => {
    const w = handled({ naka: { contentById: async () => undefined } }, [
      "movie:3",
    ]);
    await expect(w.jobs.rate(rate("film", 8))).resolves.toBeUndefined();
    expect(w.sk.calls).toEqual([]);
    expect(w.area.data.has("ratings")).toBe(false);
  });

  it("a forged flood of rates for handled keys makes no write but the rates of mapped titles", async () => {
    const w = handled({}, ["movie:3", "movie:40", "tv:7:S9E9"]);
    await w.jobs.rate(rate("film", 5, { contentId: 40 }));
    await w.jobs.rate(
      rate("épisode", 5, { contentId: SERIES, season: 9, episode: 9 }),
    );
    expect(writesOf(w.sk.calls)).toEqual([]);
  });
});

describe("dismiss-rating", () => {
  it("removes the label from pending and saves, with no network call", async () => {
    const w = world({ numberOfSeasons: 3 });
    await w.jobs.finishJob(episode(3, 3));
    w.sk.calls.length = 0;
    w.nk.calls.length = 0;
    await w.jobs.dismissRating({
      type: "dismiss-rating",
      ...SERIES_E,
      label: "série",
    });
    expect(w.sk.calls).toEqual([]);
    expect(w.nk.calls).toEqual([]);
    expect(w.cards()[0]?.pending).toEqual(["épisode", "saison"]);
    expect(w.cards()[0]?.given).toEqual({});
  });

  it("with no card it writes nothing", async () => {
    const w = world();
    await w.jobs.dismissRating({
      type: "dismiss-rating",
      contentId: 99,
      label: "film",
    });
    expect(w.area.sets).toEqual([]);
  });
});

describe("rating-card and rating-cards", () => {
  const stored = (cards: RatingCard[]) => ({ ratings: cards });

  it("rating-card answers the card of the key and the pause setting", async () => {
    const card = filmCard();
    const w = world({
      ...stored([card]),
      settings: { mode: "simulation", pauseFromPercent: 40 },
    });
    expect(
      await w.jobs.ratingCard({ type: "rating-card", contentId: 9 }),
    ).toEqual({ card, pauseFromPercent: 40 });
  });

  it("rating-card with no card answers null and the default pause setting 0", async () => {
    const w = world();
    expect(
      await w.jobs.ratingCard({ type: "rating-card", contentId: 9 }),
    ).toEqual({ card: null, pauseFromPercent: 0 });
  });

  it("rating-card adds the outcome of the last finish when it is the key's, and only then", async () => {
    const lastFinish = {
      at: 5,
      key: "movie:9",
      outcome: "failed" as const,
      error: "sc-session" as const,
    };
    const w = world({ settings: { mode: "simulation", lastFinish } });
    expect(
      await w.jobs.ratingCard({ type: "rating-card", contentId: 9 }),
    ).toEqual({
      card: null,
      pauseFromPercent: 0,
      lastFinish: { outcome: "failed", error: "sc-session" },
    });
    const other = await w.jobs.ratingCard({
      type: "rating-card",
      contentId: 8,
    });
    expect(other).not.toHaveProperty("lastFinish");
    const choice = world({
      ratings: [filmCard()],
      settings: {
        mode: "simulation",
        lastFinish: { at: 5, key: "movie:9", outcome: "needs-choice" },
      },
    });
    expect(
      await choice.jobs.ratingCard({ type: "rating-card", contentId: 9 }),
    ).toEqual({
      card: filmCard(),
      pauseFromPercent: 0,
      lastFinish: { outcome: "needs-choice" },
    });
  });

  it("rating-card matches the key exactly: another episode is another card", async () => {
    const w = world({ ratings: [episodeCard()] });
    const other = await w.jobs.ratingCard({
      type: "rating-card",
      contentId: 5,
      season: 1,
      episode: 2,
    });
    expect(other.card).toBeNull();
    const same = await w.jobs.ratingCard({
      type: "rating-card",
      contentId: 5,
      season: 1,
      episode: 1,
    });
    expect(same.card?.key).toBe("tv:5:S1E1");
  });

  it("start is the startValue of the card's first pending label", async () => {
    const first = episodeCard({
      key: "tv:5:S1E1",
      episode: 1,
      pending: [],
      given: { épisode: 6 },
    });
    const second = episodeCard({
      key: "tv:5:S1E2",
      episode: 2,
      pending: ["saison", "série"],
      given: { épisode: 9 },
    });
    const w = world({ ratings: [second, first] });
    const answer = await w.jobs.ratingCard({
      type: "rating-card",
      contentId: 5,
      season: 1,
      episode: 2,
    });
    expect(answer.start).toBe(8);
    const done = await w.jobs.ratingCard({
      type: "rating-card",
      contentId: 5,
      season: 1,
      episode: 1,
    });
    expect(done).not.toHaveProperty("start");
  });

  it("rating-cards: only cards with a pending label, newest first, at most 20, each with its start", async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      filmCard({
        key: `movie:${100 + i}`,
        contentId: 100 + i,
        pending: i % 5 === 0 ? [] : ["film"],
      }),
    );
    const w = world({ ratings: many });
    const { cards } = await w.jobs.ratingCards();
    const open = many.filter((c) => c.pending.length > 0);
    expect(open).toHaveLength(20);
    expect(cards.map((c) => c.card.key)).toEqual(open.map((c) => c.key));
    expect(cards.every((c) => c.card.pending.length > 0)).toBe(true);
    const wide = world({
      ratings: Array.from({ length: 30 }, (_, i) =>
        filmCard({ key: `movie:${200 + i}`, contentId: 200 + i }),
      ),
    });
    expect((await wide.jobs.ratingCards()).cards).toHaveLength(20);
  });

  it("rating-cards: a card's start is the one of its first pending label", async () => {
    const eps = [1, 2].map((n) =>
      episodeCard({
        key: `tv:5:S1E${n}`,
        episode: n,
        pending: n === 2 ? ["saison"] : [],
        given: { épisode: n === 1 ? 4 : 8 },
      }),
    );
    const w = world({ ratings: [eps[1], eps[0]] });
    const { cards } = await w.jobs.ratingCards();
    expect(cards).toEqual([{ card: eps[1], start: 6 }]);
  });

  it("both answers are read-only: no write at all", async () => {
    const w = world({ ratings: [filmCard()] });
    await w.jobs.ratingCard({ type: "rating-card", contentId: 9 });
    await w.jobs.ratingCards();
    expect(w.area.sets).toEqual([]);
    expect(w.area.ops.every((op) => op.startsWith("get:"))).toBe(true);
  });

  it("an unreadable store rejects the answer rather than inventing one", async () => {
    const w = world({ ratings: "garbage" });
    await expect(
      w.jobs.ratingCard({ type: "rating-card", contentId: 9 }),
    ).rejects.toThrow();
    await expect(w.jobs.ratingCards()).rejects.toThrow();
  });
});

describe("a rating-card during a running rate job", () => {
  const EXT = "abcdefghijklmnopabcdefghijklmnop";
  const PLAYER = "https://naka.cx/player?id=3&type=movie";
  const TAB = { id: EXT, url: PLAYER, frameId: 0, tab: { url: PLAYER } };
  const settle = async () => {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  it("is answered before the job ends, and shows the card as it was", async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const w = world({
      sc: {
        rate: async () => {
          await gate;
        },
      },
    });
    await w.jobs.finishJob(finished());
    const router = createRouter({
      extensionId: EXT,
      queue: createJobQueue(),
      jobs: w.jobs,
      timer: { set: () => 0, clear: () => undefined },
      now: () => NOW,
    });
    const answers: { card: RatingCard }[] = [];
    const ask = () =>
      router.handle({ type: "rating-card", contentId: FILM }, TAB, (a) =>
        answers.push(a as { card: RatingCard }),
      );
    router.handle(rate("film", 7), TAB, () => undefined);
    await settle();
    expect(w.sk.calls).toContain("rate:1003:7");
    ask();
    await settle();
    expect(answers).toHaveLength(1);
    expect(answers[0]?.card.pending).toEqual(["film"]);
    expect(answers[0]?.card.given).toEqual({});
    open();
    await settle();
    ask();
    await settle();
    expect(answers[1]?.card.pending).toEqual([]);
    expect(answers[1]?.card.given).toEqual({ film: 7 });
  });
});

describe("three rates for one title and label while a sync runs", () => {
  const EXT = "abcdefghijklmnopabcdefghijklmnop";
  const PLAYER = "https://naka.cx/player?id=3&type=movie";
  const TAB = { id: EXT, url: PLAYER, frameId: 0, tab: { url: PLAYER } };
  const settleAll = async () => {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  it("send one ProductRate with the third rating", async () => {
    const w = world();
    await w.jobs.finishJob(finished());
    w.sk.calls.length = 0;
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const router = createRouter({
      extensionId: EXT,
      queue: createJobQueue(),
      jobs: { ...w.jobs, syncJob: () => gate },
      timer: { set: () => 0, clear: () => undefined },
      now: () => NOW,
    });
    router.handle(
      { type: "resync" },
      { id: EXT, url: `chrome-extension://${EXT}/status.html` },
      () => undefined,
    );
    await settleAll();
    for (const rating of [5, 6, 9]) {
      router.handle(rate("film", rating), TAB, () => undefined);
    }
    open();
    await settleAll();
    expect(ratesOf(w.sk.calls)).toEqual(["rate:1003:9"]);
  });
});

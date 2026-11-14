import { describe, expect, it } from "vitest";
import { emptyState, type SyncState } from "../src/core/state";
import type { FicheRateMessage } from "../src/ext/fiche-messages";
import type { Settings } from "../src/ext/settings";
import { ScUnavailableError } from "../src/sc/sc-errors";
import { createJobQueue } from "../src/sw/job-queue";
import { createRouter } from "../src/sw/router";
import { answerWorld, BOUND, NOW, type WorldOpts } from "./answer-world";
import {
  filmTitle,
  linkedTo,
  OTHER_TAB,
  seriesTitle,
  TAB,
} from "./fiche-fixtures";
import { episodeCard, filmCard, target } from "./rating-fixtures";

const rate = (over: Partial<FicheRateMessage> = {}): FicheRateMessage => ({
  type: "fiche-rate",
  contentId: 5,
  target: "film",
  productId: 2005,
  rating: 8,
  ...over,
});
const LIVE: Settings = { mode: "live", binding: BOUND };
// A rating that went out, of a title the world's SensCritique says is unrated and unreviewed, with no page.
const RATED = { ok: true, panel: { canUndo: true, canRemove: true } };
const SIMULATION: Settings = { mode: "simulation", binding: BOUND };

// Content 5 is a film on Naka (the world's default item), in « Ma liste » with 99.
function filmWorld(o: WorldOpts = {}) {
  return answerWorld({
    state: linkedTo(2005),
    settings: LIVE,
    playlist: () => [5, 99],
    ...o,
  });
}

const rates = (calls: string[]) => calls.filter((c) => c.startsWith("rate:"));
const markDones = (calls: string[]) =>
  calls.filter((c) => c.startsWith("markDone:"));

describe("fiche-rate: a film", () => {
  it("linked: one rate, one finish (one slot), then removed from « Ma liste » in live mode", async () => {
    const w = filmWorld();
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual(RATED);
    expect(rates(w.sk.calls)).toEqual(["rate:2005:8"]);
    expect(markDones(w.sk.calls)).toEqual(["markDone:2005:2026-11-05"]);
    expect(w.settings().finishWindow?.count).toBe(1);
    expect(w.settings().lastFinish).toMatchObject({
      key: "movie:5",
      outcome: "done",
    });
    expect(w.nk.calls).toContain("removeFromPlaylist:5");
    expect(w.cards()[0]).toMatchObject({
      key: "movie:5",
      targets: [{ label: "film", productId: 2005, current: 8 }],
    });
  });

  it("in simulation: the same rate and finish, and « Ma liste » neither read nor written", async () => {
    const w = filmWorld({ settings: SIMULATION });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual(RATED);
    expect(rates(w.sk.calls)).toEqual(["rate:2005:8"]);
    expect(markDones(w.sk.calls)).toHaveLength(1);
    expect(w.nk.calls).not.toContain("playlistIds");
    expect(w.nk.calls).not.toContain("removeFromPlaylist:5");
  });

  it("not in « Ma liste »: rated, and no removal", async () => {
    const w = filmWorld({ playlist: () => [99] });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual(RATED);
    expect(w.nk.calls).not.toContain("removeFromPlaylist:5");
  });

  it("« Ma liste » unreadable after the rate: answered as sent, with the list's error", async () => {
    const w = filmWorld({
      playlist: () => {
        throw new Error("down");
      },
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual({
      sent: true,
      error: "unavailable",
      panel: RATED.panel,
    });
    expect(rates(w.sk.calls)).toEqual(["rate:2005:8"]);
    expect(w.nk.calls).not.toContain("removeFromPlaylist:5");
  });

  it("unlinked: the mapping is written first, then the same path", async () => {
    const w = filmWorld({ state: emptyState() });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual(RATED);
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 2005 }]);
    expect(rates(w.sk.calls)).toEqual(["rate:2005:8"]);
    expect(markDones(w.sk.calls)).toEqual(["markDone:2005:2026-11-05"]);
    expect(w.nk.calls).toContain("removeFromPlaylist:5");
  });

  it("a full budget: its error answered, no rate, no list removal, the mapping kept", async () => {
    const w = filmWorld({
      state: emptyState(),
      settings: { ...LIVE, finishWindow: { from: NOW, count: 30 } },
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual({
      error: "finish-limit",
    });
    expect(w.writes()).toEqual([]);
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 2005 }]);
  });

  it("an unlinked entry of the title: linked by hand's way, the entry gone", async () => {
    const w = filmWorld({
      state: {
        ...emptyState(),
        unlinked: [
          { side: "naka", id: 5, title: "Titre 5", reason: "no-match" },
        ],
      },
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual(RATED);
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 2005 }]);
    expect(w.state().unlinked).toEqual([]);
  });

  it("an open question on the title: linked by hand's way, the question resolved", async () => {
    const w = filmWorld({
      state: {
        ...emptyState(),
        pending: [
          {
            kind: "ambiguity",
            side: "naka",
            id: 5,
            candidateIds: [2005, 2006],
          },
        ],
      },
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual(RATED);
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 2005 }]);
    expect(w.state().pending).toEqual([]);
  });

  it.each([
    ["mapped to another content", { mapping: [{ nakaId: 9, scId: 2005 }] }],
    ["held by another settled pair", { settled: [{ nakaId: 5, scId: 2006 }] }],
    [
      "held by a settled pair of another content",
      { settled: [{ nakaId: 9, scId: 2005 }] },
    ],
  ])(
    "the product %s: refused, zero requests, nothing saved",
    async (_n, over) => {
      const state = { ...emptyState(), ...over };
      const w = filmWorld({ state });
      await w.registry.open(TAB, 5, filmTitle(2005), []);
      await expect(w.jobs.ficheRate(TAB, rate())).rejects.toThrow();
      expect(w.network()).toEqual([]);
      expect(w.state()).toEqual(state);
      expect(w.settings().finishWindow).toBeUndefined();
    },
  );

  it("a failed rate: its error answered, stored on the card, no list removal", async () => {
    const w = filmWorld({
      sc: {
        rate: async () => {
          throw new ScUnavailableError("x");
        },
      },
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual({
      error: "unavailable",
    });
    expect(w.nk.calls).not.toContain("removeFromPlaylist:5");
    expect(w.cards()[0]?.failed).toMatchObject({ error: "unavailable" });
  });

  it("linked to another product than the one issued: rejected, no request, nothing saved", async () => {
    const w = filmWorld({ state: linkedTo(2006) });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    await expect(w.jobs.ficheRate(TAB, rate())).rejects.toThrow();
    expect(w.network()).toEqual([]);
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 2006 }]);
  });

  it("a card whose film is another product than the one issued: rejected, no request", async () => {
    const w = filmWorld();
    w.area.data.set("ratings", [
      filmCard({ key: "movie:5", contentId: 5, targets: [target("film")] }),
    ]);
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    await expect(w.jobs.ficheRate(TAB, rate())).rejects.toThrow();
    expect(w.network()).toEqual([]);
  });
});

// Content 5 as a series: its product 13, the série target of episodeCard.
const seriesRate = (over: Partial<FicheRateMessage> = {}) =>
  rate({ target: "série", productId: 13, ...over });

describe("fiche-rate: a series", () => {
  const cards = () => [
    episodeCard(),
    episodeCard({ key: "tv:5:S1E2", episode: 2 }),
    filmCard(),
  ];

  it("rated, its pair settled, every card of the content gets its série rated; no finish, no slot", async () => {
    const w = filmWorld({ state: linkedTo(13) });
    w.area.data.set("ratings", cards());
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    expect(await w.jobs.ficheRate(TAB, seriesRate())).toEqual(RATED);
    expect(w.writes()).toEqual(["rate:13:8"]);
    expect(w.state().settled).toEqual([{ nakaId: 5, scId: 13 }]);
    expect(w.settings().finishWindow).toBeUndefined();
    const [first, second, film] = w.cards();
    expect(first?.targets[2]).toEqual(target("série", 8, 13));
    expect(second?.targets[2]).toEqual(target("série", 8, 13));
    expect(first?.given).toEqual({ série: 8 });
    expect(film).toEqual(filmCard());
  });

  it.each([
    ["mapped to another content", { mapping: [{ nakaId: 9, scId: 13 }] }],
    ["held by another settled pair", { settled: [{ nakaId: 9, scId: 13 }] }],
  ])(
    "the series' product %s: refused, zero requests, nothing settled",
    async (_n, over) => {
      const state = { ...emptyState(), ...over };
      const w = filmWorld({ state });
      await w.registry.open(TAB, 5, seriesTitle(13), []);
      await expect(w.jobs.ficheRate(TAB, seriesRate())).rejects.toThrow();
      expect(w.network()).toEqual([]);
      expect(w.state()).toEqual(state);
    },
  );

  it("unlinked: linked first, then rated and settled", async () => {
    const w = filmWorld({ state: emptyState() });
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    expect(await w.jobs.ficheRate(TAB, seriesRate())).toEqual(RATED);
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 13 }]);
    expect(w.state().settled).toEqual([{ nakaId: 5, scId: 13 }]);
  });

  it("the binding is checked before the write: another account, no rate, its error answered", async () => {
    const w = filmWorld({ state: linkedTo(13), username: "intruder" });
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    expect(await w.jobs.ficheRate(TAB, seriesRate())).toEqual({
      error: "other-account",
    });
    expect(w.writes()).toEqual([]);
    expect(w.state().settled).toEqual([]);
  });
});

const episodeRate = () =>
  rate({ target: "épisode", productId: 11, season: 1, episode: 1 });

// Content 5 as a series on Naka, product 13 on SC; its season 1 holds episodes 1301 and 1302.
const question = (finish?: string): SyncState => ({
  ...emptyState(),
  pending: [
    {
      kind: "ambiguity",
      side: "naka",
      id: 5,
      candidateIds: [13, 14],
      ...(finish === undefined ? {} : { finish }),
    },
  ],
});

function seriesWorld(state: SyncState, sc: WorldOpts["sc"] = {}) {
  return filmWorld({
    state,
    naka: {
      contentById: async () => ({
        contentId: 5,
        tmdbId: 9005,
        mediaType: "tv",
        title: "Titre 5",
        releaseDate: "2005-01-01",
      }),
    },
    product: (id) => ({ universe: id === 13 ? 4 : 32, isWished: false }),
    sc: {
      seasonInfo: async (_id, season) => ({
        seasonProductId: 1300,
        episodes: [1, 2].map((episode) => ({
          productId: 1300 + episode,
          season,
          episode,
          title: `Épisode ${episode}`,
          average: null,
        })),
      }),
      ...sc,
    },
  });
}

describe("fiche-rate: a linked title's waiting finish", () => {
  it("a series whose open question holds an episode finish: rated, settled, then that episode finished once", async () => {
    const w = seriesWorld(question("tv:5:S1E2"));
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    expect(await w.jobs.ficheRate(TAB, seriesRate())).toEqual(RATED);
    expect(rates(w.sk.calls)).toEqual(["rate:13:8"]);
    expect(markDones(w.sk.calls)).toEqual(["markDone:1302:2026-11-05"]);
    expect(w.sk.calls.indexOf("rate:13:8")).toBeLessThan(
      w.sk.calls.indexOf("markDone:1302:2026-11-05"),
    );
    expect(w.state().settled).toContainEqual({ nakaId: 5, scId: 13 });
    expect(w.state().pending).toEqual([]);
    expect(w.settings().lastFinish).toMatchObject({
      key: "tv:5:S1E2",
      outcome: "done",
    });
  });

  it("a series whose question holds no finish: rated and settled, no finish", async () => {
    const w = seriesWorld(question());
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    expect(await w.jobs.ficheRate(TAB, seriesRate())).toEqual(RATED);
    expect(markDones(w.sk.calls)).toEqual([]);
    expect(w.settings().finishWindow).toBeUndefined();
  });

  it("a series rate that fails: its error answered, and the waiting finish still runs (the link was made)", async () => {
    const w = seriesWorld(question("tv:5:S1E2"), {
      rate: async () => {
        throw new ScUnavailableError("x");
      },
    });
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    expect(await w.jobs.ficheRate(TAB, seriesRate())).toEqual({
      error: "unavailable",
    });
    expect(markDones(w.sk.calls)).toEqual(["markDone:1302:2026-11-05"]);
  });

  it("an episode of a series whose question holds an episode finish: linked, the episode rated, then that finish once", async () => {
    const w = seriesWorld(question("tv:5:S1E2"));
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    await w.registry.issue(TAB, 5, [1301]);
    const msg = rate({
      target: "épisode",
      productId: 1301,
      season: 1,
      episode: 1,
    });
    expect(await w.jobs.ficheRate(TAB, msg)).toEqual({ ok: true });
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 13 }]);
    expect(rates(w.sk.calls)).toEqual(["rate:1301:8"]);
    expect(markDones(w.sk.calls)).toEqual(["markDone:1302:2026-11-05"]);
    expect(w.sk.calls.indexOf("rate:1301:8")).toBeLessThan(
      w.sk.calls.indexOf("markDone:1302:2026-11-05"),
    );
    expect(w.state().pending).toEqual([]);
    expect(w.settings().lastFinish).toMatchObject({
      key: "tv:5:S1E2",
      outcome: "done",
    });
  });

  it("a film whose question holds its own finish: exactly one finish", async () => {
    const w = filmWorld({
      state: {
        ...emptyState(),
        pending: [
          {
            kind: "ambiguity",
            side: "naka",
            id: 5,
            candidateIds: [2005, 2006],
            finish: "movie:5",
          },
        ],
      },
    });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    expect(await w.jobs.ficheRate(TAB, rate())).toEqual(RATED);
    expect(markDones(w.sk.calls)).toEqual(["markDone:2005:2026-11-05"]);
    expect(w.settings().finishWindow?.count).toBe(1);
  });
});

describe("fiche-rate: an episode", () => {
  it("of a linked series: rated only, its card's épisode rated; no finish, no slot, no link", async () => {
    const w = filmWorld({ state: linkedTo(13) });
    w.area.data.set("ratings", [episodeCard()]);
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    await w.registry.issue(TAB, 5, [11]);
    expect(await w.jobs.ficheRate(TAB, episodeRate())).toEqual({ ok: true });
    expect(w.writes()).toEqual(["rate:11:8"]);
    expect(w.cards()[0]?.targets[0]).toEqual(target("épisode", 8, 11));
    expect(w.stateSaves()).toBe(0);
    expect(w.state()).toEqual(linkedTo(13));
    expect(w.settings().finishWindow).toBeUndefined();
  });

  it("of an unlinked series: the series' mapping written first, then the episode rated; no settled pair", async () => {
    let atRate: SyncState | undefined;
    const w = filmWorld({
      state: emptyState(),
      sc: {
        rate: async () => {
          atRate = structuredClone(w.state());
        },
      },
    });
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    await w.registry.issue(TAB, 5, [11]);
    expect(await w.jobs.ficheRate(TAB, episodeRate())).toEqual({ ok: true });
    expect(atRate?.mapping).toEqual([{ nakaId: 5, scId: 13 }]);
    expect(w.writes()).toEqual(["rate:11:8"]);
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 13 }]);
    expect(w.state().settled).toEqual([]);
    expect(w.settings().finishWindow).toBeUndefined();
  });

  it.each([
    ["the content mapped to another product", linkedTo(14)],
    [
      "the series mapped to another content",
      { ...emptyState(), mapping: [{ nakaId: 9, scId: 13 }] },
    ],
    [
      "the series held by a settled pair",
      { ...emptyState(), settled: [{ nakaId: 9, scId: 13 }] },
    ],
    [
      "the content held by a settled pair",
      { ...emptyState(), settled: [{ nakaId: 5, scId: 14 }] },
    ],
  ])("%s: refused, zero requests, nothing saved", async (_n, state) => {
    const w = filmWorld({ state });
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    await w.registry.issue(TAB, 5, [11]);
    await expect(w.jobs.ficheRate(TAB, episodeRate())).rejects.toThrow();
    expect(w.network()).toEqual([]);
    expect(w.state()).toEqual(state);
  });

  it("no card: rated, no card made", async () => {
    const w = filmWorld({ state: linkedTo(13) });
    await w.registry.open(TAB, 5, seriesTitle(13), []);
    await w.registry.issue(TAB, 5, [11]);
    expect(await w.jobs.ficheRate(TAB, episodeRate())).toEqual({ ok: true });
    expect(w.writes()).toEqual(["rate:11:8"]);
    expect(w.cards()).toEqual([]);
  });
});

describe("fiche-rate: only a product issued to that tab for that content", () => {
  it.each([
    ["never issued", async () => undefined],
    [
      "issued to another tab",
      (w: ReturnType<typeof filmWorld>) =>
        w.registry.open(OTHER_TAB, 5, filmTitle(2005), []),
    ],
    [
      "issued for another content",
      (w: ReturnType<typeof filmWorld>) =>
        w.registry.open(TAB, 6, filmTitle(2005), []),
    ],
  ])("%s: rejected, zero SC and Naka requests", async (_n, setUp) => {
    const w = filmWorld();
    await setUp(w);
    await expect(w.jobs.ficheRate(TAB, rate())).rejects.toThrow();
    await expect(
      w.jobs.ficheRate(TAB, seriesRate({ productId: 2005 })),
    ).rejects.toThrow();
    expect(w.network()).toEqual([]);
    expect(w.state()).toEqual(linkedTo(2005));
  });

  it("an unreadable registry counts as not issued", async () => {
    const w = filmWorld();
    w.registry.issuedAs = async () => {
      throw new Error("session down");
    };
    await expect(w.jobs.ficheRate(TAB, rate())).rejects.toThrow();
    expect(w.network()).toEqual([]);
  });
});

describe("fiche-rate: only a product issued as what the target names", () => {
  type SetUp = (w: ReturnType<typeof filmWorld>) => Promise<void>;
  const titled =
    (title: ReturnType<typeof filmTitle>): SetUp =>
    (w) =>
      w.registry.open(TAB, 5, title, []);
  const offered =
    (id: number): SetUp =>
    (w) =>
      w.registry.open(TAB, 5, undefined, [id]);
  const episodeOf =
    (series: number, id: number): SetUp =>
    async (w) => {
      await w.registry.open(TAB, 5, seriesTitle(series), []);
      await w.registry.issue(TAB, 5, [id]);
    };

  it.each<[string, SetUp, FicheRateMessage]>([
    ["a film target on a candidate", offered(2005), rate()],
    ["a film target on a series' title", titled(seriesTitle(2005)), rate()],
    ["a film target on an episode", episodeOf(13, 2005), rate()],
    ["a série target on a film's title", titled(filmTitle(13)), seriesRate()],
    ["a série target on a candidate", offered(13), seriesRate()],
    ["a série target on an episode", episodeOf(12, 13), seriesRate()],
    [
      "an épisode target on the title's product",
      episodeOf(11, 11),
      episodeRate(),
    ],
    ["an épisode target on a candidate", offered(11), episodeRate()],
    [
      "an épisode target on a film's title",
      titled(filmTitle(11)),
      episodeRate(),
    ],
    [
      "an épisode target issued under a film's title",
      async (w) => {
        await w.registry.open(TAB, 5, filmTitle(2005), []);
        await w.registry.issue(TAB, 5, [11]);
      },
      episodeRate(),
    ],
    [
      "an épisode target issued under no title",
      async (w) => {
        await offered(2005)(w);
        await w.registry.issue(TAB, 5, [11]);
      },
      episodeRate(),
    ],
  ])("%s: refused, zero requests", async (_n, setUp, msg) => {
    const w = filmWorld();
    await setUp(w);
    await expect(w.jobs.ficheRate(TAB, msg)).rejects.toThrow();
    expect(w.network()).toEqual([]);
    expect(w.state()).toEqual(linkedTo(2005));
  });
});

describe("fiche-rate: the route", () => {
  const PAGE = "https://naka.cx/content/movie/9005";
  const sender = {
    id: "ext",
    url: PAGE,
    frameId: 0,
    tab: { id: TAB, url: PAGE },
  };

  it("a Naka tab's fiche-rate is queued and answered with the job's answer", async () => {
    const w = filmWorld({ settings: SIMULATION });
    await w.registry.open(TAB, 5, filmTitle(2005), []);
    const router = createRouter({
      extensionId: "ext",
      queue: createJobQueue(),
      jobs: w.jobs,
      timer: { set: () => 0, clear: () => undefined },
      now: () => NOW,
    });
    const answer = new Promise((resolve) => {
      expect(router.handle(rate(), sender, resolve)).toBe(true);
    });
    expect(await answer).toEqual(RATED);
  });

  it("a product not issued: answered undefined", async () => {
    const w = filmWorld();
    const router = createRouter({
      extensionId: "ext",
      queue: createJobQueue(),
      jobs: w.jobs,
      timer: { set: () => 0, clear: () => undefined },
      now: () => NOW,
    });
    const answer = new Promise((resolve) => {
      router.handle(rate(), sender, resolve);
    });
    expect(await answer).toBeUndefined();
  });
});

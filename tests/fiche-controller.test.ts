import { describe, expect, it } from "vitest";
import { createFicheController } from "../src/content/fiche-controller";
import {
  FILM_PATH,
  fakePorts,
  ficheEvent,
  linked,
  minedIds,
  SERIES_PATH,
  seasonEvent,
  seasonOf,
  seriesEvent,
  settle,
} from "./fiche-controller-fakes";

function film() {
  const fake = fakePorts();
  const controller = createFicheController(fake.ports);
  controller.path(FILM_PATH);
  return { ...fake, controller };
}

async function filmShown(mine: number | null = null) {
  const t = film();
  t.controller.event(ficheEvent());
  t.ofType("fiche-info")[0]?.answer(linked(55, mine));
  await settle();
  return t;
}

async function series(
  shown: number | "no dropdown" = 1,
  over: Parameters<typeof seriesEvent>[0] = {},
) {
  const fake = fakePorts();
  fake.page.shown = shown === "no dropdown" ? undefined : shown;
  const controller = createFicheController(fake.ports);
  controller.path(SERIES_PATH);
  controller.event(seriesEvent(over));
  fake.ofType("fiche-info")[0]?.answer(linked(66));
  await settle();
  return { ...fake, controller };
}

/** A series whose shown season answered these episodes. */
async function seasonShown(season: number, ...numbers: number[]) {
  const t = await series(season);
  t.controller.event(seasonEvent(season));
  t.ofType("fiche-season")[0]?.answer(seasonOf(...numbers));
  await settle();
  return t;
}

const mineIds = (t: ReturnType<typeof fakePorts>) =>
  t.ofType("fiche-mine").map((call) => call.msg);

describe("the title page it follows", () => {
  it("asks the info of a fiche event whose tmdbId is the address's", async () => {
    const t = film();
    t.controller.event(ficheEvent());
    expect(t.ofType("fiche-info").map((call) => call.msg)).toEqual([
      {
        type: "fiche-info",
        contentId: 5,
        tmdbId: 9005,
        mediaType: "movie",
        title: "Solaris",
      },
    ]);
    t.ofType("fiche-info")[0]?.answer(linked(55));
    await settle();
    expect(t.last()?.info).toEqual(linked(55));
  });

  it("ignores a fiche event for another tmdbId", () => {
    const t = film();
    t.controller.event(ficheEvent({ tmdbId: 9999 }));
    expect(t.calls).toEqual([]);
  });

  it("ignores a fiche event of the other media type", () => {
    const t = film();
    t.controller.event(ficheEvent({ mediaType: "tv" }));
    expect(t.calls).toEqual([]);
  });

  it("ignores a fiche event off a title page", () => {
    const t = fakePorts();
    const controller = createFicheController(t.ports);
    controller.path("/player");
    controller.event(ficheEvent());
    controller.path("/content/movie/abc");
    controller.event(ficheEvent());
    expect(t.calls).toEqual([]);
  });

  it("asks the info once per page, whatever the page fetches again", () => {
    const t = film();
    t.controller.event(ficheEvent());
    t.controller.event(ficheEvent());
    t.controller.event(ficheEvent({ contentId: 8 }));
    expect(t.ofType("fiche-info")).toHaveLength(1);
  });

  it("drops an info answered after the page was left", async () => {
    const t = film();
    t.controller.event(ficheEvent());
    t.controller.path("/");
    t.ofType("fiche-info")[0]?.answer(linked(55));
    await settle();
    expect(t.last()).toBeUndefined();
  });

  it("shows a failed info as a failure", async () => {
    const t = film();
    t.controller.event(ficheEvent());
    t.ofType("fiche-info")[0]?.answer(undefined);
    await settle();
    expect(t.last()?.outcome).toEqual({ kind: "failed" });
  });
});

describe("the season it reads", () => {
  it("reads only the season the dropdown shows, among the page's prefetches", async () => {
    const t = await series(2);
    for (const season of [1, 2, 3, 4]) t.controller.event(seasonEvent(season));
    expect(t.ofType("fiche-season").map((call) => call.msg)).toEqual([
      { type: "fiche-season", contentId: 6, season: 2 },
    ]);
  });

  it("ignores a season event of another content", async () => {
    const t = await series(1);
    t.controller.event(seasonEvent(1, 99));
    expect(t.ofType("fiche-season")).toEqual([]);
  });

  it("reads a season seen before the info once the info is answered", async () => {
    const fake = fakePorts();
    fake.page.shown = 1;
    const controller = createFicheController(fake.ports);
    controller.path(SERIES_PATH);
    controller.event(seriesEvent());
    controller.event(seasonEvent(1));
    expect(fake.ofType("fiche-season")).toEqual([]);
    fake.ofType("fiche-info")[0]?.answer(linked(66));
    await settle();
    expect(fake.ofType("fiche-season")).toHaveLength(1);
  });

  it("reads no season of a title without a product", async () => {
    const fake = fakePorts();
    fake.page.shown = 1;
    const controller = createFicheController(fake.ports);
    controller.path(SERIES_PATH);
    controller.event(seriesEvent());
    controller.event(seasonEvent(1));
    fake.ofType("fiche-info")[0]?.answer({ state: "notfound" });
    await settle();
    expect(fake.ofType("fiche-season")).toEqual([]);
  });

  it("reads a season the dropdown names later, at the next poll", async () => {
    const t = await series(1);
    t.controller.event(seasonEvent(1));
    t.controller.event(seasonEvent(2));
    t.page.shown = 2;
    t.controller.path(SERIES_PATH);
    expect(t.ofType("fiche-season").map((call) => call.msg)).toEqual([
      { type: "fiche-season", contentId: 6, season: 1 },
      { type: "fiche-season", contentId: 6, season: 2 },
    ]);
  });

  it("shows the averages as soon as the season answers", async () => {
    const t = await seasonShown(1, 1, 2);
    expect(t.last()?.season).toBe(1);
    expect([...(t.last()?.episodes ?? new Map())]).toEqual([
      [1, { productId: 101, average: 7 }],
      [2, { productId: 102, average: 7 }],
    ]);
  });

  it("drops a season answered after another season was opened", async () => {
    const t = await series(1);
    t.controller.event(seasonEvent(1));
    t.page.shown = 2;
    t.controller.event(seasonEvent(2));
    t.ofType("fiche-season")[0]?.answer(seasonOf(1, 2));
    await settle();
    expect(t.last()?.episodes.size).toBe(0);
    expect(t.ofType("fiche-mine")).toEqual([]);
  });

  it("keeps reading the shown season when an older one answers late", async () => {
    const t = await series(1);
    t.controller.event(seasonEvent(1));
    t.page.shown = 2;
    t.controller.event(seasonEvent(2));
    t.ofType("fiche-season")[1]?.answer({
      episodes: [{ episode: 1, productId: 201, average: 8 }],
    });
    await settle();
    t.ofType("fiche-season")[0]?.answer(seasonOf(1, 2));
    await settle();
    t.ofType("fiche-mine")[0]?.answer({ mine: 5 });
    await settle();
    expect(minedIds(t.calls)).toEqual([201]);
    expect(t.last()?.episodes.get(1)).toEqual({
      productId: 201,
      average: 8,
      mine: 5,
    });
  });
});

describe("the owner's own episode ratings", () => {
  it("reads them strictly one after another", async () => {
    const t = await seasonShown(1, 1, 2, 3);
    expect(mineIds(t)).toEqual([
      { type: "fiche-mine", contentId: 6, productId: 101 },
    ]);
    t.ofType("fiche-mine")[0]?.answer({ mine: 8 });
    await settle();
    expect(t.last()?.episodes.get(1)?.mine).toBe(8);
    expect(minedIds(t.calls)).toEqual([101, 102]);
  });

  it("reads the visible episodes first", async () => {
    const t = await series(1);
    t.page.visible = [3, 4];
    t.controller.event(seasonEvent(1));
    t.ofType("fiche-season")[0]?.answer(seasonOf(1, 2, 3, 4));
    await settle();
    for (let i = 0; i < 4; i++) {
      t.ofType("fiche-mine")[i]?.answer({ mine: null });
      await settle();
    }
    expect(minedIds(t.calls)).toEqual([103, 104, 101, 102]);
  });

  it("stops season 1's reads when season 2 opens, and shows none of its values", async () => {
    const t = await seasonShown(1, 1, 2, 3);
    t.page.shown = 2;
    t.controller.event(seasonEvent(2));
    t.ofType("fiche-season")[1]?.answer(seasonOf(1, 2));
    await settle();
    expect(t.ofType("fiche-mine")).toHaveLength(1);
    t.ofType("fiche-mine")[0]?.answer({ mine: 9 });
    await settle();
    expect(t.last()?.season).toBe(2);
    expect(t.last()?.episodes.get(1)).toEqual({ productId: 101, average: 7 });
    expect(minedIds(t.calls)).toEqual([101, 101]);
    expect(t.views.some((view) => view?.episodes.get(1)?.mine === 9)).toBe(
      false,
    );
  });

  it("cancels the reads when the page is left", async () => {
    const t = await seasonShown(1, 1, 2);
    t.controller.path("/");
    expect(t.last()).toBeUndefined();
    t.ofType("fiche-mine")[0]?.answer({ mine: 9 });
    await settle();
    expect(t.ofType("fiche-mine")).toHaveLength(1);
    expect(t.last()).toBeUndefined();
  });

  it("keeps a read season for the visit: back on it, no new season read", async () => {
    const t = await seasonShown(1, 1);
    t.ofType("fiche-mine")[0]?.answer({ mine: 6 });
    await settle();
    t.page.shown = 2;
    t.controller.event(seasonEvent(2));
    t.ofType("fiche-season")[1]?.answer(seasonOf(1));
    await settle();
    t.page.shown = 1;
    t.controller.path(SERIES_PATH);
    expect(t.ofType("fiche-season")).toHaveLength(2);
    expect(t.last()?.episodes.get(1)?.mine).toBe(6);
  });
});

describe("the ratings the owner sends", () => {
  it("rates a film and shows the new rating", async () => {
    const t = await filmShown();
    t.controller.rateTitle(8);
    expect(t.last()?.pending).toBe("rating");
    expect(t.ofType("fiche-rate").map((call) => call.msg)).toEqual([
      {
        type: "fiche-rate",
        contentId: 5,
        target: "film",
        productId: 55,
        rating: 8,
      },
    ]);
    t.ofType("fiche-rate")[0]?.answer({ ok: true });
    await settle();
    expect(t.last()?.pending).toBeUndefined();
    expect(t.last()?.info?.product?.mine).toBe(8);
  });

  it("sends nothing more while a rating is on its way", async () => {
    const t = await filmShown();
    t.controller.rateTitle(8);
    t.controller.rateTitle(9);
    expect(t.ofType("fiche-rate")).toHaveLength(1);
  });

  it("asks a confirmation for a series, and Annuler sends nothing", async () => {
    const t = await series(1);
    t.controller.rateTitle(7);
    expect(t.last()?.pending).toBe("confirm-series");
    t.controller.cancelSeries();
    expect(t.last()?.pending).toBeUndefined();
    expect(t.ofType("fiche-rate")).toEqual([]);
  });

  it("rates the series on Envoyer", async () => {
    const t = await series(1);
    t.controller.rateTitle(7);
    t.controller.confirmSeries();
    expect(t.ofType("fiche-rate").map((call) => call.msg)).toEqual([
      {
        type: "fiche-rate",
        contentId: 6,
        target: "série",
        productId: 66,
        rating: 7,
      },
    ]);
  });

  it("rates an episode of the shown season", async () => {
    const t = await seasonShown(2, 3);
    t.controller.rateEpisode(3, 9);
    expect(t.ofType("fiche-rate").map((call) => call.msg)).toEqual([
      {
        type: "fiche-rate",
        contentId: 6,
        target: "épisode",
        productId: 103,
        rating: 9,
        season: 2,
        episode: 3,
      },
    ]);
    t.ofType("fiche-rate")[0]?.answer({ ok: true });
    await settle();
    expect(t.last()?.episodes.get(3)?.mine).toBe(9);
  });

  it("rates no episode the season did not answer", async () => {
    const t = await seasonShown(2, 3);
    t.controller.rateEpisode(4, 9);
    expect(t.ofType("fiche-rate")).toEqual([]);
  });

  it("shows a refused write as a failure", async () => {
    const t = await filmShown();
    t.controller.rateTitle(8);
    t.ofType("fiche-rate")[0]?.answer(undefined);
    await settle();
    expect(t.last()?.outcome).toEqual({ kind: "failed" });
    expect(t.last()?.info?.product?.mine).toBeNull();
  });

  it("shows a rating that went out before an error as sent, without reading it again", async () => {
    const t = await filmShown();
    t.controller.rateTitle(8);
    t.ofType("fiche-rate")[0]?.answer({ sent: true, error: "naka-session" });
    await settle();
    expect(t.ofType("fiche-mine")).toEqual([]);
    expect(t.last()?.outcome).toEqual({
      kind: "sent-with-error",
      error: "naka-session",
    });
    expect(t.last()?.info?.product?.mine).toBe(8);
    expect(t.last()?.pending).toBeUndefined();
  });

  it("shows a rating the worker did not send with its error", async () => {
    const t = await filmShown();
    t.controller.rateTitle(8);
    t.ofType("fiche-rate")[0]?.answer({ error: "finish-limit" });
    await settle();
    expect(t.ofType("fiche-mine")).toEqual([]);
    expect(t.last()?.outcome).toEqual({
      kind: "not-sent",
      error: "finish-limit",
    });
    expect(t.last()?.info?.product?.mine).toBeNull();
    expect(t.last()?.pending).toBeUndefined();
  });
});

describe("a link chosen among the candidates", () => {
  const choose = {
    state: "choose" as const,
    candidates: [{ id: 77, title: "Solaris", type: "film" as const }],
  };

  async function choosing() {
    const t = film();
    t.controller.event(ficheEvent());
    t.ofType("fiche-info")[0]?.answer(choose);
    await settle();
    return t;
  }

  it("links a candidate, then asks the info again", async () => {
    const t = await choosing();
    t.controller.link(77);
    expect(t.ofType("fiche-link").map((call) => call.msg)).toEqual([
      { type: "fiche-link", contentId: 5, productId: 77 },
    ]);
    t.ofType("fiche-link")[0]?.answer({ ok: true });
    await settle();
    expect(t.ofType("fiche-info")).toHaveLength(2);
    t.ofType("fiche-info")[1]?.answer(linked(77));
    await settle();
    expect(t.last()?.info).toEqual(linked(77));
  });

  it("links nothing the worker did not offer", async () => {
    const t = await choosing();
    t.controller.link(78);
    expect(t.ofType("fiche-link")).toEqual([]);
  });

  it("shows a failed link as a failure", async () => {
    const t = await choosing();
    t.controller.link(77);
    t.ofType("fiche-link")[0]?.answer(undefined);
    await settle();
    expect(t.last()?.outcome).toEqual({ kind: "failed" });
    expect(t.ofType("fiche-info")).toHaveLength(1);
  });
});

describe("the events sent as the page opens", () => {
  it("follows a fiche event sent right after the address changed", () => {
    const t = fakePorts();
    const controller = createFicheController(t.ports);
    controller.path("/");
    controller.path(SERIES_PATH);
    controller.event(seriesEvent());
    expect(t.ofType("fiche-info")).toHaveLength(1);
  });
});

describe("a series page with no season dropdown", () => {
  const ONE = { numberOfSeasons: 1 };
  const seasonsAsked = (t: ReturnType<typeof fakePorts>) =>
    t.ofType("fiche-season").map((call) => call.msg);

  it("opens the lone season when Naka says the series has one and the grid is there", async () => {
    const t = await series("no dropdown", ONE);
    t.controller.event(seasonEvent(1));
    expect(seasonsAsked(t)).toEqual([
      { type: "fiche-season", contentId: 6, season: 1 },
    ]);
  });

  it("opens none when Naka gives no season count", async () => {
    const t = await series("no dropdown");
    t.controller.event(seasonEvent(1));
    expect(seasonsAsked(t)).toEqual([]);
  });

  it("opens none from events one by one after the info, numberOfSeasons 2", async () => {
    const t = await series("no dropdown", { numberOfSeasons: 2 });
    t.controller.event(seasonEvent(2));
    t.controller.path(SERIES_PATH);
    t.controller.event(seasonEvent(1));
    t.controller.path(SERIES_PATH);
    expect(seasonsAsked(t)).toEqual([]);
  });

  it("opens none when two seasons were seen before the info", async () => {
    const fake = fakePorts();
    const controller = createFicheController(fake.ports);
    controller.path(SERIES_PATH);
    controller.event(seriesEvent({ numberOfSeasons: 2 }));
    controller.event(seasonEvent(1));
    controller.event(seasonEvent(2));
    fake.ofType("fiche-info")[0]?.answer(linked(66));
    await settle();
    expect(seasonsAsked(fake)).toEqual([]);
  });

  it("keeps the lone season it opened when the page fetches another", async () => {
    const t = await series("no dropdown", ONE);
    t.controller.event(seasonEvent(2));
    t.controller.event(seasonEvent(1));
    t.controller.path(SERIES_PATH);
    expect(seasonsAsked(t)).toEqual([
      { type: "fiche-season", contentId: 6, season: 2 },
    ]);
  });

  it("opens none without the episode grid", async () => {
    const t = await series("no dropdown", ONE);
    t.page.grid = false;
    t.controller.event(seasonEvent(1));
    expect(seasonsAsked(t)).toEqual([]);
  });
});

describe("a season read that fails", () => {
  async function failedSeason1() {
    const t = await series(1);
    t.controller.event(seasonEvent(1));
    t.ofType("fiche-season")[0]?.answer(undefined);
    await settle();
    return t;
  }

  it("shows the failure apart from the outcome, and retries once on a new event for that season", async () => {
    const t = await failedSeason1();
    expect(t.last()?.seasonFailed).toBe(true);
    expect(t.last()?.outcome).toBeUndefined();
    t.controller.path(SERIES_PATH);
    expect(t.ofType("fiche-season")).toHaveLength(1);
    t.controller.event(seasonEvent(1));
    expect(t.ofType("fiche-season")).toHaveLength(2);
    expect(t.last()?.seasonFailed).toBeUndefined();
    t.ofType("fiche-season")[1]?.answer(undefined);
    await settle();
    t.controller.event(seasonEvent(1));
    t.controller.path(SERIES_PATH);
    expect(t.ofType("fiche-season")).toHaveLength(2);
    expect(t.last()?.seasonFailed).toBe(true);
  });

  it("retries on no event of another content", async () => {
    const t = await failedSeason1();
    t.controller.event(seasonEvent(1, 99));
    expect(t.ofType("fiche-season")).toHaveLength(1);
    t.controller.event(seasonEvent(1));
    expect(t.ofType("fiche-season")).toHaveLength(2);
  });

  it("shows no failure once another season is read", async () => {
    const t = await failedSeason1();
    t.page.shown = 2;
    t.controller.event(seasonEvent(2));
    expect(t.last()?.seasonFailed).toBeUndefined();
    t.ofType("fiche-season")[1]?.answer(seasonOf(1));
    await settle();
    expect(t.last()?.seasonFailed).toBeUndefined();
    expect(t.last()?.outcome).toBeUndefined();
  });

  it("keeps a write's outcome through a season failure and its retry", async () => {
    const t = await series(1);
    t.controller.rateTitle(7);
    t.controller.confirmSeries();
    t.ofType("fiche-rate")[0]?.answer({ error: "sc-session" });
    await settle();
    const refused = { kind: "not-sent", error: "sc-session" };
    expect(t.last()?.outcome).toEqual(refused);
    t.controller.event(seasonEvent(1));
    t.ofType("fiche-season")[0]?.answer(undefined);
    await settle();
    expect(t.last()?.outcome).toEqual(refused);
    t.controller.event(seasonEvent(1));
    expect(t.last()?.outcome).toEqual(refused);
  });
});

describe("a flood of season events", () => {
  it("still reads the shown season after a flood for other contents", async () => {
    const t = await series(1);
    for (let id = 1000; id < 3000; id++) t.controller.event(seasonEvent(1, id));
    t.controller.event(seasonEvent(1));
    expect(t.ofType("fiche-season")).toHaveLength(1);
  });

  it("still reads the shown season after a flood sent before the fiche event", async () => {
    const fake = fakePorts();
    fake.page.shown = 1;
    const controller = createFicheController(fake.ports);
    controller.path(SERIES_PATH);
    for (let id = 1000; id < 3000; id++) controller.event(seasonEvent(1, id));
    controller.event(seasonEvent(1));
    controller.event(seriesEvent());
    fake.ofType("fiche-info")[0]?.answer(linked(66));
    await settle();
    expect(fake.ofType("fiche-season").map((call) => call.msg)).toEqual([
      { type: "fiche-season", contentId: 6, season: 1 },
    ]);
  });
});

describe("leaving the page with a write on its way", () => {
  it("shows nothing of a rating answered after the page was left", async () => {
    const t = await filmShown();
    t.controller.rateTitle(8);
    t.controller.path("/");
    const shown = t.views.length;
    t.ofType("fiche-rate")[0]?.answer({ ok: true });
    await settle();
    expect(t.views).toHaveLength(shown);
    expect(t.last()).toBeUndefined();
  });

  it("loses a series confirmation on navigation", async () => {
    const t = await series(1);
    t.controller.rateTitle(7);
    t.controller.path("/");
    t.controller.path(SERIES_PATH);
    t.controller.confirmSeries();
    expect(t.ofType("fiche-rate")).toEqual([]);
    expect(t.last()?.pending).toBeUndefined();
  });
});

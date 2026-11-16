import { describe, expect, it, vi } from "vitest";
import { createFicheWorkerPort } from "../src/content/fiche-worker-port";

const ok = (answer: unknown) => vi.fn(() => Promise.resolve(answer));
const INFO = {
  type: "fiche-info",
  contentId: 5,
  tmdbId: 77,
  mediaType: "tv",
  title: "Dark",
} as const;

describe("createFicheWorkerPort", () => {
  it("sends fiche-info as given and returns the checked info", async () => {
    const answer = {
      state: "linked",
      product: {
        id: 9,
        average: 6.9,
        mine: null,
        label: { title: "Dark" },
        canUndo: false,
        canRemove: false,
        protected: false,
      },
    };
    const send = ok(answer);
    expect(await createFicheWorkerPort(send).info(INFO)).toEqual(answer);
    expect(send).toHaveBeenCalledWith(INFO);
  });

  it("an info answer with an unknown key is undefined", async () => {
    const send = ok({ state: "linked", token: "x" });
    expect(await createFicheWorkerPort(send).info(INFO)).toBeUndefined();
  });

  it("a rejected or throwing send is undefined", async () => {
    const rejected = vi.fn(() => Promise.reject(new Error("gone")));
    const thrown = vi.fn(() => {
      throw new Error("context invalidated");
    });
    expect(await createFicheWorkerPort(rejected).info(INFO)).toBeUndefined();
    expect(await createFicheWorkerPort(thrown).info(INFO)).toBeUndefined();
  });

  it("checks the season, mine, rate and link answers", async () => {
    const season = { type: "fiche-season", contentId: 5, season: 1 } as const;
    const episodes = [{ episode: 1, productId: 3, average: 7.4 }];
    expect(
      await createFicheWorkerPort(ok({ episodes })).season(season),
    ).toEqual({
      episodes,
    });
    const mine = { type: "fiche-mine", contentId: 5, productId: 3 } as const;
    expect(
      await createFicheWorkerPort(ok({ mine: 8, average: 7.1 })).mine(mine),
    ).toEqual({
      mine: 8,
      average: 7.1,
    });
    expect(
      await createFicheWorkerPort(ok({ mine: 11, average: null })).mine(mine),
    ).toBeUndefined();
    const rate = {
      type: "fiche-rate",
      contentId: 5,
      target: "film",
      productId: 3,
      rating: 7,
    } as const;
    expect(await createFicheWorkerPort(ok({ ok: true })).rate(rate)).toEqual({
      ok: true,
    });
    expect(
      await createFicheWorkerPort(ok({ ok: false })).rate(rate),
    ).toBeUndefined();
    const link = { type: "fiche-link", contentId: 5, productId: 3 } as const;
    expect(await createFicheWorkerPort(ok({ ok: true })).link(link)).toEqual({
      ok: true,
    });
    expect(
      await createFicheWorkerPort(ok(undefined)).link(link),
    ).toBeUndefined();
  });

  it("sends fiche-rate as given and passes a rating sent before an error through", async () => {
    const rate = {
      type: "fiche-rate",
      contentId: 5,
      target: "épisode",
      productId: 3,
      rating: 7,
      season: 1,
      episode: 2,
    } as const;
    const send = ok({ sent: true, step: "local-save", error: "unavailable" });
    expect(await createFicheWorkerPort(send).rate(rate)).toEqual({
      sent: true,
      step: "local-save",
      error: "unavailable",
    });
    expect(send).toHaveBeenCalledWith(rate);
  });

  it("sends fiche-undo as given and returns the checked answer", async () => {
    const undo = {
      type: "fiche-undo",
      contentId: 5,
      productId: 3,
      listByTab: true,
    } as const;
    const send = ok({ ok: true, maListe: "tab" });
    expect(await createFicheWorkerPort(send).undo(undo)).toEqual({
      ok: true,
      maListe: "tab",
    });
    expect(send).toHaveBeenCalledWith(undo);
    expect(
      await createFicheWorkerPort(ok({ ok: true, maListe: "x" })).undo(undo),
    ).toBeUndefined();
  });

  it("sends fiche-search as given and returns the checked results", async () => {
    const search = {
      type: "fiche-search",
      contentId: 5,
      query: "Dark",
    } as const;
    const candidates = [{ id: 4, title: "Dark", year: 2017, type: "serie" }];
    const send = ok({ candidates });
    expect(await createFicheWorkerPort(send).search(search)).toEqual({
      candidates,
    });
    expect(send).toHaveBeenCalledWith(search);
    expect(
      await createFicheWorkerPort(ok({ candidates: "x" })).search(search),
    ).toBeUndefined();
  });
});

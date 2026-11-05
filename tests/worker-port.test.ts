import { describe, expect, it, vi } from "vitest";
import { createWorkerPort } from "../src/content/ui/worker-port";
import type { RatingMessage } from "../src/ext/rating-messages";
import { episodeCard, filmCard } from "./rating-fixtures";

const ok = (answer: unknown) => vi.fn(() => Promise.resolve(answer));
const IDS = { contentId: 5, season: 1, episode: 1 };

describe("askCard", () => {
  it("sends rating-card with the ids and returns a valid answer", async () => {
    const send = ok({ card: episodeCard(), pauseFromPercent: 50, start: 8 });
    const answer = await createWorkerPort(send).askCard(IDS);
    expect(send).toHaveBeenCalledWith({ type: "rating-card", ...IDS });
    expect(answer).toEqual({
      card: episodeCard(),
      pauseFromPercent: 50,
      start: 8,
    });
  });

  it("accepts no card and no start", async () => {
    const answer = await createWorkerPort(
      ok({ card: null, pauseFromPercent: 0 }),
    ).askCard(IDS);
    expect(answer).toEqual({ card: null, pauseFromPercent: 0 });
  });

  it("a rejected send is undefined, a throwing send too", async () => {
    const rejected = vi.fn(() => Promise.reject(new Error("gone")));
    const thrown = vi.fn(() => {
      throw new Error("context invalidated");
    });
    expect(await createWorkerPort(rejected).askCard(IDS)).toBeUndefined();
    expect(await createWorkerPort(thrown).askCard(IDS)).toBeUndefined();
  });

  it("an answer with a card whose given.film is 11 is undefined", async () => {
    const card = filmCard({ given: { film: 11 } });
    expect(
      await createWorkerPort(ok({ card, pauseFromPercent: 0 })).askCard(IDS),
    ).toBeUndefined();
  });

  it("refuses every malformed answer", async () => {
    const bad: unknown[] = [
      undefined,
      null,
      "x",
      {},
      { card: null },
      { card: null, pauseFromPercent: 100 },
      { card: null, pauseFromPercent: -1 },
      { card: null, pauseFromPercent: 1.5 },
      { card: null, pauseFromPercent: "5" },
      { card: null, pauseFromPercent: 0, start: 11 },
      { card: null, pauseFromPercent: 0, start: 0 },
      { card: null, pauseFromPercent: 0, extra: 1 },
      { card: { ...episodeCard(), extra: 1 }, pauseFromPercent: 0 },
    ];
    for (const answer of bad) {
      const got = await createWorkerPort(ok(answer)).askCard(IDS);
      expect(got, JSON.stringify(answer)).toBeUndefined();
    }
  });
});

describe("askCards", () => {
  it("sends rating-cards and returns the valid cards", async () => {
    const send = ok({
      cards: [{ card: filmCard(), start: 4 }, { card: episodeCard() }],
    });
    const answer = await createWorkerPort(send).askCards();
    expect(send).toHaveBeenCalledWith({ type: "rating-cards" });
    expect(answer?.cards).toHaveLength(2);
  });

  it("one invalid card makes the whole answer undefined", async () => {
    const bad = { card: filmCard({ given: { film: 11 } }) };
    expect(
      await createWorkerPort(
        ok({ cards: [{ card: filmCard() }, bad] }),
      ).askCards(),
    ).toBeUndefined();
    expect(
      await createWorkerPort(
        ok({ cards: [{ card: filmCard(), start: 99 }] }),
      ).askCards(),
    ).toBeUndefined();
    expect(await createWorkerPort(ok({})).askCards()).toBeUndefined();
  });

  it("a rejected send is undefined", async () => {
    const send = vi.fn(() => Promise.reject(new Error("gone")));
    expect(await createWorkerPort(send).askCards()).toBeUndefined();
  });
});

describe("rate and dismiss", () => {
  it("send one message each, with the ids, the label and the rating", async () => {
    const send = ok(undefined);
    const port = createWorkerPort(send);
    await port.rate(IDS, "saison", 8);
    await port.dismiss(IDS, "série");
    expect(send).toHaveBeenNthCalledWith(1, {
      type: "rate",
      ...IDS,
      label: "saison",
      rating: 8,
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      type: "dismiss-rating",
      ...IDS,
      label: "série",
    });
  });

  it("say true when the send resolved, whatever the answer", async () => {
    const port = createWorkerPort(ok(undefined));
    await expect(port.rate(IDS, "film", 5)).resolves.toBe(true);
    await expect(port.dismiss(IDS, "film")).resolves.toBe(true);
  });

  it("say false, never throw, when the send rejects or throws", async () => {
    const rejecting = createWorkerPort(
      vi.fn(() => Promise.reject(new Error("gone"))),
    );
    await expect(rejecting.rate(IDS, "film", 5)).resolves.toBe(false);
    await expect(rejecting.dismiss(IDS, "film")).resolves.toBe(false);
    const throwing = createWorkerPort(() => {
      throw new Error("Extension context invalidated.");
    });
    await expect(throwing.rate(IDS, "film", 5)).resolves.toBe(false);
    await expect(throwing.dismiss(IDS, "film")).resolves.toBe(false);
  });
});

describe("answer bounds and film ids", () => {
  it("accepts pauseFromPercent 0 and 99, start 1 and 10", async () => {
    for (const [pauseFromPercent, start] of [
      [0, 1],
      [99, 10],
    ]) {
      const answer = await createWorkerPort(
        ok({ card: null, pauseFromPercent, start }),
      ).askCard(IDS);
      expect(answer, `${pauseFromPercent}/${start}`).toEqual({
        card: null,
        pauseFromPercent,
        start,
      });
    }
  });

  it("a film sends no season and no episode key at all", async () => {
    const send = vi.fn((_msg: RatingMessage) => Promise.resolve(undefined));
    const port = createWorkerPort(send);
    await port.askCard({ contentId: 9 });
    await port.rate({ contentId: 9 }, "film", 7);
    await port.dismiss({ contentId: 9 }, "film");
    expect(send).toHaveBeenCalledTimes(3);
    for (const [msg] of send.mock.calls) {
      const keys = Object.keys(msg);
      expect(keys).not.toContain("season");
      expect(keys).not.toContain("episode");
    }
  });
});

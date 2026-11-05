import { describe, expect, it, vi } from "vitest";
import { createWorkerPort } from "../src/content/ui/worker-port";
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
    const send = vi.fn((_msg: object) => Promise.resolve(undefined));
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

describe("the sending labels of an answer", () => {
  const sendingCard = episodeCard();
  const withSending = (sending: unknown) => ({
    card: sendingCard,
    pauseFromPercent: 0,
    sending,
  });

  it("keeps the labels of the card's targets, in a card answer and in a cards answer", async () => {
    const one = await createWorkerPort(
      ok(withSending(["épisode", "série"])),
    ).askCard(IDS);
    expect(one?.sending).toEqual(["épisode", "série"]);
    const many = await createWorkerPort(
      ok({ cards: [{ card: sendingCard, sending: ["saison"] }] }),
    ).askCards();
    expect(many?.cards[0]?.sending).toEqual(["saison"]);
  });

  it("an empty list is no sending", async () => {
    const got = await createWorkerPort(ok(withSending([]))).askCard(IDS);
    expect(got?.sending).toBeUndefined();
  });

  it("refuses an unknown label, a label the card has no target for, a duplicate, a non-list", async () => {
    const bad = [["film"], ["épisode", "épisode"], ["season"], "épisode", [3]];
    for (const sending of bad) {
      const got = await createWorkerPort(ok(withSending(sending))).askCard(IDS);
      expect(got, JSON.stringify(sending)).toBeUndefined();
    }
    const cards = await createWorkerPort(
      ok({ cards: [{ card: sendingCard, sending: ["film"] }] }),
    ).askCards();
    expect(cards).toBeUndefined();
  });

  it("refuses sending on an answer without a card, for a label the ids cannot have", async () => {
    const got = await createWorkerPort(
      ok({ card: null, pauseFromPercent: 0, sending: ["film"] }),
    ).askCard(IDS);
    expect(got).toBeUndefined();
  });
});

describe("an answer without a card", () => {
  const FILM = { contentId: 9 };
  const cardless = (extra: object) => ({
    card: null,
    pauseFromPercent: 0,
    ...extra,
  });
  const asked = (answer: unknown, ids: typeof FILM | typeof IDS) =>
    createWorkerPort(ok(answer)).askCard(ids);

  it("keeps sending the film of film ids, or the épisode of episode ids", async () => {
    const film = await asked(cardless({ sending: ["film"] }), FILM);
    expect(film).toEqual(cardless({ sending: ["film"] }));
    const episode = await asked(cardless({ sending: ["épisode"] }), IDS);
    expect(episode).toEqual(cardless({ sending: ["épisode"] }));
  });

  it("refuses any other sending label, or two", async () => {
    const bad: [unknown, typeof FILM | typeof IDS][] = [
      [["saison"], IDS],
      [["série"], IDS],
      [["film"], IDS],
      [["épisode"], FILM],
      [["saison"], FILM],
      [["film", "film"], FILM],
      [["épisode", "saison"], IDS],
    ];
    for (const [sending, ids] of bad) {
      const got = await asked(cardless({ sending }), ids);
      expect(got, `${JSON.stringify(sending)} for ${JSON.stringify(ids)}`).toBe(
        undefined,
      );
    }
  });

  it("keeps the last finish of the title: a failure with its code, or another outcome alone", async () => {
    const kept = [
      { outcome: "failed", error: "sc-session" },
      { outcome: "failed", error: "finish-limit" },
      { outcome: "needs-choice" },
      { outcome: "not-found" },
      { outcome: "done" },
      { outcome: "ignored" },
    ];
    for (const lastFinish of kept) {
      const got = await asked(cardless({ lastFinish }), FILM);
      expect(got, JSON.stringify(lastFinish)).toEqual(cardless({ lastFinish }));
    }
    const withCard = await asked(
      {
        card: filmCard(),
        pauseFromPercent: 0,
        lastFinish: { outcome: "done" },
      },
      FILM,
    );
    expect(withCard?.lastFinish).toEqual({ outcome: "done" });
  });

  it("refuses a last finish that is malformed", async () => {
    const bad: unknown[] = [
      null,
      "failed",
      {},
      { outcome: "failed" },
      { outcome: "failed", error: "boom" },
      { outcome: "done", error: "sc-session" },
      { outcome: "needs-choice", error: "sc-session" },
      { outcome: "lost" },
      { outcome: "failed", error: "sc-session", at: 5 },
      { outcome: "done", key: "movie:9" },
    ];
    for (const lastFinish of bad) {
      const got = await asked(cardless({ lastFinish }), FILM);
      expect(got, JSON.stringify(lastFinish)).toBeUndefined();
    }
  });
});

describe("askQuestions and askRemovalOffer", () => {
  const OFFER = {
    kind: "removal",
    key: "removal:sc:1:101",
    removeFrom: "sc",
    pair: { nakaId: 1, scId: 101 },
    title: "",
  };

  it("send their message and return a valid answer", async () => {
    const open = ok({ questions: [OFFER], answering: ["removal:sc:1:101"] });
    expect(await createWorkerPort(open).askQuestions()).toEqual({
      questions: [OFFER],
      answering: ["removal:sc:1:101"],
    });
    expect(open).toHaveBeenCalledWith({ type: "open-questions" });
    const removal = ok({ offer: OFFER, answering: true });
    expect(await createWorkerPort(removal).askRemovalOffer(9)).toEqual({
      offer: OFFER,
      answering: true,
    });
    expect(removal).toHaveBeenCalledWith({
      type: "removal-offer",
      contentId: 9,
    });
  });

  it("give undefined for a refused answer or a failed send", async () => {
    const rejected = vi.fn(() => Promise.reject(new Error("gone")));
    expect(await createWorkerPort(rejected).askQuestions()).toBeUndefined();
    expect(await createWorkerPort(rejected).askRemovalOffer(9)).toBeUndefined();
    for (const raw of [undefined, {}, { questions: [], extra: 1 }]) {
      expect(await createWorkerPort(ok(raw)).askQuestions()).toBeUndefined();
    }
    for (const raw of [undefined, {}, { offer: null, extra: 1 }]) {
      expect(
        await createWorkerPort(ok(raw)).askRemovalOffer(9),
      ).toBeUndefined();
    }
  });

  it("askCard reads the question of a title with no card, and only then", async () => {
    const question = {
      kind: "ambiguity",
      key: "ambiguity:naka:5",
      side: "naka",
      id: 5,
      title: "Dune",
      candidates: [{ id: 50, title: "Dune", year: 1984, type: "film" }],
    };
    const lastAnswer = {
      seq: 1,
      at: 2,
      target: "ambiguity:naka:5",
      outcome: "refused",
    };
    const full = {
      card: null,
      pauseFromPercent: 0,
      question,
      questionSending: true,
      lastAnswer,
    };
    expect(await createWorkerPort(ok(full)).askCard(IDS)).toEqual(full);
    const withCard = { ...full, card: episodeCard() };
    expect(await createWorkerPort(ok(withCard)).askCard(IDS)).toBeUndefined();
    for (const patch of [
      { question: { ...question, extra: 1 } },
      { questionSending: false },
      { lastAnswer: { ...lastAnswer, extra: 1 } },
    ]) {
      expect(
        await createWorkerPort(ok({ ...full, ...patch })).askCard(IDS),
      ).toBeUndefined();
    }
  });
});

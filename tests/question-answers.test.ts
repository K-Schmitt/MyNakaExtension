import { describe, expect, it } from "vitest";
import { pageItems } from "../src/sw/page-items";
import {
  answerOpenQuestions,
  answerPageLists,
  answerRemovalOffer,
} from "../src/sw/question-answers";
import { answerCard } from "../src/sw/rating-answers";
import { statusSnapshot } from "../src/sw/status-snapshot";
import { strings } from "./naka-bridge-fakes";
import {
  ambiguity,
  cand,
  mappedAt5,
  removal,
  stateWith,
  storeWith,
} from "./question-fixtures";
import { episodeCard, filmCard } from "./rating-fixtures";

const PAIR = { nakaId: 1, scId: 101 };

describe("answerOpenQuestions", () => {
  it("lists the removals first, then the ambiguities, in stored order", async () => {
    const { store } = await storeWith(
      stateWith({
        pending: [
          ambiguity(5),
          removal("sc", PAIR, { title: "Un film" }),
          ambiguity(6),
        ],
      }),
    );
    const answer = await answerOpenQuestions(store, []);
    expect(answer.questions.map((q) => q.key)).toEqual([
      "removal:sc:1:101",
      "ambiguity:naka:5",
      "ambiguity:naka:6",
    ]);
    expect(answer.questions[0]).toEqual({
      kind: "removal",
      key: "removal:sc:1:101",
      removeFrom: "sc",
      pair: PAIR,
      title: "Un film",
    });
    expect(answer.questions[1]).toEqual({
      kind: "ambiguity",
      key: "ambiguity:naka:5",
      side: "naka",
      id: 5,
      title: "Titre 5",
      candidates: [cand(50), cand(51)],
    });
  });

  it("leaves out a hidden, a legacy and a « none » ambiguity, and a removal already asked", async () => {
    const { store } = await storeWith(
      stateWith({
        pending: [
          ambiguity(5, { asked: true }),
          ambiguity(6, { candidates: undefined }),
          ambiguity(7, { candidateIds: [], candidates: [] }),
          removal("sc", PAIR, { asked: true }),
          ambiguity(8),
        ],
      }),
    );
    const answer = await answerOpenQuestions(store, []);
    expect(answer.questions.map((q) => q.key)).toEqual(["ambiguity:naka:8"]);
  });

  it("gives an empty title to a question stored without one", async () => {
    const { store } = await storeWith(
      stateWith({
        pending: [ambiguity(5, { title: undefined }), removal("sc", PAIR)],
      }),
    );
    const answer = await answerOpenQuestions(store, []);
    expect(answer.questions.map((q) => q.title)).toEqual(["", ""]);
  });

  it("caps 25 open questions at 20", async () => {
    const pending = Array.from({ length: 25 }, (_, i) => ambiguity(i + 1));
    const { store } = await storeWith(stateWith({ pending }));
    expect((await answerOpenQuestions(store, [])).questions).toHaveLength(20);
  });

  it("reports the answering keys and the last answer, only when there are some", async () => {
    const { store } = await storeWith(stateWith({}));
    expect(await answerOpenQuestions(store, [])).toEqual({ questions: [] });
    const lastAnswer = {
      seq: 3,
      at: 9,
      target: "ambiguity:naka:5",
      outcome: "done" as const,
    };
    await store.saveSettings({ mode: "live", lastAnswer });
    expect(await answerOpenQuestions(store, ["ambiguity:naka:5"])).toEqual({
      questions: [],
      answering: ["ambiguity:naka:5"],
      lastAnswer,
    });
  });

  it("rejects when the state cannot be read", async () => {
    const { store, area } = await storeWith(stateWith({}));
    area.data.set("state", { version: 2 });
    await expect(answerOpenQuestions(store, [])).rejects.toThrow();
  });
});

describe("answerPageLists", () => {
  it("shows a legacy question as legacy, and a hidden one with hidden: true", async () => {
    const { store } = await storeWith(
      stateWith({
        pending: [
          ambiguity(5, { candidates: undefined }),
          ambiguity(6, { asked: true }),
          ambiguity(7),
          removal("sc", PAIR, { asked: true }),
        ],
      }),
    );
    const { questions } = await answerPageLists(store, []);
    expect(questions).toEqual([
      { kind: "legacy", key: "ambiguity:naka:5", side: "naka", id: 5 },
      expect.objectContaining({ key: "ambiguity:naka:6", hidden: true }),
      expect.objectContaining({ key: "ambiguity:naka:7", hidden: false }),
      expect.objectContaining({ key: "removal:sc:1:101", hidden: true }),
    ]);
  });

  it("lists a « none » ambiguity in unlinked only, with a link key", async () => {
    const { store } = await storeWith(
      stateWith({
        pending: [ambiguity(5, { candidateIds: [], candidates: [] })],
      }),
    );
    const answer = await answerPageLists(store, []);
    expect(answer.questions).toEqual([]);
    expect(answer.unlinked).toEqual([
      {
        key: "link:naka:5",
        side: "naka",
        id: 5,
        title: "Titre 5",
        reason: "none-chosen",
      },
    ]);
  });

  it("lists an unlinked entry present at the last run, not one gone at run - 1", async () => {
    const { store } = await storeWith(
      stateWith({
        run: 4,
        unlinked: [
          { side: "naka", id: 7, title: "Present", reason: "no-match" },
          { side: "sc", id: 8, title: "Gone", reason: "not-in-catalogue" },
        ],
        presence: {
          naka: [{ id: 7, from: 2, to: 4 }],
          sc: [{ id: 8, from: 1, to: 3 }],
        },
      }),
    );
    expect((await answerPageLists(store, [])).unlinked).toEqual([
      {
        key: "link:naka:7",
        side: "naka",
        id: 7,
        title: "Present",
        reason: "no-match",
      },
    ]);
  });

  it("caps the questions at 50 and the unlinked at 200", async () => {
    const pending = Array.from({ length: 60 }, (_, i) => ambiguity(i + 1));
    const unlinked = Array.from({ length: 250 }, (_, i) => ({
      side: "naka" as const,
      id: i + 1,
      title: "x",
      reason: "no-match" as const,
    }));
    const presence = {
      naka: unlinked.map((u) => ({ id: u.id, from: 1, to: 2 })),
      sc: [],
    };
    const { store } = await storeWith(
      stateWith({ run: 2, pending, unlinked, presence }),
    );
    const answer = await answerPageLists(store, []);
    expect(answer.questions).toHaveLength(50);
    expect(answer.unlinked).toHaveLength(200);
  });

  it("makes the status counts equal the list lengths", async () => {
    const state = stateWith({
      run: 4,
      unlinked: [
        { side: "naka", id: 7, title: "Present", reason: "no-match" },
        { side: "sc", id: 8, title: "Gone", reason: "no-match" },
      ],
      presence: {
        naka: [{ id: 7, from: 2, to: 4 }],
        sc: [{ id: 8, from: 1, to: 3 }],
      },
      pending: [
        ambiguity(5, { candidateIds: [], candidates: [] }),
        ambiguity(6, { candidates: undefined }),
        ambiguity(9),
        removal("sc", PAIR),
      ],
    });
    const { store } = await storeWith(state);
    const lists = await answerPageLists(store, []);
    const { counts } = await statusSnapshot(store);
    expect(counts).toEqual({
      unlinked: lists.unlinked.length,
      openQuestions: lists.questions.filter((q) => q.kind !== "removal").length,
      pendingRemovals: lists.questions.filter((q) => q.kind === "removal")
        .length,
    });
    expect(counts).toEqual({
      unlinked: 2,
      openQuestions: 2,
      pendingRemovals: 1,
    });
    expect(pageItems(state).unlinked).toEqual(lists.unlinked);
  });
});

describe("statusSnapshot: the ratings waiting", () => {
  it("counts the cards whose pending is not empty", async () => {
    const { store } = await storeWith(stateWith({}));
    await store.saveRatings([episodeCard(), filmCard({ pending: [] })]);
    expect((await statusSnapshot(store)).pendingRatings).toBe(1);
  });

  it("is absent when the ratings cannot be read", async () => {
    const { store } = await storeWith(stateWith({}));
    store.loadRatings = async () => {
      throw new Error("broken");
    };
    const snapshot = await statusSnapshot(store);
    expect(snapshot.pendingRatings).toBeUndefined();
    expect(snapshot.counts).toBeDefined();
  });
});

describe("statusSnapshot: the first run", () => {
  it("carries firstRunPending when the settings have it, and only then", async () => {
    const { store } = await storeWith(stateWith({}));
    await store.saveSettings({ mode: "live" });
    expect((await statusSnapshot(store)).firstRunPending).toBeUndefined();
    await store.saveSettings({ mode: "live", firstRunPending: true });
    expect((await statusSnapshot(store)).firstRunPending).toBe(true);
  });
});

describe("answerRemovalOffer", () => {
  const offerOf = async (state = mappedAt5(), answering: string[] = []) => {
    const { store } = await storeWith(state);
    return answerRemovalOffer(store, 1, answering);
  };
  const OFFER = {
    kind: "removal",
    key: "removal:sc:1:101",
    removeFrom: "sc",
    pair: PAIR,
    title: "",
  };

  it("offers a mapped pair present on both sides at the last run", async () => {
    expect(await offerOf()).toEqual({ offer: OFFER });
  });

  it("is NOT offered when Naka is absent at the last run, even if the pair is in the snapshot", async () => {
    const state = mappedAt5({
      presence: { naka: [], sc: [{ id: 101, from: 1, to: 5 }] },
      snapshot: [PAIR],
    });
    expect((await offerOf(state)).offer).toBeNull();
  });

  it("is not offered for a stale snapshot pair: Naka's presence ended at run 6 of 8 (a case a fuzz test found)", async () => {
    const state = mappedAt5({
      run: 8,
      presence: {
        naka: [{ id: 1, from: 1, to: 6 }],
        sc: [{ id: 101, from: 7, to: 8 }],
      },
      snapshot: [PAIR],
    });
    expect((await offerOf(state)).offer).toBeNull();
  });

  it("marks the offer answering when its key is being answered", async () => {
    const answer = await offerOf(mappedAt5(), ["removal:sc:1:101"]);
    expect(answer).toEqual({ offer: OFFER, answering: true });
  });

  it("is not offered for a settled pair", async () => {
    expect((await offerOf(mappedAt5({ settled: [PAIR] }))).offer).toBeNull();
  });

  it("is not offered when SensCritique was absent at the last run", async () => {
    const state = mappedAt5({
      presence: {
        naka: [{ id: 1, from: 1, to: 5 }],
        sc: [{ id: 101, from: 1, to: 4 }],
      },
      snapshot: [PAIR],
    });
    expect((await offerOf(state)).offer).toBeNull();
  });

  it("is not offered at run 0", async () => {
    expect(
      (await offerOf(mappedAt5({ run: 0, presence: { naka: [], sc: [] } })))
        .offer,
    ).toBeNull();
  });

  it("is not offered for a deferred Naka addition: SC present, Naka absent, not in the snapshot", async () => {
    const state = mappedAt5({
      presence: { naka: [], sc: [{ id: 101, from: 1, to: 5 }] },
    });
    expect((await offerOf(state)).offer).toBeNull();
  });

  it("is not offered for a pair that is not mapped, or another content id", async () => {
    const { store } = await storeWith(mappedAt5());
    expect((await answerRemovalOffer(store, 2, [])).offer).toBeNull();
    const unmapped = await storeWith(mappedAt5({ mapping: [] }));
    expect((await answerRemovalOffer(unmapped.store, 1, [])).offer).toBeNull();
  });

  it("is not offered when a removal from Naka of the pair exists", async () => {
    const state = mappedAt5({ pending: [removal("naka", PAIR)] });
    expect((await offerOf(state)).offer).toBeNull();
  });

  it("is offered with the stored title when a removal from SensCritique exists, even if SC left", async () => {
    const state = mappedAt5({
      presence: { naka: [], sc: [] },
      pending: [removal("sc", PAIR, { title: "Dune" })],
    });
    expect((await offerOf(state)).offer).toEqual({ ...OFFER, title: "Dune" });
  });

  it("carries the last answer aimed at the pair's removal", async () => {
    const { store } = await storeWith(mappedAt5());
    const lastAnswer = {
      seq: 1,
      at: 2,
      target: "removal:sc:1:101",
      outcome: "refused" as const,
    };
    await store.saveSettings({ mode: "live", lastAnswer });
    expect((await answerRemovalOffer(store, 1, [])).lastAnswer).toEqual(
      lastAnswer,
    );
    await store.saveSettings({
      mode: "live",
      lastAnswer: { ...lastAnswer, target: "removal:sc:2:102" },
    });
    expect("lastAnswer" in (await answerRemovalOffer(store, 1, []))).toBe(
      false,
    );
  });
});

describe("rating-card with a question", () => {
  const CARD = { type: "rating-card", contentId: 5 } as const;
  const base = { card: null, pauseFromPercent: 0 };

  it("carries the open naka-side question of the title when there is no card", async () => {
    const { store } = await storeWith(
      stateWith({
        pending: [ambiguity(5), ambiguity(6), ambiguity(5, { side: "sc" })],
      }),
    );
    expect(await answerCard(store, CARD)).toEqual({
      ...base,
      question: {
        kind: "ambiguity",
        key: "ambiguity:naka:5",
        side: "naka",
        id: 5,
        title: "Titre 5",
        candidates: [cand(50), cand(51)],
      },
    });
  });

  it("has no question for a legacy, a « none » or an absent one", async () => {
    for (const item of [
      ambiguity(5, { candidates: undefined }),
      ambiguity(5, { candidateIds: [], candidates: [] }),
      ambiguity(6),
    ]) {
      const { store } = await storeWith(stateWith({ pending: [item] }));
      expect(await answerCard(store, CARD)).toEqual(base);
    }
  });

  it("carries the last answer aimed at the title's question only", async () => {
    const { store } = await storeWith(stateWith({}));
    const lastAnswer = {
      seq: 2,
      at: 3,
      target: "ambiguity:naka:5",
      outcome: "mismatch" as const,
    };
    await store.saveSettings({ mode: "live", lastAnswer });
    expect(await answerCard(store, CARD)).toEqual({ ...base, lastAnswer });
    expect(await answerCard(store, { ...CARD, contentId: 6 })).toEqual(base);
  });

  it("leaves the answer unchanged when the state is unreadable", async () => {
    const { store, area } = await storeWith(
      stateWith({ pending: [ambiguity(5)] }),
    );
    await store.saveSettings({ mode: "live", pauseFromPercent: 40 });
    area.data.set("state", { version: 2 });
    expect(await answerCard(store, CARD)).toEqual({
      card: null,
      pauseFromPercent: 40,
    });
  });

  it("adds nothing to a title that has a card", async () => {
    const { store } = await storeWith(stateWith({ pending: [ambiguity(5)] }));
    await store.saveRatings([episodeCard({ key: "movie:5", contentId: 5 })]);
    const answer = await answerCard(store, CARD);
    expect(answer.card).not.toBeNull();
    expect("question" in answer).toBe(false);
  });
});

describe("the three answers hold no token", () => {
  const TOKEN = "SCTOKENMARKER0123456789abcdefXY";
  it("none of them carries a token marker, nor the binding", async () => {
    const state = mappedAt5({
      pending: [ambiguity(5), removal("sc", PAIR, { title: "Dune" })],
    });
    const { store } = await storeWith(state);
    await store.saveSettings({
      mode: "live",
      binding: { scUsername: "owner", nakaAccount: TOKEN },
    });
    const text = strings([
      await answerOpenQuestions(store, []),
      await answerPageLists(store, []),
      await answerRemovalOffer(store, 1, []),
    ]).join(" ");
    expect(text).toContain("Dune");
    expect(text).not.toContain("SCTOKENMARKER");
    expect(text).not.toContain("owner");
  });
});

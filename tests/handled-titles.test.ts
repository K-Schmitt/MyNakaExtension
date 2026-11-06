import { describe, expect, it } from "vitest";
import { handledTitles, waitingTitles } from "../src/core/handled-titles";
import type { RetryFinish } from "../src/core/retry-finishes";
import { emptyState } from "../src/core/state";
import { answerWorld } from "./answer-world";
import { episodeCard, filmCard } from "./rating-fixtures";

const NBSP = "\u00a0";

describe("handledTitles", () => {
  it("a key with a stored title, one with only a card, one with neither: the three labels", () => {
    const state = {
      ...emptyState(),
      handled: ["movie:1", "movie:9", "movie:21391"],
      handledTitles: { "movie:1": "Le titre gardé" },
    };
    const labels = handledTitles(state, [filmCard()]);
    expect(labels).toEqual([
      { key: "movie:21391", label: `Contenu Naka n°${NBSP}21391` },
      { key: "movie:9", label: "Un film" },
      { key: "movie:1", label: "Le titre gardé" },
    ]);
  });

  it("the fallback copy holds a no-break space after n°, and nothing else unusual", () => {
    const [only] = handledTitles({ ...emptyState(), handled: ["movie:7"] }, []);
    expect([...(only?.label ?? "")].map((c) => c.codePointAt(0))).toEqual(
      [..."Contenu Naka n°\u00a07"].map((c) => c.codePointAt(0)),
    );
  });

  it("an episode adds « · saison s, épisode e » to each source, with the middle dot U+00B7", () => {
    const state = {
      ...emptyState(),
      handled: ["tv:5:S1E1", "tv:6:S2E10", "tv:8:S3E4"],
      handledTitles: { "tv:6:S2E10": "Stockée" },
    };
    expect(handledTitles(state, [episodeCard()]).map((t) => t.label)).toEqual([
      `Contenu Naka n°${NBSP}8 · saison 3, épisode 4`,
      "Stockée · saison 2, épisode 10",
      "Une série · saison 1, épisode 1",
    ]);
    expect("Une série · saison 1".codePointAt(10)).toBe(0xb7);
  });

  it("the stored title wins over the card's", () => {
    const state = {
      ...emptyState(),
      handled: ["movie:9"],
      handledTitles: { "movie:9": "Stocké" },
    };
    expect(handledTitles(state, [filmCard()])[0]?.label).toBe("Stocké");
  });

  it("most recent first: the reverse of the handled order, and an empty list gives none", () => {
    const state = {
      ...emptyState(),
      handled: ["movie:1", "movie:2", "movie:3"],
    };
    expect(handledTitles(state, []).map((t) => t.key)).toEqual([
      "movie:3",
      "movie:2",
      "movie:1",
    ]);
    expect(handledTitles(emptyState(), [])).toEqual([]);
  });

  it("a card of another key is not used", () => {
    const state = { ...emptyState(), handled: ["movie:10"] };
    expect(handledTitles(state, [filmCard()])[0]?.label).toBe(
      `Contenu Naka n°${NBSP}10`,
    );
  });

  it("does not change the state it reads", () => {
    const state = { ...emptyState(), handled: ["movie:1", "movie:2"] };
    handledTitles(state, []);
    expect(state.handled).toEqual(["movie:1", "movie:2"]);
  });
});

describe("the handled-titles answer", () => {
  it("lists the stored state with the stored cards, and saves nothing", async () => {
    const w = answerWorld({
      state: {
        ...emptyState(),
        handled: ["movie:9", "tv:5:S1E1"],
        handledTitles: { "tv:5:S1E1": "Série" },
      },
    });
    w.area.data.set("ratings", [filmCard()]);
    expect(await w.jobs.handledTitles([])).toEqual({
      titles: [
        { key: "tv:5:S1E1", label: "Série · saison 1, épisode 1" },
        { key: "movie:9", label: "Un film" },
      ],
      waiting: [],
      cancelling: [],
    });
    expect(w.area.sets).toEqual([]);
    expect(w.network()).toEqual([]);
  });

  it("rejects when the state cannot be read", async () => {
    const w = answerWorld();
    w.area.data.set("state", { version: 2 });
    await expect(w.jobs.handledTitles([])).rejects.toThrow();
  });
});

const waitingEntry = (key: string, over: Partial<RetryFinish> = {}) =>
  ({
    key,
    pair: { nakaId: 5, scId: 1005 },
    evicted: [],
    question: { kind: "ambiguity", side: "naka", id: 5, candidateIds: [1] },
    at: 1,
    ...over,
  }) as RetryFinish;

describe("waitingTitles", () => {
  it("waiting lists each entry with the question's title", () => {
    const state = {
      ...emptyState(),
      retryFinishes: [
        waitingEntry("tv:5:S1E2", {
          question: {
            kind: "ambiguity",
            side: "naka",
            id: 5,
            title: "La Série",
            candidateIds: [1],
          },
        }),
        waitingEntry("movie:9"),
        waitingEntry("movie:7"),
      ],
    };
    expect(waitingTitles(state, [filmCard()])).toEqual([
      { key: "tv:5:S1E2", label: "La Série · saison 1, épisode 2" },
      { key: "movie:9", label: "Un film" },
      { key: "movie:7", label: `Contenu Naka n°${NBSP}7` },
    ]);
  });

  it("an entry whose key is already handled is not listed", () => {
    const state = {
      ...emptyState(),
      handled: ["movie:9"],
      retryFinishes: [waitingEntry("movie:9"), waitingEntry("movie:7")],
    };
    expect(waitingTitles(state, []).map((t) => t.key)).toEqual(["movie:7"]);
  });

  it("without a question title, the chosen candidate's title names the line before the card", () => {
    const state = {
      ...emptyState(),
      retryFinishes: [
        waitingEntry("movie:9", {
          pair: { nakaId: 9, scId: 1009 },
          question: {
            kind: "ambiguity",
            side: "naka",
            id: 9,
            candidateIds: [1008, 1009],
            candidates: [
              { id: 1008, title: "Autre", type: "film" },
              { id: 1009, title: "Le choisi", type: "film" },
            ],
          },
        }),
      ],
    };
    expect(waitingTitles(state, [filmCard()])).toEqual([
      { key: "movie:9", label: "Le choisi" },
    ]);
  });

  it("an entry whose cancel is queued is not listed", async () => {
    const w = answerWorld({
      state: {
        ...emptyState(),
        retryFinishes: [waitingEntry("movie:9"), waitingEntry("movie:7")],
      },
    });
    const answer = await w.jobs.handledTitles(["movie:9"]);
    expect(answer.waiting.map((t) => t.key)).toEqual(["movie:7"]);
  });
});

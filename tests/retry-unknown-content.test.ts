// A waiting finish played again whose content Naka no longer knows (404 on /browse/{id}), or knows as
// another kind: it is recorded as the last finish, failed with naka-content-unknown, under its question's
// title, and its entry leaves retryFinishes (the owner's decision).

import { describe, expect, it } from "vitest";
import { handledTitles, waitingTitles } from "../src/core/handled-titles";
import type { RetryFinish } from "../src/core/retry-finishes";
import type { NakaItem } from "../src/naka/naka-client";
import { retryNextJob } from "../src/sw/retry-job";
import { answerWorld, BOUND, NOW } from "./answer-world";
import { cand, stateWith } from "./question-fixtures";
import { filmCard } from "./rating-fixtures";

const SINCE = NOW - 1000;
const entry = (id: number, title?: string): RetryFinish => ({
  key: `movie:${id}`,
  pair: { nakaId: id, scId: 1000 + id },
  evicted: [],
  question: {
    kind: "ambiguity",
    side: "naka",
    id,
    ...(title === undefined ? {} : { title }),
    candidateIds: [1000 + id, 2000 + id],
    candidates: [cand(1000 + id), cand(2000 + id)],
  },
  at: NOW - 5000,
});
// A question saved by an older version: no title and no candidates.
const legacy = (id: number): RetryFinish => {
  const { candidates: _gone, ...question } = entry(id).question;
  return { ...entry(id), question };
};
const film = (id: number): NakaItem => ({
  contentId: id,
  tmdbId: 9000 + id,
  mediaType: "movie",
  title: `Film ${id}`,
  releaseDate: "2005-01-01",
});
const series = (id: number): NakaItem => ({
  ...film(id),
  mediaType: "tv",
  title: `Serie ${id}`,
});
const waitingWorld = (
  entries: RetryFinish[],
  contentById: (id: number) => Promise<NakaItem | undefined>,
) =>
  answerWorld({
    state: stateWith({
      mapping: entries.map((e) => e.pair),
      retryFinishes: entries,
    }),
    settings: {
      mode: "live",
      binding: BOUND,
      lastRun: { at: NOW, trigger: "button", mode: "live", outcome: "ok" },
    },
    naka: { contentById },
  });
const unknown = async () => undefined;
const doneCalls = (w: ReturnType<typeof answerWorld>) =>
  w.sk.calls.filter((c) => c.startsWith("markDone:"));

describe("retryNextJob: a content Naka no longer knows", () => {
  it("records a 404 as the last finish, failed, under the question's title, and drops the entry", async () => {
    const w = waitingWorld([entry(5, "Titre 5")], unknown);
    expect(await retryNextJob(w.jobDeps, SINCE)).toBe(false);
    expect(w.settings().lastFinish).toEqual({
      at: NOW,
      key: "movie:5",
      outcome: "failed",
      error: "naka-content-unknown",
      title: "Titre 5",
    });
    expect(w.state().retryFinishes).toBeUndefined();
    expect(w.state().handled).toEqual([]);
    expect(w.writes()).toEqual([]);
    expect(waitingTitles(w.state(), [])).toEqual([]);
    expect(handledTitles(w.state(), [])).toEqual([]);
  });

  it("keeps the slot it took before the Naka read", async () => {
    const w = waitingWorld([entry(5, "Titre 5")], unknown);
    await retryNextJob(w.jobDeps, SINCE);
    expect(w.settings().finishWindow).toEqual({ from: NOW, count: 1 });
  });

  it("records a film that Naka now shows as a series the same way", async () => {
    const w = waitingWorld([entry(5, "Titre 5")], async (id) => series(id));
    expect(await retryNextJob(w.jobDeps, SINCE)).toBe(false);
    expect(w.settings().lastFinish).toEqual({
      at: NOW,
      key: "movie:5",
      outcome: "failed",
      error: "naka-content-unknown",
      title: "Titre 5",
    });
    expect(w.state().retryFinishes).toBeUndefined();
    expect(w.writes()).toEqual([]);
  });

  it("without a question title, names the record after the chosen candidate", async () => {
    const w = waitingWorld([entry(5)], unknown);
    await retryNextJob(w.jobDeps, SINCE);
    expect(w.settings().lastFinish?.title).toBe("T1005");
  });

  it("without a question title or candidates, names it after the rating card", async () => {
    const w = waitingWorld([legacy(5)], unknown);
    const card = filmCard({ key: "movie:5", contentId: 5, title: "Le film" });
    w.area.data.set("ratings", [card]);
    await retryNextJob(w.jobDeps, SINCE);
    expect(w.settings().lastFinish?.title).toBe("Le film");
  });

  it("an unreadable card store does not stop a replay", async () => {
    const w = waitingWorld([legacy(5)], async (id) => film(id));
    w.area.data.set("ratings", "broken");
    expect(await retryNextJob(w.jobDeps, SINCE)).toBe(false);
    expect(doneCalls(w)).toEqual(["markDone:1005:2026-11-05"]);
    expect(w.state().retryFinishes).toBeUndefined();
  });

  it("records no title when nothing names the content", async () => {
    const w = waitingWorld([legacy(5)], unknown);
    await retryNextJob(w.jobDeps, SINCE);
    expect(w.settings().lastFinish).toEqual({
      at: NOW,
      key: "movie:5",
      outcome: "failed",
      error: "naka-content-unknown",
    });
  });

  it("does not stop the chain: the next waiting finish is played", async () => {
    const w = waitingWorld(
      [entry(5, "Titre 5"), entry(6, "Titre 6")],
      async (id) => (id === 5 ? undefined : film(id)),
    );
    expect(await retryNextJob(w.jobDeps, SINCE)).toBe(true);
    expect(w.state().retryFinishes?.map((e) => e.key)).toEqual(["movie:6"]);
    expect(await retryNextJob(w.jobDeps, SINCE)).toBe(false);
    expect(doneCalls(w)).toEqual(["markDone:1006:2026-11-05"]);
    expect(w.state().retryFinishes).toBeUndefined();
  });

  it("leaves a normal replay as it was: done, under Naka's title", async () => {
    const w = waitingWorld([entry(5, "Question 5")], async (id) => film(id));
    expect(await retryNextJob(w.jobDeps, SINCE)).toBe(false);
    expect(w.settings().lastFinish).toEqual({
      at: NOW,
      key: "movie:5",
      outcome: "done",
      title: "Film 5",
    });
    expect(doneCalls(w)).toEqual(["markDone:1005:2026-11-05"]);
    expect(w.state().retryFinishes).toBeUndefined();
    expect(w.state().handled).toEqual(["movie:5"]);
  });
});

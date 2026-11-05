import { describe, expect, it } from "vitest";
import type { PendingItem, SyncState } from "../src/core/state";
import type { AnswerQuestionMessage } from "../src/ext/question-messages";
import type { Settings } from "../src/ext/settings";
import { answerWorld, BOUND, NOW } from "./answer-world";
import { cand, stateWith } from "./question-fixtures";

// Naka title 5 is asked: SensCritique 1005 or 2005. A finish of 5 waits on the question.
const question = (
  over: Partial<Extract<PendingItem, { kind: "ambiguity" }>> = {},
): PendingItem => ({
  kind: "ambiguity",
  side: "naka",
  id: 5,
  title: "Titre 5",
  candidateIds: [1005, 2005],
  candidates: [cand(1005), cand(2005)],
  ...over,
});
const asked = (over = {}): SyncState =>
  stateWith({ pending: [question(over)] });
const LIVE: Settings = {
  mode: "live",
  binding: BOUND,
  lastAnswer: { seq: 3, at: 1, target: "ambiguity:naka:9", outcome: "done" },
};

const answer = (
  choice: number | null,
  over: Partial<AnswerQuestionMessage> = {},
): AnswerQuestionMessage => ({
  type: "answer-question",
  side: "naka",
  id: 5,
  choice,
  ...over,
});

describe("answer-question", () => {
  it("choice 2005 among [1005, 2005]: the mapping {5, 2005}, the question gone, done with seq previous + 1", async () => {
    const w = answerWorld({ state: asked(), settings: LIVE });
    await w.jobs.answerQuestion(answer(2005));
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 2005 }]);
    expect(w.state().pending).toEqual([]);
    expect(w.settings().lastAnswer).toEqual({
      seq: 4,
      at: NOW,
      target: "ambiguity:naka:5",
      outcome: "done",
    });
    expect(w.network()).toEqual([]);
  });

  it("saves the state, then records the answer", async () => {
    const w = answerWorld({ state: asked(), settings: LIVE });
    await w.jobs.answerQuestion(answer(2005));
    expect(w.area.ops.filter((op) => op.startsWith("set"))).toEqual([
      "set:state",
      "set:settings",
    ]);
  });

  it("the first answer ever is seq 1", async () => {
    const w = answerWorld({ state: asked() });
    await w.jobs.answerQuestion(answer(1005));
    expect(w.settings().lastAnswer).toMatchObject({ seq: 1, outcome: "done" });
  });

  it("choice 3005, not a candidate: refused, no state save at all, no network", async () => {
    const before = asked({ finish: "movie:5" });
    const w = answerWorld({ state: before, settings: LIVE });
    await w.jobs.answerQuestion(answer(3005));
    expect(w.stateSaves()).toBe(0);
    expect(w.state()).toEqual(before);
    expect(w.network()).toEqual([]);
    expect(w.settings().lastAnswer).toEqual({
      seq: 4,
      at: NOW,
      target: "ambiguity:naka:5",
      outcome: "refused",
    });
  });

  it("an answer to a question that is not open is refused", async () => {
    const w = answerWorld({ state: asked(), settings: LIVE });
    await w.jobs.answerQuestion(answer(1005, { id: 6 }));
    await w.jobs.answerQuestion(answer(null, { side: "sc" }));
    expect(w.stateSaves()).toBe(0);
    expect(w.settings().lastAnswer).toMatchObject({
      seq: 5,
      target: "ambiguity:sc:5",
      outcome: "refused",
    });
  });

  it("choice null: « Aucun de ceux-là » keeps the question with no candidate, done, and runs no finish", async () => {
    const w = answerWorld({ state: asked({ finish: "movie:5" }) });
    await w.jobs.answerQuestion(answer(null));
    expect(w.state().pending).toEqual([
      question({ finish: "movie:5", candidateIds: [], candidates: [] }),
    ]);
    expect(w.state().mapping).toEqual([]);
    expect(w.settings().lastAnswer).toMatchObject({ outcome: "done" });
    expect(w.network()).toEqual([]);
    expect(w.settings().lastFinish).toBeUndefined();
  });

  it("a candidate choice on a question with finish movie:5 runs that finish once: markDone on 2005, and a card", async () => {
    const w = answerWorld({
      state: asked({ finish: "movie:5" }),
      settings: { mode: "live", binding: BOUND },
    });
    await w.jobs.answerQuestion(answer(2005));
    expect(w.writes()).toEqual(["unwish:2005", "markDone:2005:2026-11-05"]);
    expect(w.nk.calls).toEqual(["contentById:5"]);
    expect(w.settings().lastFinish).toMatchObject({
      key: "movie:5",
      outcome: "done",
    });
    expect(w.settings().finishWindow?.count).toBe(1);
    expect(w.settings().lastAnswer).toMatchObject({ outcome: "done" });
    expect(w.cards().map((c) => c.key)).toEqual(["movie:5"]);
    expect(w.state().handled).toEqual(["movie:5"]);
  });

  it("the finish keeps its binding check: another SensCritique account writes nothing", async () => {
    const w = answerWorld({
      state: asked({ finish: "movie:5" }),
      settings: { mode: "live", binding: BOUND },
      username: "intruder",
    });
    await w.jobs.answerQuestion(answer(2005));
    expect(w.writes()).toEqual([]);
    expect(w.settings().lastFinish).toMatchObject({
      outcome: "failed",
      error: "other-account",
    });
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 2005 }]);
  });

  it("the same choice with finish absent runs no finish", async () => {
    const w = answerWorld({ state: asked() });
    await w.jobs.answerQuestion(answer(2005));
    expect(w.network()).toEqual([]);
    expect(w.settings().lastFinish).toBeUndefined();
  });

  it("a stored finish key of another title makes the state unreadable: failed, nothing saved or written", async () => {
    const w = answerWorld({ state: asked({ finish: "movie:6" }) });
    await w.jobs.answerQuestion(answer(2005));
    expect(w.network()).toEqual([]);
    expect(w.stateSaves()).toBe(0);
    expect(w.settings().lastAnswer).toMatchObject({
      outcome: "failed",
      error: "stored-state",
    });
  });

  it("in simulation mode, choice 2005 gives the same mapping and done (design §2.8)", async () => {
    const w = answerWorld({
      state: asked(),
      settings: { mode: "simulation" },
    });
    await w.jobs.answerQuestion(answer(2005));
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 2005 }]);
    expect(w.settings().lastAnswer).toMatchObject({ outcome: "done" });
  });

  it("a SensCritique-side question takes a Naka id as its choice", async () => {
    const w = answerWorld({
      state: stateWith({
        pending: [
          question({
            side: "sc",
            id: 1021,
            candidateIds: [21, 22],
            candidates: [cand(21), cand(22)],
          }),
        ],
      }),
    });
    await w.jobs.answerQuestion(answer(22, { side: "sc", id: 1021 }));
    expect(w.state().mapping).toEqual([{ nakaId: 22, scId: 1021 }]);
    expect(w.settings().lastAnswer?.target).toBe("ambiguity:sc:1021");
  });

  it("a product a settled pair holds is refused (D18), with no save", async () => {
    const before = stateWith({
      pending: [question()],
      mapping: [{ nakaId: 8, scId: 2005 }],
      settled: [{ nakaId: 8, scId: 2005 }],
    });
    const w = answerWorld({ state: before });
    await w.jobs.answerQuestion(answer(2005));
    expect(w.stateSaves()).toBe(0);
    expect(w.settings().lastAnswer?.outcome).toBe("refused");
  });

  it("an unreadable state: failed with stored-state, nothing saved but the record", async () => {
    const w = answerWorld({ settings: LIVE });
    w.area.data.set("state", { version: 99 });
    await w.jobs.answerQuestion(answer(2005));
    expect(w.stateSaves()).toBe(0);
    expect(w.settings().lastAnswer).toMatchObject({
      outcome: "failed",
      error: "stored-state",
    });
  });

  it("unreadable settings: the state is answered, nothing is recorded and the settings stay as they were", async () => {
    const w = answerWorld({ state: asked() });
    w.area.data.set("settings", { mode: "nope" });
    await expect(w.jobs.answerQuestion(answer(2005))).resolves.toBeUndefined();
    expect(w.area.data.get("settings")).toEqual({ mode: "nope" });
    expect(w.area.sets.some((s) => "settings" in s)).toBe(false);
  });
});

describe("hide-question", () => {
  it("dismisses an ambiguity from the home panel: one save, no record, no network", async () => {
    const w = answerWorld({ state: asked(), settings: LIVE });
    await w.jobs.hideQuestion({
      type: "hide-question",
      key: "ambiguity:naka:5",
    });
    expect(w.state().pending).toEqual([question({ asked: true })]);
    expect(w.stateSaves()).toBe(1);
    expect(w.settings().lastAnswer?.seq).toBe(3);
    expect(w.network()).toEqual([]);
  });

  it("a key with no question saves nothing", async () => {
    const before = asked();
    const w = answerWorld({ state: before });
    for (const key of ["ambiguity:naka:6", "removal:sc:21:1021", "link:naka:5"])
      await w.jobs.hideQuestion({ type: "hide-question", key });
    expect(w.stateSaves()).toBe(0);
    expect(w.state()).toEqual(before);
  });
});

import { describe, expect, it } from "vitest";
import { emptyState } from "../src/core/state";
import type { Settings } from "../src/ext/settings";
import { answerWorld, BOUND, NOW } from "./answer-world";
import { stateWith } from "./question-fixtures";

const THRESHOLDS = { film: 0.95, episode: 0.8 };
const FINISH_WINDOW = { from: 0, count: 2 };
const FULL: Settings = {
  mode: "live",
  binding: BOUND,
  thresholds: THRESHOLDS,
  pauseFromPercent: 50,
  lastAutoRunAt: 1,
  finishWindow: FINISH_WINDOW,
  lastRun: { at: NOW, trigger: "button", mode: "live", outcome: "ok" },
  lastFinish: { at: NOW, key: "movie:5", outcome: "done" },
  lastAnswer: {
    seq: 1,
    at: NOW,
    target: "removal:sc:21:1021",
    outcome: "done",
  },
};

describe("forget-binding", () => {
  it("removes the binding and keeps the mode, the last run and the thresholds", async () => {
    const w = answerWorld({ settings: FULL });
    await w.jobs.forget();
    const { binding: _gone, ...rest } = FULL;
    expect(w.settings()).toEqual(rest);
    expect(w.network()).toEqual([]);
  });

  it("saves nothing when there is no binding", async () => {
    const { binding: _gone, ...unbound } = FULL;
    const w = answerWorld({ settings: unbound });
    await w.jobs.forget();
    expect(w.area.sets).toEqual([]);
  });
});

describe("reset", () => {
  it("empties the state and the ratings without loading either, when both are unreadable", async () => {
    const w = answerWorld({ settings: FULL });
    w.area.data.set("state", { version: 2 });
    w.area.data.set("ratings", "x");
    await w.jobs.reset();
    expect(w.area.data.get("state")).toEqual(emptyState());
    expect(w.area.data.get("ratings")).toEqual([]);
    expect(w.area.ops).not.toContain("get:state");
    expect(w.area.ops).not.toContain("get:ratings");
    expect(w.network()).toEqual([]);
  });

  it("empties a readable state too", async () => {
    const w = answerWorld({
      settings: FULL,
      state: stateWith({ run: 5, mapping: [{ nakaId: 21, scId: 1021 }] }),
    });
    await w.jobs.reset();
    expect(w.state()).toEqual(emptyState());
  });

  it("switches to simulation and keeps only the binding, thresholds, pause, auto-run date and finish window", async () => {
    const w = answerWorld({ settings: FULL });
    await w.jobs.reset();
    expect(w.area.data.get("settings")).toEqual({
      mode: "simulation",
      binding: BOUND,
      thresholds: THRESHOLDS,
      pauseFromPercent: 50,
      lastAutoRunAt: 1,
      finishWindow: FINISH_WINDOW,
    });
  });

  it("writes the default settings in simulation when the settings are unreadable", async () => {
    const w = answerWorld({ settings: FULL });
    w.area.data.set("settings", { mode: "nonsense" });
    await w.jobs.reset();
    expect(w.area.data.get("settings")).toEqual({ mode: "simulation" });
  });
});

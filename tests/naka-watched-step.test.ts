import { describe, expect, it } from "vitest";
import type { Settings } from "../src/ext/settings";
import { markedWatched } from "../src/sw/naka-watched-step";
import { answerWorld, BOUND } from "./answer-world";

const LIVE: Settings = { mode: "live", binding: BOUND };
const SIMULATION: Settings = { mode: "simulation", binding: BOUND };
const watches = (calls: string[]) =>
  calls.filter((c) => c.startsWith("markWatched:"));

describe("markedWatched", () => {
  it("writes nothing on Naka in simulation", async () => {
    const w = answerWorld({ settings: SIMULATION });
    expect(await markedWatched(w.jobDeps, { contentId: 5 }, false)).toEqual({});
    expect(w.nk.calls).toEqual([]);
    expect(w.traffic.sent).toEqual([]);
  });

  it('answers "tab" and calls no client when the tab will click', async () => {
    const w = answerWorld({ settings: LIVE });
    expect(await markedWatched(w.jobDeps, { contentId: 5 }, true)).toEqual({
      dejaVu: "tab",
    });
    expect(w.nk.calls).toEqual([]);
  });

  it("PUTs through the client otherwise, a film then an episode", async () => {
    const w = answerWorld({ settings: LIVE });
    expect(await markedWatched(w.jobDeps, { contentId: 5 }, false)).toEqual({});
    const episode = { contentId: 7, season: 2, episode: 3 };
    expect(await markedWatched(w.jobDeps, episode, false)).toEqual({});
    expect(watches(w.nk.calls)).toEqual(["markWatched:5", "markWatched:7:2:3"]);
  });

  it("answers the error when Naka fails", async () => {
    const w = answerWorld({
      settings: LIVE,
      naka: {
        markWatched: async () => {
          throw new Error("down");
        },
      },
    });
    expect(await markedWatched(w.jobDeps, { contentId: 5 }, false)).toEqual({
      error: "unavailable",
    });
  });
});

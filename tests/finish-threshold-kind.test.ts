import { describe, expect, it } from "vitest";
import type { FinishedMessage } from "../src/content/playback-tracker";
import { isComplete } from "../src/core/finish-handler";
import { emptyState } from "../src/core/state";
import { DEFAULT_THRESHOLDS, type Thresholds } from "../src/core/watch-trigger";
import { preCheck } from "../src/sw/finish-precheck";
import { memoryStore } from "./sw-fakes";

type Kind = "film" | "episode";

const viewing = (
  kind: Kind,
  progress: number,
  source: "threshold" | "explicit" = "threshold",
) => ({ source, progress, kind });

// The four fixtures of the brief: each kills one mutant (kinds swapped, film read for an episode).
const CASES: [Kind, number, boolean][] = [
  ["film", 0.85, false],
  ["film", 0.9, true],
  ["episode", 0.8, true],
  ["episode", 0.79, false],
];

describe("isComplete judges by kind", () => {
  it.each(CASES)(
    "a %s at %s under the defaults is %s",
    (kind, progress, ok) => {
      expect(isComplete(viewing(kind, progress), DEFAULT_THRESHOLDS)).toBe(ok);
    },
  );

  it("an explicit film at progress 0 is complete", () => {
    expect(isComplete(viewing("film", 0, "explicit"), DEFAULT_THRESHOLDS)).toBe(
      true,
    );
  });

  it("reads the thresholds it is given", () => {
    const strict: Thresholds = { film: 0.99, episode: 0.95 };
    expect(isComplete(viewing("episode", 0.9), strict)).toBe(false);
    expect(isComplete(viewing("episode", 0.95), strict)).toBe(true);
    expect(isComplete(viewing("film", 0.95), strict)).toBe(false);
  });
});

function messageOf(kind: Kind, progress: number): FinishedMessage {
  const base = {
    type: "finished",
    source: "threshold",
    progress,
    contentId: 7,
  } as const;
  return kind === "film" ? base : { ...base, season: 1, episode: 2 };
}

describe("preCheck answers like isComplete", () => {
  it.each(CASES)("a %s at %s is %s", async (kind, progress, ok) => {
    const { store } = memoryStore();
    const msg = messageOf(kind, progress);
    const answer = await preCheck(store, msg, "key", DEFAULT_THRESHOLDS);
    expect(answer).toBe(ok ? "go" : "free");
  });

  it("a message with only one of season and episode is a film", async () => {
    const { store } = memoryStore();
    const base = messageOf("film", 0.8);
    const seasonOnly = { ...base, season: 1 };
    const episodeOnly = { ...base, episode: 2 };
    for (const msg of [seasonOnly, episodeOnly]) {
      expect(await preCheck(store, msg, "key", DEFAULT_THRESHOLDS)).toBe(
        "free",
      );
    }
  });

  it("a handled key is free even when complete", async () => {
    const { store } = memoryStore();
    await store.saveState({ ...emptyState(), handled: ["movie:7"] });
    const msg = messageOf("film", 0.99);
    expect(await preCheck(store, msg, "movie:7", DEFAULT_THRESHOLDS)).toBe(
      "free",
    );
  });
});

import { describe, expect, it } from "vitest";
import type { RatingCard } from "../src/core/rating-cards";
import { emptyState, type SyncState } from "../src/core/state";
import type { Settings } from "../src/ext/settings";
import { answerWorld, BOUND, PAIR } from "./answer-world";
import { episodeCard, filmCard } from "./rating-fixtures";

const LIVE: Settings = { mode: "live", binding: BOUND };
const EPISODE = { contentId: 5, season: 1, episode: 1 };

function handledState(over: Partial<SyncState> = {}): SyncState {
  return {
    ...emptyState(),
    mapping: [PAIR],
    settled: [PAIR],
    handled: ["movie:21", "tv:5:S1E1", "movie:9"],
    handledTitles: { "movie:21": "Titre 21", "tv:5:S1E1": "Une série" },
    ...over,
  };
}

const finishOf21 = {
  type: "finished" as const,
  source: "threshold" as const,
  progress: 0.96,
  contentId: 21,
};

describe("forgetHandledJob", () => {
  it("a handled episode with a card: the key, its title and its card are gone, and no site is called", async () => {
    const other = filmCard();
    const w = answerWorld({ state: handledState(), settings: LIVE });
    w.area.data.set("ratings", [episodeCard(), other]);
    await w.jobs.forgetHandled({ type: "forget-handled", ...EPISODE });
    expect(w.state().handled).toEqual(["movie:21", "movie:9"]);
    expect(w.state().handledTitles).toEqual({ "movie:21": "Titre 21" });
    expect(w.cards()).toEqual([other]);
    expect(w.network()).toEqual([]);
    expect(w.writes()).toEqual([]);
  });

  it("changes nothing else in the state, nor the settings", async () => {
    const w = answerWorld({ state: handledState(), settings: LIVE });
    await w.jobs.forgetHandled({ type: "forget-handled", contentId: 9 });
    expect({ ...w.state(), handled: [] }).toEqual({
      ...handledState(),
      handled: [],
    });
    expect(w.settings()).toEqual(LIVE);
  });

  it("a film with no card and no stored title is forgotten all the same", async () => {
    const w = answerWorld({ state: handledState(), settings: LIVE });
    await w.jobs.forgetHandled({ type: "forget-handled", contentId: 9 });
    expect(w.state().handled).toEqual(["movie:21", "tv:5:S1E1"]);
    expect(w.network()).toEqual([]);
  });

  it("a key that is not handled: the state is unchanged and nothing is written", async () => {
    const w = answerWorld({ state: handledState(), settings: LIVE });
    const cards: RatingCard[] = [filmCard()];
    w.area.data.set("ratings", cards);
    await w.jobs.forgetHandled({ type: "forget-handled", contentId: 77 });
    await w.jobs.forgetHandled({ type: "forget-handled", contentId: 5 });
    expect(w.state()).toEqual(handledState());
    expect(w.area.sets).toEqual([]);
    expect(w.network()).toEqual([]);
  });

  it("an orphan card of a key no longer handled is dropped too, and the state is not saved", async () => {
    const orphan = filmCard({ key: "movie:77", contentId: 77 });
    const w = answerWorld({ state: handledState(), settings: LIVE });
    w.area.data.set("ratings", [orphan]);
    await w.jobs.forgetHandled({ type: "forget-handled", contentId: 77 });
    expect(w.cards()).toEqual([]);
    expect(w.stateSaves()).toBe(0);
  });

  it("an unticked film does not forget the episodes of a series of the same id, nor the reverse", async () => {
    const w = answerWorld({
      state: handledState({ handled: ["movie:5", "tv:5:S1E1"] }),
    });
    await w.jobs.forgetHandled({ type: "forget-handled", contentId: 5 });
    expect(w.state().handled).toEqual(["tv:5:S1E1"]);
    await w.jobs.forgetHandled({ type: "forget-handled", ...EPISODE });
    expect(w.state().handled).toEqual([]);
  });

  it("an unreadable state is left as it is and the job does not reject", async () => {
    const w = answerWorld({ settings: LIVE });
    w.area.data.set("state", { version: 2 });
    await expect(
      w.jobs.forgetHandled({ type: "forget-handled", contentId: 21 }),
    ).resolves.toBeUndefined();
    expect(w.area.sets).toEqual([]);
  });

  it("a failed save of the state leaves the card in place", async () => {
    const card = filmCard({ key: "movie:21", contentId: 21 });
    const w = answerWorld({ state: handledState(), settings: LIVE });
    w.area.data.set("ratings", [card]);
    const set = w.area.set.bind(w.area);
    w.area.set = async (items) => {
      if ("state" in items) throw new Error("storage");
      return set(items);
    };
    await w.jobs.forgetHandled({ type: "forget-handled", contentId: 21 });
    expect(w.cards()).toEqual([card]);
  });
});

describe("after forgetting, the finish runs again", () => {
  it("a handled title's finish is free; once forgotten it marks the title seen again and stores its title", async () => {
    const w = answerWorld({
      state: handledState({ handled: ["movie:21"], handledTitles: {} }),
      settings: LIVE,
    });
    await w.jobs.finishJob(finishOf21);
    expect(w.network()).toEqual([]);
    await w.jobs.forgetHandled({ type: "forget-handled", contentId: 21 });
    await w.jobs.finishJob(finishOf21);
    expect(w.writes()).toEqual(["unwish:1021", "markDone:1021:2026-11-05"]);
    expect(w.state().handled).toEqual(["movie:21"]);
    expect(w.state().handledTitles).toEqual({ "movie:21": "Titre 21" });
  });
});

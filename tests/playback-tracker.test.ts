import { describe, expect, it } from "vitest";
import {
  createPlaybackTracker,
  PROGRESS_MARKS,
} from "../src/content/playback-tracker";
import { PAGE_CHANNEL, type PageEvent } from "../src/ext/messages";

const FILM = { contentId: 5, mediaType: "movie" as const };
const EP = { contentId: 9, mediaType: "tv" as const, season: 1, episode: 2 };
const TWO_HOURS = 7200;
const CH = PAGE_CHANNEL;
type Watched = Extract<PageEvent, { kind: "watched" }>;

function film() {
  const t = createPlaybackTracker();
  t.context(FILM);
  return t;
}

describe("PROGRESS_MARKS", () => {
  it("are the four marks", () => {
    expect([...PROGRESS_MARKS]).toEqual([0.85, 0.9, 0.95, 0.99]);
  });
});

describe("sample", () => {
  it("gives no message at 30 s of a 2-hour film (anti-goal)", () => {
    expect(
      film().sample({ currentTime: 30, duration: TWO_HOURS }),
    ).toBeUndefined();
  });

  it("gives no message without a context", () => {
    const t = createPlaybackTracker();
    expect(
      t.sample({ currentTime: 7000, duration: TWO_HOURS }),
    ).toBeUndefined();
  });

  it("gives none after the context is cleared", () => {
    const t = film();
    t.context(undefined);
    expect(
      t.sample({ currentTime: 7100, duration: TWO_HOURS }),
    ).toBeUndefined();
  });

  it("ignores a duration of 60 s or less, and a bad duration", () => {
    const t = film();
    expect(t.sample({ currentTime: 60, duration: 60 })).toBeUndefined();
    expect(t.sample({ currentTime: 59, duration: 60 })).toBeUndefined();
    expect(t.sample({ currentTime: 1, duration: 1 })).toBeUndefined();
    expect(t.sample({ currentTime: 5, duration: Number.NaN })).toBeUndefined();
    expect(t.sample({ currentTime: 5, duration: Infinity })).toBeUndefined();
    expect(t.sample({ currentTime: 5, duration: 0 })).toBeUndefined();
  });

  it("accepts a duration just over 60 s", () => {
    const t = film();
    expect(t.sample({ currentTime: 61, duration: 61 })?.progress).toBe(0.99);
  });

  it("ignores a bad currentTime", () => {
    const t = film();
    expect(
      t.sample({ currentTime: Number.NaN, duration: TWO_HOURS }),
    ).toBeUndefined();
    expect(t.sample({ currentTime: -5, duration: TWO_HOURS })).toBeUndefined();
    expect(
      t.sample({ currentTime: Infinity, duration: TWO_HOURS }),
    ).toBeUndefined();
  });

  it("gives nothing just below the first mark, the mark at exactly 0.85", () => {
    const t = film();
    expect(t.sample({ currentTime: 84.9, duration: 100 })).toBeUndefined();
    expect(t.sample({ currentTime: 85, duration: 100 })).toEqual({
      type: "finished",
      source: "threshold",
      progress: 0.85,
      contentId: 5,
    });
  });

  it("a run from 0 to the end gives exactly the four marks, in order", () => {
    const t = film();
    const out = [];
    for (let s = 0; s <= TWO_HOURS; s += 5) {
      const m = t.sample({ currentTime: s, duration: TWO_HOURS });
      if (m !== undefined) out.push(m.progress);
    }
    expect(out).toEqual([0.85, 0.9, 0.95, 0.99]);
  });

  it("a seek straight to the end gives one message at 0.99, a second seek none", () => {
    const t = film();
    expect(t.sample({ currentTime: TWO_HOURS, duration: TWO_HOURS })).toEqual({
      type: "finished",
      source: "threshold",
      progress: 0.99,
      contentId: 5,
    });
    expect(
      t.sample({ currentTime: TWO_HOURS, duration: TWO_HOURS }),
    ).toBeUndefined();
    expect(t.sample({ currentTime: 100, duration: TWO_HOURS })).toBeUndefined();
    expect(
      t.sample({ currentTime: TWO_HOURS - 1, duration: TWO_HOURS }),
    ).toBeUndefined();
  });

  it("a seek past the end is capped at 0.99", () => {
    expect(
      film().sample({ currentTime: 9000, duration: TWO_HOURS })?.progress,
    ).toBe(0.99);
  });

  it("a seek to 0.92 gives the 0.9 mark, then 0.95 later", () => {
    const t = film();
    expect(t.sample({ currentTime: 92, duration: 100 })?.progress).toBe(0.9);
    expect(t.sample({ currentTime: 91, duration: 100 })).toBeUndefined();
    expect(t.sample({ currentTime: 95, duration: 100 })?.progress).toBe(0.95);
  });

  it("a rewind and replay does not repeat a mark", () => {
    const t = film();
    t.sample({ currentTime: 86, duration: 100 });
    t.sample({ currentTime: 10, duration: 100 });
    expect(t.sample({ currentTime: 86, duration: 100 })).toBeUndefined();
  });
});

describe("keys", () => {
  it("an episode carries its season and episode", () => {
    const t = createPlaybackTracker();
    t.context(EP);
    expect(t.sample({ currentTime: 90, duration: 100 })).toEqual({
      type: "finished",
      source: "threshold",
      progress: 0.9,
      contentId: 9,
      season: 1,
      episode: 2,
    });
  });

  it("an episode change gives a new key, so the marks fire again", () => {
    const t = createPlaybackTracker();
    t.context(EP);
    expect(t.sample({ currentTime: 99, duration: 100 })?.progress).toBe(0.99);
    t.context({ ...EP, episode: 3 });
    expect(t.sample({ currentTime: 99, duration: 100 })).toMatchObject({
      progress: 0.99,
      episode: 3,
    });
  });

  it("a season change and a content change give new keys", () => {
    const t = createPlaybackTracker();
    t.context(EP);
    t.sample({ currentTime: 99, duration: 100 });
    t.context({ ...EP, season: 2 });
    expect(t.sample({ currentTime: 99, duration: 100 })).toBeDefined();
    t.context({ ...EP, contentId: 10 });
    expect(t.sample({ currentTime: 99, duration: 100 })).toBeDefined();
  });

  it("a film and an episode with the same id are different keys", () => {
    const t = createPlaybackTracker();
    t.context({ contentId: 9, mediaType: "movie" });
    t.sample({ currentTime: 99, duration: 100 });
    t.context(EP);
    expect(t.sample({ currentTime: 99, duration: 100 })).toBeDefined();
  });

  it("the same context again keeps its fired marks", () => {
    const t = film();
    t.sample({ currentTime: 99, duration: 100 });
    t.context({ ...FILM });
    expect(t.sample({ currentTime: 99, duration: 100 })).toBeUndefined();
  });

  it("coming back to an earlier key keeps its fired marks", () => {
    const t = film();
    t.sample({ currentTime: 99, duration: 100 });
    t.context(EP);
    t.context(FILM);
    expect(t.sample({ currentTime: 99, duration: 100 })).toBeUndefined();
  });
});

describe("watched", () => {
  const ev: Watched = { channel: CH, kind: "watched", contentId: 5 };

  it("sends an explicit finished once per key", () => {
    const t = film();
    expect(t.watched(ev)).toEqual({
      type: "finished",
      source: "explicit",
      progress: 1,
      contentId: 5,
    });
    expect(t.watched(ev)).toBeUndefined();
  });

  it("carries season and episode", () => {
    const t = createPlaybackTracker();
    expect(t.watched({ ...ev, contentId: 9, season: 1, episode: 2 })).toEqual({
      type: "finished",
      source: "explicit",
      progress: 1,
      contentId: 9,
      season: 1,
      episode: 2,
    });
  });

  it("a different episode is a new key", () => {
    const t = createPlaybackTracker();
    expect(t.watched({ ...ev, season: 1, episode: 1 })).toBeDefined();
    expect(t.watched({ ...ev, season: 1, episode: 2 })).toBeDefined();
    expect(t.watched({ ...ev, season: 2, episode: 1 })).toBeDefined();
    expect(
      t.watched({ ...ev, contentId: 6, season: 1, episode: 1 }),
    ).toBeDefined();
    expect(t.watched({ ...ev, season: 1, episode: 1 })).toBeUndefined();
  });

  it("does not depend on a playback context", () => {
    expect(createPlaybackTracker().watched(ev)).toBeDefined();
  });

  it("ignores a playlist event", () => {
    expect(
      createPlaybackTracker().watched({
        channel: PAGE_CHANNEL,
        kind: "playlist",
      }),
    ).toBeUndefined();
  });

  it("is independent of the threshold marks of the same key", () => {
    const t = film();
    t.sample({ currentTime: 99, duration: 100 });
    expect(t.watched(ev)?.source).toBe("explicit");
  });
});

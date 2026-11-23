import { describe, expect, it } from "vitest";
import {
  createPlaybackTracker,
  DURATION_FLOOR_S,
  type PlaybackTracker,
  PROGRESS_MARKS,
} from "../src/content/playback-tracker";
import { createGestureGate } from "../src/content/user-gesture";
import { THRESHOLD_CHOICES } from "../src/core/watch-trigger";
import { PAGE_CHANNEL, type PageEvent } from "../src/ext/messages";

const FILM = { contentId: 5, mediaType: "movie" as const };
const EP = { contentId: 9, mediaType: "tv" as const, season: 1, episode: 2 };
const TWO_HOURS = 7200;
const DUR = 1000;
const CH = PAGE_CHANNEL;
type Watched = Extract<PageEvent, { kind: "watched" }>;

function film() {
  const t = createPlaybackTracker();
  t.context(FILM);
  return t;
}

let playedSources = 0;
// The context, then one counted sample of a new source: the tracker knows the content really plays.
function play(
  t: PlaybackTracker,
  ctx: Parameters<PlaybackTracker["context"]>[0],
) {
  t.context(ctx);
  playedSources += 1;
  t.sample({
    currentTime: 0.1 * DUR,
    duration: DUR,
    src: `play-${playedSources}`,
  });
  return t;
}

function playingFilm() {
  return play(createPlaybackTracker(), FILM);
}

// A sample at a fraction of the duration, from a video source.
function at(t: PlaybackTracker, fraction: number, src = "A", duration = DUR) {
  return t.sample({ currentTime: fraction * duration, duration, src });
}

function sampleOf(
  t: PlaybackTracker,
  currentTime: number,
  duration: number,
  src = "A",
) {
  return t.sample({ currentTime, duration, src });
}

describe("PROGRESS_MARKS", () => {
  it("are the five marks, and the floor is 5 minutes", () => {
    expect([...PROGRESS_MARKS]).toEqual([0.8, 0.85, 0.9, 0.95, 0.99]);
    expect(DURATION_FLOOR_S).toBe(300);
  });

  it("hold every threshold choice: whatever threshold is saved, the tracker offers that mark", () => {
    for (const choice of THRESHOLD_CHOICES) {
      expect(PROGRESS_MARKS, String(choice)).toContain(choice);
    }
  });
});

describe("sample", () => {
  it("gives no message at 30 s of a 2-hour film (anti-goal)", () => {
    expect(sampleOf(film(), 30, TWO_HOURS)).toBeUndefined();
  });

  it("gives no message without a context, nor after it is cleared", () => {
    const t = createPlaybackTracker();
    expect(at(t, 0.99)).toBeUndefined();
    t.context(FILM);
    t.context(undefined);
    expect(at(t, 0.99)).toBeUndefined();
  });

  it("ignores a short video: a 4-minute video played to the end gives nothing", () => {
    const t = film();
    expect(at(t, 1, "A", 240)).toBeUndefined();
    expect(at(t, 0.99, "A", 299)).toBeUndefined();
    expect(at(t, 0.99, "A", 61)).toBeUndefined();
  });

  it("counts a duration of exactly the floor", () => {
    expect(at(film(), 0.99, "A", 300)?.progress).toBe(0.99);
  });

  it("ignores a bad duration or a bad currentTime", () => {
    const t = film();
    for (const duration of [Number.NaN, Infinity, 0, -1000]) {
      expect(sampleOf(t, 5, duration)).toBeUndefined();
    }
    for (const currentTime of [Number.NaN, -5, Infinity]) {
      expect(sampleOf(t, currentTime, DUR)).toBeUndefined();
    }
  });

  it("ignores currentTime beyond the duration; exactly the end gives 0.99", () => {
    const t = film();
    expect(sampleOf(t, 1001, DUR)).toBeUndefined();
    expect(sampleOf(t, 9000, DUR)).toBeUndefined();
    expect(sampleOf(t, DUR, DUR)).toEqual({
      type: "finished",
      source: "threshold",
      progress: 0.99,
      contentId: 5,
    });
  });

  it("gives nothing just below the first mark, the mark at exactly 0.8", () => {
    const t = film();
    expect(at(t, 0.799)).toBeUndefined();
    expect(at(t, 0.8)).toEqual({
      type: "finished",
      source: "threshold",
      progress: 0.8,
      contentId: 5,
    });
    expect(at(t, 0.81)).toBeUndefined();
  });

  it("a seek to 0.86 offers 0.8 and 0.85 once and sends only the highest", () => {
    const t = film();
    expect(at(t, 0.86)?.progress).toBe(0.85);
    expect(at(t, 0.8)).toBeUndefined();
    expect(at(t, 0.86)).toBeUndefined();
  });

  it("a run from 0 to the end gives exactly the five marks, in order", () => {
    const t = film();
    const out = [];
    for (let s = 0; s <= TWO_HOURS; s += 5) {
      const m = sampleOf(t, s, TWO_HOURS);
      if (m !== undefined) out.push(m.progress);
    }
    expect(out).toEqual([0.8, 0.85, 0.9, 0.95, 0.99]);
  });

  it("a seek straight to the end gives one message at 0.99, a second seek none", () => {
    const t = film();
    expect(at(t, 1)?.progress).toBe(0.99);
    expect(at(t, 1)).toBeUndefined();
    expect(at(t, 0.1)).toBeUndefined();
    expect(at(t, 0.999)).toBeUndefined();
  });

  it("a seek to 0.92 gives the 0.9 mark, then 0.95 later", () => {
    const t = film();
    expect(at(t, 0.92)?.progress).toBe(0.9);
    expect(at(t, 0.91)).toBeUndefined();
    expect(at(t, 0.95)?.progress).toBe(0.95);
  });

  it("a rewind and replay does not repeat a mark", () => {
    const t = film();
    at(t, 0.86);
    at(t, 0.1);
    expect(at(t, 0.86)).toBeUndefined();
  });
});

describe("consistent durations", () => {
  it("a duration that drops from 2400 to 600 is ignored and fires nothing", () => {
    const t = film();
    expect(sampleOf(t, 100, 2400)).toBeUndefined();
    expect(sampleOf(t, 500, 600)).toBeUndefined();
    expect(sampleOf(t, 590, 600)).toBeUndefined();
    expect(sampleOf(t, 1500, 600)).toBeUndefined();
  });

  it("a duration that wobbles by 0.5% still counts", () => {
    const t = film();
    at(t, 0.1, "A", 2400);
    expect(sampleOf(t, 2300, 2412)).toBeDefined();
  });

  it("a duration 3% off the reference is ignored, in both directions", () => {
    const up = film();
    at(up, 0.1, "A", 2400);
    expect(sampleOf(up, 2400, 2472)).toBeUndefined();
    const down = film();
    at(down, 0.1, "A", 2400);
    expect(sampleOf(down, 2300, 2328)).toBeUndefined();
  });

  it("a duration within 2% on each side counts", () => {
    const up = film();
    at(up, 0.1, "A", 2400);
    expect(sampleOf(up, 2400, 2440)).toBeDefined();
    const down = film();
    at(down, 0.1, "A", 2400);
    expect(sampleOf(down, 2300, 2360)).toBeDefined();
  });

  it("the reference is not set by an inconsistent first sample", () => {
    const t = film();
    sampleOf(t, 9000, 1000);
    expect(sampleOf(t, 100, 2400)).toBeUndefined();
    expect(sampleOf(t, 2400, 2400)?.progress).toBe(0.99);
  });

  it("a negative currentTime does not set the reference", () => {
    const t = film();
    sampleOf(t, -5, 1000);
    expect(sampleOf(t, 2400, 2400)?.progress).toBe(0.99);
  });

  it("each src keeps its own reference", () => {
    const t = film();
    at(t, 0.1, "A", 2400);
    at(t, 0.1, "B", 1000);
    expect(sampleOf(t, 2300, 2400, "B")).toBeUndefined();
    expect(sampleOf(t, 990, 1000, "B")?.progress).toBe(0.99);
  });

  it("a new src resets the reference", () => {
    const t = film();
    at(t, 0.1, "A", 2400);
    expect(at(t, 0.99, "B", 1000)?.progress).toBe(0.99);
  });
});

describe("video source (stale samples after a URL change)", () => {
  it("stale samples of the previous episode never fire on the next key", () => {
    const t = createPlaybackTracker();
    t.context({ ...EP, episode: 1 });
    expect(at(t, 0.99, "A")?.progress).toBe(0.99);
    t.context(EP);
    expect(at(t, 0.99, "A")).toBeUndefined();
    expect(at(t, 0.99, "A")).toBeUndefined();
    expect(at(t, 0.99, "A")).toBeUndefined();
  });

  it("then the new src counts: the marks fire for episode 2 only", () => {
    const t = createPlaybackTracker();
    t.context({ ...EP, episode: 1 });
    at(t, 0.99, "A");
    t.context(EP);
    at(t, 0.99, "A");
    expect(at(t, 0.05, "B")).toBeUndefined();
    expect(at(t, 0.9, "B")).toMatchObject({ progress: 0.9, episode: 2 });
  });

  it("the previous src is kept when the context changes again before a new src", () => {
    const t = createPlaybackTracker();
    t.context({ ...EP, episode: 1 });
    at(t, 0.5, "A");
    t.context(EP);
    at(t, 0.99, "A");
    t.context({ ...EP, episode: 3 });
    expect(at(t, 0.99, "A")).toBeUndefined();
    expect(at(t, 0.99, "C")).toMatchObject({ episode: 3 });
  });

  it("the first context of a page counts any src", () => {
    expect(at(film(), 0.99, "whatever")?.progress).toBe(0.99);
  });

  it("a resumed viewing counts: first sample at 0.6 with a new src, completes at 0.9", () => {
    const t = createPlaybackTracker();
    t.context({ ...EP, episode: 1 });
    at(t, 0.5, "A");
    t.context(EP);
    expect(at(t, 0.6, "B")).toBeUndefined();
    expect(at(t, 0.9, "B")).toMatchObject({ progress: 0.9, episode: 2 });
  });

  it("an empty src never counts", () => {
    expect(at(film(), 0.99, "")).toBeUndefined();
    const t = createPlaybackTracker();
    t.context({ ...EP, episode: 1 });
    at(t, 0.5, "A");
    t.context(EP);
    expect(at(t, 0.99, "")).toBeUndefined();
  });

  it("the same context again does not remember a previous src", () => {
    const t = film();
    at(t, 0.5, "A");
    t.context({ ...FILM });
    expect(at(t, 0.99, "A")?.progress).toBe(0.99);
  });
});

describe("keys", () => {
  it("an episode carries its season and episode", () => {
    const t = createPlaybackTracker();
    t.context(EP);
    expect(at(t, 0.9)).toEqual({
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
    expect(at(t, 0.99, "A")?.progress).toBe(0.99);
    t.context({ ...EP, episode: 3 });
    expect(at(t, 0.99, "B")).toMatchObject({ progress: 0.99, episode: 3 });
  });

  it("a season change and a content change give new keys", () => {
    const t = createPlaybackTracker();
    t.context(EP);
    at(t, 0.99, "A");
    t.context({ ...EP, season: 2 });
    expect(at(t, 0.99, "B")).toBeDefined();
    t.context({ ...EP, contentId: 10 });
    expect(at(t, 0.99, "C")).toBeDefined();
  });

  it("a film and an episode with the same id are different keys", () => {
    const t = createPlaybackTracker();
    t.context({ contentId: 9, mediaType: "movie" });
    at(t, 0.99, "A");
    t.context(EP);
    expect(at(t, 0.99, "B")).toBeDefined();
  });

  it("the same context again keeps its fired marks", () => {
    const t = film();
    at(t, 0.99);
    t.context({ ...FILM });
    expect(at(t, 0.99)).toBeUndefined();
  });

  it("coming back to an earlier key keeps its fired marks", () => {
    const t = film();
    at(t, 0.99, "A");
    t.context(EP);
    t.context(FILM);
    expect(at(t, 0.99, "B")).toBeUndefined();
  });

  it("keeps at most 200 keys, dropping the oldest first", () => {
    const t = createPlaybackTracker();
    const ev = (contentId: number): Watched => ({
      channel: CH,
      kind: "watched",
      contentId,
    });
    const watchedPlaying = (id: number) => {
      play(t, { contentId: id, mediaType: "movie" });
      return t.watched(ev(id));
    };
    for (let id = 1; id <= 200; id += 1) watchedPlaying(id);
    expect(watchedPlaying(2)).toBeUndefined();
    expect(watchedPlaying(1)).toBeUndefined();
    watchedPlaying(201);
    expect(watchedPlaying(1)).toBeDefined();
    expect(watchedPlaying(3)).toBeUndefined();
  });
});

describe("noteWatched", () => {
  it("ignores a « vu » for ids noted watched", () => {
    const t = playingFilm();
    t.noteWatched({ contentId: 5 });
    expect(
      t.watched({ channel: CH, kind: "watched", contentId: 5 }, () => true),
    ).toBeUndefined();
  });
});

describe("unwatched", () => {
  const ev: Watched = { channel: CH, kind: "watched", contentId: 5 };
  const off: PageEvent = { channel: CH, kind: "unwatched", contentId: 5 };

  it("lets the next explicit vu of that key through again", () => {
    const t = playingFilm();
    t.watched(ev);
    expect(t.watched(ev)).toBeUndefined();
    t.unwatched(off);
    expect(t.watched(ev)?.source).toBe("explicit");
  });

  it("leaves the other keys alone", () => {
    const t = createPlaybackTracker();
    play(t, { contentId: 6, mediaType: "movie" });
    t.watched({ ...ev, contentId: 6 });
    t.unwatched(off);
    expect(t.watched({ ...ev, contentId: 6 })).toBeUndefined();
  });

  it("is ignored for any other event kind", () => {
    const t = playingFilm();
    t.watched(ev);
    t.unwatched(ev);
    expect(t.watched(ev)).toBeUndefined();
  });

  it("never sends anything by itself", () => {
    expect(playingFilm().unwatched(off)).toBeUndefined();
  });
});

describe("watched", () => {
  const ev: Watched = { channel: CH, kind: "watched", contentId: 5 };

  it("sends an explicit finished once per key", () => {
    const t = playingFilm();
    expect(t.watched(ev)).toEqual({
      type: "finished",
      source: "explicit",
      progress: 1,
      contentId: 5,
    });
    expect(t.watched(ev)).toBeUndefined();
  });

  it("carries season and episode of the episode playing", () => {
    const t = createPlaybackTracker();
    play(t, EP);
    expect(t.watched({ ...ev, contentId: 9, season: 1, episode: 2 })).toEqual({
      type: "finished",
      source: "explicit",
      progress: 1,
      contentId: 9,
      season: 1,
      episode: 2,
    });
  });

  it("a different episode, once playing, is a new key", () => {
    const t = createPlaybackTracker();
    const playing = (contentId: number, season: number, episode: number) => {
      play(t, { contentId, mediaType: "tv", season, episode });
      return t.watched({ ...ev, contentId, season, episode });
    };
    expect(playing(5, 1, 1)).toBeDefined();
    expect(playing(5, 1, 2)).toBeDefined();
    expect(playing(5, 2, 1)).toBeDefined();
    expect(playing(6, 1, 1)).toBeDefined();
    expect(playing(5, 1, 1)).toBeUndefined();
  });

  it("ignores a vu for a title that is not the one playing (forged id)", () => {
    const t = playingFilm();
    expect(t.watched({ ...ev, contentId: 4242 })).toBeUndefined();
  });

  it("a forged vu for another title does not use up the playing title's vu", () => {
    const t = playingFilm();
    t.watched({ ...ev, contentId: 4242 });
    expect(t.watched(ev)?.source).toBe("explicit");
  });

  it("ignores a vu when nothing plays", () => {
    expect(createPlaybackTracker().watched(ev)).toBeUndefined();
  });

  it("ignores a vu of the title just left when the player is closed", () => {
    const t = playingFilm();
    t.context(undefined);
    expect(t.watched(ev)).toBeUndefined();
  });

  it("ignores the previous episode's vu once the player moved to the next one", () => {
    const t = createPlaybackTracker();
    play(t, EP);
    play(t, { ...EP, episode: 3 });
    expect(t.watched({ ...ev, contentId: 9, season: 1, episode: 2 })).toBe(
      undefined,
    );
    expect(t.watched({ ...ev, contentId: 9, season: 1, episode: 3 })).toEqual({
      type: "finished",
      source: "explicit",
      progress: 1,
      contentId: 9,
      season: 1,
      episode: 3,
    });
  });

  it("ignores a vu of the whole series or of another episode while an episode plays", () => {
    const t = createPlaybackTracker();
    play(t, EP);
    expect(t.watched({ ...ev, contentId: 9 })).toBeUndefined();
    expect(
      t.watched({ ...ev, contentId: 9, season: 1, episode: 5 }),
    ).toBeUndefined();
    expect(
      t.watched({ ...ev, contentId: 9, season: 2, episode: 2 }),
    ).toBeUndefined();
  });

  it("a vu for a title not playing counts right after a real gesture", () => {
    const t = playingFilm();
    expect(t.watched({ ...ev, contentId: 6 }, () => true)).toEqual({
      type: "finished",
      source: "explicit",
      progress: 1,
      contentId: 6,
    });
  });

  it("a vu with nothing playing counts right after a real gesture", () => {
    const t = createPlaybackTracker();
    expect(
      t.watched({ ...ev, contentId: 9, season: 1, episode: 4 }, () => true),
    ).toEqual({
      type: "finished",
      source: "explicit",
      progress: 1,
      contentId: 9,
      season: 1,
      episode: 4,
    });
  });

  it("a vu for a title not playing, without a gesture, sends nothing", () => {
    const t = playingFilm();
    expect(t.watched({ ...ev, contentId: 6 }, () => false)).toBeUndefined();
  });

  it("the playing title's vu needs no gesture and leaves any recent one unused", () => {
    const t = playingFilm();
    let takes = 0;
    const take = () => {
      takes += 1;
      return true;
    };
    expect(t.watched(ev, take)?.source).toBe("explicit");
    expect(takes).toBe(0);
  });

  // One click, then the playing « vu » and an off-player « vu » within 3 s: the click is the second one's.
  it("after one click, the playing vu then an off-player vu both count", () => {
    const t = playingFilm();
    let clock = 1000;
    const gate = createGestureGate(() => clock);
    gate.note({ type: "click", isTrusted: true });
    clock += 500;
    expect(t.watched(ev, gate.take)?.contentId).toBe(5);
    clock += 500;
    expect(t.watched({ ...ev, contentId: 6 }, gate.take)?.contentId).toBe(6);
  });

  it("a repeated off-player vu of a title already sent leaves the gesture unused", () => {
    const t = playingFilm();
    t.watched({ ...ev, contentId: 6 }, () => true);
    let takes = 0;
    const take = () => {
      takes += 1;
      return true;
    };
    expect(t.watched({ ...ev, contentId: 6 }, take)).toBeUndefined();
    expect(takes).toBe(0);
  });

  it("the playing title's vu needs a gesture until a sample of it counted (a page can pushState)", () => {
    const t = film();
    expect(t.watched(ev)).toBeUndefined();
    expect(t.watched(ev, () => true)?.source).toBe("explicit");
  });

  it("the playing title's vu counts without a gesture after one counted sample", () => {
    const t = film();
    at(t, 0.1);
    expect(t.watched(ev)?.source).toBe("explicit");
  });

  it("a sample of the previous content does not count for the one the URL moved to", () => {
    const t = playingFilm();
    t.context({ contentId: 6, mediaType: "movie" });
    expect(t.watched({ ...ev, contentId: 6 })).toBeUndefined();
  });

  it("a sample of the previous source after the URL moved does not count", () => {
    const t = film();
    at(t, 0.1, "old");
    t.context({ contentId: 6, mediaType: "movie" });
    at(t, 0.2, "old");
    expect(t.watched({ ...ev, contentId: 6 })).toBeUndefined();
  });

  it("an implausible sample (a short clip) does not count", () => {
    const t = film();
    sampleOf(t, 10, 60, "clip");
    expect(t.watched(ev)).toBeUndefined();
  });

  it("coming back to a content needs a new counted sample", () => {
    const t = playingFilm();
    t.context(EP);
    t.context(FILM);
    expect(t.watched(ev)).toBeUndefined();
  });

  it("ignores an episode's vu while a film with the same id plays", () => {
    const t = playingFilm();
    expect(t.watched({ ...ev, season: 1, episode: 1 })).toBeUndefined();
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
    const t = playingFilm();
    at(t, 0.99);
    expect(t.watched(ev)?.source).toBe("explicit");
  });
});

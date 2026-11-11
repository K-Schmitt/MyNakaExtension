import { describe, expect, it } from "vitest";
import {
  createPlaybackTracker,
  type PlaybackTracker,
} from "../src/content/playback-tracker";
import { PAGE_CHANNEL, type PageEvent } from "../src/ext/messages";

const SERIES = 9;
const S23E17 = {
  contentId: SERIES,
  mediaType: "tv" as const,
  season: 23,
  episode: 17,
};
const S23E18 = { ...S23E17, episode: 18 };
const FILM = { contentId: 5, mediaType: "movie" as const };
const DURATION = 1276;
const START_MS = 1221305;

const creditsOf = (
  startMs: number,
  at: { season: number; episode: number } | Record<string, never>,
): PageEvent =>
  ({ channel: PAGE_CHANNEL, kind: "credits", startMs, ...at }) as PageEvent;

function play(t: PlaybackTracker, currentTime: number, duration = DURATION) {
  return t.sample({ currentTime, duration, src: "A" });
}

function episode17(): PlaybackTracker {
  const t = createPlaybackTracker();
  t.context(S23E17);
  t.credits(creditsOf(START_MS, { season: 23, episode: 17 }));
  return t;
}

describe("the end of viewing at the credits", () => {
  it("fires once the credits start, once, with the real progress", () => {
    const t = episode17();
    // 1215 s consumes the threshold marks up to 0.95, so the next samples only carry the credits.
    expect(play(t, 1215)?.source).toBe("threshold");
    expect(play(t, 1221)).toBeUndefined();
    expect(play(t, 1222)).toEqual({
      type: "finished",
      source: "credits",
      progress: 1222 / DURATION,
      contentId: SERIES,
      season: 23,
      episode: 17,
    });
    expect(play(t, 1240)).toBeUndefined();
  });

  it("the credits win over a threshold mark reached by the same sample", () => {
    const t = episode17();
    expect(play(t, 1230)?.source).toBe("credits");
  });

  it("credits of another episode do nothing for this one", () => {
    const t = createPlaybackTracker();
    t.context(S23E17);
    t.credits(creditsOf(START_MS, { season: 23, episode: 18 }));
    expect(play(t, 1215)?.source).toBe("threshold");
    expect(play(t, 1230)).toBeUndefined();
  });

  it("credits of an episode do nothing for a film", () => {
    const t = createPlaybackTracker();
    t.context(FILM);
    t.credits(creditsOf(START_MS, { season: 23, episode: 17 }));
    expect(play(t, 1215)?.source).toBe("threshold");
    expect(play(t, 1230)).toBeUndefined();
  });

  it("credits before the floor are ignored: the threshold marks still fire", () => {
    const t = createPlaybackTracker();
    t.context(S23E17);
    t.credits(creditsOf(DURATION * 500, { season: 23, episode: 17 }));
    expect(play(t, DURATION * 0.6)).toBeUndefined();
    expect(play(t, DURATION * 0.8)).toEqual({
      type: "finished",
      source: "threshold",
      progress: 0.8,
      contentId: SERIES,
      season: 23,
      episode: 17,
    });
    expect(play(t, DURATION * 0.86)?.progress).toBe(0.85);
  });

  it("a film's credits fire for a film", () => {
    const t = createPlaybackTracker();
    t.context(FILM);
    t.credits(creditsOf(6_000_000, {}));
    expect(play(t, 6001, 7000)).toEqual({
      type: "finished",
      source: "credits",
      progress: 6001 / 7000,
      contentId: 5,
    });
  });

  it("a film's credits do nothing for an episode", () => {
    const t = createPlaybackTracker();
    t.context(S23E17);
    t.credits(creditsOf(START_MS, {}));
    expect(play(t, 1215)?.source).toBe("threshold");
    expect(play(t, 1230)).toBeUndefined();
  });

  it("credits seen before the context changes apply once it matches", () => {
    const t = createPlaybackTracker();
    t.context(S23E17);
    t.credits(creditsOf(START_MS, { season: 23, episode: 18 }));
    t.context(S23E18);
    expect(
      t.sample({ currentTime: 1230, duration: DURATION, src: "B" })?.source,
    ).toBe("credits");
  });

  it("an inconsistent sample never fires the credits", () => {
    const t = episode17();
    expect(play(t, 1230, 200)).toBeUndefined();
    expect(play(t, 1300)).toBeUndefined();
  });

  it("a later credits start for the same episode replaces the earlier one", () => {
    const t = episode17();
    t.credits(creditsOf(1_250_000, { season: 23, episode: 17 }));
    expect(play(t, 1230)?.source).toBe("threshold");
    expect(play(t, 1251)?.source).toBe("credits");
  });

  it("ignores events of other kinds", () => {
    const t = createPlaybackTracker();
    t.context(FILM);
    t.credits({ channel: PAGE_CHANNEL, kind: "playlist" });
    expect(play(t, 6001, 7000)?.source).toBe("threshold");
  });
});

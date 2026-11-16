import { describe, expect, it } from "vitest";
import type { TitlePageEvent } from "../src/content/fiche-ports";
import { startNakaTab, type TabEnv } from "../src/content/naka-tab";
import { createTabListener } from "../src/content/naka-tab-listener";
import {
  createGestureGate,
  GESTURE_WINDOW_MS,
} from "../src/content/user-gesture";
import { readVideo } from "../src/content/video-sample";
import type { ContentIds } from "../src/core/finish-event";
import { PAGE_CHANNEL, type ToWorker } from "../src/ext/messages";
import { createNakaClient } from "../src/naka/naka-client";
import { entry, fakeApi, json, MARKER, strings } from "./naka-bridge-fakes";

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const settle = () => new Promise((resolve) => setImmediate(resolve));

function listenerWorld() {
  const api = fakeApi((call) =>
    call.url.endsWith("/browse/7") ? json(entry(7)) : json({}, 404),
  );
  const client = createNakaClient({ fetch: api.fetch, token: () => MARKER });
  const listener = createTabListener(EXT, client, () => "77");
  const answers: unknown[] = [];
  const call = (msg: unknown, sender: object) =>
    listener(msg, sender, (answer) => answers.push(answer));
  return { api, answers, call };
}

describe("the tab listener", () => {
  it("answers a call from the extension, later, with the client's result", async () => {
    const w = listenerWorld();
    const msg = { type: "naka-call", call: "contentById", contentId: 7 };
    expect(w.call(msg, { id: EXT })).toBe(true);
    await settle();
    expect(w.answers).toEqual([
      {
        ok: true,
        value: {
          contentId: 7,
          tmdbId: 1007,
          mediaType: "tv",
          title: "Titre 7",
          originalTitle: "Original 7",
          releaseDate: "2020-05-17",
        },
      },
    ]);
  });

  it("answers the account without the token", async () => {
    const w = listenerWorld();
    w.call({ type: "naka-account" }, { id: EXT });
    await settle();
    expect(w.answers).toEqual([{ ok: true, value: "77" }]);
  });

  it("the token goes only into the request header, never into the answer", async () => {
    const w = listenerWorld();
    w.call(
      { type: "naka-call", call: "contentById", contentId: 7 },
      { id: EXT },
    );
    w.call(
      { type: "naka-call", call: "contentById", contentId: 8 },
      { id: EXT },
    );
    await settle();
    expect(strings(w.answers).some((s) => s.includes(MARKER))).toBe(false);
    expect(w.api.calls[0]?.init.headers.authorization).toBe(`Bearer ${MARKER}`);
  });

  it.each([
    ["another extension", { id: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" }],
    ["no extension id", {}],
  ])("ignores a message from %s, unanswered", async (_name, sender) => {
    const w = listenerWorld();
    const msg = { type: "naka-call", call: "playlistIds" };
    expect(w.call(msg, sender)).toBe(false);
    await settle();
    expect(w.answers).toEqual([]);
    expect(w.api.calls).toEqual([]);
  });

  it("ignores a message it cannot parse, unanswered", async () => {
    const w = listenerWorld();
    expect(w.call({ type: "naka-call", call: "wipe" }, { id: EXT })).toBe(
      false,
    );
    expect(w.call({ type: "naka-ready" }, { id: EXT })).toBe(false);
    await settle();
    expect(w.answers).toEqual([]);
    expect(w.api.calls).toEqual([]);
  });

  it("checks the sender before it reads the message", () => {
    const read: string[] = [];
    const msg = new Proxy(
      { type: "naka-call", call: "playlistIds" },
      {
        get(target, key) {
          read.push(String(key));
          return Reflect.get(target, key);
        },
      },
    );
    const w = listenerWorld();
    w.call(msg, { id: "other" });
    expect(read).toEqual([]);
  });

  it("an answer channel that throws is swallowed", async () => {
    const api = fakeApi(() => json({ contentIds: [1], limit: 500 }));
    const client = createNakaClient({ fetch: api.fetch, token: () => MARKER });
    const listener = createTabListener(EXT, client, () => "77");
    const msg = { type: "naka-call", call: "playlistIds" };
    expect(
      listener(msg, { id: EXT }, () => {
        throw new Error("port closed");
      }),
    ).toBe(true);
    await settle();
  });
});

const PLAYER = (id: number) => `https://naka.cx/player?id=${id}&type=movie`;
const EPISODE = (id: number, season: number, episode: number) =>
  `https://naka.cx/player?id=${id}&type=tv&season=${season}&episode=${episode}`;
const SELF = { name: "the tab's window" };

function tab(start = PLAYER(3)) {
  const sent: ToWorker[] = [];
  const ended: ContentIds[] = [];
  const urls: (ContentIds | undefined)[] = [];
  const paths: string[] = [];
  const removals: number[] = [];
  const fichePaths: string[] = [];
  const ficheEvents: TitlePageEvent[] = [];
  const ficheLog: string[] = [];
  const timers: { ms: number; fn: () => void }[] = [];
  const pageListeners: ((ev: {
    source: unknown;
    origin: string;
    data: unknown;
  }) => void)[] = [];
  const clock = { now: 1_000_000 };
  const gestures = createGestureGate(() => clock.now);
  const page = {
    href: start,
    video: undefined as
      | { currentTime: number; duration: number; src: string }
      | undefined,
  };
  const env: TabEnv = {
    self: SELF,
    href: () => page.href,
    video: () => page.video,
    every: (ms, fn) => {
      timers.push({ ms, fn });
    },
    onPageMessage: (fn) => {
      pageListeners.push(fn);
    },
    send: (msg) => {
      sent.push(msg);
    },
    finished: (ids) => {
      ended.push(ids);
    },
    urlChanged: (ids) => {
      urls.push(ids);
    },
    pathChanged: (pathname) => {
      paths.push(pathname);
    },
    removed: (contentId) => {
      removals.push(contentId);
    },
    takeGesture: gestures.take,
    fiche: {
      path: (pathname) => {
        fichePaths.push(pathname);
        ficheLog.push(`path ${pathname}`);
      },
      event: (event) => {
        ficheEvents.push(event);
        ficheLog.push(`event ${event.kind}`);
      },
    },
  };
  startNakaTab(env);
  const tick = (ms: number) => {
    for (const timer of timers) if (timer.ms === ms) timer.fn();
  };
  // One counted sample at 10 % (no mark): the tracker knows the content of the URL really plays.
  const played = (src = "blob:played") => {
    page.video = { currentTime: 600, duration: 6000, src };
    tick(5000);
    page.video = undefined;
  };
  const post = (
    data: unknown,
    source: unknown = SELF,
    origin = "https://naka.cx",
  ) => {
    for (const fn of pageListeners) fn({ source, origin, data });
  };
  return {
    sent,
    ended,
    urls,
    paths,
    removals,
    fichePaths,
    ficheEvents,
    ficheLog,
    timers,
    page,
    tick,
    played,
    post,
    clock,
    gestures,
  };
}

describe("the Naka tab URL changes", () => {
  it("tells the ids at the first poll, and again only when they change", () => {
    const t = tab(PLAYER(3));
    expect(t.urls).toEqual([]);
    t.tick(1000);
    t.tick(1000);
    expect(t.urls).toEqual([{ contentId: 3 }]);
    t.page.href = PLAYER(4);
    t.tick(1000);
    t.tick(1000);
    expect(t.urls).toEqual([{ contentId: 3 }, { contentId: 4 }]);
  });

  it("tells an episode's ids, and tells when the player page is left", () => {
    const t = tab("https://naka.cx/player?id=5&type=tv&season=2&episode=3");
    t.tick(1000);
    t.page.href = "https://naka.cx/";
    t.tick(1000);
    t.tick(1000);
    expect(t.urls).toEqual([
      { contentId: 5, season: 2, episode: 3 },
      undefined,
    ]);
  });
});

describe("the Naka tab pathname", () => {
  it("is handed to the home block at every poll", () => {
    const t = tab("https://naka.cx/");
    expect(t.paths).toEqual([]);
    t.tick(1000);
    t.tick(1000);
    t.page.href = PLAYER(4);
    t.tick(1000);
    expect(t.paths).toEqual(["/", "/", "/player"]);
  });

  it("is empty for an href that is not a URL", () => {
    const t = tab("not a url");
    t.tick(1000);
    expect(t.paths).toEqual([""]);
  });
});

describe("the Naka tab", () => {
  it("says naka-ready once, when the page loads", () => {
    const t = tab();
    expect(t.sent).toEqual([{ type: "naka-ready" }]);
    for (let i = 0; i < 5; i++) {
      t.tick(1000);
      t.tick(5000);
    }
    expect(t.sent).toEqual([{ type: "naka-ready" }]);
  });

  it("reads the URL every second and the video every 5 seconds", () => {
    const t = tab();
    expect(t.timers.map((timer) => timer.ms).sort()).toEqual([1000, 5000]);
  });

  it("the end of the film playing gives a finished candidate", () => {
    const t = tab();
    t.page.video = { currentTime: 5990, duration: 6000, src: "blob:a" };
    t.tick(5000);
    expect(t.sent.slice(1)).toEqual([
      { type: "finished", source: "threshold", progress: 0.99, contentId: 3 },
    ]);
  });

  it("the threshold finished send calls the end block with the same ids", () => {
    const t = tab();
    t.page.video = { currentTime: 5990, duration: 6000, src: "blob:a" };
    t.tick(5000);
    expect(t.ended).toEqual([{ contentId: 3 }]);
  });

  it("the explicit finished send calls the end block with the same ids", () => {
    const t = tab(EPISODE(7, 1, 2));
    t.played();
    t.post({
      channel: PAGE_CHANNEL,
      kind: "watched",
      contentId: 7,
      season: 1,
      episode: 2,
    });
    expect(t.ended).toEqual([{ contentId: 7, season: 1, episode: 2 }]);
  });

  it("a removal event sends playlist-changed, then tells the removal block the id", () => {
    const t = tab();
    t.post({ channel: PAGE_CHANNEL, kind: "playlist", removed: 21391 });
    expect(t.sent.slice(1)).toEqual([{ type: "playlist-changed" }]);
    expect(t.removals).toEqual([21391]);
  });

  it("a playlist event with no removed id tells the removal block nothing", () => {
    const t = tab();
    t.post({ channel: PAGE_CHANNEL, kind: "playlist" });
    expect(t.removals).toEqual([]);
  });

  it("a send that is not a finished never calls the end block", () => {
    const t = tab();
    t.post({ channel: PAGE_CHANNEL, kind: "playlist" });
    expect(t.ended).toEqual([]);
  });

  it("a film left after 30 seconds gives nothing", () => {
    const t = tab();
    t.page.video = { currentTime: 30, duration: 7200, src: "blob:a" };
    t.tick(5000);
    expect(t.sent.slice(1)).toEqual([]);
  });

  it("a sample just after the URL changed counts for the new content, never the old one", () => {
    const t = tab(PLAYER(3));
    t.page.video = { currentTime: 10, duration: 6000, src: "blob:a" };
    t.tick(5000);
    t.page.href = PLAYER(4);
    t.page.video = { currentTime: 5990, duration: 6000, src: "blob:b" };
    t.tick(5000);
    expect(t.sent.slice(1)).toEqual([
      { type: "finished", source: "threshold", progress: 0.99, contentId: 4 },
    ]);
  });

  // The poll sees the page leave and come back between two samples: the source played before the
  // change is then stale, so it completes nothing; a sampler alone would not notice.
  it("the URL poll follows the page between samples", () => {
    const t = tab(PLAYER(3));
    t.page.video = { currentTime: 10, duration: 6000, src: "blob:a" };
    t.tick(5000);
    t.page.href = "https://naka.cx/content/movie/5";
    t.tick(1000);
    t.page.href = PLAYER(3);
    t.tick(1000);
    t.page.video = { currentTime: 5990, duration: 6000, src: "blob:a" };
    t.tick(5000);
    expect(t.sent.slice(1)).toEqual([]);
  });

  it("no video gives nothing", () => {
    const t = tab();
    t.tick(5000);
    expect(t.sent).toEqual([{ type: "naka-ready" }]);
  });

  it("a Ma liste change on the page asks for a sync", () => {
    const t = tab();
    t.post({ channel: PAGE_CHANNEL, kind: "playlist" });
    expect(t.sent.slice(1)).toEqual([{ type: "playlist-changed" }]);
  });

  it("an explicit vu of the episode playing gives one finished candidate", () => {
    const t = tab(EPISODE(7, 1, 2));
    t.played();
    const watched = {
      channel: PAGE_CHANNEL,
      kind: "watched",
      contentId: 7,
      season: 1,
      episode: 2,
    };
    t.post(watched);
    t.post(watched);
    expect(t.sent.slice(1)).toEqual([
      {
        type: "finished",
        source: "explicit",
        progress: 1,
        contentId: 7,
        season: 1,
        episode: 2,
      },
    ]);
  });

  it("an unticked vu asks the worker to forget that title, with its ids only", () => {
    const t = tab();
    t.post({
      channel: PAGE_CHANNEL,
      kind: "unwatched",
      contentId: 7,
      season: 1,
      episode: 2,
    });
    expect(t.sent.slice(1)).toEqual([
      { type: "forget-handled", contentId: 7, season: 1, episode: 2 },
    ]);
    expect(t.ended).toEqual([]);
  });

  it("an unticked film asks for the film", () => {
    const t = tab();
    t.post({ channel: PAGE_CHANNEL, kind: "unwatched", contentId: 7 });
    expect(t.sent.slice(1)).toEqual([{ type: "forget-handled", contentId: 7 }]);
  });

  it("a forged vu for a title that is not playing sends nothing", () => {
    const t = tab(PLAYER(3));
    t.tick(1000);
    t.post({ channel: PAGE_CHANNEL, kind: "watched", contentId: 4242 });
    t.post({
      channel: PAGE_CHANNEL,
      kind: "watched",
      contentId: 4243,
      season: 1,
      episode: 1,
    });
    expect(t.sent.slice(1)).toEqual([]);
    expect(t.ended).toEqual([]);
  });

  it("a vu off the player page sends nothing", () => {
    const t = tab("https://naka.cx/content/movie/3");
    t.tick(1000);
    t.post({ channel: PAGE_CHANNEL, kind: "watched", contentId: 3 });
    expect(t.sent.slice(1)).toEqual([]);
  });

  it("the episode just opened, before the next poll, counts with the click that ticked it", () => {
    const t = tab(EPISODE(7, 1, 2));
    t.played();
    t.page.href = EPISODE(7, 1, 3);
    t.gestures.note({ type: "click", isTrusted: true });
    const watched = { channel: PAGE_CHANNEL, kind: "watched", contentId: 7 };
    t.post({ ...watched, season: 1, episode: 3 });
    t.tick(1000);
    t.post({ ...watched, season: 1, episode: 2 });
    expect(t.sent.slice(1)).toEqual([
      {
        type: "finished",
        source: "explicit",
        progress: 1,
        contentId: 7,
        season: 1,
        episode: 3,
      },
    ]);
  });

  it("a vu off the player counts right after a real click", () => {
    const t = tab("https://naka.cx/content/tv/2004");
    t.tick(1000);
    t.gestures.note({ type: "click", isTrusted: true });
    t.clock.now += 400;
    t.post({
      channel: PAGE_CHANNEL,
      kind: "watched",
      contentId: 1428,
      season: 1,
      episode: 2,
    });
    expect(t.sent.slice(1)).toEqual([
      {
        type: "finished",
        source: "explicit",
        progress: 1,
        contentId: 1428,
        season: 1,
        episode: 2,
      },
    ]);
    expect(t.ended).toEqual([{ contentId: 1428, season: 1, episode: 2 }]);
  });

  it("a vu for another episode, in the player, counts right after a real click", () => {
    const t = tab(EPISODE(7, 1, 2));
    t.tick(1000);
    t.gestures.note({ type: "pointerup", isTrusted: true });
    t.post({
      channel: PAGE_CHANNEL,
      kind: "watched",
      contentId: 7,
      season: 1,
      episode: 5,
    });
    expect(t.sent.slice(1).map((m) => m.type)).toEqual(["finished"]);
  });

  it("a vu off the player, after the gesture window, sends nothing", () => {
    const t = tab("https://naka.cx/content/movie/3");
    t.gestures.note({ type: "click", isTrusted: true });
    t.clock.now += GESTURE_WINDOW_MS + 1;
    t.post({ channel: PAGE_CHANNEL, kind: "watched", contentId: 3 });
    expect(t.sent.slice(1)).toEqual([]);
  });

  it("a click made up by the page never lets a vu off the player through", () => {
    const t = tab("https://naka.cx/content/movie/3");
    t.gestures.note({ type: "click", isTrusted: false });
    t.post({ channel: PAGE_CHANNEL, kind: "watched", contentId: 3 });
    expect(t.sent.slice(1)).toEqual([]);
  });

  it("one real click lets only one forged vu through", () => {
    const t = tab("https://naka.cx/");
    t.gestures.note({ type: "click", isTrusted: true });
    for (const contentId of [11, 12, 13]) {
      t.post({ channel: PAGE_CHANNEL, kind: "watched", contentId });
    }
    expect(t.sent.slice(1)).toEqual([
      { type: "finished", source: "explicit", progress: 1, contentId: 11 },
    ]);
  });

  it("a page that pushStates to another id gets no vu without a sample or a click", () => {
    const t = tab(PLAYER(3));
    t.played("blob:3");
    t.page.href = PLAYER(50);
    t.post({ channel: PAGE_CHANNEL, kind: "watched", contentId: 50 });
    t.tick(1000);
    t.post({ channel: PAGE_CHANNEL, kind: "watched", contentId: 50 });
    expect(t.sent.slice(1)).toEqual([]);
  });

  it("the new id's vu counts once a sample of it counted", () => {
    const t = tab(PLAYER(3));
    t.played("blob:3");
    t.page.href = PLAYER(50);
    t.played("blob:50");
    t.post({ channel: PAGE_CHANNEL, kind: "watched", contentId: 50 });
    expect(t.sent.slice(1)).toEqual([
      { type: "finished", source: "explicit", progress: 1, contentId: 50 },
    ]);
  });

  it("two real clicks on two episodes of the fiche give two finishes", () => {
    const t = tab("https://naka.cx/content/tv/2004");
    t.gestures.note({ type: "click", isTrusted: true });
    t.clock.now += 600;
    t.gestures.note({ type: "click", isTrusted: true });
    t.clock.now += 300;
    const watched = { channel: PAGE_CHANNEL, kind: "watched", contentId: 1428 };
    t.post({ ...watched, season: 1, episode: 1 });
    t.post({ ...watched, season: 1, episode: 2 });
    t.post({ ...watched, season: 1, episode: 3 });
    expect(
      t.sent.slice(1).map((m) => m.type === "finished" && m.episode),
    ).toEqual([1, 2]);
  });

  it("the playing title's vu uses up the click that made it", () => {
    const t = tab(PLAYER(3));
    t.played();
    t.gestures.note({ type: "click", isTrusted: true });
    t.post({ channel: PAGE_CHANNEL, kind: "watched", contentId: 3 });
    t.post({ channel: PAGE_CHANNEL, kind: "watched", contentId: 4242 });
    expect(t.sent.slice(1)).toEqual([
      { type: "finished", source: "explicit", progress: 1, contentId: 3 },
    ]);
  });

  it("after an unticked vu, the next tick of that title gives a finished again", () => {
    const t = tab(PLAYER(7));
    t.played();
    const on = { channel: PAGE_CHANNEL, kind: "watched", contentId: 7 };
    t.post(on);
    t.post({ ...on, kind: "unwatched" });
    t.post(on);
    expect(t.sent.slice(1).map((m) => m.type)).toEqual([
      "finished",
      "forget-handled",
      "finished",
    ]);
  });

  it("an unwatched event from another origin or window sends nothing", () => {
    const t = tab();
    const off = { channel: PAGE_CHANNEL, kind: "unwatched", contentId: 7 };
    t.post(off, {}, "https://naka.cx");
    t.post(off, SELF, "https://naka.cx.evil.com");
    expect(t.sent).toEqual([{ type: "naka-ready" }]);
  });

  it.each([
    [
      "another window",
      { channel: PAGE_CHANNEL, kind: "playlist" },
      {},
      "https://naka.cx",
    ],
    [
      "another origin",
      { channel: PAGE_CHANNEL, kind: "playlist" },
      SELF,
      "https://naka.cx.evil.com",
    ],
    [
      "another channel",
      { channel: "other", kind: "playlist" },
      SELF,
      "https://naka.cx",
    ],
    [
      "a malformed event",
      { channel: PAGE_CHANNEL, kind: "watched" },
      SELF,
      "https://naka.cx",
    ],
  ])("ignores a page message from %s", (_name, data, source, origin) => {
    const t = tab();
    t.post(data, source, origin);
    expect(t.sent).toEqual([{ type: "naka-ready" }]);
  });
});

describe("the video sample", () => {
  it("is the first video's position, duration and current source", () => {
    const video = {
      currentTime: 12,
      duration: 3600,
      currentSrc: "blob:x",
      src: "",
    };
    const asked: string[] = [];
    const doc = {
      querySelector: (selector: string) => {
        asked.push(selector);
        return video;
      },
    };
    expect(readVideo(doc)).toEqual({
      currentTime: 12,
      duration: 3600,
      src: "blob:x",
    });
    expect(asked).toEqual(["video"]);
  });

  it("is absent without a video", () => {
    expect(readVideo({ querySelector: () => null })).toBeUndefined();
  });

  it("is absent when the element cannot be read", () => {
    const doc = {
      querySelector: () => {
        throw new Error("detached");
      },
    };
    expect(readVideo(doc)).toBeUndefined();
  });
});

describe("the Naka tab at the credits", () => {
  it("a credits start from the page ends the film there, once, sends nothing by itself", () => {
    const t = tab();
    t.tick(1000); // the URL poll: the film is playing when the page learns its credits
    t.post({ channel: PAGE_CHANNEL, kind: "credits", startMs: 5_400_000 });
    expect(t.sent.slice(1)).toEqual([]);
    t.page.video = { currentTime: 5401, duration: 6000, src: "blob:a" };
    t.tick(5000);
    t.tick(5000);
    expect(t.sent.slice(1)).toEqual([
      {
        type: "finished",
        source: "credits",
        progress: 5401 / 6000,
        contentId: 3,
      },
    ]);
    expect(t.ended).toEqual([{ contentId: 3 }]);
  });

  it("a credits event from another window is ignored", () => {
    const t = tab();
    t.post({ channel: PAGE_CHANNEL, kind: "credits", startMs: 5_400_000 }, {});
    t.page.video = { currentTime: 5401, duration: 6000, src: "blob:a" };
    t.tick(5000);
    expect(t.sent.slice(1)).toEqual([
      { type: "finished", source: "threshold", progress: 0.9, contentId: 3 },
    ]);
  });
});

describe("the title page events", () => {
  const fiche = {
    channel: PAGE_CHANNEL,
    kind: "fiche",
    contentId: 6,
    tmdbId: 9006,
    mediaType: "tv",
    title: "Dark",
  };

  it("hands the pathname to the fiche controller at every poll", () => {
    const t = tab("https://naka.cx/content/tv/9006");
    t.tick(1000);
    t.tick(1000);
    expect(t.fichePaths).toEqual(["/content/tv/9006", "/content/tv/9006"]);
  });

  it("hands the fiche and season events to the controller, and sends nothing", () => {
    const t = tab("https://naka.cx/content/tv/9006");
    t.post(fiche);
    t.post({ channel: PAGE_CHANNEL, kind: "season", contentId: 6, season: 2 });
    expect(t.ficheEvents).toEqual([
      fiche,
      { channel: PAGE_CHANNEL, kind: "season", contentId: 6, season: 2 },
    ]);
    expect(t.sent).toEqual([{ type: "naka-ready" }]);
  });

  it("hands the address before an event posted before the next poll", () => {
    const t = tab(PLAYER(3));
    t.tick(1000);
    t.page.href = "https://naka.cx/content/tv/9006";
    t.post(fiche);
    expect(t.ficheLog).toEqual([
      "path /player",
      "path /content/tv/9006",
      "event fiche",
    ]);
  });

  it("hands over no fiche event from another window", () => {
    const t = tab("https://naka.cx/content/tv/9006");
    t.post(fiche, { name: "a frame" });
    expect(t.ficheEvents).toEqual([]);
  });
});

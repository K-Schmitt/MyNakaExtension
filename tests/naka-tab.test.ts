import { describe, expect, it } from "vitest";
import { startNakaTab, type TabEnv } from "../src/content/naka-tab";
import { createTabListener } from "../src/content/naka-tab-listener";
import { readVideo } from "../src/content/video-sample";
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
const SELF = { name: "the tab's window" };

function tab(start = PLAYER(3)) {
  const sent: ToWorker[] = [];
  const timers: { ms: number; fn: () => void }[] = [];
  const pageListeners: ((ev: {
    source: unknown;
    origin: string;
    data: unknown;
  }) => void)[] = [];
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
  };
  startNakaTab(env);
  const tick = (ms: number) => {
    for (const timer of timers) if (timer.ms === ms) timer.fn();
  };
  const post = (
    data: unknown,
    source: unknown = SELF,
    origin = "https://naka.cx",
  ) => {
    for (const fn of pageListeners) fn({ source, origin, data });
  };
  return { sent, timers, page, tick, post };
}

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
  // change is then stale (B8, Ruling 10), so it completes nothing; a sampler alone would not notice.
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

  it("an explicit vu gives one finished candidate", () => {
    const t = tab();
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

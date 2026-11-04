import { describe, expect, it } from "vitest";
import {
  isTrustedSender,
  parseNakaReply,
  parsePageEvent,
  parseToNakaTab,
  parseToWorker,
} from "../src/ext/messages";

const ID = "abcdefghijklmnopabcdefghijklmnop";
const CH = "mynaka/1";

describe("parseToWorker", () => {
  it("accepts the bare messages", () => {
    for (const type of ["naka-ready", "playlist-changed", "status", "resync"]) {
      expect(parseToWorker({ type })).toEqual({ type });
    }
  });

  it("accepts set-mode for both modes only", () => {
    expect(parseToWorker({ type: "set-mode", mode: "live" })).toEqual({
      type: "set-mode",
      mode: "live",
    });
    expect(parseToWorker({ type: "set-mode", mode: "simulation" })).toEqual({
      type: "set-mode",
      mode: "simulation",
    });
    for (const mode of ["LIVE", "", undefined, 1, null]) {
      expect(parseToWorker({ type: "set-mode", mode })).toBeUndefined();
    }
  });

  it("accepts finished with and without season/episode", () => {
    const base = { type: "finished", source: "threshold", progress: 0.9 };
    expect(parseToWorker({ ...base, contentId: 5 })).toEqual({
      ...base,
      contentId: 5,
    });
    expect(
      parseToWorker({
        ...base,
        source: "explicit",
        contentId: 5,
        season: 2,
        episode: 3,
      }),
    ).toEqual({
      ...base,
      source: "explicit",
      contentId: 5,
      season: 2,
      episode: 3,
    });
  });

  it("accepts progress at the bounds 0 and 1", () => {
    for (const progress of [0, 1]) {
      const m = parseToWorker({
        type: "finished",
        source: "explicit",
        progress,
        contentId: 1,
      });
      expect(m).toMatchObject({ progress });
    }
  });

  it("drops unknown keys", () => {
    const m = parseToWorker({ type: "status", token: "x" });
    expect(m).toEqual({ type: "status" });
    const f = parseToWorker({
      type: "finished",
      source: "explicit",
      progress: 1,
      contentId: 1,
      token: "x",
    });
    expect(Object.keys(f ?? {}).sort()).toEqual([
      "contentId",
      "progress",
      "source",
      "type",
    ]);
  });

  const good = {
    type: "finished",
    source: "threshold",
    progress: 0.5,
    contentId: 7,
  };
  const bad: [string, unknown][] = [
    ["progress -0.01", { ...good, progress: -0.01 }],
    ["progress 1.01", { ...good, progress: 1.01 }],
    ["progress NaN", { ...good, progress: Number.NaN }],
    ["progress Infinity", { ...good, progress: Number.POSITIVE_INFINITY }],
    ["progress string", { ...good, progress: "0.5" }],
    ["progress missing", { ...good, progress: undefined }],
    ["source unknown", { ...good, source: "other" }],
    ["source missing", { ...good, source: undefined }],
    ["contentId 0", { ...good, contentId: 0 }],
    ["contentId negative", { ...good, contentId: -1 }],
    ["contentId float", { ...good, contentId: 1.5 }],
    ["contentId unsafe", { ...good, contentId: 2 ** 53 }],
    ["contentId string", { ...good, contentId: "7" }],
    ["contentId missing", { ...good, contentId: undefined }],
    ["season 0", { ...good, season: 0 }],
    ["season float", { ...good, season: 1.5 }],
    ["season string", { ...good, season: "1" }],
    ["season null", { ...good, season: null }],
    ["episode 0", { ...good, episode: 0 }],
    ["episode float", { ...good, episode: 2.5 }],
    ["episode unsafe", { ...good, episode: 2 ** 53 }],
    ["episode null", { ...good, episode: null }],
  ];
  it.each(bad)("rejects %s", (_name, value) => {
    expect(parseToWorker(value)).toBeUndefined();
  });

  it("rejects non-objects and unknown types", () => {
    for (const v of [
      undefined,
      null,
      1,
      "status",
      [],
      [{ type: "status" }],
      {},
      { type: "nope" },
      { type: 1 },
      { type: "naka-call", call: "playlistIds" },
    ]) {
      expect(parseToWorker(v)).toBeUndefined();
    }
  });

  it("never throws on hostile input", () => {
    const hostile = {
      get type(): string {
        throw new Error("boom");
      },
    };
    expect(parseToWorker(hostile)).toBeUndefined();
    expect(
      parseToWorker(
        new Proxy(
          {},
          {
            get() {
              throw new Error("x");
            },
            ownKeys() {
              throw new Error("x");
            },
          },
        ),
      ),
    ).toBeUndefined();
  });
});

describe("parseToNakaTab", () => {
  it("accepts playlistIds", () => {
    expect(parseToNakaTab({ type: "naka-call", call: "playlistIds" })).toEqual({
      type: "naka-call",
      call: "playlistIds",
    });
  });

  it("accepts the id calls", () => {
    for (const call of ["add", "remove", "contentById"]) {
      expect(parseToNakaTab({ type: "naka-call", call, contentId: 9 })).toEqual(
        {
          type: "naka-call",
          call,
          contentId: 9,
        },
      );
    }
  });

  it("accepts search and trims the query", () => {
    expect(
      parseToNakaTab({ type: "naka-call", call: "search", query: "  dune  " }),
    ).toEqual({
      type: "naka-call",
      call: "search",
      query: "dune",
    });
  });

  it("accepts naka-account", () => {
    expect(parseToNakaTab({ type: "naka-account" })).toEqual({
      type: "naka-account",
    });
  });

  it("applies the query bounds", () => {
    const q = (query: unknown) =>
      parseToNakaTab({ type: "naka-call", call: "search", query });
    expect(q("a")).toBeDefined();
    expect(q("a".repeat(200))).toBeDefined();
    expect(q("a".repeat(201))).toBeUndefined();
    expect(q(`  ${"a".repeat(200)}  `)).toBeDefined();
    expect(q("")).toBeUndefined();
    expect(q("   ")).toBeUndefined();
    expect(q(5)).toBeUndefined();
    expect(q(undefined)).toBeUndefined();
    expect(q("\ud800")).toBeUndefined();
  });

  const idCall = (contentId: unknown, call = "add") =>
    parseToNakaTab({ type: "naka-call", call, contentId });
  it("rejects bad content ids", () => {
    for (const v of [0, -1, 1.5, 2 ** 53, "3", null, undefined, Number.NaN]) {
      expect(idCall(v)).toBeUndefined();
      expect(idCall(v, "contentById")).toBeUndefined();
      expect(idCall(v, "remove")).toBeUndefined();
    }
  });

  it("rejects unknown calls, types and shapes", () => {
    for (const v of [
      undefined,
      null,
      "naka-account",
      [],
      {},
      { type: "naka-call" },
      { type: "naka-call", call: "delete", contentId: 1 },
      { type: "naka-call", call: 1 },
      { type: "other", call: "playlistIds" },
      { type: "status" },
    ]) {
      expect(parseToNakaTab(v)).toBeUndefined();
    }
  });

  it("drops unknown keys", () => {
    expect(
      parseToNakaTab({ type: "naka-call", call: "playlistIds", token: "t" }),
    ).toEqual({
      type: "naka-call",
      call: "playlistIds",
    });
    expect(
      parseToNakaTab({
        type: "naka-call",
        call: "add",
        contentId: 1,
        token: "t",
      }),
    ).toEqual({
      type: "naka-call",
      call: "add",
      contentId: 1,
    });
  });

  it("never throws", () => {
    const hostile = {
      get type(): string {
        throw new Error("boom");
      },
    };
    expect(parseToNakaTab(hostile)).toBeUndefined();
  });
});

describe("parseNakaReply", () => {
  it("accepts ok with any value", () => {
    expect(parseNakaReply({ ok: true, value: [1, 2] })).toEqual({
      ok: true,
      value: [1, 2],
    });
    expect(parseNakaReply({ ok: true, value: null })).toEqual({
      ok: true,
      value: null,
    });
  });

  it("accepts the three errors", () => {
    for (const error of ["no-token", "unavailable", "not-found"]) {
      expect(parseNakaReply({ ok: false, error })).toEqual({
        ok: false,
        error,
      });
    }
  });

  it("rejects unknown errors and bad shapes", () => {
    for (const v of [
      undefined,
      null,
      "x",
      [],
      {},
      { ok: false },
      { ok: false, error: "boom" },
      { ok: false, error: 1 },
      { ok: "true", value: 1 },
      { ok: 1, value: 1 },
      { value: 1 },
    ]) {
      expect(parseNakaReply(v)).toBeUndefined();
    }
  });

  it("never carries a token or any extra key", () => {
    const okReply = parseNakaReply({
      ok: true,
      value: 1,
      token: "T",
      authorization: "Bearer T",
    });
    expect(Object.keys(okReply ?? {}).sort()).toEqual(["ok", "value"]);
    const errReply = parseNakaReply({
      ok: false,
      error: "no-token",
      token: "T",
      value: 1,
    });
    expect(Object.keys(errReply ?? {}).sort()).toEqual(["error", "ok"]);
    expect(JSON.stringify(okReply)).not.toContain('T"');
    expect(errReply).not.toHaveProperty("token");
  });

  it("never throws", () => {
    const hostile = {
      get ok(): boolean {
        throw new Error("boom");
      },
    };
    expect(parseNakaReply(hostile)).toBeUndefined();
  });
});

describe("parsePageEvent", () => {
  it("accepts playlist", () => {
    expect(parsePageEvent({ channel: CH, kind: "playlist" })).toEqual({
      channel: CH,
      kind: "playlist",
    });
  });

  it("accepts watched with and without season/episode", () => {
    expect(
      parsePageEvent({ channel: CH, kind: "watched", contentId: 4 }),
    ).toEqual({
      channel: CH,
      kind: "watched",
      contentId: 4,
    });
    expect(
      parsePageEvent({
        channel: CH,
        kind: "watched",
        contentId: 4,
        season: 1,
        episode: 2,
      }),
    ).toEqual({
      channel: CH,
      kind: "watched",
      contentId: 4,
      season: 1,
      episode: 2,
    });
  });

  const w = { channel: CH, kind: "watched", contentId: 4 };
  const bad: [string, unknown][] = [
    ["wrong channel", { ...w, channel: "mynaka/2" }],
    ["missing channel", { kind: "playlist" }],
    ["channel prefix", { ...w, channel: "mynaka/1/" }],
    ["unknown kind", { channel: CH, kind: "playback" }],
    ["missing kind", { channel: CH }],
    ["contentId 0", { ...w, contentId: 0 }],
    ["contentId float", { ...w, contentId: 1.5 }],
    ["contentId string", { ...w, contentId: "4" }],
    ["contentId missing", { channel: CH, kind: "watched" }],
    ["season 0", { ...w, season: 0 }],
    ["season float", { ...w, season: 1.5 }],
    ["episode 0", { ...w, episode: 0 }],
    ["episode string", { ...w, episode: "1" }],
    ["episode null", { ...w, episode: null }],
  ];
  it.each(bad)("rejects %s", (_n, v) => {
    expect(parsePageEvent(v)).toBeUndefined();
  });

  it("rejects non-objects and drops unknown keys", () => {
    for (const v of [undefined, null, 1, "x", [], {}]) {
      expect(parsePageEvent(v)).toBeUndefined();
    }
    expect(
      parsePageEvent({ channel: CH, kind: "playlist", token: "t" }),
    ).toEqual({
      channel: CH,
      kind: "playlist",
    });
  });

  it("never throws", () => {
    const hostile = {
      get channel(): string {
        throw new Error("boom");
      },
    };
    expect(parsePageEvent(hostile)).toBeUndefined();
  });
});

describe("isTrustedSender", () => {
  const tab = (url?: string) => ({ id: ID, tab: { url }, url });

  it("accepts a Naka tab of this extension", () => {
    expect(
      isTrustedSender({ id: ID, tab: { url: "https://naka.cx/" } }, ID),
    ).toBe("naka-tab");
    expect(
      isTrustedSender(
        { id: ID, tab: { url: "https://naka.cx/watch/1?x=2" } },
        ID,
      ),
    ).toBe("naka-tab");
  });

  it("rejects look-alike and insecure origins", () => {
    for (const url of [
      "https://naka.cx.evil.com/",
      "https://naka.cx",
      "http://naka.cx/",
      "https://evilnaka.cx/",
      "https://www.naka.cx/",
      "https://naka.cx@evil.com/",
      "",
      undefined,
    ]) {
      expect(isTrustedSender({ id: ID, tab: { url } }, ID)).toBeUndefined();
    }
  });

  it("rejects a Naka tab of another extension, or without an id", () => {
    expect(
      isTrustedSender({ id: "other", tab: { url: "https://naka.cx/" } }, ID),
    ).toBeUndefined();
    expect(
      isTrustedSender({ tab: { url: "https://naka.cx/" } }, ID),
    ).toBeUndefined();
  });

  it("accepts the status page, with no tab", () => {
    const url = `chrome-extension://${ID}/status.html`;
    expect(isTrustedSender({ id: ID, url }, ID)).toBe("status-page");
  });

  it("rejects the status page of another extension or another page", () => {
    expect(
      isTrustedSender(
        { id: ID, url: "chrome-extension://other/status.html" },
        ID,
      ),
    ).toBeUndefined();
    expect(
      isTrustedSender(
        { id: ID, url: `chrome-extension://${ID}/other.html` },
        ID,
      ),
    ).toBeUndefined();
    expect(
      isTrustedSender(
        { id: ID, url: `chrome-extension://${ID}/status.html?x=1` },
        ID,
      ),
    ).toBeUndefined();
    expect(
      isTrustedSender(
        { id: ID, url: `chrome-extension://${ID}/status.htmlx` },
        ID,
      ),
    ).toBeUndefined();
  });

  it("rejects the status page url when a tab is attached", () => {
    const url = `chrome-extension://${ID}/status.html`;
    expect(isTrustedSender({ id: ID, url, tab: { url } }, ID)).toBeUndefined();
    expect(isTrustedSender({ id: ID, url, tab: {} }, ID)).toBeUndefined();
  });

  it("rejects the status page url from another extension id", () => {
    const url = `chrome-extension://${ID}/status.html`;
    expect(isTrustedSender({ id: "other", url }, ID)).toBeUndefined();
    expect(isTrustedSender({ url }, ID)).toBeUndefined();
  });

  it("rejects an empty sender", () => {
    expect(isTrustedSender({}, ID)).toBeUndefined();
    expect(isTrustedSender(tab(undefined), ID)).toBeUndefined();
  });

  it("does not trust a Naka sender.url without a tab", () => {
    expect(
      isTrustedSender({ id: ID, url: "https://naka.cx/" }, ID),
    ).toBeUndefined();
  });
});

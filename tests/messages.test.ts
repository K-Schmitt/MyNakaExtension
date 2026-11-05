import { describe, expect, it } from "vitest";
import {
  allowedFor,
  isTrustedSender,
  parseNakaReply,
  parsePageEvent,
  parseToNakaTab,
  parseToWorker,
  type SenderRole,
  type ToWorker,
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

describe("rating messages", () => {
  const ROW = { contentId: 5, season: 2, episode: 3 };

  it("rating-card takes ids, with a season and episode pair or none", () => {
    expect(parseToWorker({ type: "rating-card", contentId: 5 })).toEqual({
      type: "rating-card",
      contentId: 5,
    });
    expect(
      parseToWorker({ type: "rating-card", ...ROW, extra: 1, token: "x" }),
    ).toEqual({ type: "rating-card", ...ROW });
    for (const bad of [
      { contentId: 5, season: 2 },
      { contentId: 5, episode: 3 },
      { contentId: 0 },
      { contentId: 5, season: 0, episode: 1 },
      {},
    ]) {
      expect(parseToWorker({ type: "rating-card", ...bad })).toBeUndefined();
    }
  });

  it("rating-cards is bare, and drops extra keys", () => {
    expect(parseToWorker({ type: "rating-cards", x: 1 })).toEqual({
      type: "rating-cards",
    });
  });

  it.each([1, 7, 10])("rate accepts the rating %s", (rating) => {
    expect(
      parseToWorker({ type: "rate", ...ROW, label: "épisode", rating }),
    ).toEqual({ type: "rate", ...ROW, label: "épisode", rating });
  });

  it.each([0, 11, 7.5, "7", null, undefined, -1, Number.NaN, 1e9])(
    "rate rejects the rating %j",
    (rating) => {
      expect(
        parseToWorker({ type: "rate", contentId: 5, label: "film", rating }),
      ).toBeUndefined();
    },
  );

  it.each(["season", "Film", "", 1, null, undefined, "serie"])(
    "rate and dismiss-rating reject the label %j",
    (label) => {
      expect(
        parseToWorker({ type: "rate", contentId: 5, label, rating: 7 }),
      ).toBeUndefined();
      expect(
        parseToWorker({ type: "dismiss-rating", contentId: 5, label }),
      ).toBeUndefined();
    },
  );

  it.each(["film", "épisode", "saison", "série"])(
    "accepts the label %s",
    (label) => {
      expect(
        parseToWorker({ type: "dismiss-rating", contentId: 5, label }),
      ).toEqual({ type: "dismiss-rating", contentId: 5, label });
    },
  );

  it("rate and dismiss-rating drop extra keys", () => {
    expect(
      parseToWorker({
        type: "rate",
        contentId: 5,
        label: "film",
        rating: 7,
        productId: 99,
        token: "x",
      }),
    ).toEqual({ type: "rate", contentId: 5, label: "film", rating: 7 });
    expect(
      parseToWorker({
        type: "dismiss-rating",
        contentId: 5,
        label: "film",
        productId: 99,
      }),
    ).toEqual({ type: "dismiss-rating", contentId: 5, label: "film" });
  });

  it("a half season/episode pair rejects rate and dismiss-rating", () => {
    expect(
      parseToWorker({
        type: "rate",
        contentId: 5,
        season: 1,
        label: "film",
        rating: 7,
      }),
    ).toBeUndefined();
    expect(
      parseToWorker({
        type: "dismiss-rating",
        contentId: 5,
        episode: 1,
        label: "film",
      }),
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

  it("accepts the five errors", () => {
    for (const error of [
      "no-token",
      "session",
      "rate-limit",
      "unavailable",
      "not-found",
    ]) {
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

  it("drops unknown top-level keys, and builds the exact reply", () => {
    const value = { nested: [1] };
    expect(
      parseNakaReply({
        ok: true,
        value,
        token: "T",
        authorization: "Bearer T",
      }),
    ).toStrictEqual({ ok: true, value });
    expect(
      parseNakaReply({ ok: false, error: "no-token", token: "T", value: 1 }),
    ).toStrictEqual({ ok: false, error: "no-token" });
  });

  it("accepts the void reply, without a value key", () => {
    expect(parseNakaReply({ ok: true })).toStrictEqual({ ok: true });
    expect(parseNakaReply({ ok: true, value: undefined })).toStrictEqual({
      ok: true,
    });
  });

  it("passes value through by reference, untouched", () => {
    const value = { token: "kept: the worker re-validates it" };
    const reply = parseNakaReply({ ok: true, value });
    expect(reply).toMatchObject({ ok: true });
    expect((reply as { value: unknown }).value).toBe(value);
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

describe("finished: F5 rules", () => {
  const base = { type: "finished", source: "explicit", contentId: 3 };

  it("maps a progress of -0 to 0", () => {
    const m = parseToWorker({ ...base, progress: -0 });
    expect(m).toMatchObject({ progress: 0 });
    expect(Object.is((m as { progress: number }).progress, 0)).toBe(true);
  });

  it("rejects 1e21 as an id", () => {
    expect(
      parseToWorker({ ...base, progress: 1, contentId: 1e21 }),
    ).toBeUndefined();
    expect(
      parseToNakaTab({ type: "naka-call", call: "add", contentId: 1e21 }),
    ).toBeUndefined();
    expect(
      parsePageEvent({ channel: CH, kind: "watched", contentId: 1e21 }),
    ).toBeUndefined();
  });

  it("rejects a season without an episode, and the reverse", () => {
    expect(parseToWorker({ ...base, progress: 1, season: 1 })).toBeUndefined();
    expect(parseToWorker({ ...base, progress: 1, episode: 1 })).toBeUndefined();
    expect(
      parseToWorker({ ...base, progress: 1, season: 1, episode: undefined }),
    ).toBeUndefined();
  });

  it("accepts both or neither", () => {
    expect(
      parseToWorker({ ...base, progress: 1, season: 1, episode: 2 }),
    ).toBeDefined();
    expect(parseToWorker({ ...base, progress: 1 })).toBeDefined();
  });
});

describe("watched page event: pair rule", () => {
  const w = { channel: CH, kind: "watched", contentId: 4 };

  it("rejects a partial season/episode pair", () => {
    expect(parsePageEvent({ ...w, season: 1 })).toBeUndefined();
    expect(parsePageEvent({ ...w, episode: 1 })).toBeUndefined();
  });

  it("accepts both or neither", () => {
    expect(parsePageEvent({ ...w, season: 1, episode: 1 })).toBeDefined();
    expect(parsePageEvent(w)).toBeDefined();
  });
});

describe("isTrustedSender", () => {
  const NAKA = "https://naka.cx/";
  const STATUS = `chrome-extension://${ID}/status.html`;
  const naka = (over: Record<string, unknown> = {}) => ({
    id: ID,
    frameId: 0,
    url: `${NAKA}watch/1`,
    tab: { url: NAKA },
    ...over,
  });

  it("accepts the top frame of a Naka tab", () => {
    expect(isTrustedSender(naka(), ID)).toBe("naka-tab");
    expect(
      isTrustedSender(naka({ tab: { url: `${NAKA}watch/1?x=2` } }), ID),
    ).toBe("naka-tab");
  });

  it("rejects look-alike and insecure tab urls", () => {
    for (const url of [
      "https://naka.cx.evil.com/",
      "https://naka.cx",
      "http://naka.cx/",
      "https://evilnaka.cx/",
      "https://www.naka.cx/",
      "https://naka.cx@evil.com/",
      "https://naka.cx:8443/",
      "HTTPS://NAKA.CX/",
      "https://NAKA.cx/",
      "",
      undefined,
    ]) {
      expect(isTrustedSender(naka({ tab: { url } }), ID)).toBeUndefined();
    }
  });

  it("rejects look-alike sender urls on a Naka tab", () => {
    for (const url of [
      "https://evil.example/",
      "https://naka.cx.evil.com/",
      "https://naka.cx",
      "http://naka.cx/",
      "https://naka.cx:8443/",
      "HTTPS://NAKA.CX/",
      "",
      undefined,
    ]) {
      expect(isTrustedSender(naka({ url }), ID)).toBeUndefined();
    }
  });

  it("rejects an iframe whose tab and frame are both on naka.cx", () => {
    expect(isTrustedSender(naka({ frameId: 3 }), ID)).toBeUndefined();
  });

  it("rejects a missing or non-zero frameId", () => {
    expect(isTrustedSender(naka({ frameId: undefined }), ID)).toBeUndefined();
    expect(isTrustedSender(naka({ frameId: 1 }), ID)).toBeUndefined();
    expect(isTrustedSender(naka({ frameId: -1 }), ID)).toBeUndefined();
  });

  it("rejects a top frame whose sender.url is another origin", () => {
    expect(
      isTrustedSender(naka({ url: "https://evil.example/" }), ID),
    ).toBeUndefined();
  });

  it("rejects a Naka tab of another extension, or without an id", () => {
    expect(isTrustedSender(naka({ id: "other" }), ID)).toBeUndefined();
    expect(isTrustedSender(naka({ id: undefined }), ID)).toBeUndefined();
  });

  it("accepts the status page with no tab", () => {
    expect(isTrustedSender({ id: ID, url: STATUS }, ID)).toBe("status-page");
  });

  it("accepts the status page opened in a tab", () => {
    expect(
      isTrustedSender(
        { id: ID, frameId: 0, url: STATUS, tab: { url: STATUS } },
        ID,
      ),
    ).toBe("status-page");
  });

  it("rejects the status url in a tab with another or no url", () => {
    expect(
      isTrustedSender({ id: ID, url: STATUS, tab: { url: NAKA } }, ID),
    ).toBeUndefined();
    expect(
      isTrustedSender({ id: ID, url: STATUS, tab: {} }, ID),
    ).toBeUndefined();
    expect(
      isTrustedSender({ id: ID, url: STATUS, tab: { url: "" } }, ID),
    ).toBeUndefined();
  });

  it("rejects a status url with a query or fragment, or lookalikes", () => {
    for (const url of [
      `${STATUS}?x`,
      `${STATUS}#x`,
      `${STATUS}x`,
      `chrome-extension://${ID}/other.html`,
      "chrome-extension://other/status.html",
    ]) {
      expect(isTrustedSender({ id: ID, url }, ID)).toBeUndefined();
      expect(
        isTrustedSender({ id: ID, url, tab: { url } }, ID),
      ).toBeUndefined();
    }
  });

  it("rejects a tab whose url is the status url but sender.url is not", () => {
    expect(
      isTrustedSender({ id: ID, url: NAKA, tab: { url: STATUS } }, ID),
    ).toBeUndefined();
  });

  it("rejects the status page from another extension id", () => {
    expect(isTrustedSender({ id: "other", url: STATUS }, ID)).toBeUndefined();
    expect(isTrustedSender({ url: STATUS }, ID)).toBeUndefined();
  });

  it("rejects an empty sender and a Naka url without a tab", () => {
    expect(isTrustedSender({}, ID)).toBeUndefined();
    expect(isTrustedSender({ id: ID, url: NAKA }, ID)).toBeUndefined();
  });
});

describe("allowedFor", () => {
  const messages: ToWorker[] = [
    { type: "naka-ready" },
    { type: "playlist-changed" },
    {
      type: "finished",
      source: "explicit",
      progress: 1,
      contentId: 1,
    },
    { type: "status" },
    { type: "resync" },
    { type: "set-mode", mode: "live" },
    { type: "rating-card", contentId: 1 },
    { type: "rating-cards" },
    { type: "rate", contentId: 1, label: "film", rating: 7 },
    { type: "dismiss-rating", contentId: 1, label: "film" },
  ];
  const allowed: Record<SenderRole, string[]> = {
    "naka-tab": [
      "naka-ready",
      "playlist-changed",
      "finished",
      "rating-card",
      "rating-cards",
      "rate",
      "dismiss-rating",
    ],
    "status-page": ["status", "resync", "set-mode"],
  };

  it("allows each type for its role only", () => {
    for (const role of ["naka-tab", "status-page"] as const) {
      for (const msg of messages) {
        expect(allowedFor(role, msg)).toBe(allowed[role].includes(msg.type));
      }
    }
  });

  it("refuses the privileged types from a naka.cx script", () => {
    expect(allowedFor("naka-tab", { type: "set-mode", mode: "live" })).toBe(
      false,
    );
    expect(allowedFor("naka-tab", { type: "resync" })).toBe(false);
    expect(allowedFor("naka-tab", { type: "status" })).toBe(false);
  });

  it("refuses the rating messages from the status page, and rate from nobody else", () => {
    for (const msg of messages.filter((m) =>
      ["rating-card", "rating-cards", "rate", "dismiss-rating"].includes(
        m.type,
      ),
    )) {
      expect(allowedFor("status-page", msg)).toBe(false);
      expect(allowedFor("naka-tab", msg)).toBe(true);
    }
  });

  it("refuses finished from the status page", () => {
    expect(
      allowedFor("status-page", {
        type: "finished",
        source: "explicit",
        progress: 1,
        contentId: 1,
      }),
    ).toBe(false);
  });

  it("covers every ToWorker type exactly once", () => {
    const types = messages.map((m) => m.type).sort();
    const tabbed = Object.values(allowed).flat().sort();
    expect(tabbed).toEqual(types);
    expect(new Set(types).size).toBe(10);
  });
});

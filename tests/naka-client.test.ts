import { describe, expect, it, vi } from "vitest";
import {
  createNakaClient,
  type Fetch,
  type NakaClient,
  NakaUnavailableError,
} from "../src/naka/naka-client";

const TOKEN = "T0K3N-FAKE";
const LEAK = "LEAK-MARKER-PERSONAL-DATA";
const BASE = "https://naka.cx/api/v1";

type Init = Parameters<Fetch>[1];
type Call = { url: string; init: Init };
type Reply = { status: number; body: string | Error };
type Respond = (call: Call, index: number) => Reply;

function json(value: unknown, status = 200): Reply {
  return { status, body: JSON.stringify(value) };
}

function raw(status: number, body: string): Reply {
  return { status, body };
}

const OK = json({});

function entry(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    tmdbId: 1000 + id,
    mediaType: "tv",
    title: `Titre ${id}`,
    originalTitle: `Original ${id}`,
    releaseDate: "2020-05-17",
    ...extra,
  };
}

function setup(
  respond: Respond = () => OK,
  token: () => string | undefined = () => TOKEN,
) {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    const { status, body } = respond(call, calls.length - 1);
    if (body instanceof Error) {
      return {
        ok: true,
        status,
        text: async () => {
          throw body;
        },
      };
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    };
  };
  const tokenFn = vi.fn(token);
  const client = createNakaClient({ fetch, token: tokenFn });
  return { client, calls, token: tokenFn };
}

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected the call to reject with an Error");
}

function only(calls: Call[]): Call {
  expect(calls).toHaveLength(1);
  return calls[0] as Call;
}

describe("requests on the wire", () => {
  it("GETs the playlist ids with the exact headers and options", async () => {
    const { client, calls } = setup(() =>
      json({ contentIds: [3675, 1982], limit: 500 }),
    );
    expect(await client.playlistIds()).toEqual([3675, 1982]);
    const call = only(calls);
    expect(call.url).toBe(`${BASE}/playlist/ids`);
    expect(call.init).toEqual({
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${TOKEN}`,
      },
      credentials: "include",
      redirect: "error",
    });
    expect("body" in call.init).toBe(false);
  });

  it("POSTs {contentId} as JSON on add", async () => {
    const { client, calls } = setup();
    await client.addToPlaylist(18590);
    const call = only(calls);
    expect(call.url).toBe(`${BASE}/playlist`);
    expect(call.init).toEqual({
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ contentId: 18590 }),
      credentials: "include",
      redirect: "error",
    });
  });

  it("DELETEs /playlist/{id} without a body on remove", async () => {
    const { client, calls } = setup();
    await client.removeFromPlaylist(18590);
    const call = only(calls);
    expect(call.url).toBe(`${BASE}/playlist/18590`);
    expect(call.init).toEqual({
      method: "DELETE",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${TOKEN}`,
      },
      credentials: "include",
      redirect: "error",
    });
    expect("body" in call.init).toBe(false);
  });

  it("GETs /browse/{id} for contentById", async () => {
    const { client, calls } = setup(() => json(entry(7)));
    await client.contentById(7);
    const call = only(calls);
    expect(call.url).toBe(`${BASE}/browse/7`);
    expect(call.init.method).toBe("GET");
    expect(call.init.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(call.init.credentials).toBe("include");
    expect(call.init.redirect).toBe("error");
  });

  it("treats 299 as success and 300 as failure", async () => {
    const ok = setup(() => raw(299, ""));
    await expect(ok.client.addToPlaylist(1)).resolves.toBeUndefined();
    const no = setup(() => raw(300, ""));
    await expect(no.client.addToPlaylist(1)).rejects.toBeInstanceOf(
      NakaUnavailableError,
    );
  });

  it("resolves add and remove on any 2xx and ignores the body", async () => {
    const a = setup(() => raw(204, ""));
    await expect(a.client.addToPlaylist(1)).resolves.toBeUndefined();
    const b = setup(() => raw(201, "not json at all"));
    await expect(b.client.removeFromPlaylist(1)).resolves.toBeUndefined();
  });

  it("does not call the token at construction and reads it once per call", async () => {
    const { client, token } = setup();
    expect(token).toHaveBeenCalledTimes(0);
    await client.addToPlaylist(1);
    await client.addToPlaylist(2);
    expect(token).toHaveBeenCalledTimes(2);
  });
});

describe("search", () => {
  it("encodes the trimmed query", async () => {
    const { client, calls } = setup(() => json({ data: [] }));
    await client.search("batman");
    await client.search("  l'éponge & co  ");
    expect(calls[0]?.url).toBe(`${BASE}/browse/search?q=batman`);
    expect(calls[1]?.url).toBe(
      `${BASE}/browse/search?q=${encodeURIComponent("l'éponge & co")}`,
    );
    expect(calls[1]?.url).toContain("l'%C3%A9ponge%20%26%20co");
  });

  it("maps entries into NakaItem (id becomes contentId)", async () => {
    const { client } = setup(() =>
      json({
        data: [
          entry(5),
          entry(6, { mediaType: "movie", releaseDate: "1999-01-02" }),
        ],
      }),
    );
    expect(await client.search("x")).toEqual([
      {
        contentId: 5,
        tmdbId: 1005,
        mediaType: "tv",
        title: "Titre 5",
        originalTitle: "Original 5",
        releaseDate: "2020-05-17",
      },
      {
        contentId: 6,
        tmdbId: 1006,
        mediaType: "movie",
        title: "Titre 6",
        originalTitle: "Original 6",
        releaseDate: "1999-01-02",
      },
    ]);
  });

  it("omits optional fields that are absent or malformed", async () => {
    const { client } = setup(() =>
      json({
        data: [
          entry(1, { originalTitle: "", releaseDate: "2020-5-17" }),
          entry(2, { originalTitle: 5, releaseDate: "2020-05-17T00:00" }),
          entry(3, { originalTitle: undefined, releaseDate: null }),
          entry(4, { originalTitle: "", releaseDate: "x2020-05-17" }),
          entry(5, { originalTitle: "", releaseDate: ["2020-05-17"] }),
        ],
      }),
    );
    const items = await client.search("x");
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual([
        "contentId",
        "mediaType",
        "title",
        "tmdbId",
      ]);
    }
  });

  it("drops entries that cannot be trusted and keeps the rest", async () => {
    const bad: unknown[] = [
      entry(0),
      entry(-3),
      entry(1.5),
      entry(2 ** 53),
      entry(1, { id: "9" }),
      { ...entry(1), id: undefined },
      entry(1, { tmdbId: 0 }),
      entry(1, { tmdbId: "5" }),
      entry(1, { tmdbId: 2.5 }),
      { ...entry(1), tmdbId: undefined },
      entry(1, { title: "" }),
      entry(1, { title: 4 }),
      entry(1, { mediaType: "person" }),
      entry(1, { mediaType: "TV" }),
      entry(1, { mediaType: undefined }),
      null,
      7,
      "x",
      [entry(1)],
    ];
    const { client } = setup(() => json({ data: [...bad, entry(42)] }));
    const items = await client.search("x");
    expect(items.map((i) => i.contentId)).toEqual([42]);
  });

  it("rejects when data is not an array or the body is not an object", async () => {
    for (const body of [
      { data: {} },
      { data: "x" },
      { other: [] },
      [],
      "str",
      null,
    ]) {
      const { client } = setup(() => json(body));
      expect(await failure(client.search("x"))).toBeInstanceOf(
        NakaUnavailableError,
      );
    }
  });

  it("rejects on a body that is not JSON", async () => {
    const { client } = setup(() => raw(200, "<html>challenge</html>"));
    expect(await failure(client.search("x"))).toBeInstanceOf(
      NakaUnavailableError,
    );
  });
});

describe("playlistIds fails closed", () => {
  it("removes duplicates and keeps order", async () => {
    const { client } = setup(() =>
      json({ contentIds: [5, 3, 5, 9, 3], limit: 500 }),
    );
    expect(await client.playlistIds()).toEqual([5, 3, 9]);
  });

  it("accepts an empty list", async () => {
    const { client } = setup(() => json({ contentIds: [], limit: 500 }));
    expect(await client.playlistIds()).toEqual([]);
  });

  it("rejects a list that may be truncated by the limit", async () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    const full = setup(() => json({ contentIds: ids(500), limit: 500 }));
    const error = await failure(full.client.playlistIds());
    expect(error).toBeInstanceOf(NakaUnavailableError);
    expect(error.message).toContain("truncated");
    const over = setup(() => json({ contentIds: ids(501), limit: 500 }));
    expect(await failure(over.client.playlistIds())).toBeInstanceOf(
      NakaUnavailableError,
    );
    const ok = setup(() => json({ contentIds: ids(499), limit: 500 }));
    expect(await ok.client.playlistIds()).toHaveLength(499);
  });

  it("accepts the real shape: 11 ids and limit 500", async () => {
    const ids = Array.from({ length: 11 }, (_, i) => 100 + i);
    const { client } = setup(() => json({ contentIds: ids, limit: 500 }));
    expect(await client.playlistIds()).toEqual(ids);
  });

  const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  it.each([
    ["600 ids with no limit", { contentIds: range(600) }],
    ["a missing limit", { contentIds: [1] }],
    ["a string limit", { contentIds: [1], limit: "500" }],
    ["a null limit", { contentIds: [1], limit: null }],
    ["a renamed limit", { contentIds: [1], max: 500 }],
    ["a zero limit", { contentIds: [1], limit: 0 }],
    ["a negative limit", { contentIds: [1], limit: -5 }],
    ["a float limit", { contentIds: [1], limit: 500.5 }],
    ["an unsafe limit", { contentIds: [1], limit: 2 ** 53 }],
    ["a total that differs", { contentIds: range(50), limit: 500, total: 120 }],
    [
      "a total smaller than the ids",
      { contentIds: [1, 2], limit: 500, total: 1 },
    ],
    ["hasMore true", { contentIds: [1], limit: 500, hasMore: true }],
    ["a nextCursor", { contentIds: [1], limit: 500, nextCursor: "x" }],
    ["a nextPage", { contentIds: [1], limit: 500, nextPage: 2 }],
    [
      "500 entries with one duplicate at the limit",
      { contentIds: [...range(499), 1], limit: 500 },
    ],
  ])("fails closed on %s", async (_name, body) => {
    const { client } = setup(() => json(body));
    const error = await failure(client.playlistIds());
    expect(error).toBeInstanceOf(NakaUnavailableError);
    expect(error.message).toContain("truncated");
  });

  it("accepts a matching total, hasMore false and unrelated keys", async () => {
    const { client } = setup(() =>
      json({
        contentIds: [4, 5],
        limit: 500,
        total: 2,
        hasMore: false,
        next: undefined,
        other: "x",
      }),
    );
    expect(await client.playlistIds()).toEqual([4, 5]);
  });

  it("ignores a total that is not a number", async () => {
    const { client } = setup(() =>
      json({ contentIds: [4, 5], limit: 500, total: null }),
    );
    expect(await client.playlistIds()).toEqual([4, 5]);
  });

  it.each([
    ["a missing contentIds", { limit: 500 }],
    ["contentIds that is not an array", { contentIds: "1,2" }],
    ["a float id", { contentIds: [1, 2.5], limit: 500 }],
    ["a string id", { contentIds: [1, "2"], limit: 500 }],
    ["a zero id", { contentIds: [0], limit: 500 }],
    ["a negative id", { contentIds: [-1], limit: 500 }],
    ["an unsafe id", { contentIds: [2 ** 53], limit: 500 }],
    ["a null id", { contentIds: [null], limit: 500 }],
    ["a bare array", [1, 2]],
    ["null", null],
    ["a string", "x"],
  ])("rejects %s", async (_name, body) => {
    const { client } = setup(() => json(body));
    expect(await failure(client.playlistIds())).toBeInstanceOf(
      NakaUnavailableError,
    );
  });

  it("rejects a body that is not JSON", async () => {
    const { client } = setup(() => raw(200, "oops"));
    expect(await failure(client.playlistIds())).toBeInstanceOf(
      NakaUnavailableError,
    );
  });
});

describe("contentById", () => {
  it("maps the bare object", async () => {
    const { client } = setup(() => json(entry(9, { mediaType: "movie" })));
    expect(await client.contentById(9)).toEqual({
      contentId: 9,
      tmdbId: 1009,
      mediaType: "movie",
      title: "Titre 9",
      originalTitle: "Original 9",
      releaseDate: "2020-05-17",
    });
  });

  it("maps the object wrapped in data", async () => {
    const { client } = setup(() => json({ data: entry(9) }));
    expect((await client.contentById(9))?.contentId).toBe(9);
  });

  it("rejects an item whose id is not the requested one", async () => {
    for (const body of [entry(42), { data: entry(42) }]) {
      const { client } = setup(() => json(body));
      const error = await failure(client.contentById(9));
      expect(error).toBeInstanceOf(NakaUnavailableError);
      expect((error as NakaUnavailableError).status).toBe(0);
      expect(error.message).toBe("Naka content: unexpected item");
    }
    const same = setup(() => json(entry(9)));
    expect((await same.client.contentById(9))?.contentId).toBe(9);
  });

  it("uses data only when there is no top-level id", async () => {
    const { client } = setup(() =>
      json({ ...entry(9), data: entry(42, { title: "Autre" }) }),
    );
    expect((await client.contentById(9))?.title).toBe("Titre 9");
    const odd = setup(() => json({ ...entry(9), data: "x" }));
    expect((await odd.client.contentById(9))?.contentId).toBe(9);
  });

  it("returns undefined on 404 only", async () => {
    const { client } = setup(() => raw(404, "not found"));
    expect(await client.contentById(9)).toBeUndefined();
    for (const status of [400, 401, 403, 429, 500]) {
      const other = setup(() => raw(status, "x"));
      const error = await failure(other.client.contentById(9));
      expect(error).toBeInstanceOf(NakaUnavailableError);
      expect((error as NakaUnavailableError).status).toBe(status);
    }
  });

  it("returns undefined when the object fails the mapping", async () => {
    for (const body of [
      entry(9, { mediaType: "person" }),
      { data: entry(9, { title: "" }) },
      { data: "x" },
      { data: null },
      [entry(9)],
      "str",
      null,
      {},
    ]) {
      const { client } = setup(() => json(body));
      expect(await client.contentById(9)).toBeUndefined();
    }
  });

  it("rejects a body that is not JSON", async () => {
    const { client } = setup(() => raw(200, "<html>"));
    expect(await failure(client.contentById(9))).toBeInstanceOf(
      NakaUnavailableError,
    );
  });

  it("does not mistake a network failure for a 404", async () => {
    const { client } = setup(() => {
      throw new Error("down");
    });
    const error = await failure(client.contentById(9));
    expect((error as NakaUnavailableError).status).toBe(0);
  });
});

describe("errors", () => {
  it.each([401, 403, 429, 500, 302, 199, 300])(
    "maps HTTP %i to NakaUnavailableError carrying the status",
    async (status) => {
      const { client } = setup(() => raw(status, `body ${LEAK}`));
      for (const call of [
        () => client.playlistIds(),
        () => client.addToPlaylist(1),
        () => client.removeFromPlaylist(1),
        () => client.search("x"),
      ]) {
        const error = await failure(call());
        expect(error).toBeInstanceOf(NakaUnavailableError);
        expect((error as NakaUnavailableError).status).toBe(status);
        expect(error.message).toContain(`HTTP ${status}`);
        expect(error.name).toBe("NakaUnavailableError");
      }
    },
  );

  it("has status 0 for a network failure and an unreadable body", async () => {
    const down = setup(() => {
      throw new Error(`socket closed ${TOKEN} ${LEAK}`);
    });
    const e1 = (await failure(down.client.search("x"))) as NakaUnavailableError;
    expect(e1).toBeInstanceOf(NakaUnavailableError);
    expect(e1.status).toBe(0);
    expect(e1.message).toContain("request failed");
    const bad = setup(() => ({ status: 200, body: new Error(LEAK) }));
    const e2 = (await failure(bad.client.search("x"))) as NakaUnavailableError;
    expect(e2.status).toBe(0);
    expect(e2.message).toContain("request failed");
  });

  it("has no cause", async () => {
    const down = setup(() => {
      throw new Error("down");
    });
    const error = await failure(down.client.playlistIds());
    expect("cause" in error).toBe(false);
  });

  it("rejects a body over 2,000,000 characters and accepts 2,000,000", async () => {
    const pad = (n: number) => {
      const head = '{"contentIds":[1],"limit":500,"pad":"';
      const tail = '"}';
      return head + "x".repeat(n - head.length - tail.length) + tail;
    };
    const big = setup(() => raw(200, pad(2_000_001)));
    const error = (await failure(
      big.client.playlistIds(),
    )) as NakaUnavailableError;
    expect(error).toBeInstanceOf(NakaUnavailableError);
    expect(error.message).toContain("too large");
    expect(error.status).toBe(200);
    const edge = setup(() => raw(200, pad(2_000_000)));
    expect(await edge.client.playlistIds()).toEqual([1]);
  });
});

describe("token", () => {
  it("rejects with 'no token' before any fetch for every method", async () => {
    for (const value of [undefined, "", 5, null, {}]) {
      const { client, calls } = setup(
        () => OK,
        () => value as unknown as string,
      );
      for (const call of [
        () => client.playlistIds(),
        () => client.addToPlaylist(1),
        () => client.removeFromPlaylist(1),
        () => client.search("x"),
        () => client.contentById(1),
      ]) {
        const error = await failure(call());
        expect(error).toBeInstanceOf(NakaUnavailableError);
        expect(error.message).toBe("no token");
        expect((error as NakaUnavailableError).status).toBe(0);
      }
      expect(calls).toHaveLength(0);
    }
  });

  it("drops whatever token() throws", async () => {
    const { client, calls } = setup(
      () => OK,
      () => {
        const e = new Error(`boom ${TOKEN}`, { cause: TOKEN });
        throw e;
      },
    );
    const error = await failure(client.playlistIds());
    expect(error).toBeInstanceOf(NakaUnavailableError);
    expect(error.message).toBe("Naka session: could not be read");
    expect("cause" in error).toBe(false);
    expect(String(error) + (error.stack ?? "")).not.toContain(TOKEN);
    expect(calls).toHaveLength(0);
  });
});

describe("input guards", () => {
  const badIds: unknown[] = [
    0,
    -1,
    1.5,
    Number.NaN,
    2 ** 53,
    Number.POSITIVE_INFINITY,
    "/playlist/../x",
    "5",
    undefined,
  ];

  it.each(badIds.map((v) => [String(v), v]))(
    "rejects contentId %s with RangeError before the token and any fetch",
    async (_name, value) => {
      const { client, calls, token } = setup();
      const id = value as number;
      for (const call of [
        () => client.addToPlaylist(id),
        () => client.removeFromPlaylist(id),
        () => client.contentById(id),
      ]) {
        expect(await failure(call())).toBeInstanceOf(RangeError);
      }
      expect(calls).toHaveLength(0);
      expect(token).toHaveBeenCalledTimes(0);
    },
  );

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["201 characters", "a".repeat(201)],
    ["a lone high surrogate", "a\uD800b"],
    ["a lone low surrogate", "\uDC00"],
    ["a number", 5],
    ["undefined", undefined],
  ])("rejects a %s query", async (_name, value) => {
    const { client, calls, token } = setup();
    const error = await failure(client.search(value as unknown as string));
    expect(error).toBeInstanceOf(RangeError);
    expect(calls).toHaveLength(0);
    expect(token).toHaveBeenCalledTimes(0);
  });

  it("accepts 1 and 200 characters, counted after trimming", async () => {
    const { client, calls } = setup(() => json({ data: [] }));
    await client.search("a");
    await client.search("a".repeat(200));
    await client.search(` ${"a".repeat(200)} `);
    expect(calls).toHaveLength(3);
  });

  it("accepts the largest safe integer", async () => {
    const { client, calls } = setup();
    await client.addToPlaylist(Number.MAX_SAFE_INTEGER);
    expect(calls).toHaveLength(1);
  });
});

describe("token secrecy", () => {
  function scan(client: NakaClient) {
    const run = async () => {
      let errors = 0;
      const attempts: (() => Promise<unknown>)[] = [
        () => client.playlistIds(),
        () => client.addToPlaylist(5),
        () => client.removeFromPlaylist(5),
        () => client.search("batman"),
        () => client.contentById(5),
      ];
      for (const attempt of attempts) {
        try {
          await attempt();
        } catch (error) {
          errors += 1;
          expectClean(error);
        }
      }
      return errors;
    };
    return { run };
  }

  function expectClean(error: unknown) {
    const e = error as Error & Record<string, unknown>;
    const texts = [
      e.message,
      String(e),
      e.stack ?? "",
      JSON.stringify(e),
      JSON.stringify(Object.values(e)),
      String(e.cause ?? ""),
    ];
    for (const text of texts) {
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(LEAK);
    }
    expect(e.cause).toBeUndefined();
  }

  const replies: Reply[] = [
    raw(401, `${TOKEN} ${LEAK}`),
    raw(403, `{"error":"${LEAK}","t":"${TOKEN}"}`),
    raw(404, `${TOKEN} ${LEAK}`),
    raw(429, `${TOKEN} ${LEAK}`),
    raw(500, `${TOKEN} ${LEAK}`),
    raw(200, `<html>${TOKEN} ${LEAK}</html>`),
    json({ contentIds: [1, `${TOKEN} ${LEAK}`] }),
    json({ data: `${TOKEN} ${LEAK}` }),
    { status: 200, body: new Error(`${TOKEN} ${LEAK}`) },
    json({ data: [entry(5, { title: `${TOKEN} ${LEAK}` })] }),
  ];

  it("keeps the token and response bodies out of requests and errors", async () => {
    let totalCalls = 0;
    let totalErrors = 0;
    for (const reply of replies) {
      const { client, calls } = setup(() => reply);
      totalErrors += await scan(client).run();
      totalCalls += calls.length;
      for (const call of calls) {
        expect(call.url).not.toContain(TOKEN);
        expect(call.init.body ?? "").not.toContain(TOKEN);
        expect(call.init.body ?? "").not.toContain(LEAK);
        expect(call.init.method).toMatch(/^(GET|POST|DELETE)$/);
        for (const [name, value] of Object.entries(call.init.headers)) {
          if (name === "authorization") {
            expect(value).toBe(`Bearer ${TOKEN}`);
          } else {
            expect(value).not.toContain(TOKEN);
          }
        }
        expect(call.url.startsWith(`${BASE}/`)).toBe(true);
      }
    }
    expect(totalCalls).toBeGreaterThanOrEqual(50);
    expect(totalErrors).toBeGreaterThanOrEqual(30);
  });

  it("scrubs a fetch that throws the token", async () => {
    const { client } = setup(() => {
      throw new Error(`socket ${TOKEN} ${LEAK}`);
    });
    const errors = await scan(client).run();
    expect(errors).toBe(5);
  });

  const thrown: [string, () => never][] = [
    [
      "an Error holding the token everywhere",
      () => {
        const e = new Error(`boom ${TOKEN}`, { cause: TOKEN });
        Object.assign(e, { detail: TOKEN });
        throw e;
      },
    ],
    [
      "a string holding the token",
      () => {
        throw `${TOKEN} ${LEAK}`;
      },
    ],
  ];

  it.each(thrown)("scrubs token() throwing %s", async (_name, boom) => {
    const { client, calls } = setup(() => OK, boom);
    const attempts: (() => Promise<unknown>)[] = [
      () => client.playlistIds(),
      () => client.addToPlaylist(5),
      () => client.removeFromPlaylist(5),
      () => client.search("batman"),
      () => client.contentById(5),
    ];
    for (const attempt of attempts) {
      const error = await failure(attempt());
      expect(error).toBeInstanceOf(NakaUnavailableError);
      expectClean(error);
    }
    expect(calls).toHaveLength(0);
  });
});

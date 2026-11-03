import { describe, expect, it, vi } from "vitest";
import {
  createScClient,
  type Fetch,
  type ScClient,
  type ScSession,
  ScUnauthenticatedError,
  ScUnavailableError,
} from "../src/sc/sc-client";
import { GQL } from "../src/sc/sc-queries";
import seasonHtml from "./fixtures/season-widow-s-bay-s1.html?raw";

const TOKEN = "T0K3N-FAKE";
const LEAK = "LEAK-MARKER-PERSONAL-DATA";
const APOLLO = "https://apollo.senscritique.com/";
const SEASON_URL = "https://www.senscritique.com/serie/x/99153120/S1";
const LOGGED_IN: ScSession = { token: TOKEN, username: "u" };

type Init = Parameters<Fetch>[1];
type Call = { url: string; init: Init };
type Reply = { status: number; body: string | Error };
type Respond = (call: Call, index: number) => Reply;

function gql(data: unknown): Reply {
  return { status: 200, body: JSON.stringify({ data }) };
}

function raw(status: number, body: string): Reply {
  return { status, body };
}

const OK = gql({ done: true });

function variablesOf(call: Call): Record<string, unknown> {
  const body = JSON.parse(call.init.body ?? "{}") as {
    variables: Record<string, unknown>;
  };
  return body.variables;
}

function operationOf(call: Call): string {
  const body = JSON.parse(call.init.body ?? "{}") as { operationName: string };
  return body.operationName;
}

function wishPage(products: unknown[], total: number): Reply {
  return gql({ user: { collection: { products, total } } });
}

function product(id: number): Record<string, unknown> {
  return { id, title: `Titre ${id}`, url: `/film/titre/${id}`, universe: 1 };
}

function wishlistOf(total: number): Respond {
  return (call) => {
    const offset = Number(variablesOf(call).offset);
    const ids = [];
    for (let i = offset; i < Math.min(offset + 18, total); i += 1) {
      ids.push(1000 + i);
    }
    return wishPage(ids.map(product), total);
  };
}

const EVERYTHING: Respond = (call) => {
  if (call.init.method === "GET") return raw(200, seasonHtml);
  if (operationOf(call) === "UserCollection") return wishPage([], 0);
  return OK;
};

function setup(session: ScSession, respond: Respond = EVERYTHING) {
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
  const getSession = vi.fn(async () => session);
  const client = createScClient({ fetch, getSession });
  return { client, calls, getSession };
}

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected the call to reject with an Error");
}

const METHODS: [string, (client: ScClient) => Promise<unknown>][] = [
  ["wish", (c) => c.wish(5)],
  ["unwish", (c) => c.unwish(5)],
  ["markDone", (c) => c.markDone(5, "2026-11-02")],
  ["unmarkDone", (c) => c.unmarkDone(5)],
  ["rate", (c) => c.rate(5, 8)],
  ["readWishlist", (c) => c.readWishlist("tvShow")],
  ["seasonInfo", (c) => c.seasonInfo(99153120, 1)],
];
const WRITES = METHODS.slice(0, 5);

describe("writes", () => {
  it("wish sends one ProductWish POST", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.wish(5);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(APOLLO);
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(calls[0]?.init.body ?? "")).toEqual({
      operationName: "ProductWish",
      variables: { productId: 5 },
      query: GQL.ProductWish,
    });
  });

  it("unwish sends one ProductUnwish POST", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.unwish(5);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]?.init.body ?? "")).toEqual({
      operationName: "ProductUnwish",
      variables: { productId: 5 },
      query: GQL.ProductUnwish,
    });
  });

  it("unmarkDone sends ProductUndone only", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.unmarkDone(5);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]?.init.body ?? "")).toEqual({
      operationName: "ProductUndone",
      variables: { productId: 5 },
      query: GQL.ProductUndone,
    });
  });

  it("rate sends ProductRate with the rating", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.rate(5, 8);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]?.init.body ?? "")).toEqual({
      operationName: "ProductRate",
      variables: { productId: 5, rating: 8 },
      query: GQL.ProductRate,
    });
  });

  it("markDone sends ProductDone then SetProductDateDone", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.markDone(5, "2026-11-02");
    expect(calls.map(operationOf)).toEqual([
      "ProductDone",
      "SetProductDateDone",
    ]);
    expect(variablesOf(calls[0] as Call)).toEqual({ productId: 5 });
    expect(variablesOf(calls[1] as Call)).toEqual({
      productId: 5,
      date: "2026-11-02",
    });
    expect(JSON.parse(calls[1]?.init.body ?? "").query).toBe(
      GQL.SetProductDateDone,
    );
  });

  it("markDone rejects after exactly two calls when the date call fails", async () => {
    const { client, calls } = setup(LOGGED_IN, (call) =>
      operationOf(call) === "SetProductDateDone"
        ? raw(200, JSON.stringify({ errors: [{ message: "nope" }] }))
        : OK,
    );
    const error = await failure(client.markDone(5, "2026-11-02"));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(calls.map(operationOf)).toEqual([
      "ProductDone",
      "SetProductDateDone",
    ]);
  });

  it("markDone stops after the first call when it fails", async () => {
    const { client, calls } = setup(LOGGED_IN, () => raw(500, "down"));
    await failure(client.markDone(5, "2026-11-02"));
    expect(calls.map(operationOf)).toEqual(["ProductDone"]);
  });

  it("passes each product id, rating and date through", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.wish(41);
    await client.unwish(42);
    await client.unmarkDone(43);
    await client.rate(44, 3);
    await client.markDone(45, "2024-02-29");
    expect(calls.map(operationOf)).toEqual([
      "ProductWish",
      "ProductUnwish",
      "ProductUndone",
      "ProductRate",
      "ProductDone",
      "SetProductDateDone",
    ]);
    expect(calls.map(variablesOf)).toEqual([
      { productId: 41 },
      { productId: 42 },
      { productId: 43 },
      { productId: 44, rating: 3 },
      { productId: 45 },
      { productId: 45, date: "2024-02-29" },
    ]);
  });
});

describe("input validation", () => {
  it.each([0, 11, 7.5, Number.NaN, Number.POSITIVE_INFINITY, -3])(
    "rate rejects %s with a RangeError before any fetch or session read",
    async (rating) => {
      const { client, calls, getSession } = setup(LOGGED_IN);
      const error = await failure(client.rate(5, rating));
      expect(error).toBeInstanceOf(RangeError);
      expect(calls).toHaveLength(0);
      expect(getSession).not.toHaveBeenCalled();
    },
  );

  it.each([1, 10])("rate accepts the bound %s", async (rating) => {
    const { client, calls } = setup(LOGGED_IN);
    await client.rate(5, rating);
    expect(variablesOf(calls[0] as Call)).toEqual({ productId: 5, rating });
  });

  it.each([
    "2026-1-2",
    "",
    "2026-11-02T10:00:00Z",
    "x2026-11-02",
    "2026-11-02x",
    "2026-11-02\n",
    "02-11-2026",
    "26-11-02",
    "2026-11-2",
    "20261-11-02",
    "2026-111-02",
  ])(
    "markDone rejects %j with a RangeError before any fetch or session read",
    async (date) => {
      const { client, calls, getSession } = setup(LOGGED_IN);
      const error = await failure(client.markDone(5, date));
      expect(error).toBeInstanceOf(RangeError);
      expect(calls).toHaveLength(0);
      expect(getSession).not.toHaveBeenCalled();
    },
  );
});

describe("authentication", () => {
  it("sends the raw token as the authorization header and omits credentials", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.markDone(5, "2026-11-02");
    for (const call of calls) {
      expect(call.init.headers).toStrictEqual({
        "content-type": "application/json",
        authorization: TOKEN,
      });
      expect(call.init.credentials).toBe("omit");
    }
  });

  it.each([{}, { username: "u" }, { token: "" }])(
    "writes reject with ScUnauthenticatedError and no fetch without a token (%j)",
    async (session) => {
      for (const [, run] of WRITES) {
        const { client, calls, getSession } = setup(session);
        const error = await failure(run(client));
        expect(error).toBeInstanceOf(ScUnauthenticatedError);
        expect(error).toBeInstanceOf(ScUnavailableError);
        expect(error.message).toContain("senscritique.com");
        expect(calls).toHaveLength(0);
        expect(getSession).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each([{ token: TOKEN }, { token: TOKEN, username: "" }, {}])(
    "readWishlist rejects with ScUnauthenticatedError and no fetch without a username (%j)",
    async (session) => {
      const { client, calls } = setup(session);
      const error = await failure(client.readWishlist("movie"));
      expect(error).toBeInstanceOf(ScUnauthenticatedError);
      expect(calls).toHaveLength(0);
    },
  );

  it("readWishlist sends the token when there is one", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.readWishlist("movie");
    expect(calls[0]?.init.headers).toStrictEqual({
      "content-type": "application/json",
      authorization: TOKEN,
    });
    expect(calls[0]?.init.credentials).toBe("omit");
  });

  it.each([{ username: "u" }, { username: "u", token: "" }])(
    "readWishlist reads a public profile without any authorization header (%j)",
    async (session) => {
      const { client, calls } = setup(session);
      await client.readWishlist("movie");
      expect(calls[0]?.init.headers).toStrictEqual({
        "content-type": "application/json",
      });
      expect(calls[0]?.init.credentials).toBe("omit");
    },
  );

  it("maps a GraphQL Unauthenticated error to ScUnauthenticatedError", async () => {
    const body = JSON.stringify({
      errors: [{ message: "Unauthenticated Users Not Allowed" }],
    });
    const { client } = setup(LOGGED_IN, () => raw(200, body));
    const error = await failure(client.wish(5));
    expect(error).toBeInstanceOf(ScUnauthenticatedError);
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(error.name).toBe("ScUnauthenticatedError");
    expect(error.message).toContain("log in again on senscritique.com");
    expect(error.message).not.toContain(TOKEN);
  });

  it("detects Unauthenticated in any of the errors", async () => {
    const body = JSON.stringify({
      errors: [{ message: "Something else" }, { message: "Unauthenticated" }],
    });
    const { client } = setup(LOGGED_IN, () => raw(200, body));
    expect(await failure(client.wish(5))).toBeInstanceOf(
      ScUnauthenticatedError,
    );
  });

  it("reads the token again on every call and keeps none", async () => {
    const calls: Call[] = [];
    const sessions: ScSession[] = [
      { token: "FIRST", username: "u" },
      { token: "SECOND", username: "u" },
      { username: "u" },
    ];
    const fetch: Fetch = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: {} }),
      };
    };
    const getSession = vi.fn(async () => sessions.shift() ?? {});
    const client = createScClient({ fetch, getSession });
    expect(getSession).not.toHaveBeenCalled();
    await client.wish(1);
    await client.wish(2);
    const error = await failure(client.wish(3));
    expect(calls.map((c) => c.init.headers.authorization)).toEqual([
      "FIRST",
      "SECOND",
    ]);
    expect(error).toBeInstanceOf(ScUnauthenticatedError);
    expect(getSession).toHaveBeenCalledTimes(3);
  });
});

describe("one session read per public call", () => {
  it.each(METHODS)("%s reads the session exactly once", async (_name, run) => {
    const { client, getSession } = setup(LOGGED_IN);
    await run(client);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("a three-page readWishlist reads the session once", async () => {
    const { client, calls, getSession } = setup(LOGGED_IN, wishlistOf(40));
    await client.readWishlist("tvShow");
    expect(calls).toHaveLength(3);
    expect(getSession).toHaveBeenCalledTimes(1);
    for (const call of calls) {
      expect(call.init.headers.authorization).toBe(TOKEN);
    }
  });

  it("a markDone with two requests reads the session once", async () => {
    const { client, calls, getSession } = setup(LOGGED_IN);
    await client.markDone(5, "2026-11-02");
    expect(calls).toHaveLength(2);
    expect(getSession).toHaveBeenCalledTimes(1);
  });
});

describe("error mapping", () => {
  const UNAVAILABLE: [string, Reply][] = [
    ["HTTP 403", raw(403, `forbidden ${LEAK}`)],
    ["HTTP 500", raw(500, LEAK)],
    [
      "HTTP 201 with a valid body",
      { status: 201, body: JSON.stringify({ data: {}, x: LEAK }) },
    ],
    ["a challenge page", raw(200, `<html>${LEAK}</html>`)],
    ["a JSON null", raw(200, "null")],
    ["a JSON array", raw(200, `["${LEAK}"]`)],
    ["a JSON string", raw(200, `"${LEAK}"`)],
    [
      "GraphQL errors",
      raw(200, JSON.stringify({ errors: [{ message: LEAK }] })),
    ],
    [
      "empty GraphQL errors",
      raw(200, JSON.stringify({ errors: [], data: {} })),
    ],
    [
      "errors of the wrong shape",
      raw(200, JSON.stringify({ errors: [null, 7, { message: 42 }, LEAK] })),
    ],
    [
      "errors that is not a list",
      raw(200, JSON.stringify({ errors: LEAK, data: {} })),
    ],
    ["no data", raw(200, JSON.stringify({ other: LEAK }))],
    ["null data", raw(200, JSON.stringify({ data: null, other: LEAK }))],
    ["data that is a list", raw(200, JSON.stringify({ data: [LEAK] }))],
    ["an unreadable body", { status: 200, body: new Error(LEAK) }],
  ];

  it.each(UNAVAILABLE)(
    "a write rejects with ScUnavailableError on %s",
    async (_name, reply) => {
      const { client } = setup(LOGGED_IN, () => reply);
      const error = await failure(client.wish(5));
      expect(error).toBeInstanceOf(ScUnavailableError);
      expect(error).not.toBeInstanceOf(ScUnauthenticatedError);
      expect(error.name).toBe("ScUnavailableError");
      expect(error.message).toContain("ProductWish");
      expect(error.message).not.toContain(LEAK);
      expect(error.message).not.toContain(TOKEN);
    },
  );

  it.each(UNAVAILABLE)(
    "readWishlist rejects with ScUnavailableError on %s",
    async (_name, reply) => {
      const { client } = setup(LOGGED_IN, () => reply);
      const error = await failure(client.readWishlist("movie"));
      expect(error).toBeInstanceOf(ScUnavailableError);
      expect(error.message).toContain("UserCollection");
      expect(error.message).not.toContain(LEAK);
    },
  );

  it("says when the body is not JSON", async () => {
    const { client } = setup(LOGGED_IN, () =>
      raw(200, "<html>challenge</html>"),
    );
    const error = await failure(client.wish(5));
    expect(error.message).toContain("not JSON");
  });

  it("states the HTTP status in the message", async () => {
    const { client } = setup(LOGGED_IN, () => raw(403, "x"));
    expect((await failure(client.wish(5))).message).toContain("403");
  });

  it("wraps a network failure without echoing its message", async () => {
    const { client } = setup(LOGGED_IN, () => {
      throw new Error(`socket closed ${TOKEN} ${LEAK}`);
    });
    const error = await failure(client.wish(5));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(error.message).toContain("ProductWish");
    expect(String(error)).not.toContain(TOKEN);
    expect(String(error)).not.toContain(LEAK);
    expect(error.cause).toBeUndefined();
  });
});

describe("readWishlist", () => {
  it("sends exactly the recorded UserCollection variables", async () => {
    const { client, calls } = setup({ token: TOKEN, username: "someone" });
    await client.readWishlist("tvShow");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(APOLLO);
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(calls[0]?.init.body ?? "")).toEqual({
      operationName: "UserCollection",
      variables: {
        action: "WISH",
        categoryId: null,
        gameSystemId: null,
        genreId: null,
        keywords: "",
        limit: 18,
        offset: 0,
        order: "LAST_ACTION_DESC",
        universe: "tvShow",
        username: "someone",
        yearDateDone: null,
        isCollection: true,
      },
      query: GQL.UserCollection,
    });
  });

  it("passes the movie universe through", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.readWishlist("movie");
    expect(variablesOf(calls[0] as Call).universe).toBe("movie");
  });

  it("follows the offsets 0, 18, 36 for a total of 40 and concatenates in order", async () => {
    const { client, calls } = setup(LOGGED_IN, wishlistOf(40));
    const items = await client.readWishlist("tvShow");
    expect(calls.map((c) => variablesOf(c).offset)).toEqual([0, 18, 36]);
    expect(items.map((i) => i.productId)).toEqual(
      Array.from({ length: 40 }, (_v, i) => 1000 + i),
    );
    expect(items[0]).toEqual({
      productId: 1000,
      title: "Titre 1000",
      url: "/film/titre/1000",
      universe: 1,
    });
  });

  it("stops after one page when the total fits in it", async () => {
    const { client, calls } = setup(LOGGED_IN, wishlistOf(18));
    expect(await client.readWishlist("movie")).toHaveLength(18);
    expect(calls).toHaveLength(1);
  });

  it("makes exactly two calls for a total of 36", async () => {
    const { client, calls } = setup(LOGGED_IN, wishlistOf(36));
    expect(await client.readWishlist("movie")).toHaveLength(36);
    expect(calls).toHaveLength(2);
  });

  it("returns [] for a real empty wishlist", async () => {
    const { client, calls } = setup(LOGGED_IN, () => wishPage([], 0));
    expect(await client.readWishlist("movie")).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("rejects a first page with no item while the total says more remain", async () => {
    const { client, calls } = setup(LOGGED_IN, () => wishPage([], 40));
    const error = await failure(client.readWishlist("movie"));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(calls).toHaveLength(1);
  });

  it("rejects a later page with no item rather than return a shorter list", async () => {
    const full = wishlistOf(40);
    const { client, calls } = setup(LOGGED_IN, (call, index) =>
      index === 1 ? wishPage([], 40) : full(call, index),
    );
    const error = await failure(client.readWishlist("movie"));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["no user", {}],
    ["a null user", { user: null }],
    ["a user without collection", { user: {} }],
    ["a null collection", { user: { collection: null } }],
    ["a string collection", { user: { collection: "x" } }],
    ["a list collection", { user: { collection: [] } }],
    ["a collection without products", { user: { collection: { total: 0 } } }],
    [
      "products that is not a list",
      { user: { collection: { products: {}, total: 0 } } },
    ],
    ["a collection without total", { user: { collection: { products: [] } } }],
    ["a string total", { user: { collection: { products: [], total: "0" } } }],
    [
      "a fractional total",
      { user: { collection: { products: [], total: 1.5 } } },
    ],
    ["a negative total", { user: { collection: { products: [], total: -1 } } }],
  ])("rejects an unreadable first page: %s", async (_name, data) => {
    const { client, calls } = setup(LOGGED_IN, () => gql(data));
    const error = await failure(client.readWishlist("movie"));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(error.message).toContain("UserCollection");
    expect(calls).toHaveLength(1);
  });

  it("rejects when a later page is unreadable instead of returning the first", async () => {
    const full = wishlistOf(40);
    const { client, calls } = setup(LOGGED_IN, (call, index) =>
      index === 1 ? gql({ user: { collection: null } }) : full(call, index),
    );
    const error = await failure(client.readWishlist("movie"));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(calls).toHaveLength(2);
  });

  it("gives up after 500 pages when the server never stops advertising more", async () => {
    const { client, calls } = setup(LOGGED_IN, (call) =>
      wishPage([product(Number(variablesOf(call).offset))], 1_000_000_000),
    );
    const error = await failure(client.readWishlist("movie"));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(calls).toHaveLength(500);
  });
});

describe("seasonInfo", () => {
  it("GETs the season page with the cookies and no token", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.seasonInfo(99153120, 1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(SEASON_URL);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.credentials).toBe("include");
    expect(calls[0]?.init.body).toBeUndefined();
    expect(calls[0]?.init.headers).toStrictEqual({
      "content-type": "application/json",
    });
  });

  it("parses the season product id and the episodes", async () => {
    const { client } = setup(LOGGED_IN);
    const info = await client.seasonInfo(99153120, 1);
    expect(info.seasonProductId).toBe(133353713);
    expect(info.episodes).toHaveLength(10);
    expect(info.episodes.find((e) => e.episode === 5)?.productId).toBe(
      133353719,
    );
  });

  it("builds the URL from the series and season", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.seasonInfo(42, 3);
    expect(calls[0]?.url).toBe("https://www.senscritique.com/serie/x/42/S3");
  });

  it("gives an empty result for an empty body", async () => {
    const { client } = setup(LOGGED_IN, () => raw(200, ""));
    expect(await client.seasonInfo(99153120, 1)).toStrictEqual({
      seasonProductId: undefined,
      episodes: [],
    });
  });

  it.each([404, 403, 500, 201])(
    "rejects HTTP %s with ScUnavailableError",
    async (status) => {
      const { client } = setup(LOGGED_IN, () => raw(status, seasonHtml));
      const error = await failure(client.seasonInfo(99153120, 1));
      expect(error).toBeInstanceOf(ScUnavailableError);
      expect(error).not.toBeInstanceOf(ScUnauthenticatedError);
      expect(error.message).toContain(String(status));
    },
  );

  it("wraps a network failure", async () => {
    const { client } = setup(LOGGED_IN, () => {
      throw new Error(LEAK);
    });
    const error = await failure(client.seasonInfo(99153120, 1));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(error.message).not.toContain(LEAK);
  });

  it("works without any login", async () => {
    const { client } = setup({});
    expect((await client.seasonInfo(99153120, 1)).episodes).toHaveLength(10);
  });
});

describe("the token stays secret", () => {
  const FAILURES: Reply[] = [
    OK,
    raw(403, `forbidden ${TOKEN}`),
    raw(200, `<html>${TOKEN}</html>`),
    raw(200, JSON.stringify({ errors: [{ message: `bad ${TOKEN}` }] })),
    raw(
      200,
      JSON.stringify({ errors: [{ message: `Unauthenticated ${TOKEN}` }] }),
    ),
    { status: 200, body: new Error(`unreadable ${TOKEN}`) },
  ];

  async function runEverything() {
    const calls: Call[] = [];
    const errors: Error[] = [];
    for (const reply of FAILURES) {
      for (const [, run] of METHODS) {
        const respond: Respond = (call) =>
          reply === OK ? EVERYTHING(call, 0) : reply;
        const world = setup(LOGGED_IN, respond);
        try {
          await run(world.client);
        } catch (error) {
          if (error instanceof Error) errors.push(error);
        }
        calls.push(...world.calls);
      }
    }
    const throwing = setup(LOGGED_IN, () => {
      throw new Error(`socket ${TOKEN}`);
    });
    for (const [, run] of METHODS) {
      errors.push(await failure(run(throwing.client)));
    }
    calls.push(...throwing.calls);
    return { calls, errors };
  }

  it("is in no URL, body, error message or error string, and only in the Apollo authorization header", async () => {
    const { calls, errors } = await runEverything();
    expect(calls.length).toBeGreaterThan(20);
    expect(errors.length).toBeGreaterThan(20);
    for (const call of calls) {
      const { authorization, ...otherHeaders } = call.init.headers;
      const visible = JSON.stringify({
        ...call,
        init: { ...call.init, headers: otherHeaders },
      });
      expect(visible).not.toContain(TOKEN);
      if (new URL(call.url).hostname === "apollo.senscritique.com") {
        expect(call.url).toBe(APOLLO);
        expect(call.init.method).toBe("POST");
        expect(call.init.credentials).toBe("omit");
        expect(authorization).toBe(TOKEN);
      } else {
        expect(new URL(call.url).hostname).toBe("www.senscritique.com");
        expect(call.init.method).toBe("GET");
        expect(authorization).toBeUndefined();
        expect(JSON.stringify(call)).not.toContain(TOKEN);
      }
    }
    for (const error of errors) {
      expect(error.message).not.toContain(TOKEN);
      expect(String(error)).not.toContain(TOKEN);
      expect(error.stack ?? "").not.toContain(TOKEN);
      expect(error.cause).toBeUndefined();
    }
  });

  it("is never written to the console", async () => {
    const methods = [
      "log",
      "info",
      "warn",
      "error",
      "debug",
      "trace",
      "dir",
      "table",
    ] as const;
    const spies = methods.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    try {
      await runEverything();
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

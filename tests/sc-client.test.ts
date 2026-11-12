import { describe, expect, it, vi } from "vitest";
import {
  createScClient,
  type Fetch,
  type ScClient,
  type ScSession,
  ScUnauthenticatedError,
  ScUnavailableError,
} from "../src/sc/sc-client";
import { readProductState } from "../src/sc/sc-product-state";
import { GQL } from "../src/sc/sc-queries";
import { createSessionReader } from "../src/sc/sc-session";
import type { Envelope } from "../src/sc/sc-transport";
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

function searchPage(items: unknown): Reply {
  return gql({ searchProductExplorer: { total: 0, items } });
}

function userInfos(
  id: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    isDone: false,
    isWished: true,
    productId: id,
    rating: null,
    ...extra,
  };
}

function stateReply(product: unknown): Reply {
  return gql({ product });
}

const EVERYTHING: Respond = (call) => {
  if (call.init.method === "GET") return raw(200, seasonHtml);
  if (operationOf(call) === "UserCollection") return wishPage([], 0);
  if (operationOf(call) === "SearchProductExplorer") return searchPage([]);
  if (operationOf(call) === "ProductCurrentUserInfos") {
    const id = Number(variablesOf(call).id);
    return stateReply({ id, universe: 1, currentUserInfos: userInfos(id) });
  }
  return OK;
};

function setup(session: ScSession, respond: Respond = EVERYTHING) {
  return setupSession(async () => session, respond);
}

function setupSession(
  source: () => Promise<unknown>,
  respond: Respond = EVERYTHING,
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
  const getSession = vi.fn(source as () => Promise<ScSession>);
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
  ["productState", (c) => c.productState(5)],
  ["readWishlist", (c) => c.readWishlist("tvShow")],
  ["seasonInfo", (c) => c.seasonInfo(99153120, 1)],
  ["search", (c) => c.search("Titre", "movie")],
];
// The five writes and productState: every call that needs the token.
const TOKEN_METHODS = METHODS.slice(0, 6);
const SESSION_METHODS = METHODS.slice(0, 7);
// Every call that reads the session: search and seasonInfo read none.
const SESSION_READERS = SESSION_METHODS;

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
    "writes and productState reject with ScUnauthenticatedError and no fetch without a token (%j)",
    async (session) => {
      for (const [, run] of TOKEN_METHODS) {
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
  it.each(SESSION_METHODS)(
    "%s reads the session exactly once",
    async (_name, run) => {
      const { client, getSession } = setup(LOGGED_IN);
      await run(client);
      expect(getSession).toHaveBeenCalledTimes(1);
    },
  );

  it("seasonInfo never reads the session", async () => {
    const { client, getSession } = setup(LOGGED_IN);
    await client.seasonInfo(99153120, 1);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("seasonInfo works when the session cannot be read", async () => {
    const { client, getSession } = setupSession(async () => {
      throw new Error(LEAK);
    });
    const info = await client.seasonInfo(99153120, 1);
    expect(info.episodes).toHaveLength(10);
    expect(getSession).not.toHaveBeenCalled();
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
      wishPage([product(Number(variablesOf(call).offset) + 1)], 1_000_000_000),
    );
    const error = await failure(client.readWishlist("movie"));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(calls).toHaveLength(500);
  });
});

// A short or filtered read looks like the owner removed titles: it must reject, never return less.
describe("a wishlist read that comes back short or malformed", () => {
  const DROPPED = "SensCritique UserCollection: unreadable entry";
  const SHORT =
    "SensCritique UserCollection: item count differs from the total";

  async function rejection(respond: Respond): Promise<Error> {
    const { client } = setup(LOGGED_IN, respond);
    const error = await failure(client.readWishlist("movie"));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(error).not.toBeInstanceOf(ScUnauthenticatedError);
    return error;
  }

  it("rejects a short last page: 19 items read for a total of 20 (probe P5)", async () => {
    const first = Array.from({ length: 18 }, (_v, i) => product(i + 1));
    const error = await rejection((call) =>
      Number(variablesOf(call).offset) === 0
        ? wishPage(first, 20)
        : wishPage([product(19)], 20),
    );
    expect(error.message).toBe(SHORT);
  });

  it("rejects a single page shorter than its total", async () => {
    const error = await rejection(() => wishPage([product(1)], 2));
    expect(error.message).toBe(SHORT);
  });

  it("rejects a page holding more items than the total, however large", async () => {
    const ids = Array.from({ length: 20_000 }, (_v, i) => i + 1);
    const error = await rejection(() => wishPage(ids.map(product), 18));
    expect(error.message).toBe(SHORT);
  });

  it("rejects an entry the parser drops: a null url (probe P5)", async () => {
    const page = [product(1), { ...product(2), url: null }, product(3)];
    const error = await rejection(() => wishPage(page, 3));
    expect(error.message).toBe(DROPPED);
  });

  it("rejects a dropped entry even when the count left matches the total", async () => {
    const page = [product(1), { ...product(2), url: null }, product(3)];
    const error = await rejection(() => wishPage(page, 2));
    expect(error.message).toBe(DROPPED);
  });

  it.each([
    ["a missing title", { ...product(2), title: undefined }],
    ["a missing id", { ...product(2), id: undefined }],
    ["a null entry", null],
    ["a string entry", "x"],
  ])("rejects a dropped entry: %s", async (_n, entry) => {
    const error = await rejection(() =>
      wishPage([product(1), entry, product(3)], 3),
    );
    expect(error.message).toBe(DROPPED);
  });

  it.each([
    ["a fractional id (probe P5)", 1.5],
    ["a negative id (probe P5)", -3],
    ["a zero id", 0],
    ["an unsafe id", 2 ** 53],
    ["a string id", "7"],
  ])("rejects %s", async (_n, id) => {
    const error = await rejection(() =>
      wishPage([product(1), { ...product(2), id }], 2),
    );
    expect(error.message).toBe(DROPPED);
  });

  it("rejects a dropped entry on a later page", async () => {
    const full = wishlistOf(40);
    const { client, calls } = setup(LOGGED_IN, (call, index) =>
      index === 1
        ? wishPage(
            [...Array.from({ length: 17 }, (_v, i) => product(2000 + i)), null],
            40,
          )
        : full(call, index),
    );
    const error = await failure(client.readWishlist("movie"));
    expect(error.message).toBe(DROPPED);
    expect(calls).toHaveLength(2);
  });

  it("still reads a whole list whose pages add up to the total", async () => {
    const { client } = setup(LOGGED_IN, wishlistOf(37));
    expect(await client.readWishlist("movie")).toHaveLength(37);
  });

  const DUPLICATE =
    "SensCritique UserCollection: duplicate product in the read";

  it("rejects a product listed twice across pages: the count matches, but 19 would look removed", async () => {
    const first = Array.from({ length: 18 }, (_v, i) => product(i + 1));
    const second = [
      product(18),
      ...Array.from({ length: 17 }, (_v, i) => product(i + 20)),
    ];
    const error = await rejection((call) =>
      Number(variablesOf(call).offset) === 0
        ? wishPage(first, 36)
        : wishPage(second, 36),
    );
    expect(error.message).toBe(DUPLICATE);
  });

  it("rejects a product listed twice in one page", async () => {
    const error = await rejection(() =>
      wishPage([product(1), product(2), product(1)], 3),
    );
    expect(error.message).toBe(DUPLICATE);
  });
});

describe("seasonInfo", () => {
  it("GETs the public season page with no cookie, no header and no token", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.seasonInfo(99153120, 1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(SEASON_URL);
    expect(calls[0]?.init).toStrictEqual({
      method: "GET",
      headers: {},
      credentials: "omit",
      redirect: "follow",
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
        // The search sends no token at all (Ruling 20); every other Apollo call sends it.
        const search = operationOf(call) === "SearchProductExplorer";
        expect(authorization).toBe(search ? undefined : TOKEN);
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

function leakyError(): Error {
  const error = new Error(`${TOKEN} ${LEAK}`, { cause: `${TOKEN} ${LEAK}` });
  error.stack = `${error.stack} ${TOKEN} ${LEAK}`;
  return Object.assign(error, { body: `${TOKEN} ${LEAK}` });
}

describe("a session that cannot be read", () => {
  const REJECTIONS: [string, () => unknown][] = [
    ["an Error carrying secrets everywhere", leakyError],
    ["a string carrying secrets", () => `${TOKEN} ${LEAK}`],
  ];

  describe.each(REJECTIONS)("rejecting with %s", (_label, make) => {
    it.each(SESSION_READERS)(
      "%s rejects with a bare ScUnavailableError and sends nothing",
      async (_name, run) => {
        const { client, calls, getSession } = setupSession(async () => {
          throw make();
        });
        const error = await failure(run(client));
        expect(error).toBeInstanceOf(ScUnavailableError);
        expect(error).not.toBeInstanceOf(ScUnauthenticatedError);
        expect(error.message).toBe("SensCritique session: could not be read");
        expect(error.cause).toBeUndefined();
        const seen = [
          error.message,
          String(error),
          error.stack ?? "",
          JSON.stringify(error),
          ...Object.values(error).map(String),
        ].join("\n");
        expect(seen).not.toContain(TOKEN);
        expect(seen).not.toContain("LEAK");
        expect(calls).toHaveLength(0);
        expect(getSession).toHaveBeenCalledTimes(1);
      },
    );
  });

  const throwingGetter = (field: "token" | "username") =>
    Object.defineProperty({ token: TOKEN, username: "u" }, field, {
      get() {
        throw leakyError();
      },
    });
  const READS_THAT_THROW: [string, () => unknown][] = [
    ["a token getter that throws the token", () => throwingGetter("token")],
    [
      "a username getter that throws the token",
      () => throwingGetter("username"),
    ],
    [
      "a Proxy whose field reads throw the token",
      // `then` is read while the promise resolves, inside the getSession guard: only the fields throw.
      () =>
        new Proxy(
          {},
          {
            get(_target, key) {
              if (key === "then") return undefined;
              throw leakyError();
            },
          },
        ),
    ],
  ];

  describe.each(READS_THAT_THROW)("resolving %s", (_label, make) => {
    it.each(SESSION_READERS)(
      "%s rejects with the fixed session error and sends nothing",
      async (_name, run) => {
        const { client, calls } = setupSession(async () => make());
        const error = await failure(run(client));
        expect(error).toBeInstanceOf(ScUnavailableError);
        expect(error).not.toBeInstanceOf(ScUnauthenticatedError);
        expect(error.message).toBe("SensCritique session: could not be read");
        expect(error.cause).toBeUndefined();
        const seen = [
          error.message,
          String(error),
          error.stack ?? "",
          JSON.stringify(error),
          ...Object.values(error).map(String),
        ].join("\n");
        expect(seen).not.toContain(TOKEN);
        expect(seen).not.toContain("LEAK");
        expect(calls).toHaveLength(0);
      },
    );
  });

  it.each([
    ["null", null],
    ["a number", 7],
    ["a string", TOKEN],
  ])("a resolved %s counts as no token and no username", async (_n, value) => {
    for (const [, run] of SESSION_METHODS) {
      const { client, calls } = setupSession(async () => value);
      const error = await failure(run(client));
      expect(error).toBeInstanceOf(ScUnauthenticatedError);
      expect(calls).toHaveLength(0);
    }
  });

  it("a token that is not a string counts as no token", async () => {
    const value = { token: 42, username: "u" };
    for (const [, run] of TOKEN_METHODS) {
      const { client, calls } = setupSession(async () => value);
      expect(await failure(run(client))).toBeInstanceOf(ScUnauthenticatedError);
      expect(calls).toHaveLength(0);
    }
    const { client, calls } = setupSession(async () => value);
    await client.readWishlist("movie");
    expect(calls[0]?.init.headers).toStrictEqual({
      "content-type": "application/json",
    });
  });

  it("a username that is not a string counts as no username", async () => {
    const value = { token: TOKEN, username: 42 };
    const { client, calls } = setupSession(async () => value);
    expect(await failure(client.readWishlist("movie"))).toBeInstanceOf(
      ScUnauthenticatedError,
    );
    expect(calls).toHaveLength(0);
    await client.wish(5);
    expect(calls).toHaveLength(1);
  });
});

describe("runtime guards on ids, season and date", () => {
  const BAD_IDS: [string, unknown][] = [
    ["0", 0],
    ["-1", -1],
    ["1.5", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["2 ** 53", 2 ** 53],
    ["a path-like string", "../../account?x="],
  ];
  const asNumber = (value: unknown) => value as number;
  const BY_ID: [string, (c: ScClient, id: number) => Promise<unknown>][] = [
    ["wish", (c, id) => c.wish(id)],
    ["unwish", (c, id) => c.unwish(id)],
    ["unmarkDone", (c, id) => c.unmarkDone(id)],
    ["rate", (c, id) => c.rate(id, 8)],
    ["markDone", (c, id) => c.markDone(id, "2026-11-02")],
    ["productState", (c, id) => c.productState(id)],
    ["seasonInfo (series id)", (c, id) => c.seasonInfo(id, 1)],
  ];

  describe.each(BY_ID)("%s", (_name, run) => {
    it.each(BAD_IDS)(
      "rejects the id %s before anything else",
      async (_l, bad) => {
        const { client, calls, getSession } = setup({});
        const error = await failure(run(client, asNumber(bad)));
        expect(error).toBeInstanceOf(RangeError);
        expect(calls).toHaveLength(0);
        expect(getSession).not.toHaveBeenCalled();
      },
    );

    it("accepts the smallest id, 1", async () => {
      const { client, calls } = setup(LOGGED_IN);
      await run(client, 1);
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  it.each(BAD_IDS.filter(([label]) => label !== "0"))(
    "seasonInfo rejects the season %s",
    async (_l, bad) => {
      const { client, calls } = setup(LOGGED_IN);
      const error = await failure(client.seasonInfo(99153120, asNumber(bad)));
      expect(error).toBeInstanceOf(RangeError);
      expect(calls).toHaveLength(0);
    },
  );

  it("seasonInfo accepts season 0", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.seasonInfo(99153120, 0);
    expect(calls).toHaveLength(1);
  });

  it.each([
    "2026-13-45",
    "2026-02-30",
    "2026-00-10",
    "2026-04-31",
    "2027-02-29",
    "2026-01-00",
    "0099-01-01",
  ])("markDone rejects the impossible date %s", async (date) => {
    const { client, calls, getSession } = setup(LOGGED_IN);
    const error = await failure(client.markDone(5, date));
    expect(error).toBeInstanceOf(RangeError);
    expect(calls).toHaveLength(0);
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-1-2", "YYYY-MM-DD"],
    ["x2026-11-02", "YYYY-MM-DD"],
    ["2026-11-02x", "YYYY-MM-DD"],
    ["2026-02-30", "real calendar day"],
    ["2026-13-45", "real calendar day"],
  ])("markDone %s fails on the right check (%s)", async (date, part) => {
    const { client } = setup(LOGGED_IN);
    const error = await failure(client.markDone(5, date));
    expect(error).toBeInstanceOf(RangeError);
    expect(error.message).toContain(part);
  });

  it.each(["2028-02-29", "2026-12-31", "2026-01-01"])(
    "markDone accepts the real date %s",
    async (date) => {
      const { client, calls } = setup(LOGGED_IN);
      await client.markDone(5, date);
      expect(variablesOf(calls[1] as Call).date).toBe(date);
    },
  );
});

const BIG_LIMIT = 2_000_000;

function padded(text: string, length: number): string {
  return text + " ".repeat(length - text.length);
}

describe("transport options", () => {
  it("every Apollo request pins its options exactly", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.markDone(5, "2026-11-02");
    await client.readWishlist("movie");
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.init).toStrictEqual({
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: TOKEN,
        },
        body: expect.any(String),
        credentials: "omit",
        redirect: "error",
      });
    }
  });

  it("the season request has no body and follows redirects", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.seasonInfo(99153120, 1);
    expect(Object.keys(calls[0]?.init ?? {}).sort()).toEqual([
      "credentials",
      "headers",
      "method",
      "redirect",
    ]);
    expect(calls[0]?.init.redirect).toBe("follow");
    expect(calls[0]?.init.credentials).toBe("omit");
  });
});

describe("response size cap", () => {
  const json = (length: number) => padded(JSON.stringify({ data: {} }), length);

  it("accepts a GraphQL body of exactly 2 000 000 characters", async () => {
    const { client } = setup(LOGGED_IN, () => raw(200, json(BIG_LIMIT)));
    await client.wish(5);
  });

  it("rejects a GraphQL body one character over, without echoing it", async () => {
    const body = padded(LEAK, BIG_LIMIT + 1);
    const { client } = setup(LOGGED_IN, () => raw(200, body));
    const error = await failure(client.wish(5));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(error.message).toContain("ProductWish");
    expect(error.message).toContain("200");
    expect(error.message).not.toContain("LEAK");
  });

  it("accepts a season page of exactly 2 000 000 characters", async () => {
    const { client } = setup(LOGGED_IN, () =>
      raw(200, padded(seasonHtml, BIG_LIMIT)),
    );
    expect((await client.seasonInfo(99153120, 1)).episodes).toHaveLength(10);
  });

  it("rejects a season page one character over", async () => {
    const { client } = setup(LOGGED_IN, () =>
      raw(200, padded(seasonHtml, BIG_LIMIT + 1)),
    );
    const error = await failure(client.seasonInfo(99153120, 1));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(error.message).toContain("season page");
  });
});

describe("a wishlist that changes during the read", () => {
  function changing(totalOf: (index: number) => number): Respond {
    return (call, index) => {
      const offset = Number(variablesOf(call).offset);
      const total = totalOf(index);
      const ids = [];
      for (let i = offset; i < Math.min(offset + 18, 40); i += 1) {
        ids.push(1000 + i);
      }
      return wishPage(ids.map(product), total);
    };
  }

  it.each([
    ["grows", 41],
    ["shrinks", 39],
    ["is cut short", 20],
  ])("rejects when the total %s on a later page", async (_n, later) => {
    const { client, calls } = setup(
      LOGGED_IN,
      changing((index) => (index === 0 ? 40 : later)),
    );
    const error = await failure(client.readWishlist("movie"));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(calls).toHaveLength(2);
  });

  it("rejects when only the last page disagrees", async () => {
    const { client, calls } = setup(
      LOGGED_IN,
      changing((index) => (index === 2 ? 38 : 40)),
    );
    const error = await failure(client.readWishlist("movie"));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(error.message).toBe(
      "SensCritique UserCollection: list changed during the read",
    );
    expect(calls).toHaveLength(3);
  });

  it("reads three pages for a total that stays at 40", async () => {
    const { client, calls } = setup(
      LOGGED_IN,
      changing(() => 40),
    );
    expect(await client.readWishlist("movie")).toHaveLength(40);
    expect(calls).toHaveLength(3);
  });

  it("reads the largest list the page cap allows: 9000 items in 500 pages", async () => {
    const { client, calls } = setup(LOGGED_IN, wishlistOf(9000));
    expect(await client.readWishlist("movie")).toHaveLength(9000);
    expect(calls).toHaveLength(500);
  });
});

describe("productState", () => {
  const STATE_ERROR =
    "SensCritique ProductCurrentUserInfos: unexpected product state";
  const PERSONAL = { dateDone: TOKEN, userId: LEAK };

  function expectClean(error: Error): void {
    const seen = [
      error.message,
      String(error),
      error.stack ?? "",
      JSON.stringify(error),
      ...Object.values(error).map(String),
      String(error.cause ?? ""),
    ].join("\n");
    expect(seen).not.toContain(TOKEN);
    expect(seen).not.toContain("LEAK");
    expect(error.cause).toBeUndefined();
  }

  it("sends one ProductCurrentUserInfos POST with the raw token and the id variable", async () => {
    const { client, calls, getSession } = setup(LOGGED_IN);
    await client.productState(5);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(APOLLO);
    expect(calls[0]?.init).toStrictEqual({
      method: "POST",
      headers: { "content-type": "application/json", authorization: TOKEN },
      body: expect.any(String),
      credentials: "omit",
      redirect: "error",
    });
    expect(JSON.parse(calls[0]?.init.body ?? "")).toStrictEqual({
      operationName: "ProductCurrentUserInfos",
      variables: { id: 5 },
      query: GQL.ProductCurrentUserInfos,
    });
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("asks for the requested product", async () => {
    const { client, calls } = setup(LOGGED_IN);
    await client.productState(41);
    expect(variablesOf(calls[0] as Call)).toStrictEqual({ id: 41 });
  });

  it.each([
    [false, false, 1],
    [true, false, 4],
    [false, true, 32],
    [true, true, 5],
  ])(
    "returns isDone %s, isWished %s and the universe %s",
    async (isDone, isWished, universe) => {
      const infos = { isDone, isWished, productId: 7, rating: null };
      const { client } = setup(LOGGED_IN, () =>
        stateReply({ id: 7, universe, currentUserInfos: infos }),
      );
      expect(await client.productState(7)).toStrictEqual({
        isDone,
        isWished,
        universe,
        rating: null,
      });
    },
  );

  it("returns only the flags, the universe and the owner's rating, whatever else the answer holds", async () => {
    const infos = userInfos(5, {
      ...PERSONAL,
      isDone: true,
      isWished: false,
      rating: 6,
      id: LEAK,
      review: { url: LEAK },
    });
    const { client } = setup(LOGGED_IN, () =>
      stateReply({ id: 5, universe: 1, slug: LEAK, currentUserInfos: infos }),
    );
    const state = await client.productState(5);
    expect(state).toStrictEqual({
      isDone: true,
      isWished: false,
      universe: 1,
      rating: 6,
    });
    expect(Object.keys(state).sort()).toEqual([
      "isDone",
      "isWished",
      "rating",
      "universe",
    ]);
    expect(JSON.stringify(state)).not.toContain("LEAK");
    expect(JSON.stringify(state)).not.toContain(TOKEN);
  });

  const product5 = (extra: Record<string, unknown>): Reply =>
    stateReply({ id: 5, universe: 1, ...extra });
  const withInfos = (infos: unknown): Reply =>
    product5({ currentUserInfos: infos });
  const withUniverse = (universe: unknown): Reply =>
    product5({ universe, currentUserInfos: userInfos(5, PERSONAL) });
  const flags = (extra: Record<string, unknown>): Reply =>
    withInfos(userInfos(5, { ...PERSONAL, ...extra }));
  const without = (key: string): Reply => {
    const infos = userInfos(5, PERSONAL);
    delete infos[key];
    return withInfos(infos);
  };
  const MALFORMED: [string, Reply][] = [
    ["no product", gql({ other: LEAK })],
    ["a null product", stateReply(null)],
    ["a product that is a list", stateReply([LEAK, TOKEN])],
    ["a product that is a string", stateReply(`${TOKEN} ${LEAK}`)],
    ["no currentUserInfos", product5({ title: LEAK })],
    ["a currentUserInfos of false", withInfos(false)],
    ["a currentUserInfos that is a list", withInfos([true, true])],
    ["a currentUserInfos that is a string", withInfos(`${TOKEN} ${LEAK}`)],
    ["no isDone", without("isDone")],
    ["isDone as a string", flags({ isDone: "true" })],
    ["isDone as 1", flags({ isDone: 1 })],
    ["a null isDone", flags({ isDone: null })],
    ["no isWished", without("isWished")],
    ["isWished as a string", flags({ isWished: "false" })],
    ["isWished as 0", flags({ isWished: 0 })],
    ["no rating", without("rating")],
    ["a rating of 0", flags({ rating: 0 })],
    ["a rating of 11", flags({ rating: 11 })],
    ["a rating of -1", flags({ rating: -1 })],
    ["a rating as a string", flags({ rating: "7" })],
    ["a rating of 7.5", flags({ rating: 7.5 })],
    ["a rating that is a boolean", flags({ rating: true })],
    ["no productId", without("productId")],
    ["a foreign productId", withInfos(userInfos(6, PERSONAL))],
    ["a productId as a string", flags({ productId: "5" })],
    [
      "no product id",
      stateReply({ universe: 1, currentUserInfos: userInfos(5, PERSONAL) }),
    ],
    [
      "a foreign product id",
      product5({ id: 6, currentUserInfos: userInfos(5, PERSONAL) }),
    ],
    [
      "a product id as a string",
      product5({ id: "5", currentUserInfos: userInfos(5, PERSONAL) }),
    ],
    [
      "no universe",
      stateReply({ id: 5, currentUserInfos: userInfos(5, PERSONAL) }),
    ],
    ["a null universe", withUniverse(null)],
    ["a universe as a string", withUniverse("1")],
    ["a universe of 1.5", withUniverse(1.5)],
    ["a universe of 2 ** 53", withUniverse(2 ** 53)],
    ["a universe that is a boolean", withUniverse(true)],
  ];

  describe("the owner's own rating, and no season count", () => {
    const read = async (product: Record<string, unknown>) => {
      const { client } = setup(LOGGED_IN, () =>
        stateReply({ id: 5, universe: 1, ...product }),
      );
      return client.productState(5);
    };

    it.each([1, 7, 10])("keeps a rating of %s", async (rating) => {
      const state = await read({ currentUserInfos: userInfos(5, { rating }) });
      expect(state.rating).toBe(rating);
    });

    it("keeps a null rating as null", async () => {
      const state = await read({
        currentUserInfos: userInfos(5, { rating: null }),
      });
      expect(state.rating).toBeNull();
    });

    it("reads currentUserInfos.rating, not the community average of the product", async () => {
      const state = await read({
        rating: 7.4,
        currentUserInfos: userInfos(5, { rating: 6 }),
      });
      expect(state.rating).toBe(6);
    });

    it("a null own rating stays null whatever the community average", async () => {
      const state = await read({
        rating: 8,
        currentUserInfos: userInfos(5, { rating: null }),
      });
      expect(state.rating).toBeNull();
    });

    it.each([
      ["4", 4],
      ["0", 0],
      ["-2", -2],
      ["1.5", 1.5],
      ['"3"', "3"],
      ["2 ** 53", 2 ** 53],
      ["null", null],
    ])(
      "a product with numberOfSeasons %s still reads, without the count",
      async (_n, numberOfSeasons) => {
        const state = await read({
          numberOfSeasons,
          currentUserInfos: userInfos(5, { rating: 6 }),
        });
        expect(state).toEqual({
          isDone: false,
          isWished: true,
          universe: 1,
          rating: 6,
        });
      },
    );
  });

  it.each(MALFORMED)(
    "rejects %s with the fixed error and leaks nothing",
    async (_name, reply) => {
      const { client, calls } = setup(LOGGED_IN, () => reply);
      const error = await failure(client.productState(5));
      expect(error).toBeInstanceOf(ScUnavailableError);
      expect(error).not.toBeInstanceOf(ScUnauthenticatedError);
      expect(error.name).toBe("ScUnavailableError");
      expect(error.message).toBe(STATE_ERROR);
      expectClean(error);
      expect(calls).toHaveLength(1);
    },
  );

  // SensCritique answers 200 with the product and `currentUserInfos: null` for a token it does not
  // recognize (verified 2026-11-04): the owner has to log in again.
  it.each([
    [
      "the requested product",
      product5({ title: LEAK, currentUserInfos: null }),
    ],
    [
      "the requested product without a universe",
      stateReply({ id: 5, title: LEAK, currentUserInfos: null }),
    ],
  ])(
    "rejects a null currentUserInfos on %s as an unrecognized session, leaking nothing",
    async (_name, reply) => {
      const { client, calls } = setup(LOGGED_IN, () => reply);
      const error = await failure(client.productState(5));
      expect(error).toBeInstanceOf(ScUnauthenticatedError);
      expect(error.name).toBe("ScUnauthenticatedError");
      expect(error.message).toBe(
        "Not logged in to SensCritique: log in again on senscritique.com",
      );
      expectClean(error);
      expect(calls).toHaveLength(1);
    },
  );

  it.each([
    ["a foreign product id", product5({ id: 6, currentUserInfos: null })],
    ["a product id as a string", product5({ id: "5", currentUserInfos: null })],
  ])(
    "keeps the generic error for a null currentUserInfos on %s",
    async (_name, reply) => {
      const { client } = setup(LOGGED_IN, () => reply);
      const error = await failure(client.productState(5));
      expect(error).not.toBeInstanceOf(ScUnauthenticatedError);
      expect(error.name).toBe("ScUnavailableError");
      expect(error.message).toBe(STATE_ERROR);
      expectClean(error);
    },
  );

  it("maps a GraphQL Unauthenticated error to ScUnauthenticatedError", async () => {
    const body = JSON.stringify({
      errors: [{ message: `Unauthenticated ${TOKEN} ${LEAK}` }],
    });
    const { client } = setup(LOGGED_IN, () => raw(200, body));
    const error = await failure(client.productState(5));
    expect(error).toBeInstanceOf(ScUnauthenticatedError);
    expectClean(error);
  });

  it.each([
    ["HTTP 500", raw(500, `${TOKEN} ${LEAK}`)],
    ["a null data", raw(200, JSON.stringify({ data: null, x: LEAK }))],
    ["a challenge page", raw(200, `<html>${TOKEN} ${LEAK}</html>`)],
  ])(
    "rejects %s through the transport, naming the operation",
    async (_n, reply) => {
      const { client } = setup(LOGGED_IN, () => reply);
      const error = await failure(client.productState(5));
      expect(error).toBeInstanceOf(ScUnavailableError);
      expect(error.message).toContain("ProductCurrentUserInfos");
      expectClean(error);
    },
  );
});

describe("search", () => {
  const ENTRY = (id: number, universe: unknown): Record<string, unknown> => ({
    id,
    title: `Titre ${id}`,
    originalTitle: `Original ${id}`,
    url: `/film/titre/${id}`,
    universe,
    dateRelease: "1999-05-12",
  });
  const found =
    (...items: unknown[]) =>
    () =>
      searchPage(items);
  const SEARCH_HEADERS = { "content-type": "application/json" };

  it("sends one SearchProductExplorer POST with the fixed variables", async () => {
    const { client, calls } = setup(LOGGED_IN, found());
    await client.search("Amélie", "movie");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(APOLLO);
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.credentials).toBe("omit");
    expect(calls[0]?.init.redirect).toBe("error");
    expect(JSON.parse(calls[0]?.init.body ?? "")).toEqual({
      operationName: "SearchProductExplorer",
      variables: {
        query: "Amélie",
        filters: [{ identifier: "universe", termValues: ["movie"] }],
        sortBy: "RELEVANCE",
        limit: 16,
        offset: 0,
      },
      query: GQL.SearchProductExplorer,
    });
  });

  it("filters on tvShow for a series", async () => {
    const { client, calls } = setup(LOGGED_IN, found());
    await client.search("Dark", "tvShow");
    expect(variablesOf(calls[0] as Call).filters).toEqual([
      { identifier: "universe", termValues: ["tvShow"] },
    ]);
  });

  it("sends the trimmed query", async () => {
    const { client, calls } = setup(LOGGED_IN, found());
    await client.search("  Amélie \n", "movie");
    expect(variablesOf(calls[0] as Call).query).toBe("Amélie");
  });

  // Ruling 20 (spec §5, probe 3): the search answers without a token, so it never reads the session.
  it("sends no authorization header, even when the session has a token", async () => {
    const { client, calls } = setup(LOGGED_IN, found());
    await client.search("x", "movie");
    expect(calls[0]?.init.headers).toStrictEqual(SEARCH_HEADERS);
    expect(JSON.stringify(calls)).not.toContain(TOKEN);
  });

  it("makes no www request: its only request is the Apollo POST", async () => {
    const urls: string[] = [];
    const fetch: Fetch = async (url) => {
      urls.push(url);
      const page = url === APOLLO ? searchPage([]).body : "<html></html>";
      return { ok: true, status: 200, text: async () => String(page) };
    };
    const client = createScClient({
      fetch,
      getSession: createSessionReader(fetch),
    });
    expect(await client.search("x", "movie")).toEqual([]);
    expect(urls).toEqual([APOLLO]);
  });

  it("never calls a session reader, even one that would fail", async () => {
    const { client, calls, getSession } = setupSession(
      async () => {
        throw new Error(`reader ${TOKEN}`);
      },
      found(ENTRY(7, 1)),
    );
    expect(await client.search("x", "movie")).toHaveLength(1);
    expect(getSession).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["an empty session", {}],
    ["a username only", { username: "u" }],
    ["an empty token", { token: "" }],
  ])(
    "searches without any authorization header for %s",
    async (_n, session) => {
      const { client, calls } = setup(session, found(ENTRY(7, 1)));
      expect(await client.search("x", "movie")).toHaveLength(1);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.init.headers).toStrictEqual(SEARCH_HEADERS);
    },
  );

  it("reads no session and makes one request", async () => {
    const { client, calls, getSession } = setup(LOGGED_IN, found());
    await client.search("x", "movie");
    expect(getSession).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("maps an item with the wishlist parser", async () => {
    const { client } = setup(LOGGED_IN, found(ENTRY(7, 1)));
    expect(await client.search("x", "movie")).toEqual([
      {
        productId: 7,
        title: "Titre 7",
        originalTitle: "Original 7",
        url: "/film/titre/7",
        year: 1999,
        universe: 1,
      },
    ]);
  });

  it("keeps the order of the answer", async () => {
    const items = [ENTRY(9, 1), ENTRY(3, 1), ENTRY(5, 1)];
    const { client } = setup(LOGGED_IN, found(...items));
    const got = await client.search("x", "movie");
    expect(got.map((item) => item.productId)).toEqual([9, 3, 5]);
  });

  it("returns an empty list for an empty answer", async () => {
    const { client } = setup(LOGGED_IN, found());
    expect(await client.search("x", "movie")).toEqual([]);
  });

  describe("the universe filter", () => {
    const MIXED = [
      ENTRY(1, 1),
      ENTRY(2, 3),
      ENTRY(3, 4),
      ENTRY(4, 5),
      ENTRY(5, 32),
      ENTRY(6, 1),
      ENTRY(7, 4),
    ];

    it("keeps only films for movie, even if the filter was ignored", async () => {
      const { client } = setup(LOGGED_IN, found(...MIXED));
      const got = await client.search("x", "movie");
      expect(got.map((item) => item.productId)).toEqual([1, 6]);
    });

    it("keeps only series for tvShow, even if the filter was ignored", async () => {
      const { client } = setup(LOGGED_IN, found(...MIXED));
      const got = await client.search("x", "tvShow");
      expect(got.map((item) => item.productId)).toEqual([3, 7]);
    });

    it.each([
      ["a game", 3],
      ["a season", 5],
      ["an episode", 32],
      ["a string universe", "1"],
      ["a null universe", null],
      ["no universe", undefined],
      ["a boolean universe", true],
    ])("drops %s", async (_n, universe) => {
      const { client } = setup(LOGGED_IN, found(ENTRY(1, universe)));
      expect(await client.search("x", "movie")).toEqual([]);
    });

    it("drops a series from a movie search and a film from a tvShow search", async () => {
      const { client } = setup(LOGGED_IN, found(ENTRY(1, 4)));
      expect(await client.search("x", "movie")).toEqual([]);
      const other = setup(LOGGED_IN, found(ENTRY(1, 1)));
      expect(await other.client.search("x", "tvShow")).toEqual([]);
    });
  });

  describe("pictures", () => {
    const withPicture = (id: number, picture: unknown) => ({
      ...ENTRY(id, 1),
      medias: { picture },
    });

    it("keeps an allowed picture, drops a foreign one, keeps both items", async () => {
      const ok = "https://media.senscritique.com/media/m/1/300/x.jpg";
      const { client } = setup(
        LOGGED_IN,
        found(
          withPicture(1, ok),
          withPicture(2, "https://not-sc.example/x.jpg"),
          withPicture(3, 42),
        ),
      );
      const got = await client.search("x", "movie");
      expect(got.map((item) => item.productId)).toEqual([1, 2, 3]);
      expect(got[0]?.image).toEqual({ picture: ok });
      expect(got[1]).not.toHaveProperty("image");
      expect(got[2]).not.toHaveProperty("image");
    });
  });

  describe("the query checks", () => {
    const BAD: [string, unknown][] = [
      ["an empty string", ""],
      ["blanks only", " \t\n "],
      ["201 characters", "a".repeat(201)],
      ["201 characters after trimming", ` ${"a".repeat(201)} `],
      ["a lone surrogate", "ab\uD800"],
      ["a number", 42],
      ["undefined", undefined],
      ["null", null],
      ["an object", { toString: () => "x" }],
    ];

    it.each(BAD)(
      "rejects %s with a RangeError before any session read or fetch",
      async (_n, query) => {
        const { client, calls, getSession } = setup(LOGGED_IN, found());
        const error = await failure(client.search(query as string, "movie"));
        expect(error).toBeInstanceOf(RangeError);
        expect(calls).toHaveLength(0);
        expect(getSession).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["1 character", "a", "a"],
      ["200 characters", "a".repeat(200), "a".repeat(200)],
      [
        "200 characters between blanks",
        ` ${"a".repeat(200)} `,
        "a".repeat(200),
      ],
    ])("accepts %s", async (_n, query, sent) => {
      const { client, calls } = setup(LOGGED_IN, found());
      await client.search(query, "movie");
      expect(variablesOf(calls[0] as Call).query).toBe(sent);
    });

    it("rejects an unknown universe before any session read or fetch", async () => {
      const { client, calls, getSession } = setup(LOGGED_IN, found());
      const error = await failure(client.search("x", "game" as "movie"));
      expect(error).toBeInstanceOf(RangeError);
      expect(calls).toHaveLength(0);
      expect(getSession).not.toHaveBeenCalled();
    });
  });

  describe("an answer that cannot be read", () => {
    const body = (searchProductExplorer: unknown): Reply =>
      gql({ searchProductExplorer });
    const UNREADABLE: [string, Reply][] = [
      ["no searchProductExplorer", gql({ other: LEAK })],
      ["a null searchProductExplorer", body(null)],
      ["a searchProductExplorer that is a list", body([LEAK])],
      ["a searchProductExplorer that is a string", body(LEAK)],
      ["no items", body({ total: 1 })],
      ["null items", body({ total: 1, items: null })],
      ["items that is an object", body({ total: 1, items: { 0: LEAK } })],
      ["items that is a string", body({ total: 1, items: LEAK })],
    ];

    it.each(UNREADABLE)(
      "rejects %s with a clean ScUnavailableError",
      async (_n, reply) => {
        const { client } = setup(LOGGED_IN, () => reply);
        const error = await failure(client.search("x", "movie"));
        expect(error).toBeInstanceOf(ScUnavailableError);
        expect(error).not.toBeInstanceOf(ScUnauthenticatedError);
        expect(error.message).toContain("SearchProductExplorer");
        expect(String(error) + (error.stack ?? "")).not.toContain(LEAK);
        expect(String(error)).not.toContain(TOKEN);
      },
    );

    const GOOD = ENTRY(1, 1);
    const BAD_ITEMS: [string, unknown][] = [
      ["a null item", null],
      ["a string item", LEAK],
      ["a list item", [LEAK]],
      ["an item without id", { ...GOOD, id: undefined, title: LEAK }],
      ["an item with id 0", { ...GOOD, id: 0, title: LEAK }],
      ["an item with a string id", { ...GOOD, id: "2", title: LEAK }],
      ["an item without title", { ...GOOD, id: 2, title: undefined }],
      ["an item with a numeric title", { ...GOOD, id: 2, title: 5 }],
      ["an item without url", { ...GOOD, id: 2, url: undefined }],
      ["an item with a numeric url", { ...GOOD, id: 2, url: 5 }],
      ["an unreadable item of another universe", { ...ENTRY(2, 3), id: -2 }],
    ];

    it.each(BAD_ITEMS)("rejects %s next to a good item", async (_n, item) => {
      const { client } = setup(LOGGED_IN, found(GOOD, item));
      const error = await failure(client.search("x", "movie"));
      expect(error).toBeInstanceOf(ScUnavailableError);
      expect(error.message).toBe(
        "SensCritique SearchProductExplorer: unreadable item",
      );
      expect(String(error) + (error.stack ?? "")).not.toContain(LEAK);
    });

    it("rejects an unreadable item placed before the good ones", async () => {
      const { client } = setup(LOGGED_IN, found(null, GOOD));
      expect(await failure(client.search("x", "movie"))).toBeInstanceOf(
        ScUnavailableError,
      );
    });
  });

  describe("transport failures", () => {
    it("maps a GraphQL Unauthenticated error to ScUnauthenticatedError", async () => {
      const text = JSON.stringify({ errors: [{ message: "Unauthenticated" }] });
      const { client } = setup(LOGGED_IN, () => raw(200, text));
      expect(await failure(client.search("x", "movie"))).toBeInstanceOf(
        ScUnauthenticatedError,
      );
    });

    it.each([
      ["HTTP 500", raw(500, `${TOKEN} ${LEAK}`)],
      ["a challenge page", raw(200, `<html>${TOKEN} ${LEAK}</html>`)],
      ["a null data", raw(200, JSON.stringify({ data: null, x: LEAK }))],
    ])(
      "rejects %s, naming the operation and leaking nothing",
      async (_n, reply) => {
        const { client } = setup(LOGGED_IN, () => reply);
        const error = await failure(client.search("x", "movie"));
        expect(error).toBeInstanceOf(ScUnavailableError);
        expect(error.message).toContain("SearchProductExplorer");
        const seen = String(error) + (error.stack ?? "");
        expect(seen).not.toContain(TOKEN);
        expect(seen).not.toContain(LEAK);
      },
    );
  });
});

describe("productState: the label for the preview", () => {
  const stateOf = async (extra: Record<string, unknown>) => {
    const { client } = setup(LOGGED_IN, () =>
      stateReply({
        id: 5,
        universe: 1,
        currentUserInfos: userInfos(5),
        ...extra,
      }),
    );
    return client.productState(5);
  };

  it("reads the title and the year of dateRelease", async () => {
    const state = await stateOf({
      title: "Enemy",
      dateRelease: "2013-09-08",
    });
    expect(state.label).toEqual({ title: "Enemy", year: 2013 });
  });

  it.each([
    [{ dateRelease: "2013-09-08", originalRun: "1999-01-01" }, 2013],
    [{ originalRun: "1999-01-01", yearOfProduction: 2005 }, 1999],
    [{ yearOfProduction: 2005 }, 2005],
    [{ yearOfProduction: "2005" }, 2005],
    [{ dateRelease: "abcd", yearOfProduction: 2005 }, 2005],
  ])("the year comes in order from %o: %s", async (dates, year) => {
    const state = await stateOf({ title: "T", ...dates });
    expect(state.label).toEqual({ title: "T", year });
  });

  it("a title with no usable year still gives a label", async () => {
    expect((await stateOf({ title: "T" })).label).toEqual({ title: "T" });
    expect((await stateOf({ title: "T", dateRelease: "abcd" })).label).toEqual({
      title: "T",
    });
  });

  it("an empty or non-string title gives no label, and the state is still read", async () => {
    for (const title of ["", 42, null, undefined, {}, [], true]) {
      const state = await stateOf({ title, dateRelease: "2013-09-08" });
      expect(state).toStrictEqual({
        isDone: false,
        isWished: true,
        universe: 1,
        rating: null,
      });
    }
  });

  const hostile = (patch: Record<string, unknown>) => patch;
  const THROWING = {
    get title(): string {
      throw new Error("boom");
    },
  };
  const THROWING_DATE = {
    title: "T",
    get dateRelease(): string {
      throw new Error("boom");
    },
  };
  const HOSTILE: [string, Record<string, unknown>][] = [
    ["title null", hostile({ title: null })],
    ["title {}", hostile({ title: {} })],
    ["title a getter that throws", THROWING],
    ["dateRelease a getter that throws", THROWING_DATE],
    ["dateRelease abcd", hostile({ title: "T", dateRelease: "abcd" })],
    ["dateRelease a boolean", hostile({ title: "T", dateRelease: true })],
    ["dateRelease {}", hostile({ title: "T", dateRelease: {} })],
    ["originalRun a list", hostile({ title: "T", originalRun: [1, 2] })],
    ["year 99999", hostile({ title: "T", yearOfProduction: 99999 })],
    ["year 12", hostile({ title: "T", yearOfProduction: 12 })],
    ["year NaN", hostile({ title: "T", yearOfProduction: Number.NaN })],
    ["year -2005", hostile({ title: "T", yearOfProduction: -2005 })],
    ["year 2005.5", hostile({ title: "T", yearOfProduction: 2005.5 })],
    ["date 99999-01-01", hostile({ title: "T", dateRelease: "99999-01-01" })],
  ];

  it.each(HOSTILE)("never throws: %s", (_name, patch) => {
    const product = { id: 5, universe: 1, currentUserInfos: userInfos(5) };
    Object.defineProperties(product, Object.getOwnPropertyDescriptors(patch));
    const state = readProductState({ data: { product } } as Envelope, 5);
    expect(state).toMatchObject({ isDone: false, isWished: true, universe: 1 });
    expect(state.label?.year).toBeUndefined();
  });

  it("a hostile year only drops the year, not the title", async () => {
    const state = await stateOf({ title: "T", yearOfProduction: 99999 });
    expect(state.label).toEqual({ title: "T" });
  });
});

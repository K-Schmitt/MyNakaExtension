import { describe, expect, it, vi } from "vitest";
import {
  createScClient,
  type Fetch,
  ScUnauthenticatedError,
  ScUnavailableError,
} from "../src/sc/sc-client";
import { createSessionReader } from "../src/sc/sc-session";

// A synthetic token of the observed shape (32 characters of [A-Za-z0-9_-]). Every token-like value in
// this file contains MARKER, so one scan finds any of them in an error.
const TOKEN = "MARKER_t0k3n-0123456789abcdefghi";
const LEAK = "LEAK-PERSONAL-DATA";
const USERNAME = "owner-name";
const HOME = "https://www.senscritique.com/";
const APOLLO = "https://apollo.senscritique.com/";
const CAP = 2_000_000;

type Init = Parameters<Fetch>[1];
type Call = { url: string; init: Init };
type Reply = { status: number; body: string | Error };

function nextData(json: string): string {
  return `<!DOCTYPE html><html><head><title>${LEAK}</title></head><body><div id="__next">${LEAK}</div><script id="__NEXT_DATA__" type="application/json">${json}</script></body></html>`;
}

function pageWith(pageProps: unknown): string {
  const data = { props: { pageProps }, page: "/", query: {}, buildId: LEAK };
  return nextData(JSON.stringify(data));
}

const ME = { username: USERNAME, email: LEAK, id: 7 };

// No default for meInfos: `undefined` must reach the page as a missing field.
function propsWith(
  cookies: unknown,
  meInfos: unknown,
): Record<string, unknown> {
  return { cookies, meInfos, other: LEAK };
}

function withToken(token: unknown): string {
  return pageWith(propsWith({ SC_AUTH: token, _ga: LEAK }, ME));
}

function withUsername(username: unknown): string {
  return pageWith(propsWith({ SC_AUTH: TOKEN }, { username, email: LEAK }));
}

const LOGGED_IN = withToken(TOKEN);
const LOGGED_OUT = pageWith(propsWith({ _ga: LEAK }, ME));

function ok(body: string): Reply {
  return { status: 200, body };
}

function fakeFetch(respond: (call: Call) => Reply) {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    const { status, body } = respond(call);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => {
        if (body instanceof Error) throw body;
        return body;
      },
    };
  };
  return { fetch, calls };
}

function readerOf(body: string) {
  const world = fakeFetch(() => ok(body));
  return { read: createSessionReader(world.fetch), calls: world.calls };
}

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected the call to reject with an Error");
}

function leakyError(): Error {
  const error = new Error(`${TOKEN} ${LEAK}`, { cause: `${TOKEN} ${LEAK}` });
  error.stack = `${error.stack} ${TOKEN} ${LEAK}`;
  return Object.assign(error, { body: `${TOKEN} ${LEAK}` });
}

// The scan of tests/sc-client.test.ts, plus every own property (enumerable or not).
function expectClean(error: Error): void {
  const seen = [
    error.message,
    String(error),
    error.stack ?? "",
    JSON.stringify(error),
    ...Object.values(error).map(String),
    ...Object.getOwnPropertyNames(error).map((key) =>
      String(Reflect.get(error, key)),
    ),
    String(error.cause ?? ""),
  ].join("\n");
  expect(seen).not.toContain(TOKEN);
  expect(seen).not.toContain("MARKER");
  expect(seen).not.toContain("LEAK");
  expect(error.cause).toBeUndefined();
}

async function expectFixedFailure(
  read: () => Promise<unknown>,
  message: string,
): Promise<void> {
  const error = await failure(read());
  expect(error).toBeInstanceOf(ScUnavailableError);
  expect(error).not.toBeInstanceOf(ScUnauthenticatedError);
  expect(error.name).toBe("ScUnavailableError");
  expect(error.message).toBe(message);
  expectClean(error);
}

describe("the request", () => {
  it("is one GET of the home page with the cookies, following redirects, with no header", async () => {
    const { read, calls } = readerOf(LOGGED_IN);
    await read();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(HOME);
    expect(calls[0]?.init).toStrictEqual({
      method: "GET",
      headers: {},
      credentials: "include",
      redirect: "follow",
    });
  });

  it("is not sent when the reader is created", () => {
    const { calls } = readerOf(LOGGED_IN);
    expect(calls).toHaveLength(0);
  });

  it("is sent again on every read, and nothing is cached between reads", async () => {
    const pages = [LOGGED_IN, LOGGED_OUT];
    const world = fakeFetch(() => ok(pages.shift() ?? ""));
    const read = createSessionReader(world.fetch);
    expect(await read()).toStrictEqual({ token: TOKEN, username: USERNAME });
    expect(await read()).toStrictEqual({ username: USERNAME });
    expect(world.calls).toHaveLength(2);
  });
});

describe("a readable home page", () => {
  it("gives the token and the username", async () => {
    const { read } = readerOf(LOGGED_IN);
    expect(await read()).toStrictEqual({ token: TOKEN, username: USERNAME });
  });

  it("returns an object holding exactly token and username, as strings", async () => {
    const { read } = readerOf(LOGGED_IN);
    const session = await read();
    expect(Object.keys(session).sort()).toEqual(["token", "username"]);
    expect(typeof session.token).toBe("string");
    expect(typeof session.username).toBe("string");
    expect(JSON.stringify(session)).not.toContain("LEAK");
  });

  it("without SC_AUTH gives the username only", async () => {
    const { read } = readerOf(LOGGED_OUT);
    const session = await read();
    expect(session).toStrictEqual({ username: USERNAME });
    expect(Object.keys(session)).toEqual(["username"]);
  });

  it.each([
    ["a challenge page", `<html><body>${TOKEN} ${LEAK}</body></html>`],
    ["an empty body", ""],
    [
      "a __NEXT_DATA__ tag never closed",
      `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"cookies":{"SC_AUTH":"${TOKEN}"}}}}`,
    ],
    [
      "the id outside a script tag",
      `<div id="__NEXT_DATA__">{"props":{"pageProps":{"cookies":{"SC_AUTH":"${TOKEN}"}}}}</div>`,
    ],
  ])("without __NEXT_DATA__ (%s) gives {}", async (_name, body) => {
    const { read } = readerOf(body);
    const session = await read();
    expect(session).toStrictEqual({});
    expect(Object.keys(session)).toEqual([]);
  });

  it.each([
    ["null data", "null"],
    ["data that is a list", `["${TOKEN}"]`],
    ["no props", "{}"],
    ["props that is a number", '{"props":42}'],
    ["a null pageProps", '{"props":{"pageProps":null}}'],
    ["a pageProps that is a string", `{"props":{"pageProps":"${TOKEN}"}}`],
    ["an empty pageProps", '{"props":{"pageProps":{}}}'],
  ])("with %s gives {}", async (_name, json) => {
    const { read } = readerOf(nextData(json));
    expect(await read()).toStrictEqual({});
  });

  it.each([
    ["no cookies", undefined],
    ["null cookies", null],
    ["cookies that are a string", `SC_AUTH=${TOKEN}`],
    ["cookies that are a list", [TOKEN]],
  ])("with %s gives the username only", async (_name, cookies) => {
    const { read } = readerOf(pageWith(propsWith(cookies, ME)));
    expect(await read()).toStrictEqual({ username: USERNAME });
  });

  it("ignores the other cookies and the other fields of meInfos", async () => {
    const { read } = readerOf(LOGGED_IN);
    const session = await read();
    expect(session).toStrictEqual({ token: TOKEN, username: USERNAME });
    expect(JSON.stringify(session)).not.toContain("LEAK");
  });
});

describe("the token shape", () => {
  it.each([
    ["16 characters, the shortest", "MARKER0123456789"],
    ["128 characters, the longest", `MARKER${"a".repeat(122)}`],
    ["every allowed character", `MARKER-_azAZ09${"x".repeat(10)}`],
  ])("accepts %s", async (_name, token) => {
    const { read } = readerOf(withToken(token));
    expect(await read()).toStrictEqual({ token, username: USERNAME });
  });

  const SHAPE = "SensCritique session: unexpected token shape";
  it.each<[string, unknown]>([
    ["15 characters", "MARKER012345678"],
    ["129 characters", `MARKER${"a".repeat(123)}`],
    ["an empty string", ""],
    ["a trailing bad character", `${TOKEN}!`],
    ["a leading bad character", `!${TOKEN}`],
    ["a dot, as in a JWT", `${TOKEN}.x`],
    ["a space", "MARKER 0123456789abc"],
    ["base64 padding", "MARKER0123456789abc="],
    ["a plus sign", "MARKER+0123456789abc"],
    ["a slash", "MARKER/0123456789abc"],
    ["a trailing newline", `${TOKEN}\n`],
    ["a leading newline", `\n${TOKEN}`],
    ["a carriage return and line feed", `${TOKEN}\r\nX-Leak: 1`],
    ["a non-ASCII letter", "MARKERé0123456789abc"],
    // Its decimal form is 16 digits, which the shape accepts: only a type check rejects it.
    ["a number of 16 digits", 1234567890123456],
    ["a list holding a valid token", [TOKEN]],
    ["an object holding a valid token", { value: TOKEN }],
    ["null", null],
    ["true", true],
  ])("rejects %s with the fixed error, leaking nothing", async (_n, token) => {
    const { read } = readerOf(withToken(token));
    await expectFixedFailure(read, SHAPE);
  });
});

describe("the username", () => {
  it.each([
    ["one character", "u"],
    ["64 characters, the longest", "u".repeat(64)],
  ])("accepts %s", async (_name, username) => {
    const { read } = readerOf(withUsername(username));
    expect(await read()).toStrictEqual({ token: TOKEN, username });
  });

  it.each<[string, unknown]>([
    ["65 characters", "u".repeat(65)],
    ["an empty string", ""],
    ["a number", 42],
    ["a list holding a valid name", [USERNAME]],
    ["an object", { name: USERNAME }],
    ["null", null],
  ])("treats %s as absent", async (_name, username) => {
    const { read } = readerOf(withUsername(username));
    const session = await read();
    expect(session).toStrictEqual({ token: TOKEN });
    expect(Object.keys(session)).toEqual(["token"]);
  });

  it.each([
    ["no meInfos", undefined],
    ["a null meInfos", null],
    ["a meInfos that is a string", USERNAME],
    ["a meInfos that is a list", [USERNAME]],
    ["a meInfos with no username", { email: LEAK }],
  ])("with %s gives the token only", async (_name, meInfos) => {
    const { read } = readerOf(pageWith(propsWith({ SC_AUTH: TOKEN }, meInfos)));
    expect(await read()).toStrictEqual({ token: TOKEN });
  });
});

describe("a page that cannot be read", () => {
  it.each([
    [
      "an unquoted token, which V8 quotes back in its message",
      `{"props":{"pageProps":{"cookies":{"SC_AUTH":${TOKEN}}}}}`,
    ],
    [
      "a truncated object",
      `{"props":{"pageProps":{"cookies":{"SC_AUTH":"${TOKEN}"`,
    ],
    [
      "single quotes",
      `{'props':{'pageProps':{'cookies':{'SC_AUTH':'${TOKEN}'}}}}`,
    ],
  ])(
    "rejects malformed JSON (%s) with the fixed error, leaking nothing",
    async (_n, json) => {
      const { read } = readerOf(nextData(json));
      await expectFixedFailure(
        read,
        "SensCritique session: page data is not JSON",
      );
    },
  );

  it("accepts a page of exactly 2 000 000 characters", async () => {
    const body = LOGGED_IN + " ".repeat(CAP - LOGGED_IN.length);
    expect(body).toHaveLength(CAP);
    const { read } = readerOf(body);
    expect(await read()).toStrictEqual({ token: TOKEN, username: USERNAME });
  });

  it("rejects a page one character over the cap, leaking nothing", async () => {
    const body = LOGGED_IN + " ".repeat(CAP + 1 - LOGGED_IN.length);
    expect(body).toHaveLength(CAP + 1);
    const { read } = readerOf(body);
    await expectFixedFailure(
      read,
      "SensCritique session: HTTP 200, response too large",
    );
  });

  it.each([403, 500, 503])(
    "rejects HTTP %s with the fixed error, leaking nothing",
    async (status) => {
      const world = fakeFetch(() => ({ status, body: LOGGED_IN }));
      const read = createSessionReader(world.fetch);
      await expectFixedFailure(read, `SensCritique session: HTTP ${status}`);
    },
  );

  it("rejects a fetch that throws the token, leaking nothing", async () => {
    const read = createSessionReader(async () => {
      throw leakyError();
    });
    await expectFixedFailure(read, "SensCritique session: request failed");
  });

  it("rejects a body that cannot be read, leaking nothing", async () => {
    const world = fakeFetch(() => ({ status: 200, body: leakyError() }));
    const read = createSessionReader(world.fetch);
    await expectFixedFailure(read, "SensCritique session: request failed");
  });
});

describe("the console", () => {
  it("is never written to, whatever the page", async () => {
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
    const bodies = [
      LOGGED_IN,
      LOGGED_OUT,
      withToken(`${TOKEN}!`),
      nextData(`{"props":{"pageProps":{"cookies":{"SC_AUTH":${TOKEN}}}}}`),
      LOGGED_IN + " ".repeat(CAP),
    ];
    try {
      for (const body of bodies) {
        await createSessionReader(fakeFetch(() => ok(body)).fetch)().catch(
          () => undefined,
        );
      }
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("as the getSession of the SensCritique client", () => {
  function site(home: string) {
    return fakeFetch((call) =>
      call.url === HOME
        ? ok(home)
        : ok(JSON.stringify({ data: { done: true } })),
    );
  }

  it("a write reads the home page, then sends the token to Apollo only", async () => {
    const { fetch, calls } = site(LOGGED_IN);
    const client = createScClient({
      fetch,
      getSession: createSessionReader(fetch),
    });
    await client.wish(5);
    expect(calls.map((call) => call.url)).toEqual([HOME, APOLLO]);
    const [home, apollo] = calls;
    expect(JSON.stringify(home)).not.toContain(TOKEN);
    const { authorization, ...otherHeaders } = apollo?.init.headers ?? {};
    expect(authorization).toBe(TOKEN);
    expect(apollo?.init.credentials).toBe("omit");
    const visible = {
      ...apollo,
      init: { ...apollo?.init, headers: otherHeaders },
    };
    expect(JSON.stringify(visible)).not.toContain(TOKEN);
  });

  it("a write on a logged-out page rejects as unauthenticated and sends nothing to Apollo", async () => {
    const { fetch, calls } = site(LOGGED_OUT);
    const client = createScClient({
      fetch,
      getSession: createSessionReader(fetch),
    });
    const error = await failure(client.wish(5));
    expect(error).toBeInstanceOf(ScUnauthenticatedError);
    expect(calls.map((call) => call.url)).toEqual([HOME]);
  });
});

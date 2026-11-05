import { describe, expect, it } from "vitest";
import { handleNakaCall, readAccount } from "../src/content/naka-bridge";
import type { ToNakaTab } from "../src/ext/messages";
import {
  createNakaClient,
  type NakaClient,
  NakaUnavailableError,
} from "../src/naka/naka-client";
import {
  clientOn,
  fakeApi,
  MARKER,
  standardApi,
  strings,
} from "./naka-bridge-fakes";

const noAccount = () => undefined;
const call = (
  c: "add" | "remove" | "contentById" | "availableSeasons",
  contentId: number,
) => ({ type: "naka-call", call: c, contentId }) as ToNakaTab;

function failing(error: unknown): NakaClient {
  const boom = async () => {
    throw error;
  };
  return {
    playlistIds: boom,
    addToPlaylist: boom,
    removeFromPlaylist: boom,
    search: boom,
    contentById: boom,
    availableSeasons: boom,
  };
}

describe("handleNakaCall: results", () => {
  const { fetch } = fakeApi(standardApi);
  const client = clientOn(fetch);

  it("returns the playlist ids", async () => {
    const reply = await handleNakaCall(
      { type: "naka-call", call: "playlistIds" },
      client,
      noAccount,
    );
    expect(reply).toStrictEqual({ ok: true, value: [3, 1, 2] });
  });

  it("returns the search items", async () => {
    const reply = await handleNakaCall(
      { type: "naka-call", call: "search", query: "titre" },
      client,
      noAccount,
    );
    expect(reply).toStrictEqual({
      ok: true,
      value: [
        {
          contentId: 1,
          tmdbId: 1001,
          mediaType: "tv",
          title: "Titre 1",
          originalTitle: "Original 1",
          releaseDate: "2020-05-17",
        },
        {
          contentId: 2,
          tmdbId: 1002,
          mediaType: "tv",
          title: "Titre 2",
          originalTitle: "Original 2",
        },
      ],
    });
  });

  it("returns one item, or no value when the catalogue lacks it", async () => {
    const found = await handleNakaCall(
      call("contentById", 7),
      client,
      noAccount,
    );
    expect(found).toMatchObject({ ok: true, value: { contentId: 7 } });
    const missing = await handleNakaCall(
      call("contentById", 8),
      client,
      noAccount,
    );
    expect(missing).toStrictEqual({ ok: true });
  });

  it("returns the season list, or no value on 404", async () => {
    const found = await handleNakaCall(
      call("availableSeasons", 7),
      client,
      noAccount,
    );
    expect(found).toStrictEqual({
      ok: true,
      value: { seasons: [1, 2], episodeCounts: { 1: 8, 2: 10 } },
    });
    const missing = await handleNakaCall(
      call("availableSeasons", 8),
      client,
      noAccount,
    );
    expect(missing).toStrictEqual({ ok: true });
  });

  it("answers add and remove with no value", async () => {
    expect(
      await handleNakaCall(call("add", 5), client, noAccount),
    ).toStrictEqual({
      ok: true,
    });
    expect(
      await handleNakaCall(call("remove", 5), client, noAccount),
    ).toStrictEqual({ ok: true });
  });

  it("sends add and remove to the matching endpoints", async () => {
    const api = fakeApi(standardApi);
    const c = clientOn(api.fetch);
    await handleNakaCall(call("add", 5), c, noAccount);
    await handleNakaCall(call("remove", 6), c, noAccount);
    expect(api.calls.map((x) => `${x.init.method} ${x.url}`)).toEqual([
      "POST https://naka.cx/api/v1/playlist",
      "DELETE https://naka.cx/api/v1/playlist/6",
    ]);
  });

  it("answers naka-account with the account, or with no value", async () => {
    const msg: ToNakaTab = { type: "naka-account" };
    expect(await handleNakaCall(msg, client, () => "42")).toStrictEqual({
      ok: true,
      value: "42",
    });
    expect(await handleNakaCall(msg, client, noAccount)).toStrictEqual({
      ok: true,
    });
  });
});

describe("handleNakaCall: error codes", () => {
  const msg: ToNakaTab = { type: "naka-call", call: "playlistIds" };

  it("maps a missing token to no-token", async () => {
    const api = fakeApi(standardApi);
    const client = createNakaClient({
      fetch: api.fetch,
      token: () => undefined,
    });
    expect(await handleNakaCall(msg, client, noAccount)).toStrictEqual({
      ok: false,
      error: "no-token",
    });
    expect(api.calls).toHaveLength(0);
  });

  it("maps HTTP 401 and 403 to session, 429 to rate-limit", async () => {
    const expected = new Map([
      [401, "session"],
      [403, "session"],
      [429, "rate-limit"],
      [500, "unavailable"],
      [400, "unavailable"],
    ]);
    for (const [status, error] of expected) {
      const api = fakeApi(() => ({ status, body: MARKER }));
      const reply = await handleNakaCall(msg, clientOn(api.fetch), noAccount);
      expect(reply).toStrictEqual({ ok: false, error });
    }
  });

  it("maps the session and rate-limit statuses from the status only", async () => {
    for (const [status, error] of [
      [401, "session"],
      [403, "session"],
      [429, "rate-limit"],
    ] as const) {
      const reply = await handleNakaCall(
        msg,
        failing(new NakaUnavailableError("any text at all", status)),
        noAccount,
      );
      expect(reply).toStrictEqual({ ok: false, error });
    }
  });

  it("maps a 404 to not-found", async () => {
    const reply = await handleNakaCall(
      msg,
      failing(new NakaUnavailableError("x", 404)),
      noAccount,
    );
    expect(reply).toStrictEqual({ ok: false, error: "not-found" });
  });

  it("maps any other failure to unavailable", async () => {
    for (const error of [
      new NakaUnavailableError("Naka playlist: HTTP 500", 500),
      new NakaUnavailableError("Naka session: could not be read"),
      new NakaUnavailableError("no token", 500),
      new NakaUnavailableError("HTTP 429 HTTP 401", 500),
      new RangeError("contentId must be a positive safe integer"),
      "a string",
      undefined,
    ]) {
      expect(
        await handleNakaCall(msg, failing(error), noAccount),
      ).toStrictEqual({ ok: false, error: "unavailable" });
    }
  });

  it("fails closed on a call it does not know", async () => {
    const unknown = { type: "naka-call", call: "wipe" } as unknown as ToNakaTab;
    const api = fakeApi(standardApi);
    const reply = await handleNakaCall(unknown, clientOn(api.fetch), noAccount);
    expect(reply).toStrictEqual({ ok: false, error: "unavailable" });
    expect(api.calls).toHaveLength(0);
  });

  it("maps a throwing account reader to unavailable", async () => {
    const reply = await handleNakaCall(
      { type: "naka-account" },
      failing(1),
      () => {
        throw new Error("x");
      },
    );
    expect(reply).toStrictEqual({ ok: false, error: "unavailable" });
  });

  it("never copies the text, the cause or the fields of an error", async () => {
    const hostile = Object.assign(new Error(MARKER, { cause: MARKER }), {
      status: 500,
      detail: MARKER,
    });
    for (const error of [hostile, new NakaUnavailableError(MARKER, 404)]) {
      const reply = await handleNakaCall(msg, failing(error), noAccount);
      expect(strings(reply).join("|")).not.toContain(MARKER);
      expect(Object.keys(reply).sort()).toEqual(["error", "ok"]);
    }
  });

  it("reports a rejected input as unavailable and sends nothing", async () => {
    const api = fakeApi(standardApi);
    const reply = await handleNakaCall(
      call("contentById", -1),
      clientOn(api.fetch),
      noAccount,
    );
    expect(reply).toStrictEqual({ ok: false, error: "unavailable" });
    expect(api.calls).toHaveLength(0);
  });
});

describe("readAccount", () => {
  const stored = (value: unknown) => ({
    getItem: (key: string) =>
      key === "nakastream-auth" ? JSON.stringify(value) : null,
  });
  const auth = (user: unknown) => stored({ state: { token: MARKER, user } });

  it("returns String(user.id) for a positive safe integer", () => {
    expect(readAccount(auth({ id: 42, email: "a@b.c", fullName: "N" }))).toBe(
      "42",
    );
    expect(readAccount(auth({ id: Number.MAX_SAFE_INTEGER }))).toBe(
      String(Number.MAX_SAFE_INTEGER),
    );
  });

  it("reads nothing but user.id", () => {
    expect(
      readAccount(auth({ id: 42, email: "7", fullName: "9", userId: 8 })),
    ).toBe("42");
    expect(
      readAccount(auth({ email: "a@b.c", fullName: "N", userId: 8 })),
    ).toBe(undefined);
    expect(readAccount(stored({ state: { token: MARKER, id: 5 } }))).toBe(
      undefined,
    );
    expect(readAccount(stored({ user: { id: 5 }, id: 6 }))).toBe(undefined);
  });

  it("returns undefined for an id that is not a positive safe integer", () => {
    for (const id of [
      0,
      -1,
      1.5,
      "42",
      null,
      true,
      Number.NaN,
      2 ** 53,
      [42],
    ]) {
      expect(readAccount(auth({ id }))).toBeUndefined();
    }
  });

  it("returns undefined for missing or malformed storage", () => {
    expect(readAccount({ getItem: () => null })).toBeUndefined();
    expect(readAccount({ getItem: () => "not json" })).toBeUndefined();
    expect(readAccount({ getItem: () => "42" })).toBeUndefined();
    expect(readAccount(stored({ state: null }))).toBeUndefined();
    expect(readAccount(stored({ state: {} }))).toBeUndefined();
    expect(readAccount(stored({ state: { user: [] } }))).toBeUndefined();
    expect(
      readAccount({
        getItem: () => {
          throw new Error(MARKER);
        },
      }),
    ).toBeUndefined();
  });

  it("never returns the token or any other field", () => {
    const result = readAccount(auth({ id: 42, email: MARKER }));
    expect(result).toBe("42");
    expect(String(result)).not.toContain(MARKER);
  });
});

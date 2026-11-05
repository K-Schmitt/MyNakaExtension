import { describe, expect, it } from "vitest";
import { classifyRequest } from "../src/page/fetch-observer";

const CH = "mynaka/1";
const WATCHED = "https://naka.cx/api/v1/history/watched";
const PLAYLIST = "https://naka.cx/api/v1/playlist";

describe("classifyRequest removals", () => {
  it("DELETE /api/v1/playlist/21391 carries the removed id", () => {
    expect(classifyRequest("DELETE", `${PLAYLIST}/21391`, undefined)).toEqual({
      channel: CH,
      kind: "playlist",
      removed: 21391,
    });
  });

  it.each(["abc", "0", "-3", "007", "1.5", "21391abc", "9007199254740993"])(
    "DELETE …/playlist/%s is a plain playlist change",
    (seg) => {
      expect(
        classifyRequest("DELETE", `${PLAYLIST}/${seg}`, undefined),
      ).toEqual({
        channel: CH,
        kind: "playlist",
      });
    },
  );

  it("POST /api/v1/playlist carries no removed id", () => {
    expect(classifyRequest("POST", PLAYLIST, "{}")).toEqual({
      channel: CH,
      kind: "playlist",
    });
  });
});

describe("classifyRequest playlist routes", () => {
  it("POST /api/v1/playlist is a playlist change", () => {
    expect(classifyRequest("POST", PLAYLIST, "{}")).toEqual({
      channel: CH,
      kind: "playlist",
    });
  });

  it("DELETE /api/v1/playlist/:id is a playlist change", () => {
    expect(classifyRequest("DELETE", `${PLAYLIST}/42`, undefined)).toEqual({
      channel: CH,
      kind: "playlist",
      removed: 42,
    });
  });

  it("accepts a relative url, a lower-case method and a query string", () => {
    expect(classifyRequest("post", "/api/v1/playlist?x=1", null)?.kind).toBe(
      "playlist",
    );
  });

  it("rejects the wrong method on each playlist route", () => {
    expect(classifyRequest("GET", PLAYLIST, undefined)).toBeUndefined();
    expect(classifyRequest("PUT", PLAYLIST, undefined)).toBeUndefined();
    expect(classifyRequest("DELETE", PLAYLIST, undefined)).toBeUndefined();
    expect(
      classifyRequest("POST", `${PLAYLIST}/42`, undefined),
    ).toBeUndefined();
    expect(classifyRequest("GET", `${PLAYLIST}/42`, undefined)).toBeUndefined();
  });

  it("rejects look-alike paths and foreign hosts", () => {
    expect(classifyRequest("POST", `${PLAYLIST}s`, undefined)).toBeUndefined();
    expect(
      classifyRequest("DELETE", `${PLAYLIST}/1/2`, undefined),
    ).toBeUndefined();
    expect(
      classifyRequest("DELETE", `${PLAYLIST}/`, undefined),
    ).toBeUndefined();
    expect(
      classifyRequest("POST", "https://evil.example/api/v1/playlist", ""),
    ).toBeUndefined();
    expect(
      classifyRequest("POST", "http://naka.cx/api/v1/playlist", ""),
    ).toBeUndefined();
    expect(classifyRequest("POST", "/api/v2/playlist", "")).toBeUndefined();
  });

  it("gives undefined for a url it cannot parse", () => {
    expect(classifyRequest("POST", "http://", "")).toBeUndefined();
  });
});

describe("classifyRequest watched route", () => {
  it("watched true on a film gives the explicit event", () => {
    const body = JSON.stringify({ contentId: 7, watched: true });
    expect(classifyRequest("PUT", WATCHED, body)).toEqual({
      channel: CH,
      kind: "watched",
      contentId: 7,
    });
  });

  it("carries season and episode for an episode", () => {
    const body = JSON.stringify({
      contentId: 7,
      seasonNumber: 2,
      episodeNumber: 5,
      watched: true,
    });
    expect(classifyRequest("PUT", WATCHED, body)).toEqual({
      channel: CH,
      kind: "watched",
      contentId: 7,
      season: 2,
      episode: 5,
    });
  });

  it("takes null season and episode as absent", () => {
    const body = JSON.stringify({
      contentId: 7,
      seasonNumber: null,
      episodeNumber: null,
      watched: true,
    });
    expect(classifyRequest("PUT", WATCHED, body)?.kind).toBe("watched");
  });

  it("accepts an already-parsed object body", () => {
    expect(
      classifyRequest("PUT", WATCHED, { contentId: 7, watched: true })?.kind,
    ).toBe("watched");
  });

  it("watched missing or not exactly a boolean gives nothing", () => {
    for (const watched of [undefined, "true", "false", 1, 0, null]) {
      const body = JSON.stringify({ contentId: 7, watched });
      expect(classifyRequest("PUT", WATCHED, body)).toBeUndefined();
    }
  });

  it("watched false on an episode gives the unwatched event with its ids", () => {
    const body = JSON.stringify({
      contentId: 21391,
      seasonNumber: 1,
      episodeNumber: 2,
      watched: false,
    });
    expect(classifyRequest("PUT", WATCHED, body)).toEqual({
      channel: CH,
      kind: "unwatched",
      contentId: 21391,
      season: 1,
      episode: 2,
    });
  });

  it("watched false on a film, from a parsed body, gives the unwatched event without ids of an episode", () => {
    expect(
      classifyRequest("PUT", WATCHED, {
        contentId: 7,
        seasonNumber: null,
        episodeNumber: null,
        watched: false,
      }),
    ).toEqual({ channel: CH, kind: "unwatched", contentId: 7 });
  });

  it("watched false with a bad content id gives nothing", () => {
    for (const contentId of [0, -1, "7", undefined, 1.5]) {
      const body = JSON.stringify({ contentId, watched: false });
      expect(classifyRequest("PUT", WATCHED, body)).toBeUndefined();
    }
  });

  it("rejects the wrong method", () => {
    const body = JSON.stringify({ contentId: 7, watched: true });
    for (const method of ["POST", "GET", "DELETE", "PATCH"]) {
      expect(classifyRequest(method, WATCHED, body)).toBeUndefined();
    }
  });

  it("gives nothing for an absent, unparsable or invalid body", () => {
    expect(classifyRequest("PUT", WATCHED, undefined)).toBeUndefined();
    expect(classifyRequest("PUT", WATCHED, "not json")).toBeUndefined();
    expect(classifyRequest("PUT", WATCHED, "[1]")).toBeUndefined();
    expect(classifyRequest("PUT", WATCHED, 12)).toBeUndefined();
    expect(classifyRequest("PUT", WATCHED, '{"watched":true}')).toBeUndefined();
    expect(
      classifyRequest("PUT", WATCHED, '{"contentId":0,"watched":true}'),
    ).toBeUndefined();
  });

  it("gives nothing when reading the body throws", () => {
    const throwing = {
      get watched(): boolean {
        throw new Error("hostile");
      },
    };
    expect(classifyRequest("PUT", WATCHED, throwing)).toBeUndefined();
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile");
        },
        getPrototypeOf() {
          throw new Error("hostile");
        },
      },
    );
    expect(classifyRequest("PUT", WATCHED, proxy)).toBeUndefined();
    const lateThrow = {
      watched: true,
      get contentId(): number {
        throw new Error("hostile");
      },
    };
    expect(classifyRequest("PUT", WATCHED, lateThrow)).toBeUndefined();
    const arrayLike = new Proxy([], {
      get() {
        throw new Error("hostile");
      },
    });
    expect(classifyRequest("PUT", WATCHED, arrayLike)).toBeUndefined();
  });

  it("gives nothing when only one of season and episode is present", () => {
    const body = JSON.stringify({
      contentId: 7,
      seasonNumber: 2,
      watched: true,
    });
    expect(classifyRequest("PUT", WATCHED, body)).toBeUndefined();
  });

  it("rejects a foreign host and a look-alike path", () => {
    const body = JSON.stringify({ contentId: 7, watched: true });
    expect(
      classifyRequest(
        "PUT",
        "https://evil.example/api/v1/history/watched",
        body,
      ),
    ).toBeUndefined();
    expect(classifyRequest("PUT", `${WATCHED}/x`, body)).toBeUndefined();
  });
});

describe("classifyRequest unrelated routes", () => {
  it("gives undefined", () => {
    expect(
      classifyRequest("GET", "https://naka.cx/api/v1/browse/1", ""),
    ).toBeUndefined();
    expect(classifyRequest("PUT", "/api/v1/history", "{}")).toBeUndefined();
  });
});

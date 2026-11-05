import { describe, expect, it } from "vitest";
import { acceptPageEvent, parsePlayerUrl } from "../src/content/page-events";

const CH = "mynaka/1";
const SELF = { name: "self" };
const ORIGIN = "https://naka.cx";
const GOOD = { channel: CH, kind: "playlist" };

describe("acceptPageEvent", () => {
  it("accepts an event from this window, from naka.cx, on the channel", () => {
    expect(
      acceptPageEvent({ source: SELF, origin: ORIGIN, data: GOOD }, SELF),
    ).toEqual(GOOD);
  });

  it("keeps a removed id of a playlist event", () => {
    const data = { channel: CH, kind: "playlist", removed: 21391 };
    expect(
      acceptPageEvent({ source: SELF, origin: ORIGIN, data }, SELF),
    ).toEqual(data);
  });

  it.each(["21", -1, 0, 1.5, null, Number.MAX_SAFE_INTEGER + 2, {}])(
    "refuses the whole event when removed is %j",
    (removed) => {
      const data = { channel: CH, kind: "playlist", removed };
      expect(
        acceptPageEvent({ source: SELF, origin: ORIGIN, data }, SELF),
      ).toBeUndefined();
    },
  );

  it("rejects a foreign source", () => {
    expect(
      acceptPageEvent({ source: {}, origin: ORIGIN, data: GOOD }, SELF),
    ).toBeUndefined();
    expect(
      acceptPageEvent({ source: null, origin: ORIGIN, data: GOOD }, SELF),
    ).toBeUndefined();
  });

  it("rejects a missing own window even when the source is missing too", () => {
    expect(
      acceptPageEvent(
        { source: undefined, origin: ORIGIN, data: GOOD },
        undefined,
      ),
    ).toBeUndefined();
    expect(
      acceptPageEvent({ source: null, origin: ORIGIN, data: GOOD }, null),
    ).toBeUndefined();
  });

  it("rejects a foreign origin", () => {
    for (const origin of [
      "https://evil.example",
      "http://naka.cx",
      "https://naka.cx.evil.example",
      "https://naka.cx/",
      "null",
      "",
    ]) {
      expect(
        acceptPageEvent({ source: SELF, origin, data: GOOD }, SELF),
      ).toBeUndefined();
    }
  });

  it("rejects a wrong or missing channel", () => {
    for (const channel of ["mynaka/2", "", undefined]) {
      expect(
        acceptPageEvent(
          { source: SELF, origin: ORIGIN, data: { channel, kind: "playlist" } },
          SELF,
        ),
      ).toBeUndefined();
    }
  });

  it("rejects data that is not a page event", () => {
    for (const data of [
      null,
      "x",
      { channel: CH },
      { channel: CH, kind: "other" },
      { channel: CH, kind: "watched" },
      { channel: CH, kind: "watched", contentId: Number.NaN },
    ]) {
      expect(
        acceptPageEvent({ source: SELF, origin: ORIGIN, data }, SELF),
      ).toBeUndefined();
    }
  });

  it("accepts a watched event and keeps only known keys", () => {
    const data = {
      channel: CH,
      kind: "watched",
      contentId: 3,
      season: 1,
      episode: 2,
      token: "t",
    };
    expect(
      acceptPageEvent({ source: SELF, origin: ORIGIN, data }, SELF),
    ).toEqual({
      channel: CH,
      kind: "watched",
      contentId: 3,
      season: 1,
      episode: 2,
    });
  });
});

const P = "https://naka.cx/player";

describe("parsePlayerUrl", () => {
  it("parses a film", () => {
    expect(parsePlayerUrl(`${P}?id=12&type=movie&title=Foo&poster=x`)).toEqual({
      contentId: 12,
      mediaType: "movie",
    });
  });

  it("parses an episode", () => {
    expect(
      parsePlayerUrl(`${P}?id=12&type=tv&season=2&episode=5&title=F`),
    ).toEqual({
      contentId: 12,
      mediaType: "tv",
      season: 2,
      episode: 5,
    });
  });

  it("ignores a hash and parameter order", () => {
    expect(parsePlayerUrl(`${P}?type=movie&id=3#x`)).toEqual({
      contentId: 3,
      mediaType: "movie",
    });
  });

  it("rejects a url that repeats id, type, season or episode", () => {
    expect(parsePlayerUrl(`${P}?id=1&id=2&type=movie`)).toBeUndefined();
    expect(parsePlayerUrl(`${P}?id=1&type=movie&type=tv`)).toBeUndefined();
    expect(parsePlayerUrl(`${P}?id=1&type=movie&type=movie`)).toBeUndefined();
    expect(
      parsePlayerUrl(`${P}?id=1&type=tv&season=1&season=2&episode=1`),
    ).toBeUndefined();
    expect(
      parsePlayerUrl(`${P}?id=1&type=tv&season=1&episode=1&episode=1`),
    ).toBeUndefined();
    expect(
      parsePlayerUrl(`${P}?id=1&type=movie&season=1&season=2`),
    ).toBeUndefined();
    expect(
      parsePlayerUrl(`${P}?id=1&type=movie&episode=1&episode=2`),
    ).toBeUndefined();
  });

  it("allows a repeated parameter it does not read", () => {
    expect(parsePlayerUrl(`${P}?id=1&type=movie&title=a&title=b`)).toEqual({
      contentId: 1,
      mediaType: "movie",
    });
  });

  it("ignores a season on a film", () => {
    expect(parsePlayerUrl(`${P}?id=3&type=movie&season=1&episode=1`)).toEqual({
      contentId: 3,
      mediaType: "movie",
    });
  });

  it("rejects another origin or scheme", () => {
    for (const base of [
      "http://naka.cx/player",
      "https://evil.example/player",
      "https://naka.cx.evil.example/player",
      "https://www.naka.cx/player",
    ]) {
      expect(parsePlayerUrl(`${base}?id=1&type=movie`)).toBeUndefined();
    }
  });

  it("rejects another path, never a /content page", () => {
    for (const path of [
      "/content/movie/5",
      "/player/x",
      "/players",
      "/",
      "/content/tv/5",
    ]) {
      expect(
        parsePlayerUrl(`https://naka.cx${path}?id=1&type=movie`),
      ).toBeUndefined();
    }
    expect(parsePlayerUrl("https://naka.cx/content/movie/5")).toBeUndefined();
  });

  it("rejects a bad id", () => {
    for (const id of [
      "",
      "0",
      "-1",
      "1.5",
      "abc",
      "1e3",
      "99999999999999999999",
      " 1",
      "01x",
    ]) {
      expect(
        parsePlayerUrl(`${P}?id=${encodeURIComponent(id)}&type=movie`),
      ).toBeUndefined();
    }
    expect(parsePlayerUrl(`${P}?type=movie`)).toBeUndefined();
  });

  it("rejects a bad or missing type", () => {
    for (const type of ["", "film", "MOVIE", "series"]) {
      expect(parsePlayerUrl(`${P}?id=1&type=${type}`)).toBeUndefined();
    }
    expect(parsePlayerUrl(`${P}?id=1`)).toBeUndefined();
  });

  it("does not read season and episode under another type", () => {
    for (const type of ["film", "series", ""]) {
      expect(
        parsePlayerUrl(`${P}?id=1&type=${type}&season=1&episode=1`),
      ).toBeUndefined();
    }
    expect(parsePlayerUrl(`${P}?id=1&season=1&episode=1`)).toBeUndefined();
  });

  it("needs both season and episode, valid, for tv", () => {
    for (const q of [
      "",
      "&season=1",
      "&episode=1",
      "&season=0&episode=1",
      "&season=1&episode=0",
      "&season=a&episode=1",
      "&season=1&episode=1.5",
      "&season=1&episode=",
    ]) {
      expect(parsePlayerUrl(`${P}?id=1&type=tv${q}`)).toBeUndefined();
    }
  });

  it("gives undefined for text that is not a url", () => {
    expect(parsePlayerUrl("")).toBeUndefined();
    expect(parsePlayerUrl("not a url")).toBeUndefined();
  });
});

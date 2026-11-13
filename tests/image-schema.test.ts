import { describe, expect, it } from "vitest";
import { parseTitleImage } from "../src/ext/image-schema";
import { StoredStateError } from "../src/ext/stored-error";

describe("parseTitleImage", () => {
  it("reads a TMDB poster path", () => {
    expect(parseTitleImage({ posterPath: "/a.jpg" }, "x")).toEqual({
      posterPath: "/a.jpg",
    });
  });

  it("reads all three fields together", () => {
    const image = {
      posterPath: "/a.jpg",
      backdropPath: "/b.webp",
      picture: "https://pictures.example/p.jpg",
    };
    expect(parseTitleImage({ ...image }, "x")).toEqual(image);
  });

  it("accepts an https picture whatever the host", () => {
    const image = { picture: "https://any.example/p.jpg" };
    expect(parseTitleImage(image, "x")).toEqual(image);
  });

  // The entry rule may tighten after a path was stored: a stored path it no longer accepts drops, never
  // the record that holds it.
  it.each([
    { posterPath: "a.jpg" },
    { posterPath: "/../a.jpg" },
    { backdropPath: "/a.jpg?x=1" },
    { posterPath: "/a.gif", backdropPath: "/b.svg" },
  ])("drops %j, a TMDB path the rule no longer accepts", (raw) => {
    expect(parseTitleImage(raw, "x")).toBeUndefined();
  });

  it("keeps the fields that still pass beside a dropped path", () => {
    const raw = {
      posterPath: "/a.gif",
      backdropPath: "/b.jpg",
      picture: "https://any.example/p.jpg",
    };
    expect(parseTitleImage(raw, "x")).toEqual({
      backdropPath: "/b.jpg",
      picture: "https://any.example/p.jpg",
    });
  });

  it.each([
    { posterPath: 3 },
    { backdropPath: null },
    { picture: "http://x/p.jpg" },
    { picture: "javascript:alert(1)" },
    { picture: 3 },
    { other: 1 },
    { posterPath: "/a.jpg", other: 1 },
    {},
    null,
    "/a.jpg",
  ])("rejects %j", (raw) => {
    expect(() => parseTitleImage(raw, "x")).toThrow(StoredStateError);
  });
});

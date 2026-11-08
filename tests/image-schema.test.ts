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

  it.each([
    { posterPath: "a.jpg" },
    { posterPath: "/../a.jpg" },
    { backdropPath: "/a.jpg?x=1" },
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

import { describe, expect, it } from "vitest";
import { imageOf, tmdbPathOf } from "../src/core/title-image";

describe("tmdbPathOf", () => {
  it("accepts a TMDB file path", () => {
    expect(tmdbPathOf("/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg")).toBe(
      "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
    );
  });

  it.each([
    "/../x.jpg",
    "/a/b.jpg",
    "/x.jpg?y",
    "https://image.tmdb.org/x.jpg",
    "x.jpg",
    42,
    "",
    undefined,
  ])("rejects %s", (value) => {
    expect(tmdbPathOf(value)).toBeUndefined();
  });
});

describe("imageOf", () => {
  it("keeps only the fields that survive", () => {
    expect(
      imageOf({ posterPath: "/a.jpg", backdropPath: "x", picture: 3 }),
    ).toEqual({
      posterPath: "/a.jpg",
    });
  });

  it("is undefined when no field survives", () => {
    expect(
      imageOf({ posterPath: "../a", picture: "http://x/y.jpg" }),
    ).toBeUndefined();
    expect(imageOf({})).toBeUndefined();
  });
});

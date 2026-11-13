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
    "/a.gif",
    "/a.svg",
    "/a.JPG",
    `/${"a".repeat(81)}.jpg`,
  ])("rejects %s", (value) => {
    expect(tmdbPathOf(value)).toBeUndefined();
  });
});

describe("tmdbPathOf boundaries", () => {
  it.each([
    "/a.jpg",
    "/a.jpeg",
    "/a.png",
    "/a.webp",
    "/A_b-9.jpg",
    `/${"a".repeat(80)}.jpg`,
  ])("accepts %s", (value) => {
    expect(tmdbPathOf(value)).toBe(value);
  });
});

describe("imageOf", () => {
  it("keeps a backdrop alone", () => {
    expect(imageOf({ backdropPath: "/b.jpg" })).toEqual({
      backdropPath: "/b.jpg",
    });
  });

  it("keeps a picture on a listed host", () => {
    const picture = "https://media.senscritique.com/m/1/300/x.jpg";
    expect(imageOf({ picture })).toEqual({ picture });
  });

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

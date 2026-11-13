import { describe, expect, it } from "vitest";
import {
  isShownImageUrl,
  posterUrl,
  scPictureOf,
  thumbUrl,
  wideUrl,
} from "../src/core/image-urls";

const HOSTS = ["media.example.org"];
const TMDB = "https://image.tmdb.org/t/p";

describe("scPictureOf", () => {
  it("accepts an https URL on an allowed host", () => {
    expect(scPictureOf("https://media.example.org/m/1/300/x.jpg", HOSTS)).toBe(
      "https://media.example.org/m/1/300/x.jpg",
    );
  });

  it.each([
    "http://media.example.org/x.jpg",
    "javascript:alert(1)",
    "https://other.example.org/x.jpg",
    "/m/1/x.jpg",
    42,
  ])("rejects %s", (value) => {
    expect(scPictureOf(value, HOSTS)).toBeUndefined();
  });

  it("rejects everything with the default empty list", () => {
    expect(scPictureOf("https://media.example.org/x.jpg")).toBeUndefined();
  });
});

describe("thumbUrl", () => {
  it("prefers the poster at w92", () => {
    expect(
      thumbUrl({
        posterPath: "/a.jpg",
        picture: "https://media.example.org/p.jpg",
      }),
    ).toBe(`${TMDB}/w92/a.jpg`);
  });

  it("has no thumbnail for a backdrop alone", () => {
    expect(thumbUrl({ backdropPath: "/b.jpg" })).toBeUndefined();
  });

  it("falls back to the picture", () => {
    expect(thumbUrl({ picture: "https://media.example.org/p.jpg" })).toBe(
      "https://media.example.org/p.jpg",
    );
  });

  it("is undefined without an image", () => {
    expect(thumbUrl(undefined)).toBeUndefined();
    expect(thumbUrl({})).toBeUndefined();
  });
});

describe("wideUrl", () => {
  it("prefers the backdrop at w780", () => {
    expect(wideUrl({ posterPath: "/a.jpg", backdropPath: "/b.jpg" })).toBe(
      `${TMDB}/w780/b.jpg`,
    );
  });

  it("then the poster at w500", () => {
    expect(wideUrl({ posterPath: "/a.jpg" })).toBe(`${TMDB}/w500/a.jpg`);
  });

  it("then the picture", () => {
    expect(wideUrl({ picture: "https://media.example.org/p.jpg" })).toBe(
      "https://media.example.org/p.jpg",
    );
  });

  it("is undefined without an image", () => {
    expect(wideUrl(undefined)).toBeUndefined();
    expect(wideUrl({})).toBeUndefined();
  });
});

describe("posterUrl", () => {
  it("prefers the poster at w500", () => {
    expect(posterUrl({ posterPath: "/a.jpg", backdropPath: "/b.jpg" })).toBe(
      `${TMDB}/w500/a.jpg`,
    );
  });

  it("then the backdrop at w780", () => {
    expect(
      posterUrl({
        backdropPath: "/b.jpg",
        picture: "https://media.example.org/p.jpg",
      }),
    ).toBe(`${TMDB}/w780/b.jpg`);
  });

  it("then the picture", () => {
    expect(posterUrl({ picture: "https://media.example.org/p.jpg" })).toBe(
      "https://media.example.org/p.jpg",
    );
  });

  it("is undefined without an image", () => {
    expect(posterUrl(undefined)).toBeUndefined();
    expect(posterUrl({})).toBeUndefined();
  });
});

describe("isShownImageUrl", () => {
  it("accepts TMDB and listed hosts over https", () => {
    expect(isShownImageUrl(`${TMDB}/w92/a.jpg`)).toBe(true);
    expect(isShownImageUrl("https://media.example.org/x.jpg", HOSTS)).toBe(
      true,
    );
  });

  it("rejects http, other hosts and garbage", () => {
    expect(isShownImageUrl("http://image.tmdb.org/t/p/w92/a.jpg")).toBe(false);
    expect(isShownImageUrl("https://media.example.org/x.jpg")).toBe(false);
    expect(isShownImageUrl("not a url")).toBe(false);
  });
});

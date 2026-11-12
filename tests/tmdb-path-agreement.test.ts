import { describe, expect, it } from "vitest";
import { tmdbPathOf } from "../src/core/title-image";
import { parseTitleImage } from "../src/ext/image-schema";

// The TMDB path pattern is read by the Naka entry (core) and by the stored schema (ext): both must accept
// exactly the same strings.
const ACCEPTED = [
  "/a.jpg",
  "/a.jpeg",
  "/a.png",
  "/a.webp",
  "/A_b-9.jpg",
  "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
  `/${"a".repeat(80)}.jpg`,
];
const REJECTED = [
  "",
  "a.jpg",
  "/.jpg",
  "/a.gif",
  "/a.svg",
  "/a.JPG",
  "/a.jpg ",
  " /a.jpg",
  "/a.jpg\n",
  "/a/b.jpg",
  "/../a.jpg",
  "/a.jpg?x=1",
  "/a.jpg#x",
  "https://image.tmdb.org/a.jpg",
  `/${"a".repeat(81)}.jpg`,
];

function schemaAccepts(value: string): boolean {
  try {
    parseTitleImage({ posterPath: value }, "x");
    return true;
  } catch {
    return false;
  }
}

describe("the TMDB path pattern, in both callers", () => {
  it.each(ACCEPTED)("both accept %s", (value) => {
    expect(tmdbPathOf(value)).toBe(value);
    expect(schemaAccepts(value)).toBe(true);
  });

  it.each(REJECTED)("both reject %j", (value) => {
    expect(tmdbPathOf(value)).toBeUndefined();
    expect(schemaAccepts(value)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { toItem } from "../src/naka/naka-items";

const entry = { id: 7, tmdbId: 9, mediaType: "movie", title: "T" };

describe("toItem images", () => {
  it("keeps valid poster and backdrop paths", () => {
    const item = toItem({
      ...entry,
      posterPath: "/a.jpg",
      backdropPath: "/b.jpg",
    });
    expect(item?.image).toEqual({
      posterPath: "/a.jpg",
      backdropPath: "/b.jpg",
    });
  });

  it("keeps the item but no image for an invalid path", () => {
    const item = toItem({ ...entry, posterPath: "/../a.jpg" });
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty("image");
  });

  it("has no image key without image fields", () => {
    const item = toItem(entry);
    expect(item).toBeDefined();
    expect("image" in (item ?? {})).toBe(false);
  });
});

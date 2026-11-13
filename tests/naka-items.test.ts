import { describe, expect, it } from "vitest";
import { toItem, toItems } from "../src/naka/naka-items";

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

describe("toItems images", () => {
  it("keeps every item and the image of the valid ones only", () => {
    const items = toItems({
      data: [
        { ...entry, id: 1, posterPath: "/a.jpg" },
        { ...entry, id: 2, posterPath: "/../a.jpg" },
        { ...entry, id: 3, posterPath: "/c.gif", backdropPath: "/c.png" },
        { ...entry, id: 4 },
      ],
    });
    expect(items.map((item) => item.contentId)).toEqual([1, 2, 3, 4]);
    expect(items[0]?.image).toEqual({ posterPath: "/a.jpg" });
    expect(items[1]).not.toHaveProperty("image");
    expect(items[2]?.image).toEqual({ backdropPath: "/c.png" });
    expect(items[3]).not.toHaveProperty("image");
  });
});

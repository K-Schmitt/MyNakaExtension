import { describe, expect, it } from "vitest";
import { asItem, asItems } from "../src/sw/naka-values";

// What a Naka tab sends back: the NakaItem its client built, with `contentId` and an optional `image`.
const fromTab = (extra: Record<string, unknown> = {}) => ({
  contentId: 7,
  tmdbId: 9,
  mediaType: "movie",
  title: "Un film",
  ...extra,
});

describe("asItem keeps the poster a Naka tab read", () => {
  it("keeps a valid poster and backdrop", () => {
    const item = asItem(
      fromTab({ image: { posterPath: "/a.jpg", backdropPath: "/b.jpg" } }),
    );
    expect(item.image).toStrictEqual({
      posterPath: "/a.jpg",
      backdropPath: "/b.jpg",
    });
  });

  it("re-validates the paths: an invalid one is dropped, the item stays", () => {
    const item = asItem(
      fromTab({ image: { posterPath: "/../a.jpg", backdropPath: "/b.jpg" } }),
    );
    expect(item.image).toStrictEqual({ backdropPath: "/b.jpg" });
  });

  it("never passes a SensCritique picture or any other key through", () => {
    const item = asItem(
      fromTab({
        image: {
          picture: "https://media.senscritique.com/media/1/300/x.jpg",
          other: 1,
        },
      }),
    );
    expect("image" in item).toBe(false);
  });

  it("has no image key when the tab sent none, or a non-object", () => {
    expect("image" in asItem(fromTab())).toBe(false);
    expect("image" in asItem(fromTab({ image: "/a.jpg" }))).toBe(false);
  });

  it("keeps the posters of every item of a list", () => {
    const items = asItems([
      fromTab({ image: { posterPath: "/a.jpg" } }),
      { ...fromTab({ image: { posterPath: "/c.jpg" } }), contentId: 8 },
    ]);
    expect(items.map((i) => i.image?.posterPath)).toStrictEqual([
      "/a.jpg",
      "/c.jpg",
    ]);
  });
});

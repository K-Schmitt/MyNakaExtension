import { describe, expect, it } from "vitest";
import { createTitleLookup } from "../src/content/title-lookup";
import type { NakaItem } from "../src/naka/naka-items";

const item = (contentId: number, title: string): NakaItem => ({
  contentId,
  tmdbId: 1,
  mediaType: "tv",
  title,
});

function lookup(answers: (NakaItem | undefined | "throw")[]) {
  const asked: number[] = [];
  const list = [...answers];
  const title = createTitleLookup(async (contentId) => {
    asked.push(contentId);
    const next = list.length > 1 ? list.shift() : list[0];
    if (next === "throw") throw new Error("offline");
    return next;
  });
  return { title, asked };
}

describe("the title lookup", () => {
  it("reads a title once per content", async () => {
    const w = lookup([item(5, "Une série")]);
    expect(await w.title(5)).toBe("Une série");
    expect(await w.title(5)).toBe("Une série");
    expect(w.asked).toEqual([5]);
  });

  it("keeps one title per content id", async () => {
    const w = lookup([item(5, "A")]);
    await w.title(5);
    await w.title(6);
    expect(w.asked).toEqual([5, 6]);
  });

  it("does not cache a miss: the next ask reads again", async () => {
    const w = lookup([undefined, item(5, "Une série")]);
    expect(await w.title(5)).toBeUndefined();
    expect(await w.title(5)).toBe("Une série");
    expect(w.asked).toEqual([5, 5]);
  });

  it("answers no title when the read fails, and reads again later", async () => {
    const w = lookup(["throw", item(5, "Une série")]);
    expect(await w.title(5)).toBeUndefined();
    expect(await w.title(5)).toBe("Une série");
  });
});

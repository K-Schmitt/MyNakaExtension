import { describe, expect, it } from "vitest";
import { MAX_CARDS, type RatingCard } from "../src/core/rating-cards";
import { parseRatings } from "../src/ext/rating-schema";
import { StoredStateError } from "../src/ext/stored-error";
import { episodeCard, filmCard } from "./rating-fixtures";

function full(): RatingCard {
  return episodeCard({
    given: { épisode: 7 },
    pending: ["saison"],
    targets: [
      { label: "épisode", productId: 11, current: 7 },
      { label: "saison", productId: 12, current: null },
      { label: "série", productId: 13, current: null },
    ],
    failed: { label: "saison", error: "unavailable", at: 5 },
  });
}

function bad(card: unknown): void {
  expect(() => parseRatings([card])).toThrow(StoredStateError);
}

describe("parseRatings", () => {
  it("gives an empty list when absent", () => {
    expect(parseRatings(undefined)).toEqual([]);
  });
  it("round-trips a valid list", () => {
    const list = [full(), filmCard()];
    expect(parseRatings(JSON.parse(JSON.stringify(list)))).toEqual(list);
  });
  it("round-trips a card with an image and one without", () => {
    const withImage = filmCard({ image: { posterPath: "/a.jpg" } });
    const list = [withImage, filmCard()];
    expect(parseRatings(JSON.parse(JSON.stringify(list)))).toEqual(list);
  });
  it("rejects an image of the wrong shape", () => {
    bad({ ...filmCard(), image: { picture: "http://x/p.jpg" } });
  });
  it("rejects a non-list", () => {
    expect(() => parseRatings(null)).toThrow(StoredStateError);
    expect(() => parseRatings({})).toThrow(StoredStateError);
  });
  it("rejects a pending label with no target", () => {
    bad({
      ...episodeCard(),
      pending: ["série"],
      targets: full().targets.slice(0, 2),
    });
  });
  it("rejects a rating of 11, 0 or 5.5 in given", () => {
    bad({ ...filmCard(), given: { film: 11 } });
    bad({ ...filmCard(), given: { film: 0 } });
    bad({ ...filmCard(), given: { film: 5.5 } });
  });
  it("accepts ratings 1 and 10", () => {
    expect(() =>
      parseRatings([{ ...filmCard(), given: { film: 1 } }]),
    ).not.toThrow();
    expect(() =>
      parseRatings([{ ...filmCard(), given: { film: 10 } }]),
    ).not.toThrow();
  });
  it("rejects a current outside 1-10", () => {
    bad({
      ...filmCard(),
      targets: [{ label: "film", productId: 1, current: 11 }],
    });
    bad({
      ...filmCard(),
      targets: [{ label: "film", productId: 1, current: 0 }],
    });
  });
  it("rejects a bad key", () => {
    bad({ ...filmCard(), key: "movie:x" });
  });
  it("rejects an unknown label", () => {
    bad({ ...filmCard(), pending: ["bonus"] });
    bad({ ...filmCard(), given: { bonus: 5 } });
  });
  it("rejects an unknown key in a card, a target or failed", () => {
    bad({ ...filmCard(), extra: 1 });
    bad({
      ...filmCard(),
      targets: [{ label: "film", productId: 1, current: null, x: 1 }],
    });
    bad({
      ...full(),
      failed: { label: "saison", error: "unavailable", at: 5, x: 1 },
    });
  });
  it("rejects an unknown error code", () => {
    bad({ ...full(), failed: { label: "saison", error: "boom", at: 5 } });
  });
  it("rejects an empty title, a bad contentId or at", () => {
    bad({ ...filmCard(), title: "" });
    bad({ ...filmCard(), contentId: 0 });
    bad({ ...filmCard(), at: -1 });
  });
  it("rejects a season without an episode, and the reverse", () => {
    bad({ ...filmCard(), season: 1 });
    bad({ ...filmCard(), episode: 1 });
  });
  it("rejects no target, and a label twice", () => {
    bad({ ...filmCard(), targets: [], pending: [] });
    const t = { label: "film", productId: 1, current: null };
    bad({ ...filmCard(), targets: [t, t] });
  });
  it("rejects a non-boolean seriesFinished", () => {
    bad({ ...filmCard(), seriesFinished: 1 });
  });
  it("accepts MAX_CARDS cards and rejects one more", () => {
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => filmCard({ key: `movie:${i + 1}` }));
    expect(parseRatings(make(MAX_CARDS))).toHaveLength(MAX_CARDS);
    expect(() => parseRatings(make(MAX_CARDS + 1))).toThrow(StoredStateError);
  });
  it("rejects the whole list when one card is invalid", () => {
    expect(() =>
      parseRatings([filmCard(), { ...filmCard(), title: "" }]),
    ).toThrow(StoredStateError);
  });
});

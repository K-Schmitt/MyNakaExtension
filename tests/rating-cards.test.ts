import { describe, expect, it } from "vitest";
import {
  applyDismiss,
  applyFailure,
  applyRating,
  cardFor,
  MAX_CARDS,
  pendingOf,
  type RatingCard,
  upsertCard,
} from "../src/core/rating-cards";
import { episodeCard, filmCard, target } from "./rating-fixtures";

describe("pendingOf", () => {
  const chain = () => [target("épisode"), target("saison"), target("série")];

  it("asks a film with no rating", () => {
    expect(pendingOf([target("film")], false, false)).toEqual(["film"]);
  });
  it("does not ask a rated film", () => {
    expect(pendingOf([target("film", 6)], false, false)).toEqual([]);
  });
  it("asks only the episode when it is not the last of its season", () => {
    expect(pendingOf(chain(), false, false)).toEqual(["épisode"]);
  });
  it("asks the season at the last episode", () => {
    expect(pendingOf(chain(), true, false)).toEqual(["épisode", "saison"]);
  });
  it("asks the series once finished", () => {
    expect(pendingOf(chain(), true, true)).toEqual([
      "épisode",
      "saison",
      "série",
    ]);
  });
  it("does not ask a rated season", () => {
    const targets = [target("épisode"), target("saison", 8), target("série")];
    expect(pendingOf(targets, true, true)).toEqual(["épisode", "série"]);
  });
  it("does not ask a rated episode or series", () => {
    const targets = [
      target("épisode", 3),
      target("saison"),
      target("série", 4),
    ];
    expect(pendingOf(targets, true, true)).toEqual(["saison"]);
  });
  it("asks the series even when the season is not the last", () => {
    expect(pendingOf(chain(), false, true)).toEqual(["épisode", "série"]);
  });
});

describe("upsertCard", () => {
  function many(n: number): RatingCard[] {
    return Array.from({ length: n }, (_, i) =>
      filmCard({ key: `movie:${i + 1}`, contentId: i + 1 }),
    );
  }
  function insertAll(cards: RatingCard[]): RatingCard[] {
    return cards.reduce<RatingCard[]>((list, c) => upsertCard(list, c), []);
  }

  it("caps at MAX_CARDS and drops the oldest", () => {
    const cards = insertAll(many(MAX_CARDS + 1));
    expect(cards).toHaveLength(MAX_CARDS);
    expect(cards.some((c) => c.key === "movie:1")).toBe(false);
    expect(cards[0]?.key).toBe(`movie:${MAX_CARDS + 1}`);
    expect(cards[MAX_CARDS - 1]?.key).toBe("movie:2");
  });
  it("drops nothing at exactly MAX_CARDS", () => {
    const cards = insertAll(many(MAX_CARDS));
    expect(cards).toHaveLength(MAX_CARDS);
    expect(cards.some((c) => c.key === "movie:1")).toBe(true);
  });
  it("moves a re-upserted key first and keeps one copy", () => {
    const [a, b, c] = many(3);
    if (!a || !b || !c) throw new Error("fixture");
    const cards = upsertCard([c, b, a], { ...a, title: "Neuf" });
    expect(cards.map((x) => x.key)).toEqual(["movie:1", "movie:3", "movie:2"]);
    expect(cards[0]?.title).toBe("Neuf");
  });
  it("does not change its input", () => {
    const input = many(2);
    upsertCard(input, filmCard({ key: "movie:50", contentId: 50 }));
    expect(input).toHaveLength(2);
  });
});

describe("applyRating", () => {
  it("records the rating and the current, drops pending, clears the failure", () => {
    const failed = { label: "épisode", error: "unavailable", at: 5 } as const;
    const card = episodeCard({ failed });
    const [out] = applyRating([card], card.key, "épisode", 7);
    expect(out?.given.épisode).toBe(7);
    expect(out?.targets.find((t) => t.label === "épisode")?.current).toBe(7);
    expect(out?.pending).toEqual(["saison"]);
    expect(out?.failed).toBeUndefined();
  });
  it("keeps the failure of another label", () => {
    const failed = { label: "saison", error: "unavailable", at: 5 } as const;
    const card = episodeCard({ failed });
    const [out] = applyRating([card], card.key, "épisode", 7);
    expect(out?.failed).toEqual(failed);
  });
  it("leaves the card where it is and the other cards alone", () => {
    const a = filmCard({ key: "movie:1", contentId: 1 });
    const b = filmCard({ key: "movie:2", contentId: 2 });
    const out = applyRating([a, b], "movie:2", "film", 5);
    expect(out.map((c) => c.key)).toEqual(["movie:1", "movie:2"]);
    expect(out[0]).toEqual(a);
    expect(out[1]?.given.film).toBe(5);
  });
  it("returns the list unchanged for an unknown key", () => {
    const cards = [filmCard()];
    expect(applyRating(cards, "movie:404", "film", 5)).toEqual(cards);
  });
  it("does not change its input", () => {
    const card = filmCard();
    applyRating([card], card.key, "film", 5);
    expect(card.given).toEqual({});
    expect(card.pending).toEqual(["film"]);
  });
});

describe("applyDismiss", () => {
  it("drops the label from pending and writes no rating", () => {
    const card = episodeCard();
    const [out] = applyDismiss([card], card.key, "épisode");
    expect(out?.pending).toEqual(["saison"]);
    expect(out?.given).toEqual({});
  });
  it("returns the list unchanged for an unknown key", () => {
    const cards = [episodeCard()];
    expect(applyDismiss(cards, "tv:1:S1E1", "épisode")).toEqual(cards);
  });
});

describe("applyFailure", () => {
  it("records the failure and keeps the label pending", () => {
    const card = episodeCard();
    const [out] = applyFailure([card], card.key, "saison", "sc-session", 3000);
    expect(out?.failed).toEqual({
      label: "saison",
      error: "sc-session",
      at: 3000,
    });
    expect(out?.pending).toEqual(["épisode", "saison"]);
  });
  it("returns the list unchanged for an unknown key", () => {
    const cards = [episodeCard()];
    expect(
      applyFailure(cards, "tv:1:S1E1", "saison", "unavailable", 1),
    ).toEqual(cards);
  });
});

describe("cardFor", () => {
  it("finds a card by key", () => {
    const card = filmCard();
    expect(cardFor([episodeCard(), card], "movie:9")).toBe(card);
  });
  it("gives undefined for an unknown key", () => {
    expect(cardFor([filmCard()], "movie:1")).toBeUndefined();
  });
});

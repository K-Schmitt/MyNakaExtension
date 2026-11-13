import { describe, expect, it } from "vitest";
import {
  parseOpenQuestionsAnswer,
  parseRemovalOfferAnswer,
} from "../src/ext/question-answer-schema";
import {
  parseLastAnswer,
  parsePageQuestion,
  parseQuestionKey,
  parseQuestionOffer,
  parseUnlinkedOffer,
} from "../src/ext/question-offer-schema";
import { cand } from "./question-fixtures";

const AMBIGUITY = {
  kind: "ambiguity",
  key: "ambiguity:naka:5",
  side: "naka",
  id: 5,
  title: "Dune",
  candidates: [cand(50), cand(51)],
};
const REMOVAL = {
  kind: "removal",
  key: "removal:sc:1:101",
  removeFrom: "sc",
  pair: { nakaId: 1, scId: 101 },
  title: "",
};
const LEGACY = { kind: "legacy", key: "ambiguity:sc:7", side: "sc", id: 7 };
const UNLINKED = {
  key: "link:naka:7",
  side: "naka",
  id: 7,
  title: "X",
  reason: "none-chosen",
};
const LAST = { seq: 1, at: 2, target: "ambiguity:naka:5", outcome: "done" };

describe("question offers with images", () => {
  const image = { posterPath: "/a.jpg" };

  it("a removal offer round-trips with an image", () => {
    const offer = { ...REMOVAL, image };
    expect(parseQuestionOffer(offer, "o")).toEqual(offer);
  });
  it("an ambiguity candidate round-trips with an image", () => {
    const offer = { ...AMBIGUITY, candidates: [{ ...cand(50), image }] };
    expect(parseQuestionOffer(offer, "o")).toEqual(offer);
  });
  it("rejects an image of the wrong shape", () => {
    expect(() =>
      parseQuestionOffer({ ...REMOVAL, image: { posterPath: 3 } }, "o"),
    ).toThrow();
  });
  it("drops an image whose TMDB path the rule does not accept", () => {
    expect(
      parseQuestionOffer({ ...REMOVAL, image: { posterPath: "x" } }, "o"),
    ).toEqual(REMOVAL);
  });
});

describe("question offers", () => {
  it("each offer round-trips", () => {
    expect(parseQuestionOffer(AMBIGUITY, "o")).toEqual(AMBIGUITY);
    expect(parseQuestionOffer(REMOVAL, "o")).toEqual(REMOVAL);
    expect(parsePageQuestion({ ...AMBIGUITY, hidden: true }, "o")).toEqual({
      ...AMBIGUITY,
      hidden: true,
    });
    expect(parsePageQuestion({ ...REMOVAL, hidden: false }, "o")).toEqual({
      ...REMOVAL,
      hidden: false,
    });
    expect(parsePageQuestion(LEGACY, "o")).toEqual(LEGACY);
    expect(parseUnlinkedOffer(UNLINKED, "o")).toEqual(UNLINKED);
    expect(
      parseUnlinkedOffer(
        {
          ...UNLINKED,
          key: "link:sc:3",
          side: "sc",
          id: 3,
          reason: "no-match",
        },
        "o",
      ),
    ).toMatchObject({ reason: "no-match" });
  });

  it("refuses an extra key anywhere", () => {
    const bad = [
      () => parseQuestionOffer({ ...AMBIGUITY, extra: 1 }, "o"),
      () => parseQuestionOffer({ ...REMOVAL, extra: 1 }, "o"),
      () =>
        parseQuestionOffer(
          { ...AMBIGUITY, candidates: [{ ...cand(50), extra: 1 }] },
          "o",
        ),
      () =>
        parseQuestionOffer(
          { ...REMOVAL, pair: { nakaId: 1, scId: 101, extra: 1 } },
          "o",
        ),
      () => parsePageQuestion({ ...LEGACY, extra: 1 }, "o"),
      () => parsePageQuestion({ ...AMBIGUITY, hidden: false, extra: 1 }, "o"),
      () => parsePageQuestion(AMBIGUITY, "o"), // hidden is required
      () => parseUnlinkedOffer({ ...UNLINKED, extra: 1 }, "o"),
    ];
    for (const run of bad) expect(run).toThrow();
  });

  it("refuses a key that does not match the offer", () => {
    expect(() =>
      parseQuestionOffer({ ...AMBIGUITY, key: "ambiguity:naka:6" }, "o"),
    ).toThrow();
    expect(() =>
      parseQuestionOffer({ ...REMOVAL, key: "removal:sc:1:102" }, "o"),
    ).toThrow();
    expect(() =>
      parseUnlinkedOffer({ ...UNLINKED, key: "link:sc:7" }, "o"),
    ).toThrow();
    expect(() => parsePageQuestion({ ...LEGACY, key: "x" }, "o")).toThrow();
  });

  it("refuses more than 20 candidates and a bad kind or reason", () => {
    const many = Array.from({ length: 21 }, (_, i) => cand(i + 1));
    expect(() =>
      parseQuestionOffer({ ...AMBIGUITY, candidates: many }, "o"),
    ).toThrow();
    expect(() =>
      parseQuestionOffer({ ...AMBIGUITY, kind: "x" }, "o"),
    ).toThrow();
    expect(() =>
      parseUnlinkedOffer({ ...UNLINKED, reason: "x" }, "o"),
    ).toThrow();
  });
});

describe("question keys", () => {
  it("accepts the three shapes", () => {
    for (const key of ["ambiguity:naka:5", "removal:sc:1:101", "link:sc:9"]) {
      expect(parseQuestionKey(key, "k")).toBe(key);
    }
  });

  it("refuses removal:sc:1 (missing id) and other shapes", () => {
    for (const key of [
      "removal:sc:1",
      "removal:naka:1:2:3",
      "ambiguity:naka:0",
      "link:x:1",
      "",
      5,
      null,
    ]) {
      expect(() => parseQuestionKey(key, "k")).toThrow();
    }
  });
});

describe("last answer", () => {
  it("round-trips, with an error only for a failure", () => {
    expect(parseLastAnswer(LAST, "l")).toEqual(LAST);
    const failed = { ...LAST, outcome: "failed", error: "unavailable" };
    expect(parseLastAnswer(failed, "l")).toEqual(failed);
    for (const outcome of ["moot", "refused", "mismatch"]) {
      expect(parseLastAnswer({ ...LAST, outcome }, "l").outcome).toBe(outcome);
    }
  });

  it("refuses a failure with no error, a success with one, and bad fields", () => {
    const bad = [
      { ...LAST, outcome: "failed" },
      { ...LAST, error: "unavailable" },
      { ...LAST, outcome: "failed", error: "nope" },
      { ...LAST, outcome: "x" },
      { ...LAST, extra: 1 },
      { ...LAST, seq: -1 },
      { ...LAST, at: 1.5 },
      { ...LAST, target: "removal:sc:1" },
    ];
    for (const raw of bad) expect(() => parseLastAnswer(raw, "l")).toThrow();
  });
});

describe("the answers", () => {
  it("round-trip, with the optional fields", () => {
    const open = {
      questions: [REMOVAL, AMBIGUITY],
      answering: ["ambiguity:naka:5"],
      lastAnswer: LAST,
    };
    expect(parseOpenQuestionsAnswer(open)).toEqual(open);
    expect(parseOpenQuestionsAnswer({ questions: [] })).toEqual({
      questions: [],
    });
    expect(parseRemovalOfferAnswer({ offer: null })).toEqual({ offer: null });
    const removal = { offer: REMOVAL, answering: true, lastAnswer: LAST };
    expect(parseRemovalOfferAnswer(removal)).toEqual(removal);
  });

  it("an extra key anywhere makes the whole answer refused", () => {
    const bad = [
      { questions: [], extra: 1 },
      { questions: [{ ...AMBIGUITY, extra: 1 }] },
      { questions: [LEGACY] },
      { questions: [], lastAnswer: { ...LAST, extra: 1 } },
      { questions: [], answering: ["removal:sc:1"] },
      { questions: [], answering: "x" },
      { questions: Array.from({ length: 21 }, () => AMBIGUITY) },
    ];
    for (const raw of bad)
      expect(() => parseOpenQuestionsAnswer(raw)).toThrow();
    const badOffers = [
      {},
      { offer: null, extra: 1 },
      { offer: { ...REMOVAL, extra: 1 } },
      { offer: AMBIGUITY },
      { offer: { ...REMOVAL, kind: "ambiguity" } },
      { offer: null, answering: false },
    ];
    for (const raw of badOffers) {
      expect(() => parseRemovalOfferAnswer(raw)).toThrow();
    }
  });
});

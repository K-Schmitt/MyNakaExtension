import { describe, expect, it } from "vitest";
import { readLists, readSearch } from "../src/status/lists-input";
import { AMBIGUITY, LEGACY, LISTS, UNLINKED_NAKA } from "./lists-fixtures";

describe("readLists", () => {
  it("reads a full answer into fresh objects", () => {
    const raw = JSON.parse(JSON.stringify(LISTS));
    const read = readLists(raw);
    expect(read).toEqual(LISTS);
    expect(read?.questions[0]).not.toBe(raw.questions[0]);
  });

  it("keeps the answering keys and the last answer", () => {
    const last = { seq: 2, at: 5, target: "link:naka:5", outcome: "done" };
    const read = readLists({
      ...LISTS,
      answering: ["link:naka:5"],
      lastAnswer: last,
    });
    expect(read?.answering).toEqual(["link:naka:5"]);
    expect(read?.lastAnswer).toEqual(last);
  });

  it("refuses anything but an object with both lists", () => {
    for (const raw of [undefined, null, 4, "x", [], {}, { questions: [] }]) {
      expect(readLists(raw), String(raw)).toBeUndefined();
    }
  });

  it("refuses an extra key, anywhere", () => {
    expect(readLists({ ...LISTS, extra: 1 })).toBeUndefined();
    expect(
      readLists({ ...LISTS, questions: [{ ...AMBIGUITY, extra: 1 }] }),
    ).toBeUndefined();
    expect(
      readLists({ ...LISTS, unlinked: [{ ...UNLINKED_NAKA, extra: 1 }] }),
    ).toBeUndefined();
  });

  it("refuses a key that disagrees with its fields", () => {
    expect(
      readLists({
        ...LISTS,
        questions: [{ ...LEGACY, key: "ambiguity:naka:8" }],
      }),
    ).toBeUndefined();
    expect(
      readLists({
        ...LISTS,
        unlinked: [{ ...UNLINKED_NAKA, key: "link:sc:5" }],
      }),
    ).toBeUndefined();
  });
});

describe("readSearch", () => {
  const found = { id: 2005, title: "Dune", year: 2021, type: "film" };

  it("reads candidates", () => {
    expect(readSearch({ candidates: [found] })).toEqual({
      candidates: [found],
    });
    expect(readSearch({ candidates: [] })).toEqual({ candidates: [] });
  });

  it("reads an error code", () => {
    expect(readSearch({ error: "unavailable" })).toEqual({
      error: "unavailable",
    });
  });

  it("refuses the rest", () => {
    const bad: unknown[] = [
      undefined,
      null,
      [],
      {},
      { error: "boom" },
      { error: "unavailable", candidates: [] },
      { candidates: [{ ...found, extra: 1 }] },
      { candidates: "x" },
      { candidates: [], extra: 1 },
    ];
    for (const raw of bad) {
      expect(readSearch(raw), JSON.stringify(raw)).toBeUndefined();
    }
  });
});

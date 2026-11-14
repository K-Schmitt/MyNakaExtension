import { describe, expect, it } from "vitest";
import type { FicheUndo } from "../src/core/fiche-undo";
import { parseFicheUndo } from "../src/ext/fiche-undo-schema";

function sample(): FicheUndo {
  return {
    contentId: 7,
    productId: 99,
    role: "série",
    at: 1_700_000_000_000,
    before: {
      rating: 6,
      isDone: true,
      dateDone: "2026-11-02",
      isWished: false,
      inMaListe: null,
    },
  };
}

function withBefore(change: Record<string, unknown>): unknown {
  const r = sample();
  return { ...r, before: { ...r.before, ...change } };
}

describe("parseFicheUndo", () => {
  it("round-trips a record", () => {
    const r = sample();
    expect(parseFicheUndo(structuredClone(r))).toEqual(r);
  });

  it("round-trips a film not seen, in Ma liste", () => {
    const r: FicheUndo = {
      ...sample(),
      role: "film",
      before: {
        rating: null,
        isDone: false,
        dateDone: null,
        isWished: true,
        inMaListe: true,
      },
    };
    expect(parseFicheUndo(structuredClone(r))).toEqual(r);
  });

  it.each([undefined, null])("reads %j as no record", (raw) => {
    expect(parseFicheUndo(raw)).toBeNull();
  });

  it.each([[], "x", 3, true])("reads the corrupt value %j as null", (raw) => {
    expect(parseFicheUndo(raw)).toBeNull();
  });

  it.each([
    ["contentId", 0],
    ["contentId", "7"],
    ["productId", -1],
    ["productId", 1.5],
    ["role", "épisode"],
    ["role", "serie"],
    ["at", -1],
    ["at", "now"],
    ["before", null],
  ])("reads a bad %s (%j) as null", (key, value) => {
    expect(parseFicheUndo({ ...sample(), [key]: value })).toBeNull();
  });

  it.each([
    ["rating", 0],
    ["rating", 11],
    ["rating", 6.5],
    ["rating", undefined],
    ["isDone", "yes"],
    ["dateDone", "2026-11-02T10:00:00Z"],
    ["dateDone", 1_700_000_000],
    ["isWished", null],
    ["inMaListe", "true"],
    ["inMaListe", undefined],
  ])("reads a bad before.%s (%j) as null", (key, value) => {
    expect(parseFicheUndo(withBefore({ [key]: value }))).toBeNull();
  });

  it("rejects an unknown key on the record", () => {
    expect(parseFicheUndo({ ...sample(), extra: 1 })).toBeNull();
  });

  it("rejects an unknown key on the before-state", () => {
    expect(parseFicheUndo(withBefore({ extra: 1 }))).toBeNull();
  });

  it("rejects a record missing a key", () => {
    const { at: _, ...rest } = sample();
    expect(parseFicheUndo(rest)).toBeNull();
  });
});

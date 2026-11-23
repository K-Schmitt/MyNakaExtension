import { describe, expect, it } from "vitest";
import type { FicheUndo } from "../src/core/fiche-undo";
import { parseFicheUndo } from "../src/ext/fiche-undo-schema";
import { episodeCard } from "./rating-fixtures";

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
      dejaVuOn: null,
    },
    local: {
      handled: false,
      settled: true,
      cards: [episodeCard({ contentId: 7 })],
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
        dejaVuOn: null,
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
    ["dejaVuOn", "x"],
  ])("reads a bad before.%s (%j) as null", (key, value) => {
    expect(parseFicheUndo(withBefore({ [key]: value }))).toBeNull();
  });

  it("reads a record stored before 10c (no dejaVuOn) with dejaVuOn null", () => {
    const r = sample();
    const { dejaVuOn: _gone, ...before } = r.before;
    expect(parseFicheUndo({ ...r, before })).toEqual(r);
  });

  it.each([true, false, null])("keeps dejaVuOn %s", (dejaVuOn) => {
    const r = sample();
    expect(parseFicheUndo(withBefore({ dejaVuOn }))).toEqual({
      ...r,
      before: { ...r.before, dejaVuOn },
    });
  });

  it("rejects an unknown key on the record", () => {
    expect(parseFicheUndo({ ...sample(), extra: 1 })).toBeNull();
  });

  it("rejects an unknown key on the before-state", () => {
    expect(parseFicheUndo(withBefore({ extra: 1 }))).toBeNull();
  });

  it("rejects a corrupt local state: a bad card, a missing card list, an extra key, no local", () => {
    // Arrange
    const r = sample();
    const badCard = { ...r.local, cards: [{ key: "x" }] };
    const { cards: _, ...noCards } = r.local;
    const { local: _l, ...noLocal } = r;

    // Act, Assert
    expect(parseFicheUndo({ ...r, local: badCard })).toBeNull();
    expect(parseFicheUndo({ ...r, local: noCards })).toBeNull();
    expect(parseFicheUndo({ ...r, local: { ...r.local, x: 1 } })).toBeNull();
    expect(
      parseFicheUndo({ ...r, local: { ...r.local, handled: 1 } }),
    ).toBeNull();
    expect(parseFicheUndo(noLocal)).toBeNull();
  });

  it("round-trips a film record with no card", () => {
    const r: FicheUndo = {
      ...sample(),
      role: "film",
      local: { handled: true, settled: false, cards: [] },
    };
    expect(parseFicheUndo(structuredClone(r))).toEqual(r);
  });

  it("lets an error other than a bad field through", () => {
    // Arrange: a value whose read itself throws is no stored record, so it is not read as null.
    const raw = {
      ...sample(),
      get before(): never {
        throw new RangeError("not a field");
      },
    };

    // Act, Assert
    expect(() => parseFicheUndo(raw)).toThrow(RangeError);
  });

  it("rejects a record missing a key", () => {
    const { at: _, ...rest } = sample();
    expect(parseFicheUndo(rest)).toBeNull();
  });
});

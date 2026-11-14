import { describe, expect, it } from "vitest";
import {
  canRemove,
  type FicheUndo,
  liveUndo,
  UNDO_WINDOW_MS,
  type UndoBefore,
  type UndoStep,
  undoSteps,
} from "../src/core/fiche-undo";

const AT = 1_700_000_000_000;

function record(before: Partial<UndoBefore> = {}): FicheUndo {
  return {
    contentId: 7,
    productId: 99,
    role: "film",
    at: AT,
    before: {
      rating: null,
      isDone: false,
      dateDone: null,
      isWished: false,
      inMaListe: null,
      ...before,
    },
  };
}

const OPEN = { isReviewed: false, isRecommended: false };
const REVIEWED = { isReviewed: true, isRecommended: false };
const RECOMMENDED = { isReviewed: false, isRecommended: true };
const LOCAL: UndoStep = { kind: "localRestore" };
const WISH: UndoStep = { kind: "wish" };
const MA_LISTE: UndoStep = { kind: "maListe" };
const UNDONE: UndoStep = { kind: "undone" };
const REFUSED: UndoStep[] = [{ kind: "refused-protected" }];

describe("liveUndo", () => {
  it("gives the record one millisecond before the window closes", () => {
    const r = record();
    expect(liveUndo(r, 7, AT + 599_999)).toBe(r);
  });

  it("gives nothing once the window has closed", () => {
    expect(liveUndo(record(), 7, AT + 600_000)).toBeUndefined();
  });

  it("gives nothing for another title", () => {
    expect(liveUndo(record(), 8, AT + 1)).toBeUndefined();
  });

  it("gives the record at the very millisecond it was made", () => {
    const r = record();
    expect(liveUndo(r, 7, AT)).toBe(r);
  });

  it("gives nothing for a record from the future (clock set back)", () => {
    expect(liveUndo(record(), 7, AT - 1)).toBeUndefined();
  });

  it("gives nothing without a record", () => {
    expect(liveUndo(null, 7, AT + 1)).toBeUndefined();
  });

  it("keeps a window of ten minutes", () => {
    expect(UNDO_WINDOW_MS).toBe(600_000);
  });
});

describe("undoSteps, title not seen before", () => {
  it("sends undone, then the local restore", () => {
    expect(undoSteps(record(), OPEN)).toEqual([UNDONE, LOCAL]);
  });

  it("puts the wish and Ma liste back after undone", () => {
    const r = record({ isWished: true, inMaListe: true });
    expect(undoSteps(r, OPEN)).toEqual([UNDONE, WISH, MA_LISTE, LOCAL]);
  });

  it("puts an old rating back right after undone (spec §7, ruling R1)", () => {
    const r = record({ rating: 4, isWished: true, inMaListe: true });
    expect(undoSteps(r, OPEN)).toEqual([
      UNDONE,
      { kind: "rate", rating: 4 },
      WISH,
      MA_LISTE,
      LOCAL,
    ]);
  });

  it("leaves Ma liste alone when it was out of it or unknown", () => {
    expect(undoSteps(record({ inMaListe: false }), OPEN)).toEqual([
      UNDONE,
      LOCAL,
    ]);
    expect(undoSteps(record({ inMaListe: null }), OPEN)).toEqual([
      UNDONE,
      LOCAL,
    ]);
  });
});

describe("undoSteps, title seen with a rating", () => {
  it("only puts the old rating back, never undone", () => {
    const r = record({ isDone: true, rating: 6, dateDone: "2026-11-02" });
    expect(undoSteps(r, OPEN)).toEqual([{ kind: "rate", rating: 6 }, LOCAL]);
  });

  it("adds the wish and Ma liste steps", () => {
    const r = record({
      isDone: true,
      rating: 6,
      isWished: true,
      inMaListe: true,
    });
    expect(undoSteps(r, OPEN)).toEqual([
      { kind: "rate", rating: 6 },
      WISH,
      MA_LISTE,
      LOCAL,
    ]);
  });

  it("is never refused, the critique being safe", () => {
    const r = record({ isDone: true, rating: 6 });
    expect(undoSteps(r, REVIEWED)).toEqual([
      { kind: "rate", rating: 6 },
      LOCAL,
    ]);
    expect(undoSteps(r, RECOMMENDED)).toEqual([
      { kind: "rate", rating: 6 },
      LOCAL,
    ]);
  });
});

describe("undoSteps, title seen without a rating", () => {
  it("sends undone, then « vu » at its old date", () => {
    const r = record({ isDone: true, dateDone: "2026-11-02", isWished: true });
    expect(undoSteps(r, OPEN)).toEqual([
      UNDONE,
      { kind: "markDone", date: "2026-11-02" },
      WISH,
      LOCAL,
    ]);
  });

  it("sends undone, then « vu » without a date when none was known", () => {
    const r = record({ isDone: true, inMaListe: true });
    expect(undoSteps(r, OPEN)).toEqual([
      UNDONE,
      { kind: "markDoneWithoutDate" },
      MA_LISTE,
      LOCAL,
    ]);
  });
});

describe("undoSteps, protected title", () => {
  const needingUndone: [string, Partial<UndoBefore>][] = [
    ["not seen", { isWished: true, inMaListe: true }],
    ["not seen, with an old rating", { rating: 4 }],
    ["seen without a rating, dated", { isDone: true, dateDone: "2026-11-02" }],
    ["seen without a rating, no date", { isDone: true }],
  ];

  it.each(needingUndone)("refuses undone when reviewed: %s", (_, b) => {
    expect(undoSteps(record(b), REVIEWED)).toEqual(REFUSED);
  });

  it.each(needingUndone)("refuses undone when recommended: %s", (_, b) => {
    expect(undoSteps(record(b), RECOMMENDED)).toEqual(REFUSED);
  });
});

describe("canRemove", () => {
  it("offers the removal for a rated title with nothing to lose", () => {
    expect(canRemove({ rating: 6, ...OPEN })).toBe(true);
  });

  it("does not offer it without a rating", () => {
    expect(canRemove({ rating: null, ...OPEN })).toBe(false);
  });

  it("does not offer it when reviewed", () => {
    expect(canRemove({ rating: 6, ...REVIEWED })).toBe(false);
  });

  it("does not offer it when recommended", () => {
    expect(canRemove({ rating: 6, ...RECOMMENDED })).toBe(false);
  });
});

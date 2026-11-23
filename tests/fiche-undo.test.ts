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
      dejaVuOn: null,
      ...before,
    },
    local: { handled: false, settled: false, cards: [] },
  };
}

const OPEN = { isReviewed: false, isRecommended: false };
const REVIEWED = { isReviewed: true, isRecommended: false };
const RECOMMENDED = { isReviewed: false, isRecommended: true };
/** SensCritique once the rating went out: seen today, rated 8, no longer wished. */
const RATED_NOW = {
  isDone: true,
  rating: 8,
  dateDone: "2026-11-05",
  isWished: false,
};
const at = (flags: typeof OPEN) => ({ ...RATED_NOW, ...flags });
const LOCAL: UndoStep = { kind: "localRestore" };
const WISH: UndoStep = { kind: "wish" };
const MA_LISTE: UndoStep = { kind: "maListe" };
const DEJA_VU: UndoStep = { kind: "dejaVu" };
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
    expect(undoSteps(record(), at(OPEN))).toEqual([UNDONE, LOCAL]);
  });

  it("puts the wish and Ma liste back after undone", () => {
    const r = record({ isWished: true, inMaListe: true });
    expect(undoSteps(r, at(OPEN))).toEqual([UNDONE, WISH, MA_LISTE, LOCAL]);
  });

  it("puts an old rating back right after undone", () => {
    const r = record({ rating: 4, isWished: true, inMaListe: true });
    expect(undoSteps(r, at(OPEN))).toEqual([
      UNDONE,
      { kind: "rate", rating: 4 },
      WISH,
      MA_LISTE,
      LOCAL,
    ]);
  });

  it("leaves Ma liste alone when it was out of it or unknown", () => {
    expect(undoSteps(record({ inMaListe: false }), at(OPEN))).toEqual([
      UNDONE,
      LOCAL,
    ]);
    expect(undoSteps(record({ inMaListe: null }), at(OPEN))).toEqual([
      UNDONE,
      LOCAL,
    ]);
  });
});

describe("undoSteps, title seen with a rating", () => {
  it("only puts the old rating back, never undone", () => {
    const r = record({ isDone: true, rating: 6, dateDone: "2026-11-02" });
    expect(undoSteps(r, at(OPEN))).toEqual([
      { kind: "rate", rating: 6 },
      LOCAL,
    ]);
  });

  it("adds the wish and Ma liste steps", () => {
    const r = record({
      isDone: true,
      rating: 6,
      isWished: true,
      inMaListe: true,
    });
    expect(undoSteps(r, at(OPEN))).toEqual([
      { kind: "rate", rating: 6 },
      WISH,
      MA_LISTE,
      LOCAL,
    ]);
  });

  it("is never refused, the critique being safe", () => {
    const r = record({ isDone: true, rating: 6 });
    expect(undoSteps(r, at(REVIEWED))).toEqual([
      { kind: "rate", rating: 6 },
      LOCAL,
    ]);
    expect(undoSteps(r, at(RECOMMENDED))).toEqual([
      { kind: "rate", rating: 6 },
      LOCAL,
    ]);
  });
});

describe("undoSteps, title seen without a rating", () => {
  it("sends undone, then « vu » at its old date", () => {
    const r = record({ isDone: true, dateDone: "2026-11-02", isWished: true });
    expect(undoSteps(r, at(OPEN))).toEqual([
      UNDONE,
      { kind: "markDone", date: "2026-11-02" },
      WISH,
      LOCAL,
    ]);
  });

  it("sends undone, then « vu » without a date when none was known", () => {
    const r = record({ isDone: true, inMaListe: true });
    expect(undoSteps(r, at(OPEN))).toEqual([
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
    expect(undoSteps(record(b), at(REVIEWED))).toEqual(REFUSED);
  });

  it.each(needingUndone)("refuses undone when recommended: %s", (_, b) => {
    expect(undoSteps(record(b), at(RECOMMENDED))).toEqual(REFUSED);
  });
});

describe("undoSteps, a retry after a partial failure", () => {
  const seenDated = { isDone: true, dateDone: "2026-11-02" } as const;

  it("skips the rating steps once « vu », its date and the rating are back", () => {
    const r = record({ ...seenDated, isWished: true });
    const back = { ...at(OPEN), rating: null, ...seenDated };
    expect(undoSteps(r, back)).toEqual([WISH, LOCAL]);
  });

  it("puts the date back when only the date differs", () => {
    const r = record(seenDated);
    const otherDate = { ...at(OPEN), rating: null, isDone: true };
    expect(undoSteps(r, otherDate)).toEqual([
      UNDONE,
      { kind: "markDone", date: "2026-11-02" },
      LOCAL,
    ]);
  });

  it("sends no undone over a product neither seen nor rated", () => {
    const r = record(seenDated);
    const bare = { ...at(OPEN), rating: null, isDone: false, dateDone: null };
    expect(undoSteps(r, bare)).toEqual([
      { kind: "markDone", date: "2026-11-02" },
      LOCAL,
    ]);
  });

  it("puts an old rating back without undone once the product is bare", () => {
    const r = record({ rating: 4 });
    const bare = { ...at(OPEN), rating: null, isDone: false, dateDone: null };
    expect(undoSteps(r, bare)).toEqual([{ kind: "rate", rating: 4 }, LOCAL]);
  });

  it("sends no wish when the product is wished again", () => {
    const r = record({ isWished: true });
    expect(undoSteps(r, { ...at(OPEN), isWished: true })).toEqual([
      UNDONE,
      LOCAL,
    ]);
  });

  it("a not seen title already back: only the local restore", () => {
    const bare = { ...at(OPEN), rating: null, isDone: false, dateDone: null };
    expect(undoSteps(record(), bare)).toEqual([LOCAL]);
  });

  it("still refuses an undone that remains over a protected title", () => {
    const r = record(seenDated);
    const otherDate = { ...at(REVIEWED), rating: null, isDone: true };
    expect(undoSteps(r, otherDate)).toEqual(REFUSED);
  });

  it("a protected title whose rating steps are all back is not refused", () => {
    const r = record({ ...seenDated, isWished: true });
    const back = { ...at(REVIEWED), rating: null, ...seenDated };
    expect(undoSteps(r, back)).toEqual([WISH, LOCAL]);
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

describe("undoSteps and Naka's « Déjà vu »", () => {
  it("turns it off, after « Ma liste » and before the local state, when it was off", () => {
    const r = record({ inMaListe: true, dejaVuOn: false });
    expect(undoSteps(r, at(OPEN))).toEqual([UNDONE, MA_LISTE, DEJA_VU, LOCAL]);
  });

  it("plans the step alone with the rating already back", () => {
    const r = record({ dejaVuOn: false });
    expect(undoSteps(r, { ...at(OPEN), isDone: false, rating: null })).toEqual([
      DEJA_VU,
      LOCAL,
    ]);
  });

  it.each([true, null])("plans no step when it was %s", (dejaVuOn) => {
    const steps = undoSteps(record({ dejaVuOn }), at(OPEN));
    expect(steps.some((step) => step.kind === "dejaVu")).toBe(false);
  });

  it("stays a single refusal over a protected title", () => {
    expect(undoSteps(record({ dejaVuOn: false }), at(REVIEWED))).toEqual(
      REFUSED,
    );
  });
});

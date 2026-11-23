import { describe, expect, it } from "vitest";
import {
  catchUp,
  noteRows,
  REDRAWN_STILL_MS,
  SAME_ROWS_STILL_MS,
  startTurn,
  waitLeft,
} from "../src/content/ui/season-settle";

describe("the wait after a season change", () => {
  it("starts from the rows on the page when the change is seen", () => {
    expect(startTurn("A\nB", 50)).toEqual({
      before: "A\nB",
      rows: "A\nB",
      stillSince: 50,
      caughtUp: false,
    });
  });

  it("waits 300 ms once the titles changed, 1,000 ms while they did not", () => {
    expect(REDRAWN_STILL_MS).toBe(300);
    expect(SAME_ROWS_STILL_MS).toBe(1000);
    const turn = startTurn("A\nB", 0);
    expect(waitLeft(turn, 0)).toBe(1000);
    expect(waitLeft(noteRows(turn, "C\nD", 0), 0)).toBe(300);
  });

  it("counts the wait from the last change of the titles", () => {
    const turn = noteRows(startTurn("A", 0), "B", 600);
    expect(waitLeft(turn, 700)).toBe(200);
    expect(waitLeft(startTurn("A", 0), 400)).toBe(600);
  });

  it("has nothing left to wait once the delay is past", () => {
    const turn = startTurn("A", 0);
    expect(waitLeft(turn, 1000)).toBe(0);
    expect(waitLeft(turn, 5000)).toBe(0);
    expect(waitLeft(noteRows(turn, "B", 100), 400)).toBe(0);
  });

  it("starts again from now at each new list of titles", () => {
    const first = noteRows(startTurn("A", 0), "B", 100);
    const second = noteRows(first, "C", 250);
    expect(second).toEqual({
      before: "A",
      rows: "C",
      stillSince: 250,
      caughtUp: false,
    });
    expect(noteRows(second, "A", 400)).toEqual({
      before: "A",
      rows: "A",
      stillSince: 400,
      caughtUp: false,
    });
  });

  it("keeps the same turn for the same titles", () => {
    const turn = noteRows(startTurn("A", 0), "B", 100);
    expect(noteRows(turn, "B", 900)).toBe(turn);
  });
});

describe("the wait once the view shows the page's season", () => {
  it("waits 1,000 ms again from now when the rows did not change since the turn began", () => {
    const turn = catchUp(startTurn("A", 0), 900);
    expect(turn).toEqual({
      before: "A",
      rows: "A",
      stillSince: 900,
      caughtUp: true,
    });
    expect(waitLeft(turn, 900)).toBe(1000);
  });

  it("restarts the wait only once", () => {
    const once = catchUp(startTurn("A", 0), 900);
    expect(catchUp(once, 1500)).toBe(once);
  });

  it("keeps the 300 ms wait of rows that changed", () => {
    const turn = catchUp(noteRows(startTurn("A", 0), "B", 100), 200);
    expect(turn).toEqual({
      before: "A",
      rows: "B",
      stillSince: 100,
      caughtUp: true,
    });
    expect(waitLeft(turn, 200)).toBe(200);
  });
});

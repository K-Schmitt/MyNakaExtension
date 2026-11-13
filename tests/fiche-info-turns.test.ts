import { describe, expect, it } from "vitest";
import { createInfoTurns } from "../src/sw/fiche-info-turns";

describe("the fiche-info turns of the tabs", () => {
  it("a new turn of a tab ends the older one's", () => {
    const turns = createInfoTurns();
    const older = turns.start(7);
    expect(older.live()).toBe(true);
    const newer = turns.start(7);
    expect(older.live()).toBe(false);
    expect(newer.live()).toBe(true);
  });

  it("an older turn that ends leaves the newer live", () => {
    const turns = createInfoTurns();
    const older = turns.start(7);
    const newer = turns.start(7);
    older.end();
    expect(newer.live()).toBe(true);
  });

  it("an ended turn is no longer live, and the tab's next turn is", () => {
    const turns = createInfoTurns();
    const first = turns.start(7);
    first.end();
    expect(first.live()).toBe(false);
    expect(turns.start(7).live()).toBe(true);
  });

  it("the turns of two tabs are apart", () => {
    const turns = createInfoTurns();
    const mine = turns.start(7);
    const other = turns.start(8);
    expect(mine.live()).toBe(true);
    expect(other.live()).toBe(true);
  });
});

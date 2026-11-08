import { describe, expect, it } from "vitest";
import { type RowMove, rowMove } from "../src/content/ui/row-place";

const cases: [number, number, number, RowMove][] = [
  [0, 1, 0, "keep"],
  [0, 1, 5000, "keep"],
  [0, -1, 0, "after-reprendre"],
  [0, -1, 5000, "after-reprendre"],
  [2, 0, 0, "after-reprendre"],
  [2, 0, 5000, "after-reprendre"],
  [-1, -1, 999, "wait"],
  [-1, -1, 1000, "top"],
  [-1, 0, 0, "keep"],
  [-1, 0, 5000, "keep"],
  [-1, 3, 1000, "top"],
];

describe("rowMove", () => {
  it.each(cases)(
    "reprendre %i, host %i, age %i gives %s",
    (reprendre, host, age, move) => {
      expect(rowMove({ reprendre, host, age })).toBe(move);
    },
  );
});

import { describe, expect, it } from "vitest";
import { isIsoDate } from "../src/core/iso-date";

describe("isIsoDate: the one YYYY-MM-DD check", () => {
  it.each(["2026-11-14", "1972-03-20", "0000-00-00", "2026-02-30"])(
    "accepts %s (its shape only)",
    (value) => {
      expect(isIsoDate(value)).toBe(true);
    },
  );

  it.each([
    "",
    "2026-11-1",
    "26-11-14",
    "2026/11/14",
    "2026-11-14T00:00:00Z",
    " 2026-11-14",
    "2026-11-14\n",
    "2026-1a-14",
    "\u0663\u0663\u0663\u0663-11-14",
  ])("refuses %j", (value) => {
    expect(isIsoDate(value)).toBe(false);
  });
});

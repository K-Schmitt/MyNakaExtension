import { describe, expect, it } from "vitest";
import {
  MAX_VISIT_PATH,
  parseVisit,
  VISIT_TYPE,
  visitMessage,
} from "../src/ext/fiche-visit";
import { parsePageEvent } from "../src/ext/messages";

describe("the tab's announcement of a title page visit", () => {
  it("carries the path only, and parses back to it", () => {
    const msg = visitMessage("/content/tv/1434");
    expect(msg).toEqual({ type: VISIT_TYPE, path: "/content/tv/1434" });
    expect(parseVisit(msg)).toBe("/content/tv/1434");
  });

  it("is no page event, so the tab never takes its own announcement for one", () => {
    expect(parsePageEvent(visitMessage("/content/tv/1434"))).toBeUndefined();
  });

  it(`accepts a path of ${MAX_VISIT_PATH} characters`, () => {
    const path = "x".repeat(MAX_VISIT_PATH);
    expect(parseVisit({ type: VISIT_TYPE, path })).toBe(path);
  });

  it.each([
    ["an extra key", { type: VISIT_TYPE, path: "/content/tv/1", token: "t" }],
    ["another type", { type: "mynaka/other", path: "/content/tv/1" }],
    ["no path", { type: VISIT_TYPE }],
    ["a number path", { type: VISIT_TYPE, path: 1 }],
    [
      `a path over ${MAX_VISIT_PATH} characters`,
      { type: VISIT_TYPE, path: "x".repeat(MAX_VISIT_PATH + 1) },
    ],
    ["an array", [VISIT_TYPE, "/content/tv/1"]],
    ["null", null],
    ["a string", "/content/tv/1"],
  ])("refuses %s", (_name, raw) => {
    expect(parseVisit(raw)).toBeUndefined();
  });
});

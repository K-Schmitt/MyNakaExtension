import { describe, expect, it } from "vitest";
import { exportFileName, exportText } from "../src/status/data-export";
import { mountExport } from "../src/status/data-export-dom";
import { FakeElement } from "./ui-fakes";

const NOW = new Date(2026, 0, 5, 14, 30);

const FULL = {
  state: { binding: { userId: "u1" }, lastRun: null },
  settings: { mode: "live", filmThreshold: 0.8 },
  ratings: [{ key: "k", rating: 7 }],
  ficheLinks: { a: "b" },
  ficheUndo: null,
};

describe("exportFileName", () => {
  it("uses the local date", () => {
    expect(exportFileName(NOW)).toBe("mynakaextension-donnees-2026-01-05.json");
  });
});

describe("exportText", () => {
  it("keeps the five keys and drops an unknown one", () => {
    const parsed = JSON.parse(exportText({ ...FULL, other: 1 }, "1.2.3", NOW));
    expect(Object.keys(parsed.data)).toEqual([
      "state",
      "settings",
      "ratings",
      "ficheLinks",
      "ficheUndo",
    ]);
    expect(parsed.extension).toBe("MyNakaExtension");
    expect(parsed.version).toBe("1.2.3");
    expect(parsed.exportedAt).toBe(NOW.toISOString());
  });

  it("leaves an absent key absent, not null", () => {
    const parsed = JSON.parse(exportText({ ratings: [] }, "1", NOW));
    expect(parsed.data).toEqual({ ratings: [] });
    expect("state" in parsed.data).toBe(false);
  });

  it("exports an unreadable value as stored", () => {
    const parsed = JSON.parse(
      exportText({ state: "garbage", settings: 5 }, "1", NOW),
    );
    expect(parsed.data).toEqual({ state: "garbage", settings: 5 });
  });

  it("never carries a credential", () => {
    const text = exportText(FULL, "1", NOW).toLowerCase();
    expect(text).not.toContain("sc_auth");
    expect(text).not.toContain("authorization");
  });
});

describe("mountExport", () => {
  it("downloads once per click with the name and the text", async () => {
    const button = new FakeElement("button");
    const calls: [string, string][] = [];
    mountExport(
      { getElementById: (id) => (id === "export" ? button : null) },
      { get: async () => FULL },
      (name, text) => calls.push([name, text]),
      "1.2.3",
      () => NOW,
    );
    button.click(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([
      [exportFileName(NOW), exportText(FULL, "1.2.3", NOW)],
    ]);
  });
});

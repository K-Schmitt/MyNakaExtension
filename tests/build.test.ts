import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const FILES = [
  "manifest.json",
  "sw.js",
  "naka-isolated.js",
  "naka-main.js",
  "status.html",
  "status.js",
];

function out(name: string): string {
  return readFileSync(`dist/${name}`, "utf8");
}

describe("build", () => {
  beforeAll(() => {
    execFileSync("node", ["scripts/build.mjs"], { stdio: "pipe" });
  }, 60_000);

  it("emits the six files", () => {
    for (const name of FILES) {
      expect(existsSync(`dist/${name}`), name).toBe(true);
    }
  });

  it("bundles sw.js: no import of a bare module specifier", () => {
    const bare =
      /(?:^|[\s;])(?:import|export)\s*(?:[^'"\n;]*?\sfrom\s*)?["'](?![./])[^"']+["']/m;
    expect(out("sw.js")).not.toMatch(bare);
  });

  it("keeps console.log out of every output file", () => {
    for (const name of FILES) {
      expect(out(name), name).not.toContain("console.log");
    }
  });
});

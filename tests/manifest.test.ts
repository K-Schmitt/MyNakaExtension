import { describe, expect, it } from "vitest";
import manifest from "../src/manifest.json";

describe("manifest", () => {
  it("is a Manifest V3 file with a semver version", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

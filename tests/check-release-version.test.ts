import { describe, expect, it } from "vitest";
import { releaseVersionError } from "../scripts/check-release-version.mjs";

describe("releaseVersionError", () => {
  it("accepts a tag that agrees with the manifest and the package", () => {
    expect(releaseVersionError("v1.0.0", "1.0.0", "1.0.0")).toBeUndefined();
  });

  it("rejects a tag without the v prefix", () => {
    const message = releaseVersionError("1.0.0", "1.0.0", "1.0.0");
    expect(message).toContain("1.0.0");
    expect(message).toContain("v");
  });

  it("names the tag and the manifest version when they differ", () => {
    const message = releaseVersionError("v1.0.1", "1.0.0", "1.0.1");
    expect(message).toContain("v1.0.1");
    expect(message).toContain("1.0.0");
    expect(message).toContain("manifest");
  });

  it("names the tag and the package version when they differ", () => {
    const message = releaseVersionError("v1.0.1", "1.0.1", "1.0.0");
    expect(message).toContain("v1.0.1");
    expect(message).toContain("1.0.0");
    expect(message).toContain("package");
  });
});

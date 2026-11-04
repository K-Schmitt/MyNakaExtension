import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));

describe("manifest", () => {
  it("is a Manifest V3 file with a semver version", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("asks only for storage and the three site hosts", () => {
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toEqual([
      "https://naka.cx/*",
      "https://www.senscritique.com/*",
      "https://apollo.senscritique.com/*",
    ]);
  });

  it("declares none of the forbidden powers", () => {
    const all = [
      ...(manifest.permissions ?? []),
      ...(manifest.host_permissions ?? []),
    ];
    expect(all).not.toContain("tabs");
    expect(all).not.toContain("cookies");
    expect(manifest).not.toHaveProperty("externally_connectable");
    expect(manifest).not.toHaveProperty("web_accessible_resources");
  });

  it("runs a module service worker and the status page as options", () => {
    expect(manifest.background).toEqual({
      service_worker: "sw.js",
      type: "module",
    });
    expect(manifest.options_page).toBe("status.html");
    expect(manifest.action?.default_popup).toBeUndefined();
  });

  it("injects the MAIN and ISOLATED scripts on naka.cx", () => {
    expect(manifest.content_scripts).toEqual([
      {
        matches: ["https://naka.cx/*"],
        js: ["naka-main.js"],
        world: "MAIN",
        run_at: "document_start",
      },
      {
        matches: ["https://naka.cx/*"],
        js: ["naka-isolated.js"],
        run_at: "document_idle",
      },
    ]);
  });
});

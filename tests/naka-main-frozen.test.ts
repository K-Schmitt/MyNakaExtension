import { afterAll, describe, expect, it, vi } from "vitest";

// A page whose fetch cannot be replaced: the MAIN-world script gives up quietly and the page's fetch
// stays the page's.
describe("MAIN-world entry on a page that froze its fetch", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("loads without an error and leaves the page's fetch as it was", async () => {
    const pageFetch = async () => ({ ok: true, status: 200 }) as Response;
    const page = {
      postMessage: () => undefined,
      get fetch() {
        return pageFetch;
      },
    };
    vi.stubGlobal("window", page);
    vi.stubGlobal("location", { href: "https://naka.cx/" });
    // Without isolation, the entry may already be loaded by another file: run it again on this page.
    vi.resetModules();
    await expect(import("../src/page/naka-main")).resolves.toBeDefined();
    expect(page.fetch).toBe(pageFetch);
  });
});

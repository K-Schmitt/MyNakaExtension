import { describe, expect, it } from "vitest";
import {
  createFicheRegistry,
  FICHE_REGISTRY_KEY,
  MAX_FICHE_PRODUCTS,
  MAX_FICHE_TABS,
} from "../src/sw/fiche-registry";
import { memoryArea } from "./sw-fakes";

const fresh = () => {
  const area = memoryArea();
  return { area, r: createFicheRegistry(area) };
};

describe("fiche registry", () => {
  it("knows a product only for the tab and the content it was issued to", async () => {
    const { r } = fresh();
    await r.open(1, 10, undefined, [100, 101]);
    expect(await r.has(1, 10, 100)).toBe(true);
    expect(await r.has(1, 10, 101)).toBe(true);
    expect(await r.has(1, 10, 102)).toBe(false);
    expect(await r.has(2, 10, 100)).toBe(false);
    expect(await r.has(1, 11, 100)).toBe(false);
  });

  it("the title product is issued and named", async () => {
    const { r } = fresh();
    await r.open(1, 10, 500, []);
    expect(await r.has(1, 10, 500)).toBe(true);
    expect(await r.titleOf(1, 10)).toBe(500);
    expect(await r.titleOf(1, 11)).toBeUndefined();
    expect(await r.titleOf(2, 10)).toBeUndefined();
  });

  it("issue adds to the tab's current page", async () => {
    const { r } = fresh();
    await r.open(1, 10, 500, []);
    await r.issue(1, 10, [100]);
    await r.issue(1, 10, [101]);
    expect(await r.titleOf(1, 10)).toBe(500);
    expect(await r.has(1, 10, 100)).toBe(true);
    expect(await r.has(1, 10, 101)).toBe(true);
  });

  it("issue for another content than the tab's page issues nothing", async () => {
    const { r } = fresh();
    await r.open(1, 11, 600, []);
    await r.issue(1, 10, [100]);
    expect(await r.has(1, 10, 100)).toBe(false);
    expect(await r.titleOf(1, 11)).toBe(600);
  });

  it("open resets the tab: nothing issued before stays (same content or another)", async () => {
    const { r } = fresh();
    await r.open(1, 10, undefined, [100, 101]);
    await r.open(1, 10, 500, []);
    expect(await r.has(1, 10, 100)).toBe(false);
    expect(await r.has(1, 10, 500)).toBe(true);
    await r.open(1, 11, undefined, [200]);
    expect(await r.has(1, 10, 500)).toBe(false);
    expect(await r.titleOf(1, 10)).toBeUndefined();
    expect(await r.has(1, 11, 200)).toBe(true);
  });

  it("drop forgets the tab, and only that tab", async () => {
    const { r } = fresh();
    await r.open(1, 10, 500, []);
    await r.open(2, 10, 500, []);
    await r.drop(1);
    expect(await r.has(1, 10, 500)).toBe(false);
    expect(await r.has(2, 10, 500)).toBe(true);
  });

  it("a fresh registry over the same area still knows the issued products (a worker restart)", async () => {
    const { area, r } = fresh();
    await r.open(1, 10, 500, [100]);
    await r.issue(1, 10, [101]);
    const restarted = createFicheRegistry(area);
    expect(await restarted.titleOf(1, 10)).toBe(500);
    expect(await restarted.has(1, 10, 100)).toBe(true);
    expect(await restarted.has(1, 10, 101)).toBe(true);
    expect([...area.data.keys()]).toEqual([FICHE_REGISTRY_KEY]);
  });

  it("concurrent writes are all kept", async () => {
    const { r } = fresh();
    await r.open(1, 10, 500, []);
    await Promise.all([r.issue(1, 10, [100]), r.issue(1, 10, [101])]);
    expect(await r.has(1, 10, 100)).toBe(true);
    expect(await r.has(1, 10, 101)).toBe(true);
  });

  it.each([
    ["not a list", { x: 1 }],
    ["a bad tab id", [{ tabId: -1, contentId: 10, products: [100] }]],
    ["a bad product", [{ tabId: 1, contentId: 10, products: ["100"] }]],
    ["an extra key", [{ tabId: 1, contentId: 10, products: [100], x: 1 }]],
  ])("an unreadable stored registry (%s) issues nothing", async (_n, raw) => {
    const { area, r } = fresh();
    area.data.set(FICHE_REGISTRY_KEY, raw);
    expect(await r.has(1, 10, 100)).toBe(false);
    await r.open(2, 10, 500, []);
    expect(await r.has(2, 10, 500)).toBe(true);
  });

  it(`at most ${MAX_FICHE_TABS} tabs: the one opened or issued to longest ago goes first`, async () => {
    const { r } = fresh();
    for (let tab = 1; tab <= MAX_FICHE_TABS; tab += 1) {
      await r.open(tab, 10, undefined, [100]);
    }
    await r.issue(1, 10, [101]);
    await r.open(MAX_FICHE_TABS + 1, 10, undefined, [100]);
    expect(await r.has(1, 10, 100)).toBe(true);
    expect(await r.has(2, 10, 100)).toBe(false);
    expect(await r.has(MAX_FICHE_TABS + 1, 10, 100)).toBe(true);
  });

  it(`at most ${MAX_FICHE_PRODUCTS} products per tab, the title kept`, async () => {
    const { r } = fresh();
    const many = Array.from(
      { length: MAX_FICHE_PRODUCTS + 1 },
      (_, i) => 10 + i,
    );
    await r.open(1, 10, 1, []);
    await r.issue(1, 10, many);
    expect(await r.has(1, 10, 10)).toBe(false);
    expect(await r.has(1, 10, 11)).toBe(true);
    expect(await r.has(1, 10, 10 + MAX_FICHE_PRODUCTS)).toBe(true);
    expect(await r.has(1, 10, 1)).toBe(true);
  });
});

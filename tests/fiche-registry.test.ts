import { describe, expect, it } from "vitest";
import {
  createFicheRegistry,
  FICHE_REGISTRY_KEY,
  MAX_FICHE_PRODUCTS,
  MAX_FICHE_TABS,
} from "../src/sw/fiche-registry";
import { filmTitle, seriesTitle } from "./fiche-fixtures";
import { memoryArea } from "./sw-fakes";

// A stored page of the current form, with candidate 100.
const page = (over: Record<string, unknown> = {}) => ({
  tabId: 1,
  contentId: 10,
  candidates: [100],
  episodes: [],
  ...over,
});

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
    await r.open(1, 10, seriesTitle(500), []);
    expect(await r.has(1, 10, 500)).toBe(true);
    expect(await r.titleOf(1, 10)).toEqual(seriesTitle(500));
    expect(await r.titleOf(1, 11)).toBeUndefined();
    expect(await r.titleOf(2, 10)).toBeUndefined();
  });

  it("issue adds to the tab's current page", async () => {
    const { r } = fresh();
    await r.open(1, 10, seriesTitle(500), []);
    await r.issue(1, 10, [100]);
    await r.issue(1, 10, [101]);
    expect(await r.titleOf(1, 10)).toEqual(seriesTitle(500));
    expect(await r.has(1, 10, 100)).toBe(true);
    expect(await r.has(1, 10, 101)).toBe(true);
  });

  it("issue for another content than the tab's page issues nothing", async () => {
    const { r } = fresh();
    await r.open(1, 11, seriesTitle(600), []);
    await r.issue(1, 10, [100]);
    expect(await r.has(1, 10, 100)).toBe(false);
    expect(await r.titleOf(1, 11)).toEqual(seriesTitle(600));
  });

  it("open resets the tab: nothing issued before stays (same content or another)", async () => {
    const { r } = fresh();
    await r.open(1, 10, undefined, [100, 101]);
    await r.open(1, 10, seriesTitle(500), []);
    expect(await r.has(1, 10, 100)).toBe(false);
    expect(await r.has(1, 10, 500)).toBe(true);
    await r.open(1, 11, undefined, [200]);
    expect(await r.has(1, 10, 500)).toBe(false);
    expect(await r.titleOf(1, 10)).toBeUndefined();
    expect(await r.has(1, 11, 200)).toBe(true);
  });

  it("drop forgets the tab, and only that tab", async () => {
    const { r } = fresh();
    await r.open(1, 10, seriesTitle(500), []);
    await r.open(2, 10, seriesTitle(500), []);
    await r.drop(1);
    expect(await r.has(1, 10, 500)).toBe(false);
    expect(await r.has(2, 10, 500)).toBe(true);
  });

  it("a fresh registry over the same area still knows the issued products (a worker restart)", async () => {
    const { area, r } = fresh();
    await r.open(1, 10, seriesTitle(500), [100]);
    await r.issue(1, 10, [101]);
    const restarted = createFicheRegistry(area);
    expect(await restarted.titleOf(1, 10)).toEqual(seriesTitle(500));
    expect(await restarted.has(1, 10, 100)).toBe(true);
    expect(await restarted.has(1, 10, 101)).toBe(true);
    expect([...area.data.keys()]).toEqual([FICHE_REGISTRY_KEY]);
  });

  it("concurrent writes are all kept", async () => {
    const { r } = fresh();
    await r.open(1, 10, seriesTitle(500), []);
    await Promise.all([r.issue(1, 10, [100]), r.issue(1, 10, [101])]);
    expect(await r.has(1, 10, 100)).toBe(true);
    expect(await r.has(1, 10, 101)).toBe(true);
  });

  it.each([
    ["not a list", { x: 1 }],
    [
      "the earlier form, products without their role",
      [{ tabId: 1, contentId: 10, title: 500, products: [100] }],
    ],
    ["a bad tab id", [page({ tabId: -1 })]],
    ["a bad candidate", [page({ candidates: ["100"] })]],
    ["a bad episode", [page({ episodes: [0] })]],
    ["a bad title type", [page({ title: { productId: 500, type: "x" } })]],
    ["an extra key", [page({ x: 1 })]],
  ])("an unreadable stored registry (%s) issues nothing", async (_n, raw) => {
    const { area, r } = fresh();
    area.data.set(FICHE_REGISTRY_KEY, raw);
    expect(await r.has(1, 10, 100)).toBe(false);
    expect(await r.titleOf(1, 10)).toBeUndefined();
    await r.open(2, 10, seriesTitle(500), []);
    expect(await r.has(2, 10, 500)).toBe(true);
  });

  it("a stored page of the current form is read", async () => {
    const { area, r } = fresh();
    area.data.set(FICHE_REGISTRY_KEY, [page()]);
    expect(await r.issuedAs(1, 10, 100, "candidate")).toBe(true);
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
    await r.open(1, 10, seriesTitle(1), []);
    await r.issue(1, 10, many);
    expect(await r.has(1, 10, 10)).toBe(false);
    expect(await r.has(1, 10, 11)).toBe(true);
    expect(await r.has(1, 10, 10 + MAX_FICHE_PRODUCTS)).toBe(true);
    expect(await r.has(1, 10, 1)).toBe(true);
  });

  it("a film's title stands for a film only", async () => {
    const { r } = fresh();
    await r.open(1, 10, filmTitle(500), []);
    expect(await r.issuedAs(1, 10, 500, "film")).toBe(true);
    expect(await r.issuedAs(1, 10, 500, "série")).toBe(false);
    expect(await r.issuedAs(1, 10, 500, "épisode")).toBe(false);
    expect(await r.issuedAs(1, 10, 500, "candidate")).toBe(false);
  });

  it("a series' title stands for a series only", async () => {
    const { r } = fresh();
    await r.open(1, 10, seriesTitle(500), []);
    expect(await r.issuedAs(1, 10, 500, "série")).toBe(true);
    expect(await r.issuedAs(1, 10, 500, "film")).toBe(false);
  });

  it("a candidate stands for a candidate only", async () => {
    const { r } = fresh();
    await r.open(1, 10, undefined, [100]);
    expect(await r.issuedAs(1, 10, 100, "candidate")).toBe(true);
    for (const role of ["film", "série", "épisode"] as const) {
      expect(await r.issuedAs(1, 10, 100, role)).toBe(false);
    }
  });

  it("an episode stands for an episode only, never the title's product", async () => {
    const { r } = fresh();
    await r.open(1, 10, seriesTitle(500), []);
    await r.issue(1, 10, [100, 500]);
    expect(await r.issuedAs(1, 10, 100, "épisode")).toBe(true);
    expect(await r.issuedAs(1, 10, 100, "candidate")).toBe(false);
    expect(await r.issuedAs(1, 10, 100, "série")).toBe(false);
    expect(await r.issuedAs(1, 10, 500, "épisode")).toBe(false);
  });

  it("a role is vouched for only to the tab and the content it was issued to", async () => {
    const { r } = fresh();
    await r.open(1, 10, undefined, [100]);
    expect(await r.issuedAs(2, 10, 100, "candidate")).toBe(false);
    expect(await r.issuedAs(1, 11, 100, "candidate")).toBe(false);
  });
});

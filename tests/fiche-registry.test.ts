import { describe, expect, it } from "vitest";
import {
  createFicheRegistry,
  MAX_FICHE_PRODUCTS,
  MAX_FICHE_TABS,
} from "../src/sw/fiche-registry";

describe("fiche registry", () => {
  it("knows a product only for the tab and the content it was issued to", () => {
    const r = createFicheRegistry();
    r.issue(1, 10, [100, 101]);
    expect(r.has(1, 10, 100)).toBe(true);
    expect(r.has(1, 10, 101)).toBe(true);
    expect(r.has(1, 10, 102)).toBe(false);
    expect(r.has(2, 10, 100)).toBe(false);
    expect(r.has(1, 11, 100)).toBe(false);
  });

  it("the title product is issued and named", () => {
    const r = createFicheRegistry();
    r.issueTitle(1, 10, 500);
    expect(r.has(1, 10, 500)).toBe(true);
    expect(r.titleOf(1, 10)).toBe(500);
    expect(r.titleOf(1, 11)).toBeUndefined();
    expect(r.titleOf(2, 10)).toBeUndefined();
  });

  it("issuing for the same content adds to what was issued", () => {
    const r = createFicheRegistry();
    r.issueTitle(1, 10, 500);
    r.issue(1, 10, [100]);
    r.issue(1, 10, [101]);
    expect(r.titleOf(1, 10)).toBe(500);
    expect([100, 101].map((id) => r.has(1, 10, id))).toEqual([true, true]);
  });

  it("a tab on another content forgets the previous one: only the current title page counts", () => {
    const r = createFicheRegistry();
    r.issueTitle(1, 10, 500);
    r.issue(1, 10, [100]);
    r.issue(1, 11, [200]);
    expect(r.has(1, 10, 500)).toBe(false);
    expect(r.has(1, 10, 100)).toBe(false);
    expect(r.titleOf(1, 10)).toBeUndefined();
    expect(r.has(1, 11, 200)).toBe(true);
  });

  it("drop forgets the tab, and only that tab", () => {
    const r = createFicheRegistry();
    r.issueTitle(1, 10, 500);
    r.issue(2, 10, [500]);
    r.drop(1);
    expect(r.has(1, 10, 500)).toBe(false);
    expect(r.titleOf(1, 10)).toBeUndefined();
    expect(r.has(2, 10, 500)).toBe(true);
  });

  it(`at most ${MAX_FICHE_TABS} tabs: the one issued to longest ago goes first`, () => {
    const r = createFicheRegistry();
    for (let tab = 1; tab <= MAX_FICHE_TABS; tab += 1) r.issue(tab, 10, [100]);
    r.issue(1, 10, [101]);
    r.issue(MAX_FICHE_TABS + 1, 10, [100]);
    expect(r.has(1, 10, 100)).toBe(true);
    expect(r.has(2, 10, 100)).toBe(false);
    expect(r.has(MAX_FICHE_TABS + 1, 10, 100)).toBe(true);
  });

  it(`at most ${MAX_FICHE_PRODUCTS} products per tab, the title kept`, () => {
    const r = createFicheRegistry();
    r.issueTitle(1, 10, 1);
    const many = Array.from(
      { length: MAX_FICHE_PRODUCTS + 1 },
      (_, i) => 10 + i,
    );
    r.issue(1, 10, many);
    expect(r.has(1, 10, 10)).toBe(false);
    expect(r.has(1, 10, 11)).toBe(true);
    expect(r.has(1, 10, 10 + MAX_FICHE_PRODUCTS)).toBe(true);
    expect(r.has(1, 10, 1)).toBe(true);
  });
});

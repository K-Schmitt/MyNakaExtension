import { describe, expect, it } from "vitest";
import { GQL, UNIVERSE, WISH_UNIVERSE } from "../src/sc/sc-queries";

const MUTATIONS = [
  "ProductWish",
  "ProductUnwish",
  "ProductDone",
  "ProductUndone",
  "SetProductDateDone",
  "ProductRate",
] as const;
const QUERIES = [
  "UserCollection",
  "ProductCurrentUserInfos",
  "SearchProductExplorer",
] as const;

function balanced(text: string, open: string, close: string): boolean {
  return text.split(open).length === text.split(close).length;
}

describe("recorded SensCritique operations", () => {
  it.each(MUTATIONS)("%s is a complete mutation naming itself", (name) => {
    const text: string = GQL[name];
    expect(text.startsWith("mutation ")).toBe(true);
    expect(text).toContain(`mutation ${name}(`);
    expect(balanced(text, "{", "}")).toBe(true);
    expect(balanced(text, "(", ")")).toBe(true);
  });

  it.each(QUERIES)("%s is a complete query naming itself", (name) => {
    const text: string = GQL[name];
    expect(text.startsWith("query ")).toBe(true);
    expect(text).toContain(`query ${name}(`);
    expect(balanced(text, "{", "}")).toBe(true);
    expect(balanced(text, "(", ")")).toBe(true);
  });

  it("holds exactly the ten recorded operations", () => {
    expect(Object.keys(GQL).sort()).toEqual([...MUTATIONS, ...QUERIES].sort());
  });

  it("carries no credential-looking text", () => {
    for (const text of Object.values(GQL)) {
      expect(text).not.toMatch(/bearer\s|authorization|set-cookie|SC_AUTH/i);
    }
  });

  it("pins the universe values given by the owner and seen in the traffic", () => {
    expect(UNIVERSE).toEqual({ film: 1, serie: 4, season: 5, episode: 32 });
    expect(WISH_UNIVERSE).toEqual({ film: "movie", serie: "tvShow" });
  });
});

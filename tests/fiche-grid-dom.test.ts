import { describe, expect, it } from "vitest";
import type { ElementLike } from "../src/content/ui/dom-like";
import {
  dropdownSeason,
  episodeBoxes,
  gridPorts,
} from "../src/content/ui/fiche-grid-dom";

type Slice = {
  textContent?: string | null;
  nextElementSibling?: unknown;
  after?: (host: unknown) => void;
  querySelector?: (sel: string) => unknown;
};

/** A node that answers `querySelector` from its own selector map only: a wrong selector finds nothing. */
function node(parts: Record<string, Slice | null>, own: Slice = {}): Slice {
  return {
    ...own,
    querySelector: (sel) => (sel in parts ? parts[sel] : null),
  };
}

/** A document that answers only the exact selector strings it was given. */
function docOf(
  one: Record<string, Slice | null>,
  all: Record<string, Slice[]> = {},
) {
  const asked: string[] = [];
  const doc = {
    querySelector: (sel: string) => {
      asked.push(sel);
      return sel in one ? one[sel] : null;
    },
    querySelectorAll: (sel: string) => {
      asked.push(sel);
      return sel in all ? all[sel] : [];
    },
  };
  return { doc: doc as unknown as Document, asked };
}

const host = {} as unknown as ElementLike;
/** The episode rows, read only inside Naka's episode list. */
const ROW = "ol.nh-list > li.nh-ep-row";

describe("the episode rows of Naka's grid", () => {
  it("lists the li.nh-ep-row of ol.nh-list and nothing else", () => {
    const row = node({});
    const { doc, asked } = docOf({}, { [ROW]: [row] });
    const boxes = episodeBoxes(doc);
    expect(asked).toEqual([ROW]);
    expect(boxes.map((b) => b.key)).toEqual([row]);
  });

  it("reads the number in span.nh-ep-num and the title in span.nh-row-title", () => {
    const row = node({
      "span.nh-ep-num": { textContent: "12" },
      "span.nh-row-title": { textContent: "Pilote" },
    });
    const [box] = episodeBoxes(docOf({}, { [ROW]: [row] }).doc);
    expect(box).toBeDefined();
    expect(box?.code()).toBe("12");
    expect(box?.title()).toBe("Pilote");
  });

  it("reads nothing from a row without them", () => {
    const [box] = episodeBoxes(docOf({}, { [ROW]: [node({})] }).doc);
    expect(box).toBeDefined();
    expect(box?.code()).toBeUndefined();
    expect(box?.title()).toBeUndefined();
  });

  it("puts the stars host right after span.nh-row-title", () => {
    const calls: unknown[] = [];
    const title = {
      nextElementSibling: null,
      after: (h: unknown) => calls.push(h),
    };
    const row = node({ "span.nh-row-title": title });
    const [box] = episodeBoxes(docOf({}, { [ROW]: [row] }).doc);
    expect(box).toBeDefined();
    box?.placeStars(host);
    expect(calls).toEqual([host]);
  });

  it("leaves the stars host where it is when it already follows the title", () => {
    const calls: unknown[] = [];
    const title = {
      nextElementSibling: host,
      after: (h: unknown) => calls.push(h),
    };
    const row = node({ "span.nh-row-title": title });
    const [box] = episodeBoxes(docOf({}, { [ROW]: [row] }).doc);
    expect(box).toBeDefined();
    box?.placeStars(host);
    expect(calls).toEqual([]);
  });

  it("does nothing without a title to follow", () => {
    const [box] = episodeBoxes(docOf({}, { [ROW]: [node({})] }).doc);
    expect(box).toBeDefined();
    expect(() => box?.placeStars(host)).not.toThrow();
  });
});

describe("the grid and the season dropdown", () => {
  const ports = (one: Record<string, Slice | null>) => {
    const { doc, asked } = docOf(one);
    return { asked, ...gridPorts(doc, () => 800) };
  };

  it("finds the grid by ol.nh-list > li.nh-ep-row", () => {
    const grid = ports({ "ol.nh-list > li.nh-ep-row": {} });
    expect(grid.hasEpisodeGrid()).toBe(true);
    expect(grid.asked).toEqual(["ol.nh-list > li.nh-ep-row"]);
    expect(ports({}).hasEpisodeGrid()).toBe(false);
  });

  it("orders the episodes on screen from the rows of ol.nh-list only", () => {
    const grid = ports({});
    grid.visibleFirst([3, 4]);
    expect(grid.asked).toEqual([ROW]);
  });

  it("reads the season in the Saison trigger", () => {
    const sel = 'button.nh-select-trigger[aria-label="Saison"]';
    const grid = ports({ [sel]: { textContent: "Saison 2 · 22 ép." } });
    expect(grid.shownSeason()).toBe(2);
    expect(grid.asked).toEqual([sel]);
    expect(ports({}).shownSeason()).toBeUndefined();
  });

  it("tells no dropdown from a dropdown that names no season", () => {
    const sel = 'button.nh-select-trigger[aria-label="Saison"]';
    const read = (one: Record<string, Slice | null>) =>
      dropdownSeason(docOf(one).doc as unknown as Document);
    expect(read({ [sel]: { textContent: "Saison 3 · 8 ép." } })).toBe(3);
    expect(read({ [sel]: { textContent: "Spéciaux" } })).toBeUndefined();
    expect(read({})).toBeNull();
    const specials = ports({ [sel]: { textContent: "Spéciaux" } });
    expect(specials.shownSeason()).toBeUndefined();
  });
});

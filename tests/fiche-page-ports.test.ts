import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fichePagePorts } from "../src/content/ui/fiche-page-ports";

/** A document that answers only the exact selector strings it was given. */
function docOf(one: Record<string, unknown>) {
  const asked: string[] = [];
  const doc = {
    querySelector: (sel: string) => {
      asked.push(sel);
      return sel in one ? one[sel] : null;
    },
    querySelectorAll: (sel: string) => {
      asked.push(sel);
      return [];
    },
  };
  return { doc: doc as unknown as Document, asked };
}

const timer = { set: () => 0, clear: () => {} };
const PANEL = "section.nh-fiche-about dl.nh-fiche-facts";
const BADGES = "header.nh-fiche-hero div.nh-fiche-badges";
const RATING = "header.nh-fiche-hero div.nh-fiche-badges > span.nh-rating";
const DROPDOWN = 'button.nh-select-trigger[aria-label="Saison"]';

describe("the title page's ports in the real document", () => {
  // The visibility watch is built at construction from the page's window: a window without an observer.
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    ["panel", PANEL],
    ["badges", BADGES],
    ["rating", RATING],
  ] as const)(
    "%s() asks for exactly %s and returns what the doc has",
    (port, sel) => {
      const found = { name: port };
      const { doc, asked } = docOf({ [sel]: found });
      expect(fichePagePorts(doc, timer)[port]()).toBe(found);
      expect(asked).toEqual([sel]);
    },
  );

  it.each(["panel", "badges", "rating"] as const)(
    "%s() is null when the doc has none",
    (port) => {
      expect(fichePagePorts(docOf({}).doc, timer)[port]()).toBeNull();
    },
  );

  it("reads the season in the Saison trigger", () => {
    const { doc, asked } = docOf({
      [DROPDOWN]: { textContent: "Saison 4 · 10 ép." },
    });
    expect(fichePagePorts(doc, timer).dropdownSeason()).toBe(4);
    expect(asked).toEqual([DROPDOWN]);
  });

  it("tells the clock's time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_234_567);
    expect(fichePagePorts(docOf({}).doc, timer).now()).toBe(1_234_567);
  });
});

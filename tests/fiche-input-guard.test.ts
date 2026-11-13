import { describe, expect, it } from "vitest";
import { guardFicheInput } from "../src/content/fiche-input-guard";
import type { FicheInput, TitlePageEvent } from "../src/content/fiche-ports";
import { PAGE_CHANNEL } from "../src/ext/messages";

const SEASON: TitlePageEvent = {
  channel: PAGE_CHANNEL,
  kind: "season",
  contentId: 5,
  season: 2,
};

describe("guardFicheInput", () => {
  it("hands the pathname and the events through unchanged", () => {
    const seen: unknown[] = [];
    const guarded = guardFicheInput({
      path: (pathname) => seen.push(pathname),
      event: (event) => seen.push(event),
    });
    guarded.path("/content/tv/1876");
    guarded.event(SEASON);
    expect(seen).toEqual(["/content/tv/1876", SEASON]);
  });

  it("keeps a throw of the title page controller from its caller", () => {
    const throwing: FicheInput = {
      path: () => {
        throw new Error("controller bug");
      },
      event: () => {
        throw new Error("controller bug");
      },
    };
    const guarded = guardFicheInput(throwing);
    expect(() => guarded.path("/content/tv/1876")).not.toThrow();
    expect(() => guarded.event(SEASON)).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { MOOT_LINE } from "../src/content/ui/question-copy";
import { viewOf } from "../src/content/ui/question-session-view";
import type { RemovalOffer } from "../src/sw/question-offers";

const REMOVAL: RemovalOffer = {
  kind: "removal",
  key: "removal:naka:21391:112240873",
  removeFrom: "naka",
  pair: { nakaId: 21391, scId: 112240873 },
  title: "Dune",
};

const shown = (over: { mootNotice?: true } = {}) => ({
  offer: REMOVAL,
  actions: ["plus-tard", "fermer"] as ("plus-tard" | "fermer")[],
  seq: 1,
  locked: false,
  shownAt: 0,
  ...over,
});

describe("the moot view of a removal question", () => {
  it("keeps the question line while the question is open", () => {
    expect(viewOf(shown()).question).toBeDefined();
  });

  it("omits the question line: heading, notice and Fermer only", () => {
    const view = viewOf(shown({ mootNotice: true }));
    expect(view.question).toBeUndefined();
    expect(view.notice).toBe(MOOT_LINE);
    expect(view.choices).toEqual([]);
    expect(view.actions).toEqual(["fermer"]);
    expect(view.heading).not.toBe("");
  });
});

import { describe, expect, it } from "vitest";
import type { FicheUndoMessage } from "../src/ext/fiche-messages";
import type { Settings } from "../src/ext/settings";
import type { ProductState } from "../src/sc/sc-client";
import { answerWorld, BOUND } from "./answer-world";
import { filmTitle, linkedTo, TAB } from "./fiche-fixtures";
import { filmCard, target } from "./rating-fixtures";

// The title page's undo record is the last rating of the title (spec 8 §2): a later write of the same
// content from another surface clears it, so « Annuler » cannot erase that newer rating on SensCritique.

const LIVE: Settings = { mode: "live", binding: BOUND };
const BLANK: ProductState = {
  isDone: false,
  isWished: false,
  universe: 1,
  rating: null,
  average: null,
  dateDone: null,
  isReviewed: false,
  isRecommended: false,
  url: undefined,
};
const UNDO: FicheUndoMessage = {
  type: "fiche-undo",
  contentId: 5,
  productId: 2005,
};
/** Another film, with its card: a rating of it goes out at once. */
const OTHER = filmCard({ targets: [target("film", null, 21)] });

/** Film 5 rated 8 from its page; SensCritique then shows it seen and rated. */
async function ratedOnItsPage() {
  const sc = { now: {} as Partial<ProductState> };
  const w = answerWorld({
    state: linkedTo(2005),
    settings: LIVE,
    playlist: () => [],
    product: () => ({ ...BLANK, ...sc.now }),
  });
  w.area.data.set("ratings", [OTHER]);
  await w.registry.open(TAB, 5, filmTitle(2005), []);
  const msg = {
    type: "fiche-rate",
    contentId: 5,
    target: "film",
    productId: 2005,
    rating: 8,
  } as const;
  expect(await w.jobs.ficheRate(TAB, msg)).toMatchObject({ ok: true });
  sc.now = { rating: 8, isDone: true };
  expect(w.area.data.get("ficheUndo")).toMatchObject({ contentId: 5 });
  return w;
}

describe("the title page's undo after a later write of the same title", () => {
  it("a rating from the pause block or the home row: « Annuler » is refused, with no SC call", async () => {
    // Arrange
    const w = await ratedOnItsPage();
    await w.jobs.rate({ type: "rate", contentId: 5, label: "film", rating: 6 });
    const before = w.sk.calls.length;

    // Act
    const answer = await w.jobs.ficheUndo(TAB, UNDO);

    // Assert
    expect(answer).toEqual({ refused: "expired" });
    expect(w.sk.calls.slice(before)).toEqual([]);
    expect(w.area.data.get("ficheUndo")).toBeNull();
  });

  it("a rating of another content leaves the record", async () => {
    // Arrange
    const w = await ratedOnItsPage();
    const record = w.area.data.get("ficheUndo");

    // Act
    await w.jobs.rate({ type: "rate", contentId: 9, label: "film", rating: 7 });

    // Assert
    expect(w.sk.calls).toContain("rate:21:7");
    expect(w.area.data.get("ficheUndo")).toEqual(record);
  });

  it.each([
    ["« Oublier » on the status page", "forgetHandled"],
    ["« Oublier » asked by a Naka tab", "forgetHandledFromTab"],
  ] as const)("%s: the record of that content goes", async (_n, job) => {
    // Arrange
    const w = await ratedOnItsPage();

    // Act
    await w.jobs[job]({ type: "forget-handled", contentId: 5 });

    // Assert
    expect(w.area.data.get("ficheUndo")).toBeNull();
  });

  it("a finish that writes nothing (the film is handled already) leaves the record", async () => {
    // Arrange
    const w = await ratedOnItsPage();
    const record = w.area.data.get("ficheUndo");

    // Act
    await w.jobs.finishJob({
      type: "finished",
      source: "threshold",
      progress: 0.95,
      contentId: 5,
    });

    // Assert
    expect(w.area.data.get("ficheUndo")).toEqual(record);
  });
});

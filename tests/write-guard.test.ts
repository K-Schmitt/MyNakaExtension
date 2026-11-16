// D7 on the player block and the home row's rating tiles (owner's decision, 2026-11-16): a star or a
// series confirmation counts only once IntersectionObserver v2 said its row visible for 300 ms unbroken;
// before v2's first report the click counts (D11), and without v2 every click counts.

import { describe, expect, it, vi } from "vitest";
import { createDrawWatch } from "../src/content/ui/draw-watch";
import { createEndUi } from "../src/content/ui/end-ui";
import { questionView } from "../src/content/ui/question-view";
import { CANCEL_LABEL, SEND_LABEL } from "../src/content/ui/rating-copy";
import { buildRatingTile } from "../src/content/ui/rating-tile";
import { type RatingView, ratingView } from "../src/content/ui/rating-view";
import {
  createSeenWatch,
  MIN_VISIBLE_MS,
} from "../src/content/ui/star-visibility";
import { QUESTION } from "./end-block-fakes";
import { episodeCard, filmCard } from "./rating-fixtures";
import {
  descendants,
  FakeDoc,
  type FakeElement,
  FakeNode,
  fakeVisibility,
} from "./ui-fakes";

const handlers = () => ({
  onChoose: vi.fn(),
  onAction: vi.fn(),
  onOther: vi.fn(),
  onConfirm: vi.fn(),
});
const FILM = (): RatingView => ratingView(filmCard(), "film");
const CONFIRM = (): RatingView => ({
  ...ratingView(episodeCard(), "saison", 8),
  confirm: true,
});

const buttonsOf = (node: FakeNode) =>
  descendants(node).filter((el) => el.tag === "button");
const named = (node: FakeNode, text: string) =>
  buttonsOf(node).find((b) => b.textContent === text);
const starOf = (node: FakeNode, n: number) =>
  buttonsOf(node).find((b) => b.attributes["aria-label"] === `${n} sur 10`);

function player() {
  const doc = new FakeDoc();
  const v = fakeVisibility();
  const ui = createEndUi(doc, v.seen);
  const root = () => doc.created[0]?.shadow ?? new FakeNode();
  return { doc, v, ui, root };
}

describe("the player block's stars and confirmation (D7)", () => {
  it("a trusted star click while the stars are reported hidden rates nothing; after 300 ms visible it rates", () => {
    const p = player();
    const h = handlers();
    p.ui.show(FILM(), h);
    p.v.report(false);
    starOf(p.root(), 5)?.click(true);
    expect(h.onChoose).not.toHaveBeenCalled();
    p.v.report(true);
    p.v.later(MIN_VISIBLE_MS - 1);
    starOf(p.root(), 5)?.click(true);
    expect(h.onChoose).not.toHaveBeenCalled();
    p.v.later(1);
    starOf(p.root(), 5)?.click(true);
    expect(h.onChoose).toHaveBeenCalledWith(5);
  });

  it("« Envoyer » and « Annuler » of the series confirmation do nothing while covered, and act once seen", () => {
    const p = player();
    const h = handlers();
    p.ui.show(CONFIRM(), h);
    p.v.report(false);
    named(p.root(), SEND_LABEL)?.click(true);
    named(p.root(), CANCEL_LABEL)?.click(true);
    expect(h.onConfirm).not.toHaveBeenCalled();
    p.v.report(true);
    p.v.later(MIN_VISIBLE_MS);
    named(p.root(), SEND_LABEL)?.click(true);
    expect(h.onConfirm).toHaveBeenCalledWith(true);
  });

  it("a click before v2's first report counts, as on the title page (D11)", () => {
    const p = player();
    const h = handlers();
    p.ui.show(FILM(), h);
    starOf(p.root(), 7)?.click(true);
    expect(h.onChoose).toHaveBeenCalledWith(7);
  });

  it("an untrusted click still does nothing once seen", () => {
    const p = player();
    const h = handlers();
    p.ui.show(FILM(), h);
    p.v.report(true);
    p.v.later(MIN_VISIBLE_MS);
    starOf(p.root(), 7)?.click(false);
    expect(h.onChoose).not.toHaveBeenCalled();
  });

  it("without IntersectionObserver v2 every trusted click counts, as on the title page", () => {
    const doc = new FakeDoc();
    const seen = createSeenWatch(
      () => undefined,
      () => 0,
    );
    const ui = createEndUi(doc, seen);
    const h = handlers();
    ui.show(FILM(), h);
    starOf(doc.created[0]?.shadow ?? new FakeNode(), 3)?.click(true);
    expect(h.onChoose).toHaveBeenCalledWith(3);
  });

  it("a redraw watches only the rows it drew, a question drawn instead none, and hide none", () => {
    const p = player();
    p.ui.show(FILM(), handlers());
    p.ui.show(CONFIRM(), handlers());
    const confirmRow = named(p.root(), SEND_LABEL)?.parent;
    expect([...p.v.observed]).toEqual([confirmRow]);
    p.ui.showQuestion(questionView(QUESTION, ["plus-tard"]), {
      onChoose: vi.fn(),
      onAction: vi.fn(),
    });
    expect(p.v.observed.size).toBe(0);
    p.ui.show(FILM(), handlers());
    expect(p.v.observed.size).toBe(1);
    p.ui.hide();
    expect(p.v.observed.size).toBe(0);
  });
});

describe("the home row's rating tile (D7)", () => {
  function tile(view: RatingView) {
    const v = fakeVisibility();
    const h = handlers();
    const el = buildRatingTile(
      new FakeDoc(),
      view,
      undefined,
      h,
      createDrawWatch(v.seen).watch,
    ) as FakeElement;
    return { v, h, el };
  }

  it("a trusted star click while covered rates nothing; after 300 ms visible it rates", () => {
    const t = tile(FILM());
    t.v.report(false);
    starOf(t.el, 4)?.click(true);
    expect(t.h.onChoose).not.toHaveBeenCalled();
    t.v.report(true);
    t.v.later(MIN_VISIBLE_MS);
    starOf(t.el, 4)?.click(true);
    expect(t.h.onChoose).toHaveBeenCalledWith(4);
  });

  it("« Envoyer » while covered does nothing; after 300 ms visible it sends", () => {
    const t = tile(CONFIRM());
    t.v.report(false);
    named(t.el, SEND_LABEL)?.click(true);
    expect(t.h.onConfirm).not.toHaveBeenCalled();
    t.v.report(true);
    t.v.later(MIN_VISIBLE_MS);
    named(t.el, SEND_LABEL)?.click(true);
    expect(t.h.onConfirm).toHaveBeenCalledWith(true);
  });
});

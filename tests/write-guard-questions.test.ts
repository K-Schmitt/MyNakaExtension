// The visibility guard on the question controls whose click can lead to a site write: the removal
// offer's « Retirer » choice (unwish on SC, or a removal from Naka's list) and an ambiguity's candidates
// (the link runs the finish that waited on the question). « Garder », « Aucun de ceux-là » and the actions
// write nothing on a site: they stay unguarded.

import { describe, expect, it, vi } from "vitest";
import { createDrawWatch } from "../src/content/ui/draw-watch";
import { createEndUi } from "../src/content/ui/end-ui";
import { KEEP_LABEL, NONE_LABEL } from "../src/content/ui/question-copy";
import { buildQuestionTile } from "../src/content/ui/question-tile";
import {
  type QuestionView,
  questionView,
} from "../src/content/ui/question-view";
import { MIN_VISIBLE_MS } from "../src/content/ui/star-visibility";
import type { RemovalOffer } from "../src/sw/question-offers";
import { QUESTION } from "./end-block-fakes";
import {
  descendants,
  FakeDoc,
  type FakeElement,
  FakeNode,
  fakeVisibility,
} from "./ui-fakes";

const OFFER: RemovalOffer = {
  kind: "removal",
  key: "removal:sc:21391:112240873",
  removeFrom: "sc",
  pair: { nakaId: 21391, scId: 112240873 },
  title: "Un Job Mortel",
};
const REMOVE = "Retirer aussi de tes envies SensCritique";
const CANDIDATE = "Une série (2005, série)";

const removal = (): QuestionView => questionView(OFFER, ["plus-tard"]);
const ambiguity = (): QuestionView => questionView(QUESTION, ["plus-tard"]);
const handlers = () => ({ onChoose: vi.fn(), onAction: vi.fn() });

const buttonsOf = (node: FakeNode) =>
  descendants(node).filter((el) => el.tag === "button");
const named = (node: FakeNode, text: string) =>
  buttonsOf(node).find(
    (b) =>
      b.textContent === text ||
      descendants(b).some((d) => d.textContent === text),
  );

function player(view: QuestionView) {
  const doc = new FakeDoc();
  const v = fakeVisibility();
  const ui = createEndUi(doc, v.seen);
  const h = handlers();
  ui.showQuestion(view, h);
  const root = () => doc.created[0]?.shadow ?? new FakeNode();
  return { v, ui, h, root };
}

function tile(view: QuestionView) {
  const v = fakeVisibility();
  const h = handlers();
  const draw = createDrawWatch(v.seen);
  const el = buildQuestionTile(
    new FakeDoc(),
    view,
    h,
    draw.watch,
  ) as FakeElement;
  return { v, h, el, draw };
}

describe.each([
  [
    "the player block",
    (view: QuestionView) => {
      const p = player(view);
      return { v: p.v, h: p.h, root: p.root };
    },
  ],
  [
    "the home row's tile",
    (view: QuestionView) => {
      const t = tile(view);
      return { v: t.v, h: t.h, root: () => t.el };
    },
  ],
] as const)("%s's question controls", (_, make) => {
  it("« Retirer » of a removal offer does nothing while covered, and answers once visible 300 ms", () => {
    const q = make(removal());
    q.v.report(false);
    named(q.root(), REMOVE)?.click(true);
    expect(q.h.onChoose).not.toHaveBeenCalled();
    q.v.report(true);
    q.v.later(MIN_VISIBLE_MS - 1);
    named(q.root(), REMOVE)?.click(true);
    expect(q.h.onChoose).not.toHaveBeenCalled();
    q.v.later(1);
    named(q.root(), REMOVE)?.click(true);
    expect(q.h.onChoose).toHaveBeenCalledWith({ kind: "remove" });
  });

  it("an ambiguity's candidate does nothing while covered, and chooses once visible 300 ms", () => {
    const q = make(ambiguity());
    q.v.report(false);
    named(q.root(), CANDIDATE)?.click(true);
    expect(q.h.onChoose).not.toHaveBeenCalled();
    q.v.report(true);
    q.v.later(MIN_VISIBLE_MS);
    named(q.root(), CANDIDATE)?.click(true);
    expect(q.h.onChoose).toHaveBeenCalledWith({ kind: "candidate", id: 2005 });
  });

  it("« Garder », « Aucun » and the actions, which write nothing on a site, are not watched", () => {
    const r = make(removal());
    r.v.report(false);
    named(r.root(), KEEP_LABEL)?.click(true);
    expect(r.h.onChoose).toHaveBeenCalledWith({ kind: "keep" });
    const a = make(ambiguity());
    a.v.report(false);
    named(a.root(), NONE_LABEL)?.click(true);
    expect(a.h.onChoose).toHaveBeenCalledWith({ kind: "none" });
  });

  it("a click before v2's first report counts", () => {
    const q = make(removal());
    named(q.root(), REMOVE)?.click(true);
    expect(q.h.onChoose).toHaveBeenCalledWith({ kind: "remove" });
  });
});

describe("the question rows' lifecycle", () => {
  it("the player block stops watching a question's controls on the next draw and on hide", () => {
    const p = player(ambiguity());
    expect(p.v.observed.size).toBe(2);
    p.ui.showQuestion(removal(), handlers());
    expect(p.v.observed.size).toBe(1);
    p.ui.hide();
    expect(p.v.observed.size).toBe(0);
  });
});

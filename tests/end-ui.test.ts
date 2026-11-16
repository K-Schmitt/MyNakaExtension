import { describe, expect, it, vi } from "vitest";
import { createEndUi } from "../src/content/ui/end-ui";
import { questionView } from "../src/content/ui/question-view";
import { ratingView } from "../src/content/ui/rating-view";
import { QUESTION } from "./end-block-fakes";
import { filmCard } from "./rating-fixtures";
import { descendants, FakeDoc, FakeNode, noObserverWatch } from "./ui-fakes";

const handlers = () => ({
  onChoose: vi.fn(),
  onAction: vi.fn(),
  onOther: vi.fn(),
  onConfirm: vi.fn(),
});
const view = () => ratingView(filmCard(), "film");
const buttonsIn = (doc: FakeDoc) =>
  doc.created.flatMap((host) =>
    descendants(host.shadow).filter((el) => el.tag === "button"),
  );

describe("the end block's surface", () => {
  it("adds nothing to the page until a block is shown", () => {
    const doc = new FakeDoc();
    createEndUi(doc, noObserverWatch());
    expect(doc.created).toEqual([]);
    expect(doc.body.children).toEqual([]);
  });

  it("draws the view in the closed shadow root of the host under body", () => {
    const doc = new FakeDoc();
    const h = handlers();
    createEndUi(doc, noObserverWatch()).show(view(), h);
    const host = doc.created[0];
    expect(host?.parent).toBe(doc.body);
    expect(host?.shadowInit).toEqual([{ mode: "closed" }]);
    buttonsIn(doc)[4]?.click(true);
    expect(h.onChoose).toHaveBeenCalledWith(5);
  });

  it("puts the host back first when the page removed it", () => {
    const doc = new FakeDoc();
    const ui = createEndUi(doc, noObserverWatch());
    ui.show(view(), handlers());
    doc.created[0]?.remove();
    ui.show(view(), handlers());
    expect(doc.created[0]?.parent).toBe(doc.body);
  });

  it("draws in the fullscreen element when there is one", () => {
    const doc = new FakeDoc();
    const full = new FakeNode();
    doc.fullscreenElement = full;
    createEndUi(doc, noObserverWatch()).show(view(), handlers());
    expect(doc.created[0]?.parent).toBe(full);
  });

  it("hide empties the root, and hiding before any show does nothing", () => {
    const doc = new FakeDoc();
    const ui = createEndUi(doc, noObserverWatch());
    ui.hide();
    expect(doc.created).toEqual([]);
    ui.show(view(), handlers());
    ui.hide();
    expect(buttonsIn(doc)).toEqual([]);
  });

  it("draws a question in the same host and root, and its click reaches the handler", () => {
    const doc = new FakeDoc();
    const h = { onChoose: vi.fn(), onAction: vi.fn() };
    const ui = createEndUi(doc, noObserverWatch());
    ui.show(view(), handlers());
    ui.showQuestion(questionView(QUESTION, ["plus-tard"]), h);
    expect(doc.body.children).toHaveLength(1);
    const buttons = descendants(
      doc.created[0]?.shadow ?? new FakeNode(),
    ).filter((el) => el.tag === "button");
    expect(buttons).toHaveLength(4);
    buttons[0]?.click(true);
    expect(h.onChoose).toHaveBeenCalledWith({ kind: "candidate", id: 2005 });
    buttons[3]?.click(false);
    expect(h.onAction).not.toHaveBeenCalled();
    buttons[3]?.click(true);
    expect(h.onAction).toHaveBeenCalledWith("plus-tard");
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  ACTION_LABELS,
  CANCEL_LABEL,
  OTHER_LABELS,
  SEND_LABEL,
  SENDING_LINE,
  SERIES_WARNING,
} from "../src/content/ui/rating-copy";
import {
  button,
  renderRating,
  textLine,
} from "../src/content/ui/rating-render";
import { type RatingView, ratingView } from "../src/content/ui/rating-view";
import { episodeCard } from "./rating-fixtures";
import { descendants, FakeDoc, type FakeElement, FakeShadow } from "./ui-fakes";

function setup() {
  const doc = new FakeDoc();
  const root = new FakeShadow();
  const handlers = {
    onChoose: vi.fn(),
    onAction: vi.fn(),
    onOther: vi.fn(),
    onConfirm: vi.fn(),
  };
  const block = {
    show: (view: RatingView) => renderRating(doc, root, view, handlers),
  };
  const buttons = () => descendants(root).filter((el) => el.tag === "button");
  const button = (text: string) => {
    const found = buttons().find((b) => b.textContent === text);
    if (found === undefined) throw new Error(`no button ${text}`);
    return found;
  };
  return { doc, root, handlers, block, buttons, button };
}

describe("the rating block", () => {
  it("draws the choices, the manual choices and the actions as buttons", () => {
    const { block, buttons } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    const texts = buttons().map((b) => b.textContent);
    expect(texts.slice(0, 10)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
    expect(texts).toContain(OTHER_LABELS.épisode);
    expect(texts).toContain(OTHER_LABELS.série);
    expect(texts).not.toContain(OTHER_LABELS.saison);
    expect(texts).toContain(ACTION_LABELS.fermer);
  });

  it("writes the remote title as text, never as markup", () => {
    const { block, root } = setup();
    block.show(
      ratingView(episodeCard({ title: "<img src=x onerror=1>" }), "épisode"),
    );
    const texts = descendants(root).map((el) => el.textContent);
    expect(texts.some((t) => t?.includes("<img src=x onerror=1>"))).toBe(true);
    expect(descendants(root).some((el) => el.tag === "img")).toBe(false);
  });

  it("a trusted click calls the handler with the value, the action, the label", () => {
    const { block, handlers, button } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    button("8").click(true);
    button(ACTION_LABELS.ignorer).click(true);
    button(OTHER_LABELS.série).click(true);
    expect(handlers.onChoose).toHaveBeenCalledWith(8);
    expect(handlers.onAction).toHaveBeenCalledWith("ignorer");
    expect(handlers.onOther).toHaveBeenCalledWith("série");
  });

  it("a forged click calls nothing", () => {
    const { block, handlers, buttons } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    for (const b of buttons()) b.click(false);
    expect(handlers.onChoose).not.toHaveBeenCalled();
    expect(handlers.onAction).not.toHaveBeenCalled();
    expect(handlers.onOther).not.toHaveBeenCalled();
  });

  it("marks the start choice", () => {
    const { block, button } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    expect(button("8").attributes["aria-pressed"]).toBe("true");
    expect(button("7").attributes["aria-pressed"]).toBe("false");
  });

  it("shows the warning and the error lines", () => {
    const { block, root } = setup();
    block.show(
      ratingView(
        episodeCard({ failed: { label: "série", error: "sc-session", at: 1 } }),
        "série",
      ),
    );
    const texts = descendants(root).map((el) => el.textContent ?? "");
    expect(texts.some((t) => t.includes("n'est pas finie sur Naka"))).toBe(
      true,
    );
    expect(texts.some((t) => t.startsWith("La note n'est pas partie"))).toBe(
      true,
    );
  });

  it("replaces the previous content", () => {
    const { block, root } = setup();
    block.show(ratingView(episodeCard(), "épisode"));
    const first = [...root.children];
    block.show(ratingView(episodeCard(), "saison", 8));
    expect(root.children).toHaveLength(first.length);
    expect(root.children.some((child) => first.includes(child))).toBe(false);
  });

  it("a confirm view draws the warning and Envoyer / Annuler only, on trusted clicks", () => {
    const { block, buttons, button, handlers, root } = setup();
    block.show({
      ...ratingView(episodeCard({ seriesFinished: false }), "série"),
      choices: [],
      others: [],
      actions: [],
      confirm: true,
    });
    expect(buttons().map((b) => b.textContent)).toEqual([
      SEND_LABEL,
      CANCEL_LABEL,
    ]);
    expect(
      descendants(root).some((el) => el.textContent === SERIES_WARNING),
    ).toBe(true);
    button(SEND_LABEL).click(false);
    expect(handlers.onConfirm).not.toHaveBeenCalled();
    button(SEND_LABEL).click(true);
    button(CANCEL_LABEL).click(true);
    expect(handlers.onConfirm.mock.calls).toEqual([[true], [false]]);
  });

  it("the rating block keeps its choices on a wrapping row", () => {
    const { block, button } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    const row = button("1").parent as { className: string } | null;
    expect(row?.className).toBe("mn-row");
  });

  it("a view with a notice and no buttons draws the notice and no row", () => {
    const { block, buttons, root } = setup();
    block.show({
      ...ratingView(episodeCard(), "épisode"),
      choices: [],
      others: [],
      actions: [],
      notice: SENDING_LINE,
    });
    expect(buttons()).toEqual([]);
    expect(
      descendants(root).some((el) => el.textContent === SENDING_LINE),
    ).toBe(true);
    expect(
      descendants(root).filter((el) =>
        el.className.split(" ").includes("mn-row"),
      ),
    ).toEqual([]);
  });
});

describe("the shared draw pieces", () => {
  it("makes a button that acts on a trusted click only, with text", () => {
    const doc = new FakeDoc();
    const fn = vi.fn();
    const el = button(doc, "<b>x</b>", "mn-btn", fn) as FakeElement;
    expect(el.textContent).toBe("<b>x</b>");
    expect(el.className).toBe("mn-btn");
    el.click(false);
    expect(fn).not.toHaveBeenCalled();
    el.click(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("makes a text line holding text, not markup", () => {
    const doc = new FakeDoc();
    const line = textLine(doc, "<i>y</i>") as FakeElement;
    expect(line.textContent).toBe("<i>y</i>");
    expect(line.className).toBe("mn-line");
    expect(textLine(doc, "z", "mn-line mn-error").className).toBe(
      "mn-line mn-error",
    );
  });
});

describe("the block's classes", () => {
  it("draws the block as a card, its heading as a title", () => {
    const { block, root } = setup();
    block.show(ratingView(episodeCard(), "épisode"));
    const card = root.children[0] as FakeElement;
    expect(card.className).toBe("mn-card");
    expect((card.children[0] as FakeElement).className).toBe(
      "mn-line mn-title",
    );
  });

  it("marks the chosen note and « Envoyer » as primary, the rest plain", () => {
    const { block, button } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    expect(button("8").className).toBe("mn-btn mn-btn--primary");
    expect(button("7").className).toBe("mn-btn");
    block.show({ ...ratingView(episodeCard(), "saison", 8), confirm: true });
    expect(button(SEND_LABEL).className).toBe("mn-btn mn-btn--primary");
    expect(button(CANCEL_LABEL).className).toBe("mn-btn");
  });

  it("draws an error and a warning with their classes", () => {
    const { block, root } = setup();
    block.show({
      ...ratingView(episodeCard(), "épisode"),
      error: "boom",
      warning: "careful",
    });
    const classOf = (text: string) =>
      descendants(root).find((el) => el.textContent === text)?.className;
    expect(classOf("boom")).toBe("mn-line mn-error");
    expect(classOf("careful")).toBe("mn-line mn-warning");
  });
});

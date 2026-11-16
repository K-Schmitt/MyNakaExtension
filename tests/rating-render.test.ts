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
import { starRater } from "../src/content/ui/star-rater";
import { episodeCard } from "./rating-fixtures";
import {
  COUNTS,
  descendants,
  FakeDoc,
  FakeElement,
  FakeShadow,
} from "./ui-fakes";

function setup() {
  FakeElement.focused = null;
  const doc = new FakeDoc();
  const root = new FakeShadow();
  const handlers = {
    onChoose: vi.fn(),
    onAction: vi.fn(),
    onOther: vi.fn(),
    onConfirm: vi.fn(),
  };
  const block = {
    show: (view: RatingView) => renderRating(doc, root, view, handlers, COUNTS),
  };
  const buttons = () => descendants(root).filter((el) => el.tag === "button");
  const button = (text: string) => {
    const found = buttons().find((b) => b.textContent === text);
    if (found === undefined) throw new Error(`no button ${text}`);
    return found;
  };
  const star = (n: number) => {
    const found = buttons().find(
      (b) => b.attributes["aria-label"] === `${n} sur 10`,
    );
    if (found === undefined) throw new Error(`no star ${n}`);
    return found;
  };
  return { doc, root, handlers, block, buttons, button, star };
}

describe("the rating block", () => {
  it("draws the choices, the manual choices and the actions as buttons", () => {
    const { block, buttons } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    const texts = buttons().map((b) => b.textContent);
    expect(
      buttons()
        .slice(0, 10)
        .map((b) => [b.textContent, b.attributes["aria-label"]]),
    ).toEqual(
      Array.from({ length: 10 }, (_, i) => ["\u2605", `${i + 1} sur 10`]),
    );
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
    const { block, handlers, button, star } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    star(8).click(true);
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
    const { block, star } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    expect(star(8).attributes["aria-checked"]).toBe("true");
    expect(star(7).attributes["aria-checked"]).toBe("false");
    expect(star(8).attributes.tabindex).toBe("0");
    expect(star(7).attributes.tabindex).toBe("-1");
    expect(star(8).attributes.role).toBe("radio");
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
    expect(texts.some((t) => t.includes("n’est pas finie sur Naka"))).toBe(
      true,
    );
    expect(texts.some((t) => t.startsWith("La note n’est pas partie"))).toBe(
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

  it("the ten stars sit in one radiogroup, followed by the marked value", () => {
    const { block, star } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    const group = star(1).parent as FakeElement;
    expect(group.className).toBe("mn-stars");
    expect(group.attributes.role).toBe("radiogroup");
    expect(group.attributes["aria-label"]).toBe("Note");
    expect(group.children.filter((c) => c === star(1))).toHaveLength(1);
    expect(
      Array.from({ length: 10 }, (_, i) => star(i + 1).parent === group),
    ).toEqual(Array(10).fill(true));
    const value = group.parent?.children[1] as FakeElement;
    expect(value.className).toBe("mn-stars-value");
    expect(value.textContent).toBe("8/10");
  });

  it("two marked choices show one value: the highest holds the check, the tab stop and the text", () => {
    const { block, buttons, star } = setup();
    const view = ratingView(episodeCard(), "saison", 8);
    block.show({
      ...view,
      choices: view.choices.map((c) => ({
        ...c,
        marked: c.value === 6 || c.value === 8,
      })),
    });
    const checked = buttons().filter(
      (b) => b.attributes["aria-checked"] === "true",
    );
    expect(checked).toEqual([star(8)]);
    expect(star(8).attributes.tabindex).toBe("0");
    expect(star(6).attributes.tabindex).toBe("-1");
    const group = star(8).parent as FakeElement;
    const value = group.parent?.children[1] as FakeElement;
    expect(value.textContent).toBe("8/10");
  });

  it.each(Array.from({ length: 10 }, (_, i) => i + 1))(
    "a trusted click on star %i chooses exactly that value once",
    (n) => {
      const { block, handlers, star } = setup();
      block.show(ratingView(episodeCard(), "saison", 8));
      star(n).click(true);
      expect(handlers.onChoose).toHaveBeenCalledTimes(1);
      expect(handlers.onChoose).toHaveBeenCalledWith(n);
    },
  );

  it("with no marked value the first star takes the tab stop and the value is empty", () => {
    const { block, star } = setup();
    block.show({
      ...ratingView(episodeCard(), "saison", 8),
      choices: ratingView(episodeCard(), "saison", 8).choices.map((c) => ({
        ...c,
        marked: false,
      })),
    });
    expect(star(1).attributes.tabindex).toBe("0");
    expect(star(2).attributes.tabindex).toBe("-1");
    const group = star(1).parent as FakeElement;
    const value = group.parent?.children[1] as FakeElement | undefined;
    expect(value?.textContent).toBe("");
  });

  it("arrow keys move the focus and the tab stop, never choosing", () => {
    const { block, handlers, star } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    const group = star(8).parent as FakeElement;
    group.press("ArrowRight");
    expect(FakeElement.focused).toBe(star(9));
    expect(star(9).attributes.tabindex).toBe("0");
    expect(star(8).attributes.tabindex).toBe("-1");
    group.press("ArrowLeft");
    group.press("ArrowLeft");
    expect(FakeElement.focused).toBe(star(7));
    group.press("Enter");
    expect(FakeElement.focused).toBe(star(7));
    expect(handlers.onChoose).not.toHaveBeenCalled();
  });

  it("an arrow key the stars handle never scrolls the row's track: its default is prevented, at the ends too", () => {
    const { block, star } = setup();
    block.show(ratingView(episodeCard(), "saison", 10));
    const group = star(10).parent as FakeElement;
    expect(group.press("ArrowLeft")).toBe(true);
    expect(group.press("ArrowRight")).toBe(true);
    expect(group.press("ArrowRight")).toBe(true);
  });

  it("other keys keep their default: Tab leaves the stars, Enter clicks the focused one", () => {
    const { block, handlers, star } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    const group = star(8).parent as FakeElement;
    expect(group.press("Tab")).toBe(false);
    expect(group.press("Enter")).toBe(false);
    star(8).click(true);
    expect(handlers.onChoose).toHaveBeenCalledWith(8);
  });

  it("a modified arrow key is left to the browser: no focus move, no preventDefault", () => {
    const { block, star } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    const group = star(8).parent as FakeElement;
    expect(group.press("ArrowLeft", { altKey: true })).toBe(false);
    expect(group.press("ArrowRight", { ctrlKey: true })).toBe(false);
    expect(group.press("ArrowRight", { metaKey: true })).toBe(false);
    expect(FakeElement.focused).toBeNull();
    expect(star(8).attributes.tabindex).toBe("0");
  });

  it("arrow keys stop at both ends", () => {
    const { block, star } = setup();
    block.show(ratingView(episodeCard(), "saison", 10));
    const group = star(10).parent as FakeElement;
    group.press("ArrowRight");
    expect(FakeElement.focused).toBeNull();
    expect(star(10).attributes.tabindex).toBe("0");
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

  it("marks « Envoyer » as primary, the rest plain", () => {
    const { block, button, star } = setup();
    block.show(ratingView(episodeCard(), "saison", 8));
    expect(star(8).className).toBe("mn-star");
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

describe("the hover preview of the stars", () => {
  const VALUES = Array.from({ length: 10 }, (_, i) => i + 1);
  function previewed(preview: true | undefined) {
    const doc = new FakeDoc();
    const choose = vi.fn();
    const stars = VALUES.map((value) => ({ value, marked: value === 4 }));
    const wrap = starRater(
      doc,
      stars,
      choose,
      preview === undefined ? {} : { preview },
    ) as FakeElement;
    const group = wrap.children[0] as FakeElement;
    const buttons = group.children as FakeElement[];
    const lit = () =>
      buttons.flatMap((b, i) => (b.className.includes("lit") ? [i + 1] : []));
    return { choose, group, buttons, lit };
  }

  it("lights 1 to 7 on entering star 7, and leaving returns to the rating of 4", () => {
    const { group, buttons, lit, choose } = previewed(true);
    buttons[6]?.pointer("pointerenter", "mouse");
    expect(lit()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(group.attributes["data-previewing"]).toBe("");
    group.pointer("pointerleave", "mouse");
    expect(lit()).toEqual([]);
    expect(group.attributes["data-previewing"]).toBeUndefined();
    expect(buttons[3]?.attributes["aria-checked"]).toBe("true");
    expect(choose).not.toHaveBeenCalled();
  });

  it("lights 1 to 3 on the focus of star 3, keeps previewing from star to star, and a blur out ends it", () => {
    const { buttons, lit, choose } = previewed(true);
    buttons[2]?.dispatch("focus");
    expect(lit()).toEqual([1, 2, 3]);
    buttons[2]?.dispatch("blur");
    buttons[3]?.dispatch("focus");
    expect(lit()).toEqual([1, 2, 3, 4]);
    buttons[3]?.dispatch("blur");
    expect(lit()).toEqual([]);
    expect(choose).not.toHaveBeenCalled();
  });

  it("a touch does not preview: the first tap rates", () => {
    const { buttons, lit, choose } = previewed(true);
    buttons[6]?.pointer("pointerenter", "touch");
    expect(lit()).toEqual([]);
    buttons[6]?.click(true);
    expect(choose).toHaveBeenCalledWith(7);
  });

  it("without the option nothing changes on enter or focus", () => {
    const { group, buttons, lit } = previewed(undefined);
    buttons[6]?.pointer("pointerenter", "mouse");
    buttons[2]?.dispatch("focus");
    expect(lit()).toEqual([]);
    expect(group.attributes["data-previewing"]).toBeUndefined();
  });
});

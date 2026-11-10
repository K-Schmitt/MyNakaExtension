import { describe, expect, it, vi } from "vitest";
import { panelView } from "../src/content/ui/home-view";
import {
  CANCEL_LABEL,
  SEND_LABEL,
  SERIES_WARNING,
} from "../src/content/ui/rating-copy";
import { buildBlock } from "../src/content/ui/rating-render";
import { buildRatingTile } from "../src/content/ui/rating-tile";
import { type RatingView, ratingView } from "../src/content/ui/rating-view";
import { episodeCard, target } from "./rating-fixtures";
import { descendants, FakeDoc, type FakeElement } from "./ui-fakes";

const POSTER = "https://image.tmdb.org/t/p/w780/back.jpg";

function handlers() {
  return {
    onChoose: vi.fn(),
    onAction: vi.fn(),
    onOther: vi.fn(),
    onConfirm: vi.fn(),
  };
}

function tile(view: RatingView, image: string | undefined) {
  const h = handlers();
  const el = buildRatingTile(new FakeDoc(), view, image, h) as FakeElement;
  const buttons = descendants(el).filter((d) => d.tag === "button");
  return { el, h, buttons };
}

// Every line of the view: heading, current, start, notice, error and warning.
const FULL: RatingView = {
  ...panelView(
    ratingView(
      episodeCard({
        pending: ["série"],
        targets: [target("série", 6, 13)],
        failed: { label: "série", error: "unavailable", at: 1 },
      }),
      "série",
      7,
    ),
  ),
  notice: "Une notice",
};

const lineTexts = (el: FakeElement): string[] =>
  descendants(el)
    .filter((d) => d.className.startsWith("mn-line"))
    .map((d) => d.textContent ?? "");

describe("buildRatingTile", () => {
  it("is a tile whose first child is the art frame", () => {
    const { el } = tile(FULL, POSTER);
    const [art] = el.children as FakeElement[];
    expect(el.className).toBe("mn-tile mn-tile--poster");
    expect(art?.className).toBe("mn-art");
    expect((art?.children[0] as FakeElement | undefined)?.tag).toBe("img");
  });

  it("an image off the allowlist gives the neutral frame", () => {
    const { el } = tile(FULL, "http://image.tmdb.org/t/p/w780/back.jpg");
    const [art] = el.children as FakeElement[];
    expect(art?.className).toBe("mn-art");
    expect(art?.children).toHaveLength(0);
  });

  it("shows the same lines as the player block, in the same order", () => {
    const block = buildBlock(new FakeDoc(), FULL, handlers()) as FakeElement;
    const lines = lineTexts(tile(FULL, POSTER).el);
    expect(lines).toEqual(lineTexts(block));
    expect(lines).toHaveLength(6);
    expect(lines[5]).toBe(SERIES_WARNING);
  });

  it("then the ten stars, then « Ignorer », last", () => {
    const { buttons } = tile(FULL, POSTER);
    expect(buttons).toHaveLength(11);
    expect(buttons.slice(0, 10).map((b) => b.attributes["aria-label"])).toEqual(
      Array.from({ length: 10 }, (_, i) => `${i + 1} sur 10`),
    );
    expect(buttons[10]?.textContent).toBe("Ignorer");
  });

  it("a trusted star chooses, a forged one calls nothing", () => {
    const { buttons, h } = tile(FULL, POSTER);
    buttons[7]?.click(false);
    buttons[10]?.click(false);
    expect(h.onChoose).not.toHaveBeenCalled();
    expect(h.onAction).not.toHaveBeenCalled();
    buttons[7]?.click(true);
    expect(h.onChoose).toHaveBeenCalledWith(8);
    buttons[10]?.click(true);
    expect(h.onAction).toHaveBeenCalledWith("ignorer");
  });

  it("the confirmation view: the warning, « Envoyer » and « Annuler », no star", () => {
    const view: RatingView = {
      ...FULL,
      choices: [],
      others: [],
      actions: [],
      confirm: true,
    };
    const { el, buttons, h } = tile(view, POSTER);
    expect(lineTexts(el)).toContain(SERIES_WARNING);
    expect(buttons.map((b) => b.textContent)).toEqual([
      SEND_LABEL,
      CANCEL_LABEL,
    ]);
    buttons[0]?.click(false);
    expect(h.onConfirm).not.toHaveBeenCalled();
    buttons[0]?.click(true);
    buttons[1]?.click(true);
    expect(h.onConfirm.mock.calls).toEqual([[true], [false]]);
  });

  it("draws a title as text, never as markup", () => {
    const view = ratingView(
      episodeCard({ title: "<img src=x onerror=1>" }),
      "épisode",
    );
    const { el } = tile(view, undefined);
    expect(
      descendants(el).some((d) =>
        d.textContent?.includes("<img src=x onerror=1>"),
      ),
    ).toBe(true);
    expect(descendants(el).some((d) => d.tag === "img")).toBe(false);
  });
});

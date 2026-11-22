import { describe, expect, it } from "vitest";
import { HERO_CHIP_LABEL, heroChipText } from "../src/content/ui/fiche-copy";
import type { FicheInfo } from "../src/ext/fiche-answers";
import {
  FILM_PATH,
  ficheEvent,
  linked,
  settle,
} from "./fiche-controller-fakes";
import { deepParts, fakeUi } from "./fiche-ui-world";
import type { FakeElement } from "./ui-fakes";

async function film(info: FicheInfo) {
  const t = fakeUi(FILM_PATH);
  t.controller.event(ficheEvent());
  t.ofType("fiche-info")[0]?.answer(info);
  await settle();
  const chip = () =>
    (t.hero.badges.children as FakeElement[]).find(
      (c) => c.shadowInit.length > 0,
    );
  return { ...t, chip };
}

const noAverage = (mine: number | null): FicheInfo => {
  const info = linked(55, mine);
  if (info.product !== undefined) info.product.average = null;
  return info;
};

describe("heroChipText", () => {
  it("writes the average and the rating", () => {
    expect(heroChipText(7.4, 8)).toBe("★ 7,4 SC · ta note 8");
  });
  it("writes the average alone", () => {
    expect(heroChipText(7.4, null)).toBe("★ 7,4 SC");
  });
  it("writes the rating alone", () => {
    expect(heroChipText(null, 8)).toBe("SC · ta note 8");
  });
});

describe("hero chip", () => {
  it("puts the chip right after Naka's rating, once; a second apply moves nothing", async () => {
    const t = await film(linked(55, 8));
    const host = t.chip();
    expect(host).toBeDefined();
    expect(t.hero.rating.nextElementSibling).toBe(host);
    t.pageChanged();
    expect(t.hero.badges.children.filter((c) => c === host)).toHaveLength(1);
    expect(t.hero.rating.nextElementSibling).toBe(host);
  });

  it("puts the chip at the end of the badges without a rating", async () => {
    const t = fakeUi(FILM_PATH);
    t.hero.rating.remove();
    t.controller.event(ficheEvent());
    t.ofType("fiche-info")[0]?.answer(linked(55, 8));
    await settle();
    const host = t.hero.badges.lastElementChild as FakeElement;
    expect(host.shadowInit).toHaveLength(1);
  });

  it("places nothing without the badges", async () => {
    const t = fakeUi(FILM_PATH);
    t.hero.shown = false;
    t.controller.event(ficheEvent());
    t.ofType("fiche-info")[0]?.answer(linked(55, 8));
    await settle();
    expect(t.hero.badges.children).toHaveLength(3);
  });

  it("shows the chip only for a linked product with an average or a rating", async () => {
    const none = await film({ state: "unlinked" } as unknown as FicheInfo);
    expect(none.chip()).toBeUndefined();
    const empty = await film(noAverage(null));
    expect(empty.chip()).toBeUndefined();
    const mineOnly = await film(noAverage(8));
    expect(mineOnly.chip()).toBeDefined();
  });

  it("scrolls our first row into the centre on a trusted click, and does nothing on a forged one", async () => {
    const t = await film(linked(55, 8));
    const button = deepParts((t.chip() as FakeElement).shadow).find(
      (e) => e.tag === "button",
    ) as FakeElement;
    expect(button.textContent).toBe("★ 6,9 SC · ta note 8");
    const row = t.kept.ours()[0] as FakeElement;
    button.click(false);
    expect(row.scrolls).toEqual([]);
    button.click(true);
    expect(row.scrolls).toEqual([{ behavior: "smooth", block: "center" }]);
  });

  it("lets screen readers read its value: a title, no aria-label over the text", async () => {
    const t = await film(linked(55, 8));
    const button = deepParts((t.chip() as FakeElement).shadow).find(
      (e) => e.tag === "button",
    ) as FakeElement;
    expect(HERO_CHIP_LABEL).toBe("Voir la note SensCritique");
    expect(button.attributes.title).toBe(HERO_CHIP_LABEL);
    expect(button.attributes["aria-label"]).toBeUndefined();
    expect(button.textContent).toBe("★ 6,9 SC · ta note 8");
  });

  it("sends nothing on a click", async () => {
    const t = await film(linked(55, 8));
    const button = deepParts((t.chip() as FakeElement).shadow).find(
      (e) => e.tag === "button",
    ) as FakeElement;
    const before = t.calls.length;
    button.click(true);
    expect(t.calls).toHaveLength(before);
  });

  it("takes the chip off when the tab leaves the title page", async () => {
    const t = await film(linked(55, 8));
    t.controller.path("/home");
    expect(t.chip()).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { badgeRight } from "../src/content/ui/fiche-badge-place";
import {
  episodeNumber,
  frenchAverage,
  seasonNumber,
} from "../src/content/ui/fiche-numbers";
import {
  linked,
  SERIES_PATH,
  seasonEvent,
  seriesEvent,
  settle,
} from "./fiche-controller-fakes";
import {
  checked,
  type FakeBox,
  fakeBox,
  fakeUi,
  hostsIn,
  shadowParts,
  starsOf,
  texts,
} from "./fiche-ui-world";

const episodes = (...list: [number, number | null][]) => ({
  episodes: list.map(([episode, average]) => ({
    episode,
    productId: 100 + episode,
    average,
  })),
});

/** A series on season 1 whose boxes are on the page, its season answered with these episodes. */
async function seasonOne(boxes: FakeBox[], answer = episodes([3, 7.4])) {
  const t = fakeUi(SERIES_PATH, boxes);
  t.page.shown = 1;
  t.controller.event(seriesEvent());
  t.controller.event(seasonEvent(1));
  t.ofType("fiche-info")[0]?.answer(linked(66));
  await settle();
  t.ofType("fiche-season")[0]?.answer(answer);
  await settle();
  return t;
}

const badgeOf = (b: FakeBox) => hostsIn(b.thumb)[0];
const starsHostOf = (b: FakeBox) => hostsIn(b.body)[0];

describe("the episode number of a box", () => {
  it("reads the number that ends span.dcf-ep-code", () => {
    expect(episodeNumber("S1 E3")).toBe(3);
    expect(episodeNumber("E12 ")).toBe(12);
    expect(episodeNumber("7")).toBe(7);
  });

  it("reads nothing from a code without a positive number at its end", () => {
    expect(episodeNumber(undefined)).toBeUndefined();
    expect(episodeNumber("")).toBeUndefined();
    expect(episodeNumber("Bonus")).toBeUndefined();
    expect(episodeNumber("E0")).toBeUndefined();
    expect(episodeNumber("E99999999999999999999")).toBeUndefined();
  });
});

describe("the numbers read from the page and written in French", () => {
  it("reads the season the dropdown names", () => {
    expect(seasonNumber("Saison 2")).toBe(2);
    expect(seasonNumber("  saison 12 ")).toBe(12);
    expect(seasonNumber("Spéciaux")).toBeUndefined();
    expect(seasonNumber(undefined)).toBeUndefined();
  });

  it("writes an average with a decimal comma and one decimal at most", () => {
    expect(frenchAverage(7.4)).toBe("7,4");
    expect(frenchAverage(7)).toBe("7");
    expect(frenchAverage(6.86)).toBe("6,9");
  });
});

describe("the badge's place in the thumb", () => {
  const thumb = { top: 100, left: 0, right: 378 };

  it("sits in the top-right corner when Naka has nothing there", () => {
    const picture = { top: 100, left: 0, right: 378 };
    const duration = { top: 290, left: 320, right: 370 };
    expect(badgeRight(thumb, [picture, duration])).toBe(8);
  });

  it("moves left of Naka's control in that corner", () => {
    const control = { top: 108, left: 321, right: 370 };
    expect(badgeRight(thumb, [control])).toBe(65);
  });
});

describe("the episode boxes", () => {
  it("puts the average badge in the thumb and ten stars under the title of a known episode", async () => {
    const box = fakeBox("S1 E3");
    await seasonOne([box]);
    expect(texts(shadowParts(badgeOf(box)))).toEqual(["7,4"]);
    expect(badgeOf(box)?.shadowInit).toEqual([{ mode: "closed" }]);
    expect(starsOf(shadowParts(starsHostOf(box)))).toHaveLength(10);
    expect(starsHostOf(box)?.shadowInit).toEqual([{ mode: "closed" }]);
  });

  it("keeps a star's click from the box (and its hit button) and sends the episode's rating", async () => {
    const box = fakeBox("S1 E3");
    const t = await seasonOne([box]);
    const star = starsOf(shadowParts(starsHostOf(box)))[5];
    expect(star?.dispatch("click", true)).toBe(false);
    expect(box.clicks).toEqual([]);
    expect(t.ofType("fiche-rate").map((c) => c.msg)).toEqual([
      {
        type: "fiche-rate",
        contentId: 6,
        target: "épisode",
        productId: 103,
        rating: 6,
        season: 1,
        episode: 3,
      },
    ]);
  });

  it("keeps a click on the badge from the box too", async () => {
    const box = fakeBox("S1 E3");
    await seasonOne([box]);
    expect(badgeOf(box)?.dispatch("click", true)).toBe(false);
    expect(box.clicks).toEqual([]);
  });

  it("sends nothing on a forged star click", async () => {
    const box = fakeBox("S1 E3");
    const t = await seasonOne([box]);
    starsOf(shadowParts(starsHostOf(box)))[5]?.click(false);
    expect(t.ofType("fiche-rate")).toEqual([]);
  });

  it("leaves a box with an unreadable code bare, never with a neighbour's values", async () => {
    const bare = fakeBox("Bonus");
    const none = fakeBox(undefined);
    const four = fakeBox("S1 E4");
    await seasonOne([bare, none, four], episodes([3, 7.4], [4, 6.8]));
    for (const b of [bare, none]) {
      expect(hostsIn(b.thumb)).toEqual([]);
      expect(hostsIn(b.body)).toEqual([]);
    }
    expect(texts(shadowParts(badgeOf(four)))).toEqual(["6,8"]);
  });

  it("leaves bare a box whose episode SensCritique does not list", async () => {
    const box = fakeBox("S1 E9");
    await seasonOne([box]);
    expect(hostsIn(box.thumb)).toEqual([]);
    expect(hostsIn(box.body)).toEqual([]);
  });

  it("shows the stars without a badge for an episode with no average", async () => {
    const box = fakeBox("E3");
    await seasonOne([box], episodes([3, null]));
    expect(hostsIn(box.thumb)).toEqual([]);
    expect(starsOf(shadowParts(starsHostOf(box)))).toHaveLength(10);
  });

  it("marks the owner's rating once it is read", async () => {
    const box = fakeBox("E3");
    const t = await seasonOne([box]);
    expect(checked(shadowParts(starsHostOf(box)))).toEqual([]);
    t.ofType("fiche-mine")[0]?.answer({ mine: 8 });
    await settle();
    expect(checked(shadowParts(starsHostOf(box)))).toEqual(["8 sur 10"]);
    expect(hostsIn(box.body)).toHaveLength(1);
  });

  it("takes the decorations off when another season opens, before its episodes come", async () => {
    const box = fakeBox("E3");
    const t = await seasonOne([box]);
    t.page.shown = 2;
    t.controller.event(seasonEvent(2));
    expect(hostsIn(box.thumb)).toEqual([]);
    expect(hostsIn(box.body)).toEqual([]);
  });

  it("puts a decoration back when Naka redraws the box without it", async () => {
    const box = fakeBox("E3");
    const t = await seasonOne([box]);
    starsHostOf(box)?.remove();
    t.pageChanged();
    expect(starsOf(shadowParts(starsHostOf(box)))).toHaveLength(10);
  });

  it("follows a box whose code Naka rewrote for another episode", async () => {
    const box = fakeBox("E3");
    const t = await seasonOne([box], episodes([3, 7.4], [4, 6.8]));
    box.codeSpan.textContent = "E4";
    t.pageChanged();
    expect(texts(shadowParts(badgeOf(box)))).toEqual(["6,8"]);
    starsOf(shadowParts(starsHostOf(box)))[0]?.click(true);
    expect(t.ofType("fiche-rate")[0]?.msg).toMatchObject({
      episode: 4,
      productId: 104,
    });
  });

  it("stops watching the page and takes everything off when the tab leaves the title page", async () => {
    const box = fakeBox("E3");
    const t = await seasonOne([box]);
    expect(t.watching()).toBe(true);
    t.controller.path("/");
    expect(t.watching()).toBe(false);
    expect(hostsIn(box.thumb)).toEqual([]);
    expect(hostsIn(box.body)).toEqual([]);
  });
});

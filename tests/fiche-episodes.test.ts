import { describe, expect, it } from "vitest";
import {
  badgeInsertOffset,
  badgeRight,
} from "../src/content/ui/fiche-badge-place";
import {
  codeSeason,
  episodeNumber,
  frenchAverage,
  seasonNumber,
} from "../src/content/ui/fiche-numbers";
import { EPISODE_STARS_SHEET } from "../src/content/ui/fiche-styles";
import { visibleFirstOrder } from "../src/content/ui/fiche-visible-order";
import { errorLine, NOT_RATED_LINE } from "../src/content/ui/rating-copy";
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
  panelParts,
  shadowParts,
  starsOf,
  texts,
} from "./fiche-ui-world";
import type { FakeElement } from "./ui-fakes";

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

const NB = "\u202F";
const badgeOf = (b: FakeBox) => hostsIn(b.thumb)[0];
const starsHostOf = (b: FakeBox) => hostsIn(b.body)[0];
const groupOf = (b: FakeBox) =>
  shadowParts(starsHostOf(b)).find((el) => el.attributes.role === "radiogroup");

describe("the episode number of a box", () => {
  it("reads the bare number of span.nh-ep-num", () => {
    expect(episodeNumber("1")).toBe(1);
    expect(episodeNumber("12")).toBe(12);
    expect(episodeNumber("S1 E3")).toBe(3);
  });

  it("reads nothing from a code without a positive number at its end", () => {
    expect(episodeNumber(undefined)).toBeUndefined();
    expect(episodeNumber("")).toBeUndefined();
    expect(episodeNumber("Bonus")).toBeUndefined();
    expect(episodeNumber("E0")).toBeUndefined();
    expect(episodeNumber("E99999999999999999999")).toBeUndefined();
  });
});

describe("the season a box's code carries", () => {
  it("reads S<n> in both forms, in any case", () => {
    expect(codeSeason("S1 E3")).toBe(1);
    expect(codeSeason("S01E03")).toBe(1);
    expect(codeSeason("s2 e5")).toBe(2);
    expect(codeSeason("S12E1")).toBe(12);
  });

  it("reads no season from a code without one", () => {
    expect(codeSeason(undefined)).toBeUndefined();
    expect(codeSeason(null)).toBeUndefined();
    expect(codeSeason("")).toBeUndefined();
    expect(codeSeason("E3")).toBeUndefined();
    expect(codeSeason("3")).toBeUndefined();
    expect(codeSeason("Bonus")).toBeUndefined();
  });

  it("reads S0 as season 0, which no shown season matches", () => {
    expect(codeSeason("S0 E1")).toBe(0);
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

  it("counts a child in the corner only when it starts past the thumb's middle", () => {
    expect(badgeRight(thumb, [{ top: 100, left: 189, right: 378 }])).toBe(8);
    expect(badgeRight(thumb, [{ top: 100, left: 190, right: 378 }])).toBe(196);
  });

  it("counts a child in the corner only when its top is less than 40 px from the thumb's", () => {
    expect(badgeRight(thumb, [{ top: 139, left: 330, right: 378 }])).toBe(56);
    expect(badgeRight(thumb, [{ top: 140, left: 330, right: 378 }])).toBe(8);
  });

  it("counts a child in the corner only when its right edge is less than 40 px from the thumb's", () => {
    expect(badgeRight(thumb, [{ top: 100, left: 300, right: 339 }])).toBe(86);
    expect(badgeRight(thumb, [{ top: 100, left: 300, right: 338 }])).toBe(8);
  });

  it("moves left of the leftmost of several controls in the corner", () => {
    const toggle = { top: 104, left: 321, right: 370 };
    const download = { top: 104, left: 290, right: 340 };
    expect(badgeRight(thumb, [toggle, download])).toBe(96);
  });
});

describe("putting the badge in the thumb", () => {
  const thumbRect = { top: 0, left: 0, right: 378 };
  const control = { top: 8, left: 321, right: 370 };

  it("puts nothing in a box without a thumb", () => {
    expect(badgeInsertOffset(undefined)).toBeUndefined();
  });

  it("leaves a badge already in the thumb where it is, reading no layout", () => {
    const read = () => {
      throw new Error("layout read");
    };
    expect(
      badgeInsertOffset({ holdsBadge: true, rect: read, children: read }),
    ).toBeUndefined();
  });

  it("puts a badge the thumb does not hold at the offset of its corner", () => {
    const thumb = { rect: () => thumbRect, children: () => [control] };
    expect(badgeInsertOffset({ holdsBadge: false, ...thumb })).toBe(65);
    expect(
      badgeInsertOffset({
        holdsBadge: false,
        rect: () => thumbRect,
        children: () => [],
      }),
    ).toBe(8);
  });
});

describe("the episodes on screen first", () => {
  it("puts the asked episodes on screen first, each group in the asked order", () => {
    expect(visibleFirstOrder([3, 4, 5, 6], [5, undefined, 3])).toEqual([
      3, 5, 4, 6,
    ]);
  });

  it("keeps the asked order when no box is on screen", () => {
    expect(visibleFirstOrder([2, 1], [])).toEqual([2, 1]);
  });

  it("ignores boxes on screen whose episode was not asked", () => {
    expect(visibleFirstOrder([1, 2], [7, 8, 2])).toEqual([2, 1]);
  });
});

describe("the episode boxes", () => {
  it("puts the average badge in the thumb and ten stars right after the title of a known episode", async () => {
    const box = fakeBox("S1 E3");
    await seasonOne([box]);
    expect(box.titleSpan.nextElementSibling).toBe(starsHostOf(box));
    expect(box.port.title()).toBe("Épisode");
    expect(texts(shadowParts(badgeOf(box)))).toEqual(["7,4"]);
    expect(badgeOf(box)?.shadowInit).toEqual([{ mode: "closed" }]);
    expect(starsOf(shadowParts(starsHostOf(box)))).toHaveLength(10);
    expect(starsHostOf(box)?.shadowInit).toEqual([{ mode: "closed" }]);
  });

  it("names the stars after the SensCritique episode they rate", async () => {
    const box = fakeBox("S1 E3");
    const answer = {
      episodes: [{ episode: 3, productId: 103, average: 7.4, title: "Pilote" }],
    };
    await seasonOne([box], answer);
    const group = groupOf(box);
    const name = `Noter «${NB}Pilote${NB}» sur SensCritique`;
    expect(group?.attributes["aria-label"]).toBe(name);
    expect(group?.attributes.title).toBe(name);
  });

  it("names an untitled episode's stars as before", async () => {
    const box = fakeBox("S1 E3");
    await seasonOne([box]);
    const group = groupOf(box);
    expect(group?.attributes["aria-label"]).toBe("Note");
    expect(group?.attributes.title).toBeUndefined();
  });

  it("names the stars again when the episode's title changes", async () => {
    const box = fakeBox("E3");
    const titled = (title: string) => ({
      episodes: [{ episode: 3, productId: 103, average: 7.4, title }],
    });
    const t = await seasonOne([box], titled("Pilote"));
    t.page.shown = 2;
    t.controller.event(seasonEvent(2));
    await settle();
    t.ofType("fiche-season")[1]?.answer(titled("Retour"));
    await settle();
    expect(groupOf(box)?.attributes.title).toBe(
      `Noter «${NB}Retour${NB}» sur SensCritique`,
    );
  });

  it("keeps a star's click from the box (the whole row starts the episode) and sends the episode's rating", async () => {
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

  it("keeps click, pointerdown, mousedown and keydown on our hosts from the row", async () => {
    const box = fakeBox("S1 E3");
    await seasonOne([box]);
    const hosts = [starsHostOf(box), badgeOf(box)];
    expect(hosts.every((host) => host !== undefined)).toBe(true);
    for (const type of ["click", "pointerdown", "mousedown", "keydown"]) {
      for (const host of hosts) expect(host?.dispatch(type, true)).toBe(false);
      expect(box.heard[type]).toEqual([]);
    }
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

  it("leaves bare a box whose code names another season than the shown one", async () => {
    const two = fakeBox("S2 E3");
    const zero = fakeBox("S0 E3");
    const packed = fakeBox("S02E03");
    await seasonOne([two, zero, packed]);
    for (const b of [two, zero, packed]) {
      expect(hostsIn(b.thumb)).toEqual([]);
      expect(hostsIn(b.body)).toEqual([]);
    }
  });

  it("decorates a box whose code names the shown season, in either form", async () => {
    const spaced = fakeBox("s1 e3");
    const packed = fakeBox("S01E03");
    await seasonOne([spaced, packed]);
    for (const b of [spaced, packed]) {
      expect(texts(shadowParts(badgeOf(b)))).toEqual(["7,4"]);
      expect(starsOf(shadowParts(starsHostOf(b)))).toHaveLength(10);
    }
  });

  it("takes a box's decorations off when Naka rewrites its code for another season", async () => {
    const box = fakeBox("S1 E3");
    const t = await seasonOne([box]);
    box.codeSpan.textContent = "S2 E3";
    t.pageChanged();
    expect(hostsIn(box.thumb)).toEqual([]);
    expect(hostsIn(box.body)).toEqual([]);
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
    t.ofType("fiche-mine")[0]?.answer({ mine: 8, average: null });
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

describe("an episode rating on its box", () => {
  const busyOf = (b: FakeBox) =>
    shadowParts(starsHostOf(b)).filter(
      (el) => el.attributes["aria-busy"] === "true",
    );
  const starOf = (b: FakeBox, value: number) =>
    starsOf(shadowParts(starsHostOf(b)))[value - 1];
  const linesOf = (b: FakeBox) =>
    shadowParts(starsHostOf(b))
      .filter((el) => el.className.includes("mn-error"))
      .map((el) => el.textContent);
  const twoBoxes = async () => {
    const three = fakeBox("S1 E3");
    const four = fakeBox("S1 E4");
    const t = await seasonOne([three, four], episodes([3, 7.4], [4, 6.8]));
    return { t, three, four };
  };

  it("sends nothing for a trusted click on an episode's stars reported hidden", async () => {
    const { t, three } = await twoBoxes();
    t.stars.hidden = true;
    starOf(three, 6)?.click(true);
    expect(t.ofType("fiche-rate")).toEqual([]);
    t.stars.hidden = false;
    starOf(three, 6)?.click(true);
    expect(t.ofType("fiche-rate")).toHaveLength(1);
  });

  const starsSlotOf = (
    t: Awaited<ReturnType<typeof twoBoxes>>["t"],
    b: FakeBox,
  ) =>
    t.stars.slots.find((_, i) =>
      t.stars.rows[i]?.children.includes(starOf(b, 6) as FakeElement),
    );

  it("stops watching a box's stars when the tab leaves the title page", async () => {
    const { t, three, four } = await twoBoxes();
    const slots = [starsSlotOf(t, three), starsSlotOf(t, four)];
    t.controller.path("/");
    expect(t.stars.released).toEqual(expect.arrayContaining(slots));
  });

  it("stops watching a box's stars once Naka drops the box", async () => {
    const three = fakeBox("S1 E3");
    const four = fakeBox("S1 E4");
    const boxes = [three, four];
    const t = await seasonOne(boxes, episodes([3, 7.4], [4, 6.8]));
    const slot = t.stars.slots.find((_, i) =>
      t.stars.rows[i]?.children.includes(starOf(three, 6) as FakeElement),
    );
    boxes.splice(0, 1);
    t.pageChanged();
    expect(t.stars.released).toEqual([slot]);
  });

  it("stops watching a box's stars when Naka rewrites its code for another season", async () => {
    const { t, three } = await twoBoxes();
    const slot = starsSlotOf(t, three);
    three.codeSpan.textContent = "S2 E3";
    t.pageChanged();
    expect(t.stars.released).toEqual([slot]);
  });

  it("draws each box's stars in a slot of its own, kept when the box is drawn again", async () => {
    const { t, three, four } = await twoBoxes();
    const slotOf = (b: FakeBox) =>
      t.stars.slots.filter((_, i) =>
        t.stars.rows[i]?.children.includes(starOf(b, 6) as FakeElement),
      )[0];
    const first = slotOf(three);
    expect(first).toBeDefined();
    expect(slotOf(four)).toBeDefined();
    expect(slotOf(four)).not.toBe(first);
    starOf(three, 6)?.click(true);
    t.ofType("fiche-rate")[0]?.answer({ ok: true });
    await settle();
    expect(slotOf(three)).toBe(first);
  });

  it("refuses only the hidden box's stars: another box's click still rates", async () => {
    const { t, three, four } = await twoBoxes();
    const groupOfThree = t.stars.rows.find((row) =>
      row.children.includes(starOf(three, 6) as FakeElement),
    );
    expect(groupOfThree?.attributes.role).toBe("radiogroup");
    t.stars.hiddenRows.add(groupOfThree);
    starOf(three, 6)?.click(true);
    expect(t.ofType("fiche-rate")).toEqual([]);
    starOf(four, 7)?.click(true);
    expect(t.ofType("fiche-rate").map((c) => c.msg)).toMatchObject([
      { rating: 7 },
    ]);
  });

  it("dims the box's stars and marks them busy while it is sent; a second click sends nothing", async () => {
    const { t, three, four } = await twoBoxes();
    starOf(three, 6)?.click(true);
    await settle();
    expect(busyOf(three)).toHaveLength(1);
    expect(busyOf(four)).toEqual([]);
    expect(EPISODE_STARS_SHEET).toContain('[aria-busy="true"]{opacity:');
    starOf(three, 8)?.click(true);
    starOf(four, 8)?.click(true);
    expect(t.ofType("fiche-rate")).toHaveLength(1);
  });

  it.each([
    ["not sent", { error: "sc-session" }, errorLine("sc-session")],
    ["no answer", undefined, NOT_RATED_LINE],
  ])(
    "%s: the panel's error line under that box's stars only",
    async (_n, answer, line) => {
      const { t, three, four } = await twoBoxes();
      starOf(three, 6)?.click(true);
      t.ofType("fiche-rate")[0]?.answer(answer);
      await settle();
      expect(linesOf(three)).toEqual([line]);
      expect(linesOf(four)).toEqual([]);
      expect(texts(panelParts(t.kept))).toContain(line);
      expect(busyOf(three)).toEqual([]);
      expect(checked(shadowParts(starsHostOf(three)))).toEqual([]);
    },
  );

  it("the line goes with the next view without that outcome", async () => {
    const { t, three, four } = await twoBoxes();
    starOf(three, 6)?.click(true);
    t.ofType("fiche-rate")[0]?.answer({ error: "sc-session" });
    await settle();
    starOf(four, 5)?.click(true);
    await settle();
    expect(linesOf(three)).toEqual([]);
    expect(busyOf(four)).toHaveLength(1);
  });

  it("sent: normal stars with the new rating", async () => {
    const { t, three } = await twoBoxes();
    starOf(three, 6)?.click(true);
    t.ofType("fiche-rate")[0]?.answer({ ok: true });
    await settle();
    expect(busyOf(three)).toEqual([]);
    expect(linesOf(three)).toEqual([]);
    expect(checked(shadowParts(starsHostOf(three)))).toEqual(["6 sur 10"]);
  });

  it("an episode whose rating went out but was not saved: its box says so, and shows the rating", async () => {
    const { t, three } = await twoBoxes();
    starOf(three, 6)?.click(true);
    t.ofType("fiche-rate")[0]?.answer({
      sent: true,
      step: "local-save",
      error: "unavailable",
    });
    await settle();
    expect(linesOf(three)).toEqual([
      "Note envoyée sur SensCritique, mais l’extension n’a pas pu l’enregistrer.",
    ]);
    expect(checked(shadowParts(starsHostOf(three)))).toEqual(["6 sur 10"]);
  });

  it("the box of the same episode in another season shows nothing of it", async () => {
    const box = fakeBox("E3");
    const t = await seasonOne([box]);
    starOf(box, 6)?.click(true);
    t.ofType("fiche-rate")[0]?.answer({ error: "sc-session" });
    await settle();
    t.page.shown = 2;
    t.controller.event(seasonEvent(2));
    await settle();
    t.ofType("fiche-season")[1]?.answer(episodes([3, 7.4]));
    await settle();
    expect(starsOf(shadowParts(starsHostOf(box)))).toHaveLength(10);
    expect(linesOf(box)).toEqual([]);
  });
});

describe("the preview on an episode's stars", () => {
  it("lights the stars up to the hovered one, sends nothing, and the home row's rater has none", async () => {
    const box = fakeBox("E3");
    const t = await seasonOne([box]);
    const before = t.ofType("fiche-rate").length;
    const stars = starsOf(shadowParts(starsHostOf(box)));
    stars[4]?.pointer("pointerenter", "mouse");
    expect(stars.filter((s) => s.className.includes("lit"))).toHaveLength(5);
    groupOf(box)?.pointer("pointerleave", "mouse");
    expect(stars.filter((s) => s.className.includes("lit"))).toHaveLength(0);
    expect(t.ofType("fiche-rate")).toHaveLength(before);
  });
});

import { describe, expect, it } from "vitest";
import { emptyState, type SyncState } from "../src/core/state";
import { MAX_FICHE_LINKS } from "../src/ext/fiche-links-schema";
import type { FicheLinkMessage } from "../src/ext/fiche-messages";
import { answerWorld } from "./answer-world";
import { filmTitle, OTHER_TAB, seriesTitle, TAB } from "./fiche-fixtures";

const link = (over: Partial<FicheLinkMessage> = {}): FicheLinkMessage => ({
  type: "fiche-link",
  contentId: 5,
  productId: 11,
  ...over,
});
const STATE: SyncState = {
  ...emptyState(),
  mapping: [{ nakaId: 3, scId: 1003 }],
  settled: [{ nakaId: 3, scId: 1003 }],
};

async function chosenWorld(state: SyncState = STATE) {
  const w = answerWorld({ state });
  await w.registry.open(TAB, 5, undefined, [11, 12]);
  return w;
}

describe("fiche-link: a title the extension does not know", () => {
  it("writes the display-only link, and leaves mapping and settled untouched", async () => {
    const w = await chosenWorld();
    expect(await w.jobs.ficheLink(TAB, link())).toEqual({ ok: true });
    expect(w.area.data.get("ficheLinks")).toEqual({ "5": 11 });
    expect(w.state()).toEqual(STATE);
    expect(w.network()).toEqual([]);
  });

  it("a later choice replaces the content's link", async () => {
    const w = await chosenWorld();
    await w.jobs.ficheLink(TAB, link());
    await w.jobs.ficheLink(TAB, link({ productId: 12 }));
    expect(w.area.data.get("ficheLinks")).toEqual({ "5": 12 });
  });

  it(`keeps at most ${MAX_FICHE_LINKS} links: the first key goes before a new one`, async () => {
    const w = await chosenWorld();
    const full = Object.fromEntries(
      Array.from({ length: MAX_FICHE_LINKS }, (_, i) => [String(i + 100), 1]),
    );
    w.area.data.set("ficheLinks", full);
    await w.jobs.ficheLink(TAB, link());
    const links = w.area.data.get("ficheLinks") as Record<string, number>;
    expect(Object.keys(links)).toHaveLength(MAX_FICHE_LINKS);
    expect(links["100"]).toBeUndefined();
    expect(links["5"]).toBe(11);
  });

  it("an existing link of the content is replaced without dropping another", async () => {
    const w = await chosenWorld();
    const full = Object.fromEntries(
      Array.from({ length: MAX_FICHE_LINKS }, (_, i) => [String(i + 1), 1]),
    );
    w.area.data.set("ficheLinks", full);
    await w.jobs.ficheLink(TAB, link());
    const links = w.area.data.get("ficheLinks") as Record<string, number>;
    expect(Object.keys(links)).toHaveLength(MAX_FICHE_LINKS);
    expect(links["1"]).toBe(1);
    expect(links["5"]).toBe(11);
  });

  it("unreadable links are replaced by the new one", async () => {
    const w = await chosenWorld();
    w.area.data.set("ficheLinks", { bad: "x" });
    expect(await w.jobs.ficheLink(TAB, link())).toEqual({ ok: true });
    expect(w.area.data.get("ficheLinks")).toEqual({ "5": 11 });
  });
});

describe("fiche-link: a title the extension knows", () => {
  it("an unlinked Naka title: the link-title path (both sites read, the mapping written), no display link", async () => {
    const w = await chosenWorld({
      ...emptyState(),
      unlinked: [{ side: "naka", id: 5, title: "Titre 5", reason: "no-match" }],
    });
    expect(await w.jobs.ficheLink(TAB, link())).toEqual({ ok: true });
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 11 }]);
    expect(w.state().unlinked).toEqual([]);
    expect(w.sk.calls).toContain("productState:11");
    expect(w.area.data.has("ficheLinks")).toBe(false);
  });

  it("an open question on the Naka title: the link-title path closes it", async () => {
    const w = await chosenWorld({
      ...emptyState(),
      pending: [
        { kind: "ambiguity", side: "naka", id: 5, candidateIds: [11, 12] },
      ],
    });
    expect(await w.jobs.ficheLink(TAB, link())).toEqual({ ok: true });
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 11 }]);
    expect(w.state().pending).toEqual([]);
    expect(w.area.data.has("ficheLinks")).toBe(false);
  });
});

describe("fiche-link: the link-title path answers from its ending", () => {
  const unlinked: SyncState = {
    ...emptyState(),
    unlinked: [{ side: "naka", id: 5, title: "Titre 5", reason: "no-match" }],
  };

  it("refused (the pair held by a settled one): rejected, nothing linked", async () => {
    const state = { ...unlinked, settled: [{ nakaId: 9, scId: 11 }] };
    const w = await chosenWorld(state);
    await expect(w.jobs.ficheLink(TAB, link())).rejects.toThrow();
    expect(w.state()).toEqual(state);
  });

  it("mismatch (a series product for a film): rejected, nothing linked", async () => {
    const w = await chosenWorld(unlinked);
    w.jobDeps.sc.productState = async () => ({
      isDone: false,
      isWished: false,
      universe: 4,
      rating: null,
      average: null,
    });
    await expect(w.jobs.ficheLink(TAB, link())).rejects.toThrow();
    expect(w.state()).toEqual(unlinked);
  });

  it("failed (a read throws): rejected, nothing linked", async () => {
    const w = await chosenWorld(unlinked);
    w.jobDeps.sc.productState = async () => {
      throw new Error("down");
    };
    await expect(w.jobs.ficheLink(TAB, link())).rejects.toThrow();
    expect(w.state()).toEqual(unlinked);
  });
});

describe("fiche-link: only a product issued to that tab for that content", () => {
  it.each([
    ["never issued", link({ productId: 13 })],
    ["for another content", link({ contentId: 6 })],
  ])("%s: rejected, nothing written", async (_n, msg) => {
    const w = await chosenWorld();
    await expect(w.jobs.ficheLink(TAB, msg)).rejects.toThrow();
    expect(w.area.data.has("ficheLinks")).toBe(false);
    expect(w.state()).toEqual(STATE);
  });

  it.each([
    [
      "the title's product",
      (w: ReturnType<typeof answerWorld>) =>
        w.registry.open(TAB, 5, filmTitle(11), []),
    ],
    [
      "an episode",
      async (w: ReturnType<typeof answerWorld>) => {
        await w.registry.open(TAB, 5, seriesTitle(13), []);
        await w.registry.issue(TAB, 5, [11]);
      },
    ],
  ])(
    "issued as %s, not as a candidate: rejected, zero requests",
    async (_n, setUp) => {
      const w = answerWorld({ state: STATE });
      await setUp(w);
      await expect(w.jobs.ficheLink(TAB, link())).rejects.toThrow();
      expect(w.area.data.has("ficheLinks")).toBe(false);
      expect(w.network()).toEqual([]);
      expect(w.state()).toEqual(STATE);
    },
  );

  it("issued to another tab: rejected", async () => {
    const w = await chosenWorld();
    await expect(w.jobs.ficheLink(OTHER_TAB, link())).rejects.toThrow();
    expect(w.area.data.has("ficheLinks")).toBe(false);
  });
});

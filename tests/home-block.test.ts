import { describe, expect, it } from "vitest";
import { GRACE_MS } from "../src/content/ui/click-grace";
import { createHomeBlock, HOME_PATHS } from "../src/content/ui/home-block";
import { questionView } from "../src/content/ui/question-view";
import {
  chosenLine,
  errorLine,
  SENDING_LINE,
  SERIES_WARNING,
  UNREACHABLE_LINE,
  WAIT_LINE,
} from "../src/content/ui/rating-copy";
import { renderRow } from "../src/content/ui/row-render";
import type { RatingCard } from "../src/core/rating-cards";
import type { QuestionOffer } from "../src/sw/question-offers";
import { flush } from "./end-block-fakes";
import { answerOf, asksOf, entryOf, homeWorld, sendsOf } from "./home-fakes";
import { episodeCard, filmCard } from "./rating-fixtures";
import { descendants, FakeDoc, type FakeElement, FakeShadow } from "./ui-fakes";

const film = (id: number, at: number): RatingCard =>
  filmCard({ key: `movie:${id}`, contentId: id, title: `Film ${id}`, at });

// Stored out of order on purpose: the row must sort by `at`.
const A = film(1, 100);
const B = film(2, 300);
const C = film(3, 200);
const SERIE = episodeCard({
  pending: ["série"],
  seriesFinished: false,
  at: 400,
});

async function arrived(...cards: RatingCard[]) {
  const w = homeWorld();
  const block = createHomeBlock(w.ports);
  w.state.answer = answerOf(...cards);
  block.route("/");
  await flush();
  return { ...w, block };
}

describe("the home block's arrival", () => {
  it("serves the home path of the owner's probe, and nothing else", () => {
    expect(HOME_PATHS).toEqual(["/"]);
  });

  it("shows the row on a home path", async () => {
    const w = await arrived(A);
    expect(w.shown).toHaveLength(1);
    expect(w.keys()).toEqual(["movie:1"]);
  });

  it("asks nothing and shows nothing off the home paths", async () => {
    const w = homeWorld();
    const block = createHomeBlock(w.ports);
    w.state.answer = answerOf(A);
    block.route("/player");
    block.route("/profile");
    await flush();
    expect(asksOf(w.calls)).toEqual([]);
    expect(w.shown).toEqual([]);
  });

  it("leaving the home path hides the row", async () => {
    const w = await arrived(A);
    const before = w.hidden();
    w.block.route("/player");
    expect(w.hidden()).toBeGreaterThan(before);
  });

  it("after leaving, a choice from the old row sends nothing", async () => {
    const w = await arrived(A);
    await w.ready();
    const handlers = w.handlersOf("movie:1");
    w.block.route("/player");
    handlers.onChoose(5);
    await flush();
    expect(sendsOf(w.calls)).toEqual([]);
  });

  it("an answer that comes after leaving shows nothing", async () => {
    const w = homeWorld();
    const block = createHomeBlock(w.ports);
    w.state.answer = answerOf(A);
    block.route("/");
    block.route("/player");
    await flush();
    expect(w.shown).toEqual([]);
  });

  it("asks once per arrival, however often the path is fed", async () => {
    const w = await arrived(A);
    w.block.route("/");
    w.block.route("/");
    await flush();
    expect(asksOf(w.calls)).toHaveLength(1);
    w.block.route("/player");
    w.block.route("/");
    await flush();
    expect(asksOf(w.calls)).toHaveLength(2);
  });

  it("no card, or no answer, gives no row", async () => {
    const none = await arrived();
    expect(none.shown).toEqual([]);
    const w = homeWorld();
    const block = createHomeBlock(w.ports);
    block.route("/");
    await flush();
    expect(w.shown).toEqual([]);
  });

  it("lists three cards, newest first, whatever the answer's order", async () => {
    const w = await arrived(A, B, C);
    expect(w.keys()).toEqual(["movie:2", "movie:3", "movie:1"]);
    expect(w.viewOf("movie:2")?.heading).toContain("Film 2");
  });

  it("an entry opens on its failed label first, the second pending one here", async () => {
    const ep = episodeCard({
      pending: ["épisode", "saison"],
      failed: { label: "saison", error: "sc-session", at: 7 },
      at: 500,
    });
    const w = await arrived(ep);
    expect(w.viewOf(ep.key)?.heading).toContain("Noter la saison 1");
    expect(w.viewOf(ep.key)?.error).toBe(errorLine("sc-session"));
    await w.ready();
    w.handlersOf(ep.key).onChoose(6);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 5:1:1 saison 6"]);
  });

  it("an entry's série shows the warning", async () => {
    const w = await arrived(SERIE);
    expect(w.viewOf("tv:5:S1E1")?.warning).toBe(SERIES_WARNING);
  });
});

describe("a choice in the row", () => {
  it("sends one rate for that entry's first pending label and locks it", async () => {
    const w = await arrived(A, B);
    await w.ready();
    w.handlersOf("movie:2").onChoose(8);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 2:: film 8"]);
    expect(w.viewOf("movie:2")?.notice).toBe(SENDING_LINE);
    expect(w.viewOf("movie:2")?.choices).toEqual([]);
  });

  it("a second click on the locked entry sends nothing, a click on another entry does", async () => {
    const w = await arrived(A, B);
    await w.ready();
    const locked = w.handlersOf("movie:2");
    locked.onChoose(8);
    locked.onChoose(9);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 2:: film 8"]);
    await w.ready(); // Ruling 27: the lock redrew the row, the neighbour has a fresh grace
    w.handlersOf("movie:1").onChoose(6);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 2:: film 8", "rate 1:: film 6"]);
    expect(w.viewOf("movie:1")?.notice).toBe(SENDING_LINE);
  });

  it("asks again 2 s after the click, and drops the entry the worker no longer lists", async () => {
    const w = await arrived(A, B, C);
    await w.ready();
    await w.clock.advance(500);
    w.handlersOf("movie:2").onChoose(8);
    await w.clock.advance(1999);
    expect(asksOf(w.calls)).toHaveLength(1);
    w.state.answer = answerOf(A, C);
    await w.clock.advance(1);
    expect(asksOf(w.calls)).toHaveLength(2);
    expect(w.keys()).toEqual(["movie:3", "movie:1"]);
  });

  it("keeps the entry locked while the card is unchanged", async () => {
    const w = await arrived(A, B);
    await w.ready();
    w.handlersOf("movie:2").onChoose(8);
    await w.clock.advance(2000);
    expect(w.viewOf("movie:2")?.notice).toBe(SENDING_LINE);
    await w.clock.advance(3000);
    expect(w.viewOf("movie:2")?.notice).toBe(SENDING_LINE);
  });

  it("a card absent from the answer counts as moved on", async () => {
    const w = await arrived(A, B);
    await w.ready();
    w.handlersOf("movie:1").onChoose(8);
    w.state.answer = answerOf(B);
    await w.clock.advance(2000);
    expect(w.keys()).toEqual(["movie:2"]);
  });

  it("hides the row when its last entry is gone", async () => {
    const w = await arrived(A);
    await w.ready();
    w.handlersOf("movie:1").onChoose(8);
    w.state.answer = answerOf();
    const before = w.hidden();
    await w.clock.advance(2000);
    expect(w.hidden()).toBeGreaterThan(before);
  });

  it("moves an entry on to its next label, unlocked", async () => {
    const ep = episodeCard({ pending: ["épisode", "saison"], at: 500 });
    const w = await arrived(ep);
    await w.ready();
    w.handlersOf(ep.key).onChoose(8);
    w.state.answer = {
      cards: [
        entryOf(
          episodeCard({ pending: ["saison"], given: { épisode: 8 }, at: 500 }),
          7,
        ),
      ],
    };
    await w.clock.advance(2000);
    expect(w.viewOf(ep.key)?.heading).toContain("Noter la saison 1");
    expect(w.viewOf(ep.key)?.choices).toHaveLength(10);
    expect(w.viewOf(ep.key)?.notice).toBeUndefined();
    expect(w.viewOf(ep.key)?.choices.find((c) => c.value === 7)?.marked).toBe(
      true,
    );
  });

  it("drops the entry when the schedule is spent with answers and no change", async () => {
    const w = await arrived(A, B);
    await w.ready();
    w.handlersOf("movie:2").onChoose(8);
    await w.clock.advance(60000);
    expect(w.keys()).toEqual(["movie:1"]);
  });
});

describe("the unreachable worker", () => {
  it("a send that fails says so on that entry only, and unlocks it", async () => {
    const w = await arrived(A, B);
    await w.ready();
    w.state.sendOk = false;
    w.handlersOf("movie:2").onChoose(8);
    await flush();
    expect(w.viewOf("movie:2")?.error).toBe(UNREACHABLE_LINE);
    expect(w.viewOf("movie:2")?.choices).toHaveLength(10);
    expect(w.viewOf("movie:1")?.error).toBeUndefined();
  });

  it("an entry whose every ask goes unanswered says so, and unlocks", async () => {
    const w = await arrived(A, B);
    await w.ready();
    w.handlersOf("movie:2").onChoose(8);
    w.state.answer = undefined;
    await w.clock.advance(60000);
    expect(w.viewOf("movie:2")?.error).toBe(UNREACHABLE_LINE);
    expect(w.viewOf("movie:2")?.choices).toHaveLength(10);
    expect(w.viewOf("movie:1")?.error).toBeUndefined();
  });
});

describe("the série confirmation in an entry", () => {
  it("asks first, sends nothing, and Annuler sends nothing", async () => {
    const w = await arrived(SERIE);
    await w.ready();
    w.handlersOf(SERIE.key).onChoose(7);
    expect(w.viewOf(SERIE.key)?.confirm).toBe(true);
    expect(w.viewOf(SERIE.key)?.notice).toBe(chosenLine(7));
    expect(w.viewOf(SERIE.key)?.warning).toBe(SERIES_WARNING);
    await w.ready(); // Ruling F2
    w.handlersOf(SERIE.key).onConfirm(false);
    await flush();
    expect(sendsOf(w.calls)).toEqual([]);
    expect(w.viewOf(SERIE.key)?.confirm).toBeUndefined();
  });

  it("Envoyer sends the chosen rating", async () => {
    const w = await arrived(SERIE);
    await w.ready();
    w.handlersOf(SERIE.key).onChoose(7);
    await w.ready(); // Ruling F2: the confirmation view has its own grace
    w.handlersOf(SERIE.key).onConfirm(true);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 5:1:1 série 7"]);
    expect(w.viewOf(SERIE.key)?.notice).toBe(SENDING_LINE);
  });
});

describe("Ignorer", () => {
  it("Ignorer dismisses the first pending label, locks, then drops the entry", async () => {
    const ep = episodeCard({ pending: ["saison", "série"], at: 500 });
    const w = await arrived(ep, A);
    await w.ready();
    w.handlersOf(ep.key).onAction("ignorer");
    await flush();
    expect(sendsOf(w.calls)).toEqual(["dismiss 5:1:1 saison"]);
    expect(w.viewOf(ep.key)?.notice).toBe(WAIT_LINE);
    w.state.answer = answerOf(A);
    await w.clock.advance(2000);
    expect(w.keys()).toEqual(["movie:1"]);
  });
});

describe("a home entry ignores a click right after it appears", () => {
  it("a choice at 399 ms is ignored, at 400 ms taken", async () => {
    const w = await arrived(A);
    await w.clock.advance(399);
    w.handlersOf("movie:1").onChoose(8);
    w.handlersOf("movie:1").onAction("ignorer");
    await flush();
    expect(sendsOf(w.calls)).toEqual([]);
    await w.clock.advance(1);
    w.handlersOf("movie:1").onChoose(8);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 1:: film 8"]);
  });

  it("the next label of an entry: ignored at 399 ms, taken at 400 ms", async () => {
    const ep = episodeCard({ pending: ["épisode", "saison"], at: 500 });
    const w = await arrived(ep);
    await w.clock.advance(400);
    w.handlersOf(ep.key).onChoose(8);
    w.state.answer = {
      cards: [
        entryOf(
          episodeCard({ pending: ["saison"], given: { épisode: 8 }, at: 500 }),
        ),
      ],
    };
    await w.clock.advance(2000);
    expect(w.viewOf(ep.key)?.heading).toContain("Noter la saison 1");
    await w.clock.advance(399);
    w.handlersOf(ep.key).onChoose(6);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 5:1:1 épisode 8"]);
    await w.clock.advance(1);
    w.handlersOf(ep.key).onChoose(6);
    await flush();
    expect(sendsOf(w.calls)).toEqual([
      "rate 5:1:1 épisode 8",
      "rate 5:1:1 saison 6",
    ]);
  });
});

// Review Focus 4: a card leaves while the cursor is over the row, and the next tile slides under it.
describe("a tile that slides under the cursor after a card leaves", () => {
  // The star of that value on the row's only tile, drawn from what the block showed last.
  function starOnRow(w: Awaited<ReturnType<typeof arrived>>, n: number) {
    const root = new FakeShadow();
    renderRow(new FakeDoc(), root, w.last().view, w.last().handlers);
    const star = descendants(root).find(
      (el: FakeElement) => el.attributes["aria-label"] === `${n} sur 10`,
    );
    if (star === undefined) throw new Error(`no star ${n}`);
    return star;
  }

  it("a trusted click within the grace sends nothing, one after it sends", async () => {
    const w = await arrived(A, B);
    await w.ready();
    w.handlersOf("movie:2").onChoose(8);
    w.state.answer = answerOf(A);
    await w.clock.advance(2000);
    expect(w.keys()).toEqual(["movie:1"]); // the first card left, the second took its place
    starOnRow(w, 6).click(true);
    await w.clock.advance(GRACE_MS - 1);
    starOnRow(w, 6).click(true);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 2:: film 8"]);
    await w.clock.advance(1);
    starOnRow(w, 6).click(true);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 2:: film 8", "rate 1:: film 6"]);
  });
});

const REMOVAL: QuestionOffer = {
  kind: "removal",
  key: "removal:sc:1:2",
  removeFrom: "sc",
  pair: { nakaId: 1, scId: 2 },
  title: "Un titre",
};

describe("the live card of the home block", () => {
  function liveHandlers() {
    const chosen: unknown[] = [];
    return {
      chosen,
      handlers: {
        onChoose: (c: unknown) => chosen.push(c),
        onAction: () => {},
      },
    };
  }
  const liveView = () => questionView(REMOVAL, ["plus-tard"]);

  it("is drawn before the entries", async () => {
    const w = await arrived(A);
    w.block.showLive(REMOVAL.key, liveView(), liveHandlers().handlers);
    expect(w.last().view.live?.key).toBe(REMOVAL.key);
    expect(w.keys()).toEqual(["movie:1"]);
  });

  it("makes the row appear alone, and hideLive takes it down", async () => {
    const w = await arrived();
    expect(w.shown).toHaveLength(0);
    w.block.showLive(REMOVAL.key, liveView(), liveHandlers().handlers);
    expect(w.shown).toHaveLength(1);
    expect(w.last().view.entries).toEqual([]);
    const before = w.hidden();
    w.block.hideLive();
    expect(w.hidden()).toBeGreaterThan(before);
  });

  it("leaving the home path clears it", async () => {
    const w = await arrived(A);
    w.block.showLive(REMOVAL.key, liveView(), liveHandlers().handlers);
    w.block.route("/player");
    w.block.route("/");
    await flush();
    expect(w.last().view.live).toBeUndefined();
  });

  it("a choice reaches the handler only on a trusted click", async () => {
    const w = await arrived();
    const { chosen, handlers } = liveHandlers();
    w.block.showLive(REMOVAL.key, liveView(), handlers);
    const root = new FakeShadow();
    renderRow(new FakeDoc(), root, w.last().view, w.last().handlers);
    const keep = descendants(root).find((el: FakeElement) =>
      el.textContent?.startsWith("Non"),
    );
    if (keep === undefined) throw new Error("no keep button");
    keep.click(false);
    expect(chosen).toEqual([]);
    keep.click(true);
    expect(chosen).toEqual([{ kind: "keep" }]);
  });

  it("when the live card goes, a trusted click within the grace on the next card sends nothing", async () => {
    const w = await arrived(A);
    w.block.showLive(REMOVAL.key, liveView(), liveHandlers().handlers);
    await w.ready();
    w.block.hideLive();
    const root = new FakeShadow();
    renderRow(new FakeDoc(), root, w.last().view, w.last().handlers);
    const star = (n: number) =>
      descendants(root).find(
        (el: FakeElement) => el.attributes["aria-label"] === `${n} sur 10`,
      );
    star(6)?.click(true);
    await flush();
    expect(sendsOf(w.calls)).toEqual([]);
    await w.clock.advance(GRACE_MS);
    star(6)?.click(true);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 1:: film 6"]);
  });
});

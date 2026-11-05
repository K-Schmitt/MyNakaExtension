import { describe, expect, it } from "vitest";
import { wireBlocks } from "../src/content/ui/blocks-wiring";
import type { HomeHandlers } from "../src/content/ui/home-block";
import type { HomeView } from "../src/content/ui/home-view";
import type { RatingHandlers } from "../src/content/ui/rating-render";
import { GRACE_MS } from "../src/content/ui/rating-session";
import type { RatingView } from "../src/content/ui/rating-view";
import type { WorkerPort } from "../src/content/ui/worker-port";
import type { ContentIds } from "../src/core/finish-event";
import type { RatingCard, RatingLabel } from "../src/core/rating-cards";
import type { CardAnswer } from "../src/sw/rating-answers";
import { fakeClock, flush } from "./end-block-fakes";
import { episodeCard } from "./rating-fixtures";

const keyOf = (ids: ContentIds): string =>
  `${ids.contentId}:${ids.season ?? ""}:${ids.episode ?? ""}`;

const E1: ContentIds = { contentId: 5, season: 1, episode: 1 };
const E2: ContentIds = { contentId: 5, season: 1, episode: 2 };
const LAST: ContentIds = { contentId: 5, season: 1, episode: 10 };

const lastEpisode = (over: Partial<RatingCard> = {}) =>
  episodeCard({ key: "tv:5:S1E10", episode: 10, ...over });
const second = (over: Partial<RatingCard> = {}) =>
  episodeCard({ key: "tv:5:S1E2", episode: 2, ...over });

// The real blocks, wired, against a stateful worker (`set` plays its progress) and two fake overlays
// that keep what is drawn now.
function wiringWorld() {
  const clock = fakeClock();
  const calls: string[] = [];
  const answers = new Map<string, CardAnswer>();
  const held = { on: false, release: [] as (() => void)[] };
  const player = {
    drawn: undefined as
      | { view: RatingView; handlers: RatingHandlers }
      | undefined,
  };
  const home = {
    drawn: undefined as { view: HomeView; handlers: HomeHandlers } | undefined,
  };
  const answerOf = (ids: ContentIds): CardAnswer =>
    answers.get(keyOf(ids)) ?? { card: null, pauseFromPercent: 0 };
  const port: WorkerPort = {
    askCard: async (ids) => {
      calls.push(`ask ${keyOf(ids)}`);
      if (held.on) await new Promise<void>((go) => held.release.push(go));
      return answerOf(ids);
    },
    askCards: async () => {
      calls.push("askCards");
      return { cards: [] };
    },
    askQuestions: async () => undefined,
    askRemovalOffer: async () => undefined,
    rate: async (ids, label, rating) => {
      calls.push(`rate ${keyOf(ids)} ${label} ${rating}`);
      return true;
    },
    dismiss: async (ids, label) => {
      calls.push(`dismiss ${keyOf(ids)} ${label}`);
      return true;
    },
    answerQuestion: async () => true,
    answerRemoval: async () => true,
    hideQuestion: async () => true,
  };
  const blocks = wireBlocks({
    port,
    timer: clock.timer,
    playerUi: {
      show: (view, handlers) => {
        player.drawn = { view, handlers };
      },
      hide: () => {
        player.drawn = undefined;
      },
    },
    homeUi: {
      show: (view, handlers) => {
        home.drawn = { view, handlers };
      },
      hide: () => {
        home.drawn = undefined;
      },
    },
    now: () => 1_000_000 + clock.now(),
    titleOf: async () => "Une série",
  });
  const drawn = () => {
    if (player.drawn === undefined) throw new Error("nothing drawn");
    return player.drawn;
  };
  return {
    blocks,
    clock,
    calls,
    player,
    home,
    held,
    drawn,
    set(
      ids: ContentIds,
      card: RatingCard | null,
      sending?: RatingLabel[],
    ): void {
      answers.set(keyOf(ids), {
        card,
        pauseFromPercent: 0,
        ...(sending === undefined ? {} : { sending }),
      });
    },
    sends: () => calls.filter((c) => !c.startsWith("ask")),
    async pause(progress: number): Promise<void> {
      blocks.paused({ currentTime: progress * 1000, duration: 1000, src: "" });
      await flush();
    },
    /** Steps past the grace of a label just drawn, so that a click on it counts. */
    ready: () => clock.advance(GRACE_MS),
    // On the player for these ids, past the pause block's wait after a URL change.
    async play(ids: ContentIds): Promise<void> {
      blocks.urlChanged(ids);
      await clock.advance(5000);
    },
  };
}

describe("one owner for the overlay over the player", () => {
  it("the review's reproduction: the end block keeps the overlay, and gives it back when it closes", async () => {
    const w = wiringWorld();
    await w.play(LAST);
    // 1. The threshold finish told the end block (it asks at +2, +5, +10 s); no card yet. A pause at 81 %.
    w.blocks.finished(LAST);
    await w.clock.advance(1000);
    await w.pause(0.81);
    expect(w.drawn().view.heading).toContain("épisode 10");
    // 2. A 7 on the pause block's view-only card: it asks at +3.4, +6.4, +11.4 s.
    await w.ready();
    w.drawn().handlers.onChoose(7);
    w.set(LAST, null, ["épisode"]);
    await w.clock.advance(3500);
    // 3. The finish made the card, the épisode's rate still runs: at +5 s the end poll finds it.
    w.set(LAST, lastEpisode({ pending: ["épisode", "saison", "série"] }), [
      "épisode",
    ]);
    await w.clock.advance(1000);
    expect(w.drawn().view.heading).toContain("épisode 10");
    // The rate went through: the end block moves on at +7 s; the pause block's own wait ends at +11.4 s.
    await w.clock.advance(500);
    w.set(
      LAST,
      lastEpisode({ pending: ["saison", "série"], given: { épisode: 7 } }),
    );
    await w.clock.advance(5000);
    expect(w.drawn().view.heading).toContain("Noter la saison 1");
    // 4. The saison is rated on what is drawn, once its buttons have settled.
    await w.ready();
    w.drawn().handlers.onChoose(8);
    w.set(
      LAST,
      lastEpisode({ pending: ["série"], given: { épisode: 7, saison: 8 } }),
    );
    await w.clock.advance(2000);
    expect(w.drawn().view.heading).toContain("la série");
    await w.clock.advance(60000);
    expect(w.drawn().view.heading).toContain("la série");
    expect(w.sends()).toEqual([
      "rate 5:1:10 épisode 7",
      "rate 5:1:10 saison 8",
    ]);
    // Closed, the end block leaves the overlay empty, and a pause draws again: endShown is false.
    w.drawn().handlers.onAction("plus-tard");
    expect(w.player.drawn).toBeUndefined();
    w.set(LAST, lastEpisode({ pending: [], given: { épisode: 7, saison: 8 } }));
    await w.pause(0.5);
    expect(w.drawn().view.heading).toContain("épisode 10");
  });

  it("an end block opened while the pause rating was still sent leaves nothing behind once closed", async () => {
    const w = wiringWorld();
    await w.play(LAST);
    w.blocks.finished(LAST);
    await w.clock.advance(1000);
    await w.pause(0.81);
    await w.ready();
    w.drawn().handlers.onChoose(7);
    w.set(LAST, null, ["épisode"]);
    await w.clock.advance(1000);
    // The card exists, the épisode's rate is still running: the pause block waits, the end block opens.
    w.set(
      LAST,
      lastEpisode({ pending: ["saison", "série"], given: { épisode: 7 } }),
      ["épisode"],
    );
    await w.clock.advance(3000);
    expect(w.drawn().view.heading).toContain("Noter la saison 1");
    await w.ready();
    w.drawn().handlers.onAction("plus-tard");
    expect(w.player.drawn).toBeUndefined();
    w.set(
      LAST,
      lastEpisode({ pending: ["saison", "série"], given: { épisode: 7 } }),
    );
    await w.clock.advance(60000);
    expect(w.player.drawn).toBeUndefined();
    expect(w.sends()).toEqual(["rate 5:1:10 épisode 7"]);
  });

  it("an end block opening while a pause block is shown replaces it", async () => {
    const w = wiringWorld();
    await w.play(E1);
    w.set(E1, episodeCard({ pending: [] }));
    await w.pause(0.5);
    const paused = w.drawn().handlers;
    expect(w.drawn().view.heading).toContain("épisode 1");
    w.set(E1, episodeCard({ pending: ["saison"], given: { épisode: 6 } }));
    w.blocks.finished(E1);
    await w.clock.advance(2000);
    expect(w.drawn().view.heading).toContain("Noter la saison 1");
    paused.onChoose(3);
    paused.onAction("fermer");
    await flush();
    expect(w.sends()).toEqual([]);
    expect(w.drawn().view.heading).toContain("Noter la saison 1");
  });
});

describe("leaving the player closes the player's blocks", () => {
  it("player → home closes the end block and its queue, and sends nothing", async () => {
    const w = wiringWorld();
    await w.play(E1);
    w.set(E1, episodeCard());
    w.set(E2, second());
    w.blocks.finished(E1);
    await w.clock.advance(2000);
    w.blocks.finished(E2);
    await w.clock.advance(2000);
    expect(w.drawn().view.heading).toContain("épisode 1");
    w.blocks.urlChanged(undefined);
    w.blocks.pathChanged("/");
    await flush();
    expect(w.player.drawn).toBeUndefined();
    await w.clock.advance(60000);
    expect(w.player.drawn).toBeUndefined();
    expect(w.sends()).toEqual([]);
  });

  it("player → home closes the pause block", async () => {
    const w = wiringWorld();
    await w.play(E1);
    w.set(E1, episodeCard());
    await w.pause(0.5);
    expect(w.drawn().view.heading).toContain("épisode 1");
    w.blocks.urlChanged(undefined);
    expect(w.player.drawn).toBeUndefined();
    await w.clock.advance(60000);
    expect(w.sends()).toEqual([]);
  });

  it("a card the end poll finds after leaving the player opens nothing", async () => {
    const w = wiringWorld();
    await w.play(E1);
    w.blocks.finished(E1);
    await w.clock.advance(1000);
    w.blocks.urlChanged(undefined);
    w.set(E1, episodeCard());
    await w.clock.advance(60000);
    expect(w.player.drawn).toBeUndefined();
  });

  it("autoplay S1E1 → S1E2 keeps the end block on E1", async () => {
    const w = wiringWorld();
    await w.play(E1);
    w.set(E1, episodeCard());
    w.blocks.finished(E1);
    await w.clock.advance(2000);
    w.blocks.urlChanged(E2);
    await w.clock.advance(1000);
    expect(w.drawn().view.heading).toContain("épisode 1");
    w.drawn().handlers.onChoose(6);
    await flush();
    expect(w.sends()).toEqual(["rate 5:1:1 épisode 6"]);
  });

  it("a pause answer arriving after a URL change opens nothing", async () => {
    const w = wiringWorld();
    await w.play(E1);
    w.set(E1, episodeCard());
    w.held.on = true;
    await w.pause(0.5);
    w.blocks.urlChanged(E2);
    w.held.on = false;
    for (const go of w.held.release) go();
    await flush();
    expect(w.player.drawn).toBeUndefined();
  });
});

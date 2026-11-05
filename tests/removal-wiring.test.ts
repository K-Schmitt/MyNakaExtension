import { describe, expect, it } from "vitest";
import { wireBlocks } from "../src/content/ui/blocks-wiring";
import type { QuestionHandlers } from "../src/content/ui/question-render";
import type { QuestionView } from "../src/content/ui/question-view";
import type { RatingHandlers } from "../src/content/ui/rating-render";
import { GRACE_MS } from "../src/content/ui/rating-session";
import type { RatingView } from "../src/content/ui/rating-view";
import type { WorkerPort } from "../src/content/ui/worker-port";
import type { ContentIds } from "../src/core/finish-event";
import type { SyncState } from "../src/core/state";
import { parseRemovalOfferAnswer } from "../src/ext/question-answer-schema";
import type { AnswerRemovalMessage } from "../src/ext/question-messages";
import type { Settings } from "../src/ext/settings";
import type { RemovalOffer } from "../src/sw/question-offers";
import { answerWorld, BOUND, PAIR } from "./answer-world";
import { fakeClock, flush } from "./end-block-fakes";
import { stateWith } from "./question-fixtures";
import { episodeCard } from "./rating-fixtures";

const E1: ContentIds = { contentId: 5, season: 1, episode: 1 };
const REMOVE = "Retirer aussi de vos envies SensCritique";
const OFFER: RemovalOffer = {
  kind: "removal",
  key: "removal:sc:21391:112240873",
  removeFrom: "sc",
  pair: { nakaId: 21391, scId: 112240873 },
  title: "Un Job Mortel",
};

type Removal = Pick<WorkerPort, "askRemovalOffer" | "answerRemoval">;

// The real blocks, wired, over two fake overlays; the removal line to the worker is injected.
function world(removal: Removal) {
  const clock = fakeClock();
  const player = { rating: undefined as RatingView | undefined };
  const asked = {
    drawn: undefined as
      | { view: QuestionView; handlers: QuestionHandlers }
      | undefined,
  };
  const rated: RatingHandlers[] = [];
  const hide = (): void => {
    player.rating = undefined;
    asked.drawn = undefined;
  };
  const port: WorkerPort = {
    askCard: async () => ({ card: episodeCard(), pauseFromPercent: 0 }),
    askCards: async () => ({ cards: [] }),
    askQuestions: async () => undefined,
    rate: async () => true,
    dismiss: async () => true,
    answerQuestion: async () => true,
    hideQuestion: async () => true,
    ...removal,
  };
  const blocks = wireBlocks({
    port,
    timer: clock.timer,
    playerUi: {
      show: (view, handlers) => {
        hide();
        player.rating = view;
        rated.push(handlers);
      },
      showQuestion: (view, handlers) => {
        hide();
        asked.drawn = { view, handlers };
      },
      hide,
    },
    homeUi: { show: () => {}, hide: () => {} },
    now: () => 1_000_000 + clock.now(),
    titleOf: async () => "Une série",
  });
  return { blocks, clock, player, asked };
}

function scripted(offer: RemovalOffer | null = OFFER) {
  const sent: unknown[][] = [];
  const removal: Removal = {
    askRemovalOffer: async () => ({ offer }),
    answerRemoval: async (...args) => {
      sent.push(args);
      return true;
    },
  };
  return { ...world(removal), sent };
}

const clickRemove = async (w: ReturnType<typeof scripted>): Promise<void> => {
  await w.clock.advance(GRACE_MS);
  const handlers = w.asked.drawn?.handlers;
  handlers?.onChoose({ kind: "remove" });
  await flush();
};

describe("the removal block, wired", () => {
  it.each([
    "/",
    "/content/tv/2004",
    "/player?id=21391&type=movie",
    "/playlist",
  ])("shows on %s, not only on the player", async (path) => {
    const w = scripted();
    w.blocks.pathChanged(path);
    w.blocks.removed(21391);
    await flush();
    expect(w.asked.drawn?.view.heading).toContain("Un Job Mortel");
  });

  it("shows nothing without an offer", async () => {
    const w = scripted(null);
    w.blocks.removed(21391);
    await flush();
    expect(w.asked.drawn).toBeUndefined();
  });

  it("an end block opening closes it, and its old buttons send nothing", async () => {
    const w = scripted();
    w.blocks.removed(21391);
    await flush();
    const old = w.asked.drawn?.handlers;
    await w.clock.advance(GRACE_MS);
    w.blocks.urlChanged(E1);
    w.blocks.finished(E1);
    await w.clock.advance(2000);
    expect(w.asked.drawn).toBeUndefined();
    expect(w.player.rating?.heading).toContain("épisode 1");
    old?.onChoose({ kind: "remove" });
    await flush();
    expect(w.sent).toEqual([]);
  });

  it("a pause card opening closes it", async () => {
    const w = scripted();
    w.blocks.removed(21391);
    await flush();
    w.blocks.urlChanged(E1);
    await w.clock.advance(5000);
    w.blocks.paused({ currentTime: 500, duration: 1000, src: "" });
    await flush();
    expect(w.asked.drawn).toBeUndefined();
    expect(w.player.rating?.heading).toContain("épisode 1");
  });

  it("does not draw over a shown end block", async () => {
    const w = scripted();
    w.blocks.urlChanged(E1);
    w.blocks.finished(E1);
    await w.clock.advance(2000);
    expect(w.player.rating).toBeDefined();
    w.blocks.removed(21391);
    await flush();
    expect(w.asked.drawn).toBeUndefined();
    expect(w.player.rating).toBeDefined();
  });

  it("does not draw over a shown pause card", async () => {
    const w = scripted();
    w.blocks.urlChanged(E1);
    await w.clock.advance(5000);
    w.blocks.paused({ currentTime: 500, duration: 1000, src: "" });
    await flush();
    expect(w.player.rating).toBeDefined();
    w.blocks.removed(21391);
    await flush();
    expect(w.asked.drawn).toBeUndefined();
    expect(w.player.rating).toBeDefined();
  });

  it("a click sends one answer-removal for the offer's pair", async () => {
    const w = scripted();
    w.blocks.removed(21391);
    await flush();
    await clickRemove(w);
    expect(w.sent).toEqual([["sc", 21391, 112240873, true]]);
  });
});

// Review Focus 1: a page script forges `removed` for a title Naka still lists. The block shows (both
// lists held the pair at the last run); the click reaches the REAL job, which reads « Ma liste » and refuses.
describe("a forged removed event, with the real worker jobs", () => {
  // The real job awaits a store, a tab and two clients: many more ticks than one flush.
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 20; i++) await flush();
  };
  const LIVE: Settings = { mode: "live", binding: BOUND };
  const listedBoth = (): SyncState =>
    stateWith({
      run: 5,
      mapping: [PAIR],
      presence: {
        naka: [{ id: PAIR.nakaId, from: 1, to: 5 }],
        sc: [{ id: PAIR.scId, from: 1, to: 5 }],
      },
    });

  function forged(state: SyncState, playlist: () => number[]) {
    const jobs = answerWorld({ state, settings: LIVE, playlist });
    const removal: Removal = {
      askRemovalOffer: async (contentId) =>
        parseRemovalOfferAnswer(await jobs.jobs.removalOffer(contentId, [])),
      answerRemoval: async (removeFrom, nakaId, scId, remove) => {
        const msg: AnswerRemovalMessage = {
          type: "answer-removal",
          removeFrom,
          nakaId,
          scId,
          remove,
        };
        await jobs.jobs.answerRemoval(msg);
        return true;
      },
    };
    return { jobs, ...world(removal) };
  }

  it("a title still in « Ma liste »: the block shows, the trusted click gets refused, zero writes", async () => {
    const w = forged(listedBoth(), () => [99, PAIR.nakaId]);
    w.blocks.removed(PAIR.nakaId);
    await flush();
    expect(w.asked.drawn?.view.choices.map((c) => c.label)).toContain(REMOVE);
    await w.clock.advance(GRACE_MS);
    w.asked.drawn?.handlers.onChoose({ kind: "remove" });
    await settle();
    expect(w.jobs.writes()).toEqual([]);
    expect(w.jobs.settings().lastAnswer?.outcome).toBe("refused");
  });

  it("a mapped pair never listed on Naka (deferred addition): no block, no job", async () => {
    const state = stateWith({
      run: 5,
      mapping: [PAIR],
      presence: { naka: [], sc: [{ id: PAIR.scId, from: 1, to: 5 }] },
    });
    const w = forged(state, () => [99]);
    w.blocks.removed(PAIR.nakaId);
    await flush();
    expect(w.asked.drawn).toBeUndefined();
    expect(w.jobs.writes()).toEqual([]);
  });

  it("a real removal (Naka no longer lists it): the click unwishes once", async () => {
    const w = forged(listedBoth(), () => [99]);
    w.blocks.removed(PAIR.nakaId);
    await flush();
    await w.clock.advance(GRACE_MS);
    w.asked.drawn?.handlers.onChoose({ kind: "remove" });
    await settle();
    expect(w.jobs.writes()).toEqual([`unwish:${PAIR.scId}`]);
  });
});

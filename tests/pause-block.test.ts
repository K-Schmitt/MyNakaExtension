import { describe, expect, it } from "vitest";
import { createPauseBlock } from "../src/content/ui/pause-block";
import { UNREACHABLE_LINE } from "../src/content/ui/rating-copy";
import type { ContentIds } from "../src/core/finish-event";
import type { RatingCard } from "../src/core/rating-cards";
import type { CardAnswer } from "../src/sw/rating-answers";
import { EP_IDS, FILM_IDS, fakePorts, flush } from "./end-block-fakes";
import { episodeCard, filmCard } from "./rating-fixtures";

const DURATION = 1000;

function asked(card: RatingCard | null, pauseFromPercent = 0, start?: number) {
  const out: CardAnswer = {
    card,
    pauseFromPercent,
    ...(start === undefined ? {} : { start }),
  };
  return out;
}

function world(
  titles: [number, string][] = [
    [5, "Une série"],
    [9, "Un film"],
  ],
) {
  const w = fakePorts();
  let now = 100_000;
  let endShown = false;
  const titleCalls: number[] = [];
  const known = new Map(titles);
  const block = createPauseBlock({
    ...w.ports,
    now: () => now,
    endShown: () => endShown,
    titleOf: async (contentId) => {
      titleCalls.push(contentId);
      return known.get(contentId);
    },
  });
  return {
    ...w,
    block,
    titleCalls,
    setNow: (ms: number) => {
      now = ms;
    },
    setEndShown: (shown: boolean) => {
      endShown = shown;
    },
    async pauseAt(progress: number, ids: ContentIds | null = EP_IDS) {
      block.paused(
        { currentTime: Math.round(progress * DURATION), duration: DURATION },
        ids ?? undefined,
      );
      await flush();
    },
  };
}

describe("the pause block thresholds", () => {
  it("shows at the pause-from percent and not below it", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard(), 50));
    await w.pauseAt(0.49);
    expect(w.shown).toEqual([]);
    w.setNow(110_000);
    await w.pauseAt(0.5);
    expect(w.shown).toHaveLength(1);
  });

  it("shows below the end zone and not at it", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard()));
    await w.pauseAt(0.98);
    expect(w.shown).toEqual([]);
    w.setNow(110_000);
    await w.pauseAt(0.979);
    expect(w.shown).toHaveLength(1);
  });

  it("shows nothing 2999 ms after a URL change", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard()));
    w.block.urlChanged(200_000);
    w.setNow(202_999);
    await w.pauseAt(0.5);
    expect(w.shown).toEqual([]);
  });

  it("shows 3000 ms after a URL change", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard()));
    w.block.urlChanged(200_000);
    w.setNow(203_000);
    await w.pauseAt(0.5);
    expect(w.shown).toHaveLength(1);
  });

  it("ignores a second pause within 1000 ms and takes one at 1000 ms", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard()));
    await w.pauseAt(0.5);
    w.setNow(100_999);
    await w.pauseAt(0.5);
    expect(w.calls.filter((c) => c.startsWith("ask"))).toHaveLength(1);
    w.setNow(101_000);
    await w.pauseAt(0.5);
    expect(w.calls.filter((c) => c.startsWith("ask"))).toHaveLength(2);
  });

  it("a play between two quick pauses lets the second one through", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard()));
    await w.pauseAt(0.5);
    w.block.resumed();
    w.setNow(100_100);
    await w.pauseAt(0.5);
    expect(w.shown).toHaveLength(2);
  });

  it("shows nothing off a player page, and asks nothing", async () => {
    const w = world();
    await w.pauseAt(0.5, null);
    expect(w.calls).toEqual([]);
    expect(w.shown).toEqual([]);
  });

  it("shows nothing while the end block is shown, and asks nothing", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard()));
    w.setEndShown(true);
    await w.pauseAt(0.5);
    expect(w.calls).toEqual([]);
    expect(w.shown).toEqual([]);
  });

  it("shows nothing for a duration that is not a number", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard()));
    w.block.paused({ currentTime: 10, duration: Number.NaN }, EP_IDS);
    w.block.paused({ currentTime: 10, duration: 0 }, EP_IDS);
    await flush();
    expect(w.shown).toEqual([]);
  });

  it("shows nothing when the worker does not answer", async () => {
    const w = world();
    w.script(EP_IDS, undefined);
    await w.pauseAt(0.5);
    expect(w.shown).toEqual([]);
  });
});

describe("the pause block card", () => {
  it("shows the first pending label, with the start", async () => {
    const w = world();
    w.script(
      EP_IDS,
      asked(episodeCard({ pending: ["saison", "série"] }), 0, 7),
    );
    await w.pauseAt(0.5);
    expect(w.last().view.heading).toContain("saison 1");
    expect(w.last().view.start).toBeDefined();
  });

  it("shows the first target of a rated title, without the start", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard({ pending: [] }), 0, 7));
    await w.pauseAt(0.5);
    expect(w.last().view.heading).toContain("épisode 1");
    expect(w.last().view.start).toBeUndefined();
    w.last().handlers.onChoose(8);
    expect(w.calls).toContain("rate 5:1:1 épisode 8");
  });

  it("a card-less episode shows the épisode target and sends rate with the ids", async () => {
    const w = world();
    w.script(EP_IDS, asked(null));
    await w.pauseAt(0.5);
    expect(w.last().view.heading).toContain("Une série");
    expect(w.last().view.heading).toContain("épisode 1");
    w.last().handlers.onChoose(9);
    await flush();
    expect(w.calls).toContain("rate 5:1:1 épisode 9");
    expect(w.titleCalls).toEqual([5]);
  });

  it("a card-less film sends rate with the film label", async () => {
    const w = world();
    w.script(FILM_IDS, asked(null));
    await w.pauseAt(0.5, FILM_IDS);
    expect(w.last().view.heading).toContain("Un film");
    w.last().handlers.onChoose(6);
    await flush();
    expect(w.calls).toContain("rate 9:: film 6");
  });

  it("shows nothing when no title can be read", async () => {
    const w = world([]);
    w.script(EP_IDS, asked(null));
    await w.pauseAt(0.5);
    expect(w.shown).toEqual([]);
  });

  it("does not read a title when there is a card", async () => {
    const w = world();
    w.script(FILM_IDS, asked(filmCard()));
    await w.pauseAt(0.5, FILM_IDS);
    expect(w.titleCalls).toEqual([]);
  });
});

describe("the pause block lifecycle", () => {
  it("a play hides the block", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard()));
    await w.pauseAt(0.5);
    const hidden = w.hidden();
    w.block.resumed();
    expect(w.hidden()).toBe(hidden + 1);
  });

  it("a play before the card arrives shows nothing", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard()));
    w.block.paused({ currentTime: 500, duration: DURATION }, EP_IDS);
    w.block.resumed();
    await flush();
    expect(w.shown).toEqual([]);
  });

  it("the end block shown while the card travels wins", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard()));
    w.block.paused({ currentTime: 500, duration: DURATION }, EP_IDS);
    w.setEndShown(true);
    await flush();
    expect(w.shown).toEqual([]);
  });

  it("Fermer hides the block until the next pause", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard()));
    await w.pauseAt(0.5);
    w.last().handlers.onAction("fermer");
    expect(w.hidden()).toBe(1);
    expect(w.calls.filter((c) => c.startsWith("rate"))).toEqual([]);
    w.setNow(110_000);
    await w.pauseAt(0.5);
    expect(w.shown).toHaveLength(2);
  });

  it("a play while a rating travels leaves the block hidden when the card answers", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard({ pending: ["épisode", "saison"] })));
    await w.pauseAt(0.5);
    w.last().handlers.onChoose(8);
    w.block.resumed();
    w.script(EP_IDS, asked(episodeCard({ pending: ["saison"] })));
    const before = w.shown.length;
    await w.clock.advance(2000);
    expect(w.shown).toHaveLength(before);
  });

  it("shows the unreachable line when the rate does not leave", async () => {
    const w = world();
    w.script(EP_IDS, asked(episodeCard()));
    await w.pauseAt(0.5);
    w.fail.send = true;
    w.last().handlers.onChoose(8);
    await flush();
    expect(w.last().view.error).toBe(UNREACHABLE_LINE);
  });
});

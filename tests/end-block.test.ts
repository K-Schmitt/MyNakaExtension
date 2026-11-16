import { describe, expect, it, vi } from "vitest";
import { createEndBlock } from "../src/content/ui/end-block";
import {
  ambiguityHeading,
  SENDING_LINE as QUESTION_SENDING_LINE,
} from "../src/content/ui/question-copy";
import {
  chosenLine,
  errorLine,
  SENDING_LINE,
  SERIES_WARNING,
  UNREACHABLE_LINE,
  WAIT_LINE,
} from "../src/content/ui/rating-copy";
import type { ContentIds } from "../src/core/finish-event";
import type { RatingCard } from "../src/core/rating-cards";
import type { CardAnswer } from "../src/sw/rating-answers";
import {
  answer,
  asks,
  EP_IDS,
  FILM_IDS,
  fakePorts,
  flush,
  OTHER_IDS,
  QUESTION,
  questionAnswer,
} from "./end-block-fakes";
import { episodeCard, filmCard } from "./rating-fixtures";

const NOTHING = answer(episodeCard({ pending: [] }));

function world() {
  const w = fakePorts();
  const block = createEndBlock(w.ports);
  return { ...w, block };
}

const toSaison = (over: Partial<RatingCard> = {}) =>
  episodeCard({ pending: ["saison", "série"], ...over });
const toSerie = (over: Partial<RatingCard> = {}) =>
  episodeCard({ pending: ["série"], ...over });

describe("the end block poll", () => {
  it("asks at exactly 2, 5, 10, 20 and 40 seconds, then stops", async () => {
    const w = world();
    w.script(EP_IDS, answer(episodeCard({ pending: [] })));
    w.block.finished(EP_IDS);
    const expected = [
      [1999, 0],
      [1, 1],
      [2999, 1],
      [1, 2],
      [4999, 2],
      [1, 3],
      [9999, 3],
      [1, 4],
      [19999, 4],
      [1, 5],
      [60000, 5],
    ] as const;
    for (const [ms, count] of expected) {
      await w.clock.advance(ms);
      expect(asks(w.calls), `after +${ms}`).toHaveLength(count);
    }
    expect(w.shown).toEqual([]);
  });

  it("stops at the first card with a pending label and shows its first", async () => {
    const w = world();
    w.script(EP_IDS, NOTHING, NOTHING, answer(episodeCard(), 6));
    w.block.finished(EP_IDS);
    await w.clock.advance(10000);
    expect(asks(w.calls)).toHaveLength(3);
    await w.clock.advance(60000);
    expect(asks(w.calls)).toHaveLength(3);
    expect(w.shown).toHaveLength(1);
    expect(w.last().view.heading).toContain("épisode 1");
    expect(w.block.isShown()).toBe(true);
  });

  it("a card without pending at 2 s, pending at 5 s: shown at 5 s", async () => {
    const w = world();
    w.script(EP_IDS, NOTHING, answer(episodeCard()));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    expect(w.shown).toEqual([]);
    await w.clock.advance(2999);
    expect(w.shown).toEqual([]);
    await w.clock.advance(1);
    expect(w.shown).toHaveLength(1);
  });

  it("an unknown card or a failed ask counts as nothing yet", async () => {
    const w = world();
    w.script(EP_IDS, undefined, { card: null, pauseFromPercent: 0 });
    w.block.finished(EP_IDS);
    await w.clock.advance(5000);
    expect(w.shown).toEqual([]);
    expect(asks(w.calls)).toHaveLength(2);
  });

  it("after five empty asks a later finished for the key polls again", async () => {
    const w = world();
    w.script(EP_IDS, NOTHING);
    w.block.finished(EP_IDS);
    await w.clock.advance(40000);
    expect(asks(w.calls)).toHaveLength(5);
    w.script(EP_IDS, answer(episodeCard()));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    expect(asks(w.calls)).toHaveLength(6);
    expect(w.shown).toHaveLength(1);
  });

  it("a key whose card was shown stays seen: no second poll", async () => {
    const w = world();
    w.script(EP_IDS, answer(episodeCard()));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    expect(w.shown).toHaveLength(1);
    w.block.finished(EP_IDS);
    await w.clock.advance(100000);
    expect(asks(w.calls)).toHaveLength(1);
  });

  it("a second finished for the same key adds no poll", async () => {
    const w = world();
    w.script(EP_IDS, NOTHING);
    w.block.finished(EP_IDS);
    await w.clock.advance(3000);
    w.block.finished(EP_IDS);
    await w.clock.advance(100000);
    expect(asks(w.calls)).toHaveLength(5);
  });
});

describe("the end block chain", () => {
  it("épisode rated, saison shown with its start, rated, série shown with the warning", async () => {
    const w = world();
    w.script(EP_IDS, answer(episodeCard()));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    expect(w.last().view.heading).toContain("épisode 1");

    w.script(EP_IDS, answer(toSaison(), 8));
    await w.ready();
    w.last().handlers.onChoose(9);
    await flush();
    expect(w.calls).toContain("rate 5:1:1 épisode 9");
    await w.clock.advance(2000);
    expect(w.last().view.heading).toContain("Noter la saison 1");
    expect(w.last().view.start).toContain("8");
    expect(w.last().view.choices.filter((c) => c.marked)).toEqual([
      { value: 8, marked: true },
    ]);

    w.script(EP_IDS, answer(toSerie(), 7));
    await w.ready();
    w.last().handlers.onChoose(7);
    await flush();
    await w.clock.advance(2000);
    expect(w.calls).toContain("rate 5:1:1 saison 7");
    expect(w.last().view.heading).toContain("la série");
    expect(w.last().view.warning).toBe(SERIES_WARNING);
  });

  it("hides when nothing is pending after a rate, and never rates twice", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    w.script(FILM_IDS, answer(filmCard({ pending: [] })));
    await w.ready();
    w.last().handlers.onChoose(10);
    await flush();
    expect(w.hidden()).toBe(0);
    await w.clock.advance(2000);
    expect(w.hidden()).toBe(1);
    expect(w.block.isShown()).toBe(false);
    expect(w.calls.filter((c) => c.startsWith("rate"))).toHaveLength(1);
  });

  it("shows a failure line when the card says the rate failed", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    const failed = filmCard({
      failed: { label: "film", error: "sc-session", at: 5 },
    });
    w.script(FILM_IDS, answer(failed));
    await w.ready();
    w.last().handlers.onChoose(6);
    await flush();
    await w.clock.advance(2000);
    expect(w.last().view.error).toBeDefined();
    expect(w.block.isShown()).toBe(true);
    // Unlocked again: the next choice goes out.
    await w.ready();
    w.last().handlers.onChoose(6);
    await flush();
    expect(w.calls.filter((c) => c.startsWith("rate"))).toHaveLength(2);
  });

  it("never hides for an unreachable worker: every ask unanswered gives the line, choices unlocked", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    w.script(FILM_IDS, undefined);
    await w.ready();
    w.last().handlers.onChoose(6);
    await flush();
    await w.clock.advance(39999);
    expect(w.last().view.notice).toBe(SENDING_LINE);
    await w.clock.advance(1);
    expect(w.hidden()).toBe(0);
    expect(w.block.isShown()).toBe(true);
    expect(w.last().view.error).toBe(UNREACHABLE_LINE);
    expect(w.last().view.choices).toHaveLength(10);
    expect(w.last().view.notice).toBeUndefined();
  });

  it("a send that failed shows the line at once and unlocks the choices", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    w.fail.send = true;
    await w.ready();
    w.last().handlers.onChoose(6);
    await flush();
    expect(w.last().view.error).toBe(UNREACHABLE_LINE);
    expect(w.last().view.choices).toHaveLength(10);
    expect(w.hidden()).toBe(0);
    w.fail.send = false;
    await w.ready();
    w.last().handlers.onChoose(6);
    await flush();
    expect(w.calls.filter((c) => c.startsWith("rate"))).toHaveLength(2);
  });
});

describe("the end block série confirmation", () => {
  async function serieShown() {
    const w = world();
    w.script(EP_IDS, answer(toSerie(), 7));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    await w.ready();
    return w;
  }

  it("a choice on an unfinished série asks first, in the block, and sends nothing yet", async () => {
    const w = await serieShown();
    const shownBefore = w.shown.length;
    w.last().handlers.onChoose(9);
    await flush();
    expect(w.calls.filter((c) => c.startsWith("rate"))).toEqual([]);
    expect(w.shown).toHaveLength(shownBefore + 1);
    expect(w.last().view.confirm).toBe(true);
    expect(w.last().view.warning).toBe(SERIES_WARNING);
  });

  it("Envoyer sends the chosen rating", async () => {
    const w = await serieShown();
    w.last().handlers.onChoose(9);
    await w.ready(); // the confirmation view has its own grace
    w.last().handlers.onConfirm(true);
    await flush();
    expect(w.calls.filter((c) => c.startsWith("rate"))).toEqual([
      "rate 5:1:1 série 9",
    ]);
  });

  it("Annuler sends nothing and goes back to the choices", async () => {
    const w = await serieShown();
    w.last().handlers.onChoose(9);
    await w.ready();
    w.last().handlers.onConfirm(false);
    await flush();
    await w.clock.advance(10000);
    expect(w.calls.filter((c) => c.startsWith("rate"))).toEqual([]);
    expect(w.last().view.confirm).toBeUndefined();
    expect(w.last().view.choices).toHaveLength(10);
    // The choices work again.
    w.last().handlers.onChoose(4);
    await w.ready();
    w.last().handlers.onConfirm(true);
    await flush();
    expect(w.calls).toContain("rate 5:1:1 série 4");
  });

  it("a finished série asks nothing more", async () => {
    const w = world();
    w.script(EP_IDS, answer(toSerie({ seriesFinished: true })));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    await w.ready();
    w.last().handlers.onChoose(9);
    await flush();
    expect(w.calls).toContain("rate 5:1:1 série 9");
  });
});

describe("the end block lock and manual choice", () => {
  it("locks after the first choice: a double click sends one rate", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    await w.ready();
    const { handlers } = w.last();
    handlers.onChoose(8);
    handlers.onChoose(8);
    await flush();
    await w.clock.advance(1000);
    handlers.onChoose(3);
    await flush();
    expect(w.calls.filter((c) => c.startsWith("rate"))).toEqual([
      "rate 9:: film 8",
    ]);
  });

  it("a manual choice shows that label's view, without the start", async () => {
    const w = world();
    w.script(EP_IDS, answer(toSaison(), 8));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    expect(w.last().view.choices.some((c) => c.value === 8 && c.marked)).toBe(
      true,
    );
    expect(w.last().view.start).toBeDefined();
    w.last().handlers.onOther("série");
    expect(w.last().view.heading).toContain("la série");
    expect(w.last().view.start).toBeUndefined();
    expect(w.last().view.choices.some((c) => c.marked)).toBe(false);
    w.last().handlers.onOther("saison");
    expect(w.last().view.start).toBeDefined();
  });

  it("a manual choice on the série needs the confirmation too", async () => {
    const w = world();
    w.script(EP_IDS, answer(toSaison(), 8));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    await w.ready();
    w.last().handlers.onOther("série");
    await w.ready(); // another label's buttons have their own grace
    w.last().handlers.onChoose(5);
    await flush();
    expect(w.calls.filter((c) => c.startsWith("rate"))).toEqual([]);
    expect(w.last().view.confirm).toBe(true);
  });
});

describe("the end block waits for a manual choice to show", () => {
  it("a label that was not pending moves on when its given rating changes", async () => {
    const w = world();
    const card = toSaison({ pending: ["saison"] });
    const given = toSaison({ pending: ["saison"], given: { épisode: 8 } });
    w.script(EP_IDS, answer(card), answer(card), answer(given));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    await w.ready();
    w.last().handlers.onOther("épisode");
    await w.ready();
    w.last().handlers.onChoose(8);
    await flush();
    await w.clock.advance(2000);
    expect(w.last().view.choices).toEqual([]);
    await w.clock.advance(3000);
    expect(w.last().view.choices).toHaveLength(10);
    expect(w.last().view.heading).toContain("saison");
  });
});

describe("the end block actions", () => {
  it("Plus tard hides and sends no message", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    await w.ready();
    const before = [...w.calls];
    w.last().handlers.onAction("plus-tard");
    await flush();
    await w.clock.advance(60000);
    expect(w.hidden()).toBe(1);
    expect(w.calls).toEqual(before);
    expect(w.block.isShown()).toBe(false);
  });

  it("Ignorer dismisses that label, then shows the next pending one", async () => {
    const w = world();
    w.script(EP_IDS, answer(episodeCard()));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    w.script(EP_IDS, answer(episodeCard({ pending: ["saison"] }), 8));
    await w.ready();
    w.last().handlers.onAction("ignorer");
    await flush();
    expect(w.calls).toContain("dismiss 5:1:1 épisode");
    await w.clock.advance(2000);
    expect(w.last().view.heading).toContain("Noter la saison 1");
  });

  it("Ignorer waits with « Un instant… », not the sending line", async () => {
    const w = world();
    w.script(EP_IDS, answer(episodeCard()));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    await w.ready();
    w.last().handlers.onAction("ignorer");
    await flush();
    expect(w.last().view.notice).toBe(WAIT_LINE);
    expect(w.last().view.choices).toEqual([]);
    await w.clock.advance(2000);
    expect(w.last().view.notice).toBe(WAIT_LINE);
  });

  it("a rating after an Ignorer that came back waits with the sending line again", async () => {
    const w = world();
    const failed = episodeCard({
      failed: { label: "épisode", error: "unavailable", at: 3 },
    });
    w.script(EP_IDS, answer(episodeCard()), answer(failed));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    await w.ready();
    w.last().handlers.onAction("ignorer");
    await w.clock.advance(2000);
    expect(w.last().view.choices).toHaveLength(10);
    await w.ready();
    w.last().handlers.onChoose(5);
    await flush();
    expect(w.last().view.notice).toBe(SENDING_LINE);
  });

  it("a label switch from the view before the click changes nothing while the rating is sent", async () => {
    const w = world();
    w.script(EP_IDS, answer(toSaison({ pending: ["saison"] })));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    await w.ready();
    w.last().handlers.onOther("épisode");
    await w.ready();
    const before = w.last().handlers;
    before.onChoose(8);
    await flush();
    const drawn = w.shown.length;
    before.onOther("saison");
    expect(w.shown).toHaveLength(drawn);
    expect(w.last().view.choices).toEqual([]);
  });

  it("a manual choice of a label that is not pending offers Fermer only", async () => {
    const w = world();
    w.script(EP_IDS, answer(toSaison({ pending: ["saison"] })));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    expect(w.last().view.actions).toEqual(["plus-tard", "ignorer", "fermer"]);
    w.last().handlers.onOther("épisode");
    expect(w.last().view.actions).toEqual(["fermer"]);
    w.last().handlers.onOther("saison");
    expect(w.last().view.actions).toEqual(["plus-tard", "ignorer", "fermer"]);
  });

  it("Ignorer on the last pending label hides", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    w.script(FILM_IDS, answer(filmCard({ pending: [] })));
    await w.ready();
    w.last().handlers.onAction("ignorer");
    await flush();
    await w.clock.advance(2000);
    expect(w.hidden()).toBe(1);
  });
});

describe("the end block with several contents", () => {
  it("a URL change (autoplay) keeps the shown card; the new one waits behind it", async () => {
    const w = world();
    w.script(EP_IDS, answer(episodeCard()));
    w.script(OTHER_IDS, answer(filmCard({ contentId: 7, title: "Suivant" })));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    w.block.finished(OTHER_IDS);
    await w.clock.advance(2000);
    expect(w.shown).toHaveLength(1);
    expect(w.last().view.heading).toContain("Une série");
    expect(w.block.isShown()).toBe(true);

    w.last().handlers.onAction("plus-tard");
    await flush();
    expect(w.last().view.heading).toContain("Suivant");
    expect(w.block.isShown()).toBe(true);
  });

  it("a stale handler of a closed block does nothing", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    await w.ready();
    const { handlers } = w.last();
    handlers.onAction("fermer");
    await flush();
    handlers.onChoose(5);
    await flush();
    expect(w.calls.filter((c) => c.startsWith("rate"))).toEqual([]);
  });
});

describe("the end block and the overlay's other users", () => {
  it("says so just before each card opens, the queued one included", async () => {
    const w = world();
    const drawnAtOpening: number[] = [];
    w.ports.opening = () => {
      drawnAtOpening.push(w.shown.length);
    };
    w.script(EP_IDS, answer(episodeCard()));
    w.script(OTHER_IDS, answer(filmCard({ contentId: 7, title: "Suivant" })));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    expect(drawnAtOpening).toEqual([0]);
    expect(w.shown).toHaveLength(1);
    w.block.finished(OTHER_IDS);
    await w.clock.advance(2000);
    expect(drawnAtOpening).toEqual([0]);
    w.last().handlers.onAction("plus-tard");
    await flush();
    expect(drawnAtOpening).toEqual([0, 1]);
    expect(w.last().view.heading).toContain("Suivant");
  });

  it("leave closes the shown card, drops the queue and the waits, and sends nothing", async () => {
    const w = world();
    w.script(EP_IDS, answer(episodeCard()));
    w.script(OTHER_IDS, answer(filmCard({ contentId: 7 })));
    w.script(FILM_IDS, NOTHING);
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    w.block.finished(OTHER_IDS);
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    w.block.leave();
    expect(w.block.isShown()).toBe(false);
    expect(w.hidden()).toBe(1);
    const asked = asks(w.calls).length;
    w.script(FILM_IDS, answer(filmCard()));
    await w.clock.advance(60000);
    expect(asks(w.calls)).toHaveLength(asked);
    expect(w.shown).toHaveLength(1);
    expect(w.calls.filter((c) => !c.startsWith("ask"))).toEqual([]);
  });

  it("after leave, a later finished for a key that was queued behind a card opens its card", async () => {
    const w = world();
    w.script(EP_IDS, answer(episodeCard()));
    w.script(OTHER_IDS, answer(filmCard({ contentId: 7, title: "Suivant" })));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    w.block.finished(OTHER_IDS);
    await w.clock.advance(2000);
    w.block.leave();
    w.script(OTHER_IDS, answer(filmCard({ contentId: 7, title: "Suivant" })));
    w.block.finished(OTHER_IDS);
    await w.clock.advance(2000);
    expect(w.block.isShown()).toBe(true);
    expect(w.last().view.heading).toContain("Suivant");
  });

  it("after leave, a later finished for a key that was still waiting polls again", async () => {
    const w = world();
    w.script(FILM_IDS, NOTHING);
    w.block.finished(FILM_IDS);
    await w.clock.advance(1000);
    w.block.leave();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    expect(w.block.isShown()).toBe(true);
  });
});

describe("the end block waits for the rating to be sent", () => {
  async function filmSent(...after: Parameters<typeof answer>[0][]) {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    w.script(FILM_IDS, ...after.map((card) => answer(card)));
    await w.ready();
    w.last().handlers.onChoose(7);
    await flush();
    return w;
  }
  const pending = () => filmCard();
  const done = () => filmCard({ pending: [] });

  it("stays locked with the sending line while the label is still pending, then moves on", async () => {
    const w = world();
    w.script(EP_IDS, answer(episodeCard()));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    const same = answer(episodeCard());
    w.script(EP_IDS, same, same, answer(toSaison(), 8));
    await w.ready();
    const { handlers } = w.last();
    handlers.onChoose(7);
    await flush();
    expect(w.last().view.notice).toBe(SENDING_LINE);
    await w.clock.advance(2000);
    expect(w.last().view.notice).toBe(SENDING_LINE);
    expect(w.last().view.choices).toEqual([]);
    handlers.onChoose(3);
    await w.clock.advance(1000);
    handlers.onChoose(4);
    await w.clock.advance(2000);
    expect(w.last().view.notice).toBe(SENDING_LINE);
    await w.clock.advance(5000);
    expect(w.last().view.heading).toContain("Noter la saison 1");
    expect(w.last().view.notice).toBeUndefined();
    expect(w.calls.filter((c) => c.startsWith("rate"))).toEqual([
      "rate 5:1:1 épisode 7",
    ]);
  });

  it("asks again at 2, 5, 10, 20 and 40 seconds from the click", async () => {
    const w = await filmSent(pending());
    const before = asks(w.calls).length;
    for (const [ms, count] of [
      [1999, 0],
      [1, 1],
      [3000, 2],
      [5000, 3],
      [10000, 4],
      [20000, 5],
    ] as const) {
      await w.clock.advance(ms);
      expect(asks(w.calls).length - before, `+${ms}`).toBe(count);
    }
  });

  it("hides when the schedule ends with the label still pending", async () => {
    const w = await filmSent(pending());
    await w.clock.advance(39999);
    expect(w.hidden()).toBe(0);
    await w.clock.advance(1);
    expect(w.hidden()).toBe(1);
    expect(w.block.isShown()).toBe(false);
  });

  it("hides as soon as nothing is pending", async () => {
    const w = await filmSent(pending(), done());
    await w.clock.advance(2000);
    expect(w.hidden()).toBe(0);
    await w.clock.advance(3000);
    expect(w.hidden()).toBe(1);
  });

  it("a new failure at 5 s shows the failure line and unlocks", async () => {
    const failed = filmCard({
      failed: { label: "film", error: "sc-session", at: 9 },
    });
    const w = await filmSent(pending(), failed);
    await w.clock.advance(2000);
    expect(w.last().view.notice).toBe(SENDING_LINE);
    await w.clock.advance(3000);
    expect(w.last().view.error).toBe(errorLine("sc-session"));
    expect(w.last().view.notice).toBeUndefined();
    expect(w.last().view.choices).toHaveLength(10);
  });

  it("an answer without the card is not yet, even with nothing sent: the shown card was real", async () => {
    const w = await filmSent(pending());
    w.script(FILM_IDS, { card: null, pauseFromPercent: 0 });
    await w.clock.advance(2000);
    expect(w.last().view.notice).toBe(SENDING_LINE);
    expect(w.last().view.error).toBeUndefined();
    expect(w.last().view.choices).toEqual([]);
  });

  it("a failure already on the card at the click is not a new one", async () => {
    const w = world();
    const old = filmCard({
      failed: { label: "film", error: "sc-session", at: 1 },
    });
    w.script(FILM_IDS, answer(old));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    await w.ready();
    w.last().handlers.onChoose(7);
    await flush();
    await w.clock.advance(2000);
    expect(w.last().view.notice).toBe(SENDING_LINE);
    expect(w.last().view.choices).toEqual([]);
    expect(w.calls.filter((c) => c.startsWith("rate"))).toHaveLength(1);
  });
});

describe("the end block confirmation line and failing ports", () => {
  it("the série confirmation shows the chosen rating", async () => {
    const w = world();
    w.script(EP_IDS, answer(toSerie(), 7));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    await w.ready();
    w.last().handlers.onChoose(9);
    expect(w.last().view.notice).toBe(chosenLine(9));
    expect(w.last().view.confirm).toBe(true);
  });

  it("asks that reject unlock the block with the unreachable line", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    w.fail.ask = true;
    await w.ready();
    w.last().handlers.onChoose(6);
    await flush();
    await w.clock.advance(40000);
    expect(w.hidden()).toBe(0);
    expect(w.last().view.error).toBe(UNREACHABLE_LINE);
    expect(w.last().view.choices).toHaveLength(10);
  });

  it("a rate that rejects unlocks the block with the unreachable line", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    w.ports.port.rate = async () => {
      throw new Error("port bug");
    };
    await w.ready();
    w.last().handlers.onChoose(6);
    await flush();
    expect(w.last().view.error).toBe(UNREACHABLE_LINE);
    expect(w.last().view.choices).toHaveLength(10);
  });

  it("an ask that rejects while opening a queued card does not break the block", async () => {
    const w = world();
    w.script(EP_IDS, answer(episodeCard()));
    w.script(OTHER_IDS, answer(filmCard({ contentId: 7 })));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    w.block.finished(OTHER_IDS);
    await w.clock.advance(2000);
    w.fail.ask = true;
    w.last().handlers.onAction("plus-tard");
    await flush();
    expect(w.block.isShown()).toBe(false);
    w.fail.ask = false;
    w.block.finished(FILM_IDS);
    w.script(FILM_IDS, answer(filmCard()));
    await w.clock.advance(2000);
    expect(w.block.isShown()).toBe(true);
  });
});

describe("the end block ignores a click right after a label appears", () => {
  const rates = (calls: string[]) => calls.filter((c) => c.startsWith("rate"));

  it("a new block: a choice at 399 ms is ignored, at 400 ms taken", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    await w.clock.advance(399);
    w.last().handlers.onChoose(7);
    await flush();
    expect(rates(w.calls)).toEqual([]);
    expect(w.last().view.choices).toHaveLength(10);
    await w.clock.advance(1);
    w.last().handlers.onChoose(7);
    await flush();
    expect(rates(w.calls)).toEqual(["rate 9:: film 7"]);
  });

  it("a new block: an action at 399 ms is ignored, at 400 ms taken", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2399);
    w.last().handlers.onAction("plus-tard");
    w.last().handlers.onAction("ignorer");
    await flush();
    expect(w.block.isShown()).toBe(true);
    expect(w.calls.filter((c) => c.startsWith("dismiss"))).toEqual([]);
    await w.clock.advance(1);
    w.last().handlers.onAction("plus-tard");
    expect(w.block.isShown()).toBe(false);
  });

  it("the next label of the chain: ignored at 399 ms, taken at 400 ms", async () => {
    const w = world();
    w.script(EP_IDS, answer(episodeCard()));
    w.block.finished(EP_IDS);
    await w.clock.advance(2400);
    w.script(EP_IDS, answer(toSaison({ given: { épisode: 9 } })));
    w.last().handlers.onChoose(9);
    await w.clock.advance(2000);
    expect(w.last().view.heading).toContain("Noter la saison 1");
    await w.clock.advance(399);
    w.last().handlers.onChoose(4);
    await flush();
    expect(rates(w.calls)).toEqual(["rate 5:1:1 épisode 9"]);
    await w.clock.advance(1);
    w.last().handlers.onChoose(4);
    await flush();
    expect(rates(w.calls)).toEqual([
      "rate 5:1:1 épisode 9",
      "rate 5:1:1 saison 4",
    ]);
  });

  it("an unlock after a failure: ignored at 399 ms, taken at 400 ms", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2400);
    const failed = filmCard({
      failed: { label: "film", error: "sc-session", at: 5 },
    });
    w.script(FILM_IDS, answer(failed));
    w.last().handlers.onChoose(6);
    await w.clock.advance(2000);
    expect(w.last().view.error).toBe(errorLine("sc-session"));
    await w.clock.advance(399);
    w.last().handlers.onChoose(6);
    await flush();
    expect(rates(w.calls)).toHaveLength(1);
    await w.clock.advance(1);
    w.last().handlers.onChoose(6);
    await flush();
    expect(rates(w.calls)).toHaveLength(2);
  });

  it("an unlock after an unreachable send: ignored at 399 ms, taken at 400 ms", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2400);
    w.fail.send = true;
    w.last().handlers.onChoose(6);
    await flush();
    expect(w.last().view.error).toBe(UNREACHABLE_LINE);
    w.fail.send = false;
    await w.clock.advance(399);
    w.last().handlers.onChoose(6);
    await flush();
    expect(rates(w.calls)).toHaveLength(1);
    await w.clock.advance(1);
    w.last().handlers.onChoose(6);
    await flush();
    expect(rates(w.calls)).toHaveLength(2);
  });

  it("a confirmation drawn again by a late unlock: ignored at 399 ms, taken at 400 ms", async () => {
    const w = world();
    w.script(EP_IDS, answer(toSerie()));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    await w.ready();
    // The first send hangs, then fails after the card already showed its failure.
    let fail: (error: Error) => void = () => undefined;
    const sends: string[] = [];
    w.ports.port.rate = (_ids, label, rating) => {
      sends.push(`${label} ${rating}`);
      return sends.length === 1
        ? new Promise<boolean>((_ok, ko) => {
            fail = ko;
          })
        : Promise.resolve(true);
    };
    w.last().handlers.onChoose(7);
    await w.ready();
    w.last().handlers.onConfirm(true);
    w.script(
      EP_IDS,
      answer(
        toSerie({ failed: { label: "série", error: "unavailable", at: 4 } }),
      ),
    );
    await w.clock.advance(2000);
    await w.ready();
    w.last().handlers.onChoose(5);
    expect(w.last().view.confirm).toBe(true);
    await w.clock.advance(1000); // the grace of the confirmation view is long spent: only the unlock restarts it
    fail(new Error("gone"));
    await flush();
    expect(w.last().view.error).toBe(UNREACHABLE_LINE);
    expect(w.last().view.confirm).toBe(true);
    await w.clock.advance(399);
    w.last().handlers.onConfirm(true);
    await flush();
    expect(sends).toEqual(["série 7"]);
    await w.clock.advance(1);
    w.last().handlers.onConfirm(true);
    await flush();
    expect(sends).toEqual(["série 7", "série 5"]);
  });

  // The label's buttons are drawn again (owner's decision of 2026-11-05).
  it("a click on « Noter la saison »: a rating at 100 ms is ignored, at 400 ms taken", async () => {
    const w = world();
    w.script(EP_IDS, answer(toSaison()));
    w.block.finished(EP_IDS);
    await w.clock.advance(2400);
    w.last().handlers.onOther("saison");
    await w.clock.advance(100);
    w.last().handlers.onChoose(5);
    await flush();
    expect(rates(w.calls)).toEqual([]);
    await w.clock.advance(300);
    w.last().handlers.onChoose(5);
    await flush();
    expect(rates(w.calls)).toEqual(["rate 5:1:1 saison 5"]);
  });

  // Entering and leaving the série confirmation view draws the buttons again.
  it("Envoyer 100 ms after the confirmation view came is ignored, at 400 ms taken", async () => {
    const w = world();
    w.script(EP_IDS, answer(toSerie(), 7));
    w.block.finished(EP_IDS);
    await w.clock.advance(2400);
    w.last().handlers.onChoose(9);
    await w.clock.advance(100);
    w.last().handlers.onConfirm(true);
    await flush();
    expect(rates(w.calls)).toEqual([]);
    await w.clock.advance(300);
    w.last().handlers.onConfirm(true);
    await flush();
    expect(rates(w.calls)).toEqual(["rate 5:1:1 série 9"]);
  });

  it("a click 100 ms after Annuler brought the choices back is ignored, at 400 ms taken", async () => {
    const w = world();
    w.script(EP_IDS, answer(toSerie(), 7));
    w.block.finished(EP_IDS);
    await w.clock.advance(2400);
    w.last().handlers.onChoose(9);
    await w.clock.advance(400);
    w.last().handlers.onConfirm(false);
    expect(w.last().view.confirm).toBeUndefined();
    await w.clock.advance(100);
    w.last().handlers.onChoose(4);
    expect(w.last().view.confirm).toBeUndefined();
    await w.clock.advance(300);
    w.last().handlers.onChoose(4);
    expect(w.last().view.confirm).toBe(true);
    expect(rates(w.calls)).toEqual([]);
  });

  // A re-send of the same rating that succeeds after a failed one closes the block.
  it("a re-send of a given rating that succeeds after a failed one closes the block", async () => {
    const w = world();
    const failedBefore = toSaison({
      pending: ["saison"],
      given: { épisode: 8 },
      failed: { label: "épisode", error: "sc-session", at: 5 },
    });
    const sentNow = toSaison({ pending: [], given: { épisode: 8 } });
    w.script(EP_IDS, answer(failedBefore), answer(sentNow));
    w.block.finished(EP_IDS);
    await w.clock.advance(2400);
    w.last().handlers.onOther("épisode");
    await w.clock.advance(400);
    w.last().handlers.onChoose(8);
    await flush();
    expect(rates(w.calls)).toEqual(["rate 5:1:1 épisode 8"]);
    const shownBefore = w.shown.length;
    await w.clock.advance(2000);
    expect(w.block.isShown()).toBe(false);
    expect(w.hidden()).toBe(1);
    expect(w.shown).toHaveLength(shownBefore);
  });

  it("a clock set back does not freeze the choices: the grace starts again", async () => {
    const w = world();
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2400);
    let now = w.clock.now() - 3_600_000; // the system clock steps back an hour
    w.ports.now = () => now;
    w.last().handlers.onChoose(6);
    await flush();
    expect(rates(w.calls)).toEqual([]);
    now += 399;
    w.last().handlers.onChoose(6);
    await flush();
    expect(rates(w.calls)).toEqual([]);
    now += 1;
    w.last().handlers.onChoose(6);
    await flush();
    expect(rates(w.calls)).toEqual(["rate 9:: film 6"]);
  });
});

// A film (content 9) waiting on an ambiguity, as the worker answers while no card exists.
const FILM_QUESTION = {
  ...QUESTION,
  key: "ambiguity:naka:9",
  id: 9,
  title: "Un film",
} as const;
const filmQuestion = (over: Partial<CardAnswer> = {}): CardAnswer =>
  questionAnswer({ question: FILM_QUESTION, ...over });
const done = (seq: number): CardAnswer["lastAnswer"] => ({
  seq,
  at: 1,
  target: FILM_QUESTION.key,
  outcome: "done",
});
const answers = (calls: string[]): string[] =>
  calls.filter((c) => c.startsWith("answer"));

describe("the end block asks a question before the rating", () => {
  it("shows the question at 2 s, sends the candidate once, then rates the film", async () => {
    const w = world();
    w.script(
      FILM_IDS,
      filmQuestion(),
      filmQuestion({ questionSending: true }),
      answer(filmCard({ pending: ["film"] })),
    );
    w.block.finished(FILM_IDS);
    await w.clock.advance(1999);
    expect(w.questions).toEqual([]);
    await w.clock.advance(1);
    expect(w.questions).toHaveLength(1);
    expect(w.shown).toEqual([]);
    expect(w.lastQuestion().view.choices.map((c) => c.choice)).toEqual([
      { kind: "candidate", id: 2005 },
      { kind: "candidate", id: 2006 },
      { kind: "none" },
    ]);
    expect(w.lastQuestion().view.actions).toEqual(["plus-tard"]);
    expect(w.block.isShown()).toBe(true);

    await w.ready();
    w.lastQuestion().handlers.onChoose({ kind: "candidate", id: 2005 });
    w.lastQuestion().handlers.onChoose({ kind: "candidate", id: 2006 });
    await flush();
    expect(answers(w.calls)).toEqual(["answer naka 9 2005"]);
    expect(w.lastQuestion().view.notice).toBe(QUESTION_SENDING_LINE);

    await w.clock.advance(2000); // sending: not yet
    expect(w.lastQuestion().view.notice).toBe(QUESTION_SENDING_LINE);
    expect(w.shown).toEqual([]);
    await w.clock.advance(3000); // the question is gone: answered
    expect(w.shown).toEqual([]);
    await w.clock.advance(2000); // the card poll, counted from the answer
    expect(w.shown).toHaveLength(1);
    expect(w.last().view.heading).toContain("Un film");
    expect(w.last().view.choices).toHaveLength(10);
    expect(answers(w.calls)).toEqual(["answer naka 9 2005"]);
  });

  it("a stale last answer on the opening answer is not the click's outcome", async () => {
    const w = world();
    const stale = {
      seq: 3,
      at: 1,
      target: FILM_QUESTION.key,
      outcome: "failed",
      error: "sc-session",
    } as const;
    w.script(
      FILM_IDS,
      filmQuestion({ lastAnswer: stale }),
      filmQuestion({ lastAnswer: stale }),
      filmQuestion({ lastAnswer: stale }),
      { card: null, pauseFromPercent: 0, lastAnswer: done(4) },
      answer(filmCard({ pending: ["film"] })),
    );
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    await w.ready();
    w.lastQuestion().handlers.onChoose({ kind: "candidate", id: 2005 });
    await flush();
    for (const ms of [2000, 3000]) {
      await w.clock.advance(ms);
      expect(w.lastQuestion().view.notice).toBe(QUESTION_SENDING_LINE);
      expect(w.lastQuestion().view.error).toBeUndefined();
      expect(w.lastQuestion().view.choices).toEqual([]);
    }
    await w.clock.advance(5000); // seq 4, done
    expect(w.shown).toEqual([]);
    await w.clock.advance(2000);
    expect(w.shown).toHaveLength(1);
    expect(w.last().view.heading).toContain("Un film");
  });

  it("« Aucun de ceux-là » sends a null choice, then the block hides and no card is awaited", async () => {
    const w = world();
    w.script(
      FILM_IDS,
      filmQuestion(),
      filmQuestion({ questionSending: true }),
      { card: null, pauseFromPercent: 0, lastAnswer: done(1) },
    );
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    expect(w.questions).toHaveLength(1);
    await w.ready();
    w.lastQuestion().handlers.onChoose({ kind: "none" });
    await flush();
    expect(answers(w.calls)).toEqual(["answer naka 9 null"]);
    await w.clock.advance(2000);
    expect(w.block.isShown()).toBe(true);
    await w.clock.advance(3000);
    expect(w.block.isShown()).toBe(false);
    expect(w.hidden()).toBeGreaterThan(0);
    const before = asks(w.calls).length;
    await w.clock.advance(60000);
    expect(asks(w.calls)).toHaveLength(before);
    expect(w.shown).toEqual([]);
  });

  it("« Plus tard » closes the block and sends nothing", async () => {
    const w = world();
    w.script(FILM_IDS, filmQuestion());
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    expect(w.questions).toHaveLength(1);
    await w.ready();
    w.lastQuestion().handlers.onAction("plus-tard");
    expect(w.block.isShown()).toBe(false);
    expect(w.hidden()).toBe(1);
    await w.clock.advance(60000);
    expect(answers(w.calls)).toEqual([]);
    expect(w.shown).toEqual([]);
  });

  it("a card with nothing pending is no question", async () => {
    const w = world();
    w.script(
      FILM_IDS,
      questionAnswer({
        card: filmCard({ pending: [] }),
        question: FILM_QUESTION,
      }),
    );
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    expect(w.questions).toEqual([]);
  });

  it("a second title finishing behind a shown question waits, then opens when it closes", async () => {
    const w = world();
    w.script(FILM_IDS, filmQuestion());
    w.script(OTHER_IDS, answer(filmCard({ key: "movie:7", contentId: 7 })));
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    w.block.finished(OTHER_IDS);
    await w.clock.advance(2000);
    expect(w.questions).toHaveLength(1);
    expect(w.shown).toEqual([]);
    await w.ready();
    w.lastQuestion().handlers.onAction("plus-tard");
    await flush();
    expect(w.shown).toHaveLength(1);
  });

  it("a title that finds a question behind a shown card waits, then asks it when the card closes", async () => {
    const w = world();
    w.script(EP_IDS, answer(episodeCard({ pending: ["épisode"] })));
    w.script(FILM_IDS, filmQuestion());
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    expect(w.shown).toHaveLength(1);
    expect(w.questions).toEqual([]);
    await w.ready();
    w.last().handlers.onAction("plus-tard");
    await flush();
    expect(w.questions).toHaveLength(1);
    expect(w.lastQuestion().view).toMatchObject({
      heading: ambiguityHeading("naka", FILM_QUESTION.title),
    });
  });

  it("leaving the player closes the question", async () => {
    const w = world();
    w.script(FILM_IDS, filmQuestion());
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    expect(w.questions).toHaveLength(1);
    w.block.leave();
    expect(w.block.isShown()).toBe(false);
    expect(w.hidden()).toBe(1);
  });
});

describe("the end block queue", () => {
  // Two cards wait behind a shown one: A on screen, then B and C queued.
  async function queued() {
    const w = world();
    w.script(EP_IDS, answer(episodeCard({ pending: ["épisode"] })));
    w.script(OTHER_IDS, answer(filmCard({ key: "movie:7", contentId: 7 })));
    w.script(FILM_IDS, answer(filmCard()));
    w.block.finished(EP_IDS);
    await w.clock.advance(2000);
    w.block.finished(OTHER_IDS);
    w.block.finished(FILM_IDS);
    await w.clock.advance(2000);
    expect(w.shown).toHaveLength(1);
    return w;
  }

  it("a leave while the next ask is awaited opens no card", async () => {
    const w = await queued();
    const release: (() => void)[] = [];
    const inner = w.ports.port.askCard;
    w.ports.port.askCard = vi.fn(async (ids: ContentIds) => {
      if (ids.contentId === EP_IDS.contentId) return inner(ids);
      await new Promise<void>((go) => release.push(go));
      return answer(filmCard({ key: `movie:${ids.contentId}` }));
    });
    await w.ready();
    w.last().handlers.onChoose(7);
    await flush();
    w.script(
      EP_IDS,
      answer(episodeCard({ pending: [], given: { épisode: 7 } })),
    );
    await w.clock.advance(2000); // the rating went: the card moves on, openNext awaits its ask
    const shownBefore = w.shown.length;
    w.block.leave();
    for (const go of release) go();
    await flush();
    expect(w.shown).toHaveLength(shownBefore);
    expect(w.block.isShown()).toBe(false);
  });

  it("a rejected ask for the first queued title still opens the second", async () => {
    const w = await queued();
    const inner = w.ports.port.askCard;
    let reject = true;
    w.ports.port.askCard = vi.fn(async (ids: ContentIds) => {
      if (reject && ids.contentId === OTHER_IDS.contentId) {
        reject = false;
        throw new Error("rejected");
      }
      return inner(ids);
    });
    await w.ready();
    w.last().handlers.onAction("plus-tard");
    await flush();
    expect(w.shown).toHaveLength(2);
    expect(w.last().view.heading).toContain("Un film");
  });
});

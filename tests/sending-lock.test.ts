import { describe, expect, it } from "vitest";
import { createEndBlock } from "../src/content/ui/end-block";
import { createHomeBlock } from "../src/content/ui/home-block";
import { createPauseBlock } from "../src/content/ui/pause-block";
import { SENDING_LINE } from "../src/content/ui/rating-copy";
import type { RatingCard, RatingLabel } from "../src/core/rating-cards";
import type { CardAnswer, CardsAnswer } from "../src/sw/rating-answers";
import { EP_IDS, fakePorts, flush } from "./end-block-fakes";
import { homeWorld, sendsOf } from "./home-fakes";
import { episodeCard, filmCard } from "./rating-fixtures";

const sendingAnswer = (
  card: RatingCard,
  sending: RatingLabel[],
): CardAnswer => ({ card, pauseFromPercent: 0, sending });

const listOf = (card: RatingCard, sending: RatingLabel[]): CardsAnswer => ({
  cards: [{ card, sending }],
});

describe("the end block with a rating still being sent", () => {
  it("opens locked, with the sending line and no choice, and sends nothing", async () => {
    const w = fakePorts();
    const block = createEndBlock(w.ports);
    w.script(EP_IDS, sendingAnswer(episodeCard(), ["épisode"]));
    block.finished(EP_IDS);
    await w.clock.advance(2000);
    expect(w.last().view.notice).toBe(SENDING_LINE);
    expect(w.last().view.choices).toEqual([]);
    await w.ready();
    w.last().handlers.onChoose(5);
    await flush();
    expect(w.calls.filter((c) => c.startsWith("rate"))).toEqual([]);
  });

  it("a label that is not being sent opens with its choices", async () => {
    const w = fakePorts();
    const block = createEndBlock(w.ports);
    w.script(EP_IDS, sendingAnswer(episodeCard(), ["saison"]));
    block.finished(EP_IDS);
    await w.clock.advance(2000);
    expect(w.last().view.choices).toHaveLength(10);
  });
});

describe("the pause block with a rating still being sent", () => {
  it("opens locked on a label that is being sent", async () => {
    const w = fakePorts();
    const block = createPauseBlock({
      ...w.ports,
      now: () => 100_000,
      endShown: () => false,
      titleOf: async () => "Une série",
    });
    w.script(EP_IDS, sendingAnswer(episodeCard(), ["épisode"]));
    block.paused({ currentTime: 500, duration: 1000 }, EP_IDS);
    await flush();
    expect(w.last().view.notice).toBe(SENDING_LINE);
    expect(w.last().view.choices).toEqual([]);
  });
});

describe("the home panel with a rating still being sent", () => {
  const EP = episodeCard({ pending: ["épisode", "saison"], at: 500 });
  const FILM = filmCard();

  async function arrivedSending() {
    const w = homeWorld();
    const block = createHomeBlock(w.ports);
    w.state.answer = listOf(EP, ["épisode"]);
    block.route("/");
    await flush();
    return { ...w, block };
  }

  it("shows the entry locked on arrival, with no choice and no send", async () => {
    const w = await arrivedSending();
    expect(w.viewOf(EP.key)?.notice).toBe(SENDING_LINE);
    expect(w.viewOf(EP.key)?.choices).toEqual([]);
    w.handlersOf(EP.key).onChoose(7);
    await flush();
    expect(sendsOf(w.calls)).toEqual([]);
  });

  it("leaving and coming back while it is still sent shows it locked again, sending nothing", async () => {
    const w = await arrivedSending();
    w.block.route("/player");
    w.block.route("/");
    await flush();
    expect(w.viewOf(EP.key)?.notice).toBe(SENDING_LINE);
    w.handlersOf(EP.key).onChoose(7);
    await flush();
    expect(sendsOf(w.calls)).toEqual([]);
  });

  it("stays locked while the worker still lists it, even if the card changed", async () => {
    const w = await arrivedSending();
    const rated = episodeCard({
      pending: ["saison"],
      given: { épisode: 7 },
      at: 500,
    });
    w.state.answer = listOf(rated, ["épisode"]);
    await w.clock.advance(2000);
    expect(w.viewOf(EP.key)?.notice).toBe(SENDING_LINE);
  });

  it("moves on once the worker no longer lists it and the card says it was rated", async () => {
    const w = await arrivedSending();
    const rated = episodeCard({
      pending: ["saison"],
      given: { épisode: 7 },
      at: 500,
    });
    w.state.answer = { cards: [{ card: rated }] };
    await w.clock.advance(2000);
    expect(w.viewOf(EP.key)?.heading).toContain("Noter la saison 1");
    expect(w.viewOf(EP.key)?.choices).toHaveLength(10);
  });

  it("an entry moved on to a label that is being sent is locked again", async () => {
    const w = await arrivedSending();
    const rated = episodeCard({
      pending: ["saison"],
      given: { épisode: 7 },
      at: 500,
    });
    w.state.answer = listOf(rated, ["saison"]);
    await w.clock.advance(2000);
    expect(w.viewOf(EP.key)?.notice).toBe(SENDING_LINE);
    expect(w.viewOf(EP.key)?.heading).toContain("Noter la saison 1");
  });

  it("another entry that is not being sent stays usable", async () => {
    const w = homeWorld();
    const block = createHomeBlock(w.ports);
    w.state.answer = {
      cards: [{ card: EP, sending: ["épisode"] }, { card: FILM }],
    };
    block.route("/");
    await flush();
    await w.ready();
    w.handlersOf(FILM.key).onChoose(6);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 9:: film 6"]);
  });
});

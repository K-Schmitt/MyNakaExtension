import { describe, expect, it } from "vitest";
import { createHomeBlock } from "../src/content/ui/home-block";
import { SENDING_LINE, UNKNOWN_TITLE } from "../src/content/ui/question-copy";
import type { RatingCard } from "../src/core/rating-cards";
import type {
  AmbiguityOffer,
  OpenQuestionsAnswer,
  RemovalOffer,
} from "../src/sw/question-offers";
import { flush } from "./end-block-fakes";
import {
  answerOf,
  asksOf,
  homeWorld,
  questionAsksOf,
  questionsOf,
  sendsOf,
} from "./home-fakes";
import { filmCard } from "./rating-fixtures";

const NB = "\u202F";
const film = (id: number, at: number): RatingCard =>
  filmCard({ key: `movie:${id}`, contentId: id, title: `Film ${id}`, at });
const A = film(1, 100);
const B = film(2, 300);

const REMOVAL: RemovalOffer = {
  kind: "removal",
  key: "removal:naka:21391:112240873",
  removeFrom: "naka",
  pair: { nakaId: 21391, scId: 112240873 },
  title: "Un Job Mortel",
};
const AMBIG = (
  id: number,
  over: Partial<AmbiguityOffer> = {},
): AmbiguityOffer => ({
  kind: "ambiguity",
  key: `ambiguity:naka:${id}`,
  side: "naka",
  id,
  title: `Titre ${id}`,
  candidates: [
    { id: id + 1000, title: `Titre ${id}`, year: 2021, type: "film" },
    { id: id + 2000, title: `Titre ${id}`, type: "serie" },
  ],
  ...over,
});
const Q1 = AMBIG(1);
const Q2 = AMBIG(2);

async function arrived(cards: RatingCard[], questions: OpenQuestionsAnswer) {
  const w = homeWorld();
  const block = createHomeBlock(w.ports);
  w.state.answer = answerOf(...cards);
  w.state.questions = questions;
  block.route("/");
  await flush();
  return { ...w, block };
}

describe("the questions of the home row", () => {
  it("shows the row with questions only when no card is to rate", async () => {
    const w = await arrived([], questionsOf(Q1));
    expect(w.shown).toHaveLength(1);
    expect(w.keys()).toEqual([]);
    expect(w.questionKeys()).toEqual([Q1.key]);
  });

  it("shows the cards only when there is no question", async () => {
    const w = await arrived([A, B], questionsOf());
    expect(w.keys()).toEqual(["movie:2", "movie:1"]);
    expect(w.questionKeys()).toEqual([]);
  });

  it("shows nothing when there is neither a card nor a question", async () => {
    const w = await arrived([], questionsOf());
    expect(w.shown).toEqual([]);
  });

  it("asks cards and questions once per arrival; a missing answer from one keeps the other", async () => {
    const w = homeWorld();
    const block = createHomeBlock(w.ports);
    w.state.answer = answerOf(A);
    block.route("/");
    await flush();
    expect(asksOf(w.calls)).toHaveLength(1);
    expect(questionAsksOf(w.calls)).toHaveLength(1);
    expect(w.keys()).toEqual(["movie:1"]);
    expect(w.questionKeys()).toEqual([]);
  });

  it("a removal removeFrom « naka » shows its heading, its question and its two buttons", async () => {
    const w = await arrived([], questionsOf(REMOVAL));
    const view = w.questionViewOf(REMOVAL.key);
    expect(view?.heading).toBe(
      `«${NB}Un Job Mortel${NB}» a quitté tes envies SensCritique.`,
    );
    expect(view?.question).toBe(`Retirer aussi de Ma liste Naka${NB}?`);
    expect(view?.choices.map((c) => c.label)).toEqual([
      "Retirer aussi de Ma liste Naka",
      "Non",
    ]);
    expect(view?.actions).toEqual(["ecarter"]);
  });

  it("an ambiguity shows its candidates and offers « Écarter » only", async () => {
    const w = await arrived([], questionsOf(Q1));
    const view = w.questionViewOf(Q1.key);
    expect(view?.choices).toHaveLength(3);
    expect(view?.actions).toEqual(["ecarter"]);
  });
});

describe("answers from the row", () => {
  it("« Retirer… » sends answer-removal with its removeFrom, once", async () => {
    const w = await arrived([], questionsOf(REMOVAL));
    await w.ready();
    const h = w.questionHandlersOf(REMOVAL.key);
    h.onChoose({ kind: "remove" });
    h.onChoose({ kind: "remove" });
    await flush();
    expect(sendsOf(w.calls)).toEqual([
      "answer-removal naka 21391 112240873 true",
    ]);
    expect(w.questionViewOf(REMOVAL.key)?.notice).toBe(SENDING_LINE);
  });

  it("« Non » sends answer-removal with remove false", async () => {
    const w = await arrived([], questionsOf(REMOVAL));
    await w.ready();
    w.questionHandlersOf(REMOVAL.key).onChoose({ kind: "keep" });
    await flush();
    expect(sendsOf(w.calls)).toEqual([
      "answer-removal naka 21391 112240873 false",
    ]);
  });

  it("a candidate sends answer-question with the side, the id and the choice", async () => {
    const w = await arrived([], questionsOf(Q1));
    await w.ready();
    w.questionHandlersOf(Q1.key).onChoose({ kind: "candidate", id: 1001 });
    await flush();
    expect(sendsOf(w.calls)).toEqual(["answer-question naka 1 1001"]);
  });

  it("« Aucun de ceux-là » sends answer-question with a null choice", async () => {
    const w = await arrived([], questionsOf(Q1));
    await w.ready();
    w.questionHandlersOf(Q1.key).onChoose({ kind: "none" });
    await flush();
    expect(sendsOf(w.calls)).toEqual(["answer-question naka 1 null"]);
  });

  it("« Écarter » sends hide-question once and the entry leaves", async () => {
    const w = await arrived([], questionsOf(Q1, Q2));
    await w.ready();
    const h = w.questionHandlersOf(Q1.key);
    h.onAction("ecarter");
    h.onAction("ecarter");
    await flush();
    expect(sendsOf(w.calls)).toEqual([`hide-question ${Q1.key}`]);
    expect(w.questionKeys()).toEqual([Q2.key]);
  });

  it("a key in `answering` stays locked through the 40 s schedule", async () => {
    const w = await arrived([], questionsOf(Q1, Q2));
    await w.ready();
    w.state.questions = { questions: [Q1, Q2], answering: [Q1.key] };
    const h = w.questionHandlersOf(Q1.key);
    h.onChoose({ kind: "candidate", id: 1001 });
    await w.clock.advance(39999);
    expect(w.questionKeys()).toEqual([Q1.key, Q2.key]);
    expect(w.questionViewOf(Q1.key)?.notice).toBe(SENDING_LINE);
    expect(w.questionViewOf(Q1.key)?.choices).toEqual([]);
    h.onChoose({ kind: "candidate", id: 1002 });
    await flush();
    expect(sendsOf(w.calls)).toEqual(["answer-question naka 1 1001"]);
  });

  it("an answered question leaves at the re-ask that no longer lists it", async () => {
    const w = await arrived([], questionsOf(Q1, Q2));
    await w.ready();
    w.questionHandlersOf(Q1.key).onChoose({ kind: "candidate", id: 1001 });
    w.state.questions = questionsOf(Q2);
    await w.clock.advance(2000);
    expect(w.questionKeys()).toEqual([Q2.key]);
  });
});

describe("the title of an offer", () => {
  it("an untitled removal gets its title from titleOf(21391)", async () => {
    const w = homeWorld();
    w.state.titles.set(21391, "Un Job Mortel");
    w.state.questions = questionsOf({ ...REMOVAL, title: "" });
    createHomeBlock(w.ports).route("/");
    await flush();
    expect(w.calls).toContain("titleOf 21391");
    expect(w.questionViewOf(REMOVAL.key)?.heading).toContain(
      `«${NB}Un Job Mortel${NB}»`,
    );
  });

  it("an untitled removal with no title found says « (titre inconnu) »", async () => {
    const w = homeWorld();
    w.state.questions = questionsOf({ ...REMOVAL, title: "" });
    createHomeBlock(w.ports).route("/");
    await flush();
    expect(w.questionViewOf(REMOVAL.key)?.heading).toContain(UNKNOWN_TITLE);
  });

  it("a titled removal reads nothing", async () => {
    const w = await arrived([], questionsOf(REMOVAL));
    expect(w.calls.filter((c) => c.startsWith("titleOf"))).toEqual([]);
  });

  it("an untitled naka-side ambiguity gets titleOf(id)", async () => {
    const w = homeWorld();
    w.state.titles.set(1, "Dune");
    w.state.questions = questionsOf(AMBIG(1, { title: "" }));
    createHomeBlock(w.ports).route("/");
    await flush();
    expect(w.calls).toContain("titleOf 1");
    expect(w.questionViewOf(Q1.key)?.heading).toContain(`«${NB}Dune${NB}»`);
  });

  it("an untitled sc-side ambiguity reads nothing and says « (titre inconnu) »", async () => {
    const w = homeWorld();
    const sc = AMBIG(7, { side: "sc", title: "" });
    w.state.questions = questionsOf(sc);
    createHomeBlock(w.ports).route("/");
    await flush();
    expect(w.calls.filter((c) => c.startsWith("titleOf"))).toEqual([]);
    expect(w.questionViewOf(sc.key)?.heading).toContain(UNKNOWN_TITLE);
  });

  it("a lookup that throws still shows the question, untitled", async () => {
    const w = homeWorld();
    w.ports.titleOf = async () => {
      throw new Error("tab gone");
    };
    w.state.questions = questionsOf({ ...REMOVAL, title: "" });
    createHomeBlock(w.ports).route("/");
    await flush();
    expect(w.questionViewOf(REMOVAL.key)?.heading).toContain(UNKNOWN_TITLE);
  });
});

describe("leaving the home path", () => {
  it("hides everything, and the old handlers send nothing", async () => {
    const w = await arrived([A], questionsOf(Q1));
    await w.ready();
    const h = w.questionHandlersOf(Q1.key);
    const before = w.hidden();
    w.block.route("/player");
    expect(w.hidden()).toBeGreaterThan(before);
    h.onChoose({ kind: "none" });
    h.onAction("ecarter");
    await flush();
    expect(sendsOf(w.calls)).toEqual([]);
  });

  it("an answer that comes after leaving shows nothing", async () => {
    const w = homeWorld();
    const block = createHomeBlock(w.ports);
    w.state.questions = questionsOf({ ...REMOVAL, title: "" });
    block.route("/");
    block.route("/player");
    await flush();
    expect(w.shown).toEqual([]);
  });
});

describe("a fresh grace for the entries that remain", () => {
  async function ratingsMoved() {
    const w = await arrived([A, B], questionsOf());
    await w.ready();
    w.handlersOf("movie:2").onChoose(7);
    await flush();
    w.state.answer = answerOf(A);
    await w.clock.advance(2000);
    expect(w.keys()).toEqual(["movie:1"]);
    return w;
  }

  it("a rating entry that moves up: a click at 100 ms sends nothing, 400 ms after the redraw is taken", async () => {
    const w = await ratingsMoved();
    await w.clock.advance(100);
    w.handlersOf("movie:1").onChoose(7);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 2:: film 7"]);
    await w.clock.advance(300);
    w.handlersOf("movie:1").onChoose(7);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 2:: film 7", "rate 1:: film 7"]);
  });

  it("a question entry that moves up: a click at 100 ms sends nothing, 400 ms after the redraw is taken", async () => {
    const w = await arrived([], questionsOf(Q1, Q2));
    await w.ready();
    w.questionHandlersOf(Q1.key).onAction("ecarter");
    await flush();
    expect(w.questionKeys()).toEqual([Q2.key]);
    await w.clock.advance(100);
    w.questionHandlersOf(Q2.key).onChoose({ kind: "none" });
    await flush();
    expect(sendsOf(w.calls)).toEqual([`hide-question ${Q1.key}`]);
    await w.clock.advance(300);
    w.questionHandlersOf(Q2.key).onChoose({ kind: "none" });
    await flush();
    expect(sendsOf(w.calls)).toEqual([
      `hide-question ${Q1.key}`,
      "answer-question naka 2 null",
    ]);
  });

  it("a rating entry leaving gives the questions a fresh grace too", async () => {
    const w = await arrived([A], questionsOf(Q1));
    await w.ready();
    w.handlersOf("movie:1").onAction("ignorer");
    w.state.answer = answerOf();
    await w.clock.advance(2000);
    expect(w.keys()).toEqual([]);
    await w.clock.advance(100);
    w.questionHandlersOf(Q1.key).onChoose({ kind: "none" });
    await flush();
    expect(sendsOf(w.calls)).toEqual(["dismiss 1:: film"]);
    await w.clock.advance(300);
    w.questionHandlersOf(Q1.key).onChoose({ kind: "none" });
    await flush();
    expect(sendsOf(w.calls)).toEqual([
      "dismiss 1:: film",
      "answer-question naka 1 null",
    ]);
  });

  it("a question leaving gives the ratings a fresh grace too", async () => {
    const w = await arrived([A], questionsOf(Q1));
    await w.ready();
    w.questionHandlersOf(Q1.key).onAction("ecarter");
    await flush();
    await w.clock.advance(100);
    w.handlersOf("movie:1").onChoose(7);
    await flush();
    expect(sendsOf(w.calls)).toEqual([`hide-question ${Q1.key}`]);
    await w.clock.advance(300);
    w.handlersOf("movie:1").onChoose(7);
    await flush();
    expect(sendsOf(w.calls)).toEqual([
      `hide-question ${Q1.key}`,
      "rate 1:: film 7",
    ]);
  });
});

describe("an entry that redraws gives every other entry a fresh grace", () => {
  it("a rating entry locking: a click on its neighbour at 100 ms sends nothing, 400 ms after is taken", async () => {
    const w = await arrived([A, B], questionsOf());
    await w.ready();
    w.handlersOf("movie:2").onChoose(7); // locks: the entry shrinks, the row shifts
    await flush();
    await w.clock.advance(100);
    w.handlersOf("movie:1").onChoose(7);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 2:: film 7"]);
    await w.clock.advance(300);
    w.handlersOf("movie:1").onChoose(7);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 2:: film 7", "rate 1:: film 7"]);
  });

  it("a question entry locking: the rating above it has a fresh grace", async () => {
    const w = await arrived([A], questionsOf(Q1));
    await w.ready();
    w.questionHandlersOf(Q1.key).onChoose({ kind: "none" });
    await flush();
    await w.clock.advance(100);
    w.handlersOf("movie:1").onChoose(7);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["answer-question naka 1 null"]);
    await w.clock.advance(300);
    w.handlersOf("movie:1").onChoose(7);
    await flush();
    expect(sendsOf(w.calls)).toEqual([
      "answer-question naka 1 null",
      "rate 1:: film 7",
    ]);
  });

  it("a rating entry locking: the question below it has a fresh grace", async () => {
    const w = await arrived([A], questionsOf(Q1));
    await w.ready();
    w.handlersOf("movie:1").onChoose(7);
    await flush();
    await w.clock.advance(100);
    w.questionHandlersOf(Q1.key).onChoose({ kind: "none" });
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 1:: film 7"]);
    await w.clock.advance(300);
    w.questionHandlersOf(Q1.key).onChoose({ kind: "none" });
    await flush();
    expect(sendsOf(w.calls)).toEqual([
      "rate 1:: film 7",
      "answer-question naka 1 null",
    ]);
  });

  it("an entry unlocking (the worker is unreachable): its neighbour has a fresh grace", async () => {
    const w = await arrived([A, B], questionsOf());
    await w.ready();
    w.handlersOf("movie:2").onChoose(7);
    w.state.answer = undefined; // no answer at all until the schedule is spent, at 40 s
    await w.clock.advance(40000);
    expect(w.viewOf("movie:2")?.choices).toHaveLength(10);
    await w.clock.advance(100);
    w.handlersOf("movie:1").onChoose(7);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 2:: film 7"]);
    await w.clock.advance(300);
    w.handlersOf("movie:1").onChoose(7);
    await flush();
    expect(sendsOf(w.calls)).toEqual(["rate 2:: film 7", "rate 1:: film 7"]);
  });
});

describe("a question the worker is answering", () => {
  it("a re-arrival opens it locked, with no button; a click sends nothing; it leaves once answered", async () => {
    const w = await arrived([], { questions: [Q1], answering: [Q1.key] });
    await w.ready();
    const view = w.questionViewOf(Q1.key);
    expect(view?.notice).toBe(SENDING_LINE);
    expect(view?.choices).toEqual([]);
    expect(view?.actions).toEqual([]);
    w.questionHandlersOf(Q1.key).onChoose({ kind: "none" });
    w.questionHandlersOf(Q1.key).onAction("ecarter");
    await flush();
    expect(sendsOf(w.calls)).toEqual([]);
    w.state.questions = questionsOf();
    const before = w.hidden();
    await w.clock.advance(2000);
    expect(w.hidden()).toBeGreaterThan(before); // the row is empty: it is hidden
  });

  it("stays locked while answering, whatever an older answer of the same key says, and again on a re-arrival after the schedule", async () => {
    const stale = {
      seq: 6,
      at: 1,
      target: Q1.key,
      outcome: "done" as const,
    };
    const w = await arrived([], questionsOf(Q1));
    await w.ready();
    w.state.questions = {
      questions: [Q1],
      answering: [Q1.key],
      lastAnswer: stale,
    };
    w.questionHandlersOf(Q1.key).onChoose({ kind: "candidate", id: 1001 });
    const hidden = w.hidden();
    await w.clock.advance(39999);
    expect(w.hidden()).toBe(hidden); // the row is still drawn: the older answer closed nothing
    expect(w.questionKeys()).toEqual([Q1.key]);
    expect(w.questionViewOf(Q1.key)?.notice).toBe(SENDING_LINE);
    await w.clock.advance(5001); // the schedule is spent: the entry hides, the job is queued
    w.block.route("/player");
    w.block.route("/");
    await flush();
    expect(w.questionViewOf(Q1.key)?.notice).toBe(SENDING_LINE);
    expect(w.questionViewOf(Q1.key)?.choices).toEqual([]);
    expect(sendsOf(w.calls)).toEqual(["answer-question naka 1 1001"]);
  });
});

describe("a title lookup that never answers", () => {
  it("is given up after 2 s: the cards are shown, the question says « (titre inconnu) »", async () => {
    const w = homeWorld();
    w.ports.titleOf = () => new Promise<string | undefined>(() => {});
    w.state.answer = answerOf(A);
    w.state.questions = questionsOf({ ...REMOVAL, title: "" });
    createHomeBlock(w.ports).route("/");
    await flush(); // the lookup starts at 0
    await w.clock.advance(1999);
    expect(w.shown).toEqual([]);
    await w.clock.advance(1);
    expect(w.keys()).toEqual(["movie:1"]);
    expect(w.questionViewOf(REMOVAL.key)?.heading).toContain(UNKNOWN_TITLE);
  });

  it("a lookup that answers in time is kept, and its timer is cleared", async () => {
    const w = homeWorld();
    w.state.titles.set(21391, "Un Job Mortel");
    w.state.questions = questionsOf({ ...REMOVAL, title: "" });
    createHomeBlock(w.ports).route("/");
    await flush();
    expect(w.questionViewOf(REMOVAL.key)?.heading).toContain("Un Job Mortel");
    expect(w.clock.count()).toBe(0);
  });
});

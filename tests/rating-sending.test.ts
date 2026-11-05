import { describe, expect, it } from "vitest";
import { createJobQueue } from "../src/sw/job-queue";
import type { Jobs } from "../src/sw/jobs";
import { createRouter } from "../src/sw/router";

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const PLAYER = "https://naka.cx/player?id=3&type=movie";
const NAKA_TAB = { id: EXT, url: PLAYER, frameId: 0, tab: { url: PLAYER } };
const STATUS_URL = `chrome-extension://${EXT}/status.html`;
const STATUS_PAGE = { id: EXT, url: STATUS_URL, tab: { url: STATUS_URL } };

const RATE = { type: "rate", contentId: 3, label: "film", rating: 7 };
const CARD = { type: "rating-card", contentId: 3 };
const SERIE_IDS = { contentId: 5, season: 1, episode: 1 };

const filmCard = {
  key: "movie:3",
  contentId: 3,
  title: "Un film",
  at: 1,
  targets: [{ label: "film", productId: 1, current: null }],
  pending: ["film"],
  given: {},
  seriesFinished: false,
};
const serieCard = {
  ...filmCard,
  key: "tv:5:S1E1",
  contentId: 5,
  season: 1,
  episode: 1,
  targets: [
    { label: "épisode", productId: 1, current: null },
    { label: "saison", productId: 2, current: null },
    { label: "série", productId: 3, current: null },
  ],
  pending: ["épisode", "saison", "série"],
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

function latch() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

type Answer = { sending?: string[]; cards?: { sending?: string[] }[] };

// A router whose reads return fixed cards; a sync holds the queue until `sync.open()`.
async function world(rate?: Jobs["rate"]) {
  const sync = latch();
  const answers: unknown[] = [];
  const jobs = {
    syncJob: async () => {
      await sync.opened;
    },
    rate: rate ?? (async () => undefined),
    ratingCard: async () => ({
      card: structuredClone(filmCard),
      pauseFromPercent: 0,
    }),
    ratingCards: async () => ({
      cards: [filmCard, serieCard].map((c) => ({ card: structuredClone(c) })),
    }),
  } as unknown as Jobs;
  const router = createRouter({
    extensionId: EXT,
    queue: createJobQueue(),
    jobs,
    timer: { set: () => 0, clear: () => undefined },
    now: () => 0,
  });
  const send = (msg: object, sender: object = NAKA_TAB) =>
    router.handle(msg, sender, (answer) => answers.push(answer));
  const ask = async (msg: object): Promise<Answer> => {
    const before = answers.length;
    send(msg);
    await settle();
    return answers[before] as Answer;
  };
  send({ type: "resync" }, STATUS_PAGE);
  await settle();
  return { send, ask, sync };
}

describe("router: the ratings still being sent are reported", () => {
  it("lists a rate held behind a running sync, in both answers, in target order", async () => {
    const w = await world();
    w.send(RATE);
    w.send({ ...RATE, ...SERIE_IDS, label: "série" });
    w.send({ ...RATE, ...SERIE_IDS, label: "épisode" });
    expect((await w.ask(CARD)).sending).toEqual(["film"]);
    const cards = (await w.ask({ type: "rating-cards" })).cards;
    expect(cards?.[0]?.sending).toEqual(["film"]);
    expect(cards?.[1]?.sending).toEqual(["épisode", "série"]);
    w.sync.open();
    await settle();
  });

  it("omits the field when nothing is being sent", async () => {
    const w = await world();
    expect("sending" in (await w.ask(CARD))).toBe(false);
    const cards = (await w.ask({ type: "rating-cards" })).cards;
    expect(cards?.every((c) => !("sending" in c))).toBe(true);
    w.sync.open();
    await settle();
  });

  it("keeps listing the label while its rate job runs, and drops it when it ends", async () => {
    const run = latch();
    const w = await world(async () => {
      await run.opened;
    });
    w.send(RATE);
    w.sync.open();
    await settle();
    expect((await w.ask(CARD)).sending).toEqual(["film"]);
    run.open();
    await settle();
    expect("sending" in (await w.ask(CARD))).toBe(false);
  });

  it("stops listing it after a rate job that rejected", async () => {
    const w = await world(async () => {
      throw new Error("rejected");
    });
    w.send(RATE);
    w.sync.open();
    await settle();
    expect("sending" in (await w.ask(CARD))).toBe(false);
  });

  it("a rate replaced while waiting is one listed label", async () => {
    const w = await world();
    w.send(RATE);
    w.send({ ...RATE, rating: 9 });
    expect((await w.ask(CARD)).sending).toEqual(["film"]);
    w.sync.open();
    await settle();
  });

  it("the review's case: asked from 2 s to 40 s behind a long sync, every answer lists it", async () => {
    const w = await world();
    w.send(RATE);
    for (let ask = 0; ask < 5; ask++) {
      expect(
        (await w.ask({ type: "rating-cards" })).cards?.[0]?.sending,
      ).toEqual(["film"]);
    }
    w.sync.open();
    await settle();
  });
});

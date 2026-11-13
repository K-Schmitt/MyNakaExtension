import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FinishedMessage } from "../src/content/playback-tracker";
import { emptyState } from "../src/core/state";
import { MAX_FINISHES_PER_WINDOW } from "../src/ext/finish-window";
import { type Mode, parseSettings } from "../src/ext/settings";
import { createStore } from "../src/ext/store";
import { createNakaClient } from "../src/naka/naka-client";
import type { Fetch } from "../src/sc/sc-client";
import { toSettingsView } from "../src/status/settings-view";
import { localFormat } from "../src/status/status-format";
import { toStatusView } from "../src/status/status-view";
import { MAX_QUEUED_FINISHES } from "../src/sw/finish-queue";
import { createJobQueue } from "../src/sw/job-queue";
import {
  createJobs,
  type Jobs,
  type StatusSnapshot,
  type Trigger,
} from "../src/sw/jobs";
import type { TabsPort, Timer } from "../src/sw/naka-proxy";
import { createRouter } from "../src/sw/router";
import { PLAYLIST_DEBOUNCE_MS } from "../src/sw/run-throttle";
import { createWorker } from "../src/sw/worker";
import { strings, tabRunning } from "./naka-bridge-fakes";
import { countingLimiter, fakeNaka, fakeSc, memoryArea } from "./sw-fakes";

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const STATUS_URL = `chrome-extension://${EXT}/status.html`;
const PLAYER = "https://naka.cx/player?id=3&type=movie";

const NAKA_TAB = { id: EXT, url: PLAYER, frameId: 0, tab: { url: PLAYER } };
const STATUS_PAGE = { id: EXT, url: STATUS_URL, tab: { url: STATUS_URL } };
const EVIL = {
  id: EXT,
  url: "https://naka.cx.evil.com/",
  frameId: 0,
  tab: { url: "https://naka.cx.evil.com/" },
};
const IFRAME = { ...NAKA_TAB, frameId: 3 };
const OTHER_EXTENSION = { ...NAKA_TAB, id: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" };

const RATE = {
  type: "rate",
  contentId: 3,
  label: "film",
  rating: 7,
};
const DISMISS = { type: "dismiss-rating", contentId: 3, label: "film" };
const CARD = { type: "rating-card", contentId: 3 };
const SETTINGS = {
  type: "set-settings",
  thresholds: { film: 0.95, episode: 0.85 },
  pauseFromPercent: 30,
};
const RATING_MESSAGES: [string, unknown][] = [
  ["a set-settings", SETTINGS],
  ["a rate", RATE],
  ["a dismiss-rating", DISMISS],
  ["a rating-card", CARD],
  ["a rating-cards", { type: "rating-cards" }],
];

const ANSWER = { type: "answer-question", side: "naka", id: 5, choice: 2005 };
const REMOVAL = {
  type: "answer-removal",
  removeFrom: "sc",
  nakaId: 21,
  scId: 1021,
  remove: true,
};
const HIDE = { type: "hide-question", key: "ambiguity:naka:5" };
const SEARCH = { type: "search-titles", side: "naka", query: "cowboy bebop" };
const LINK = { type: "link-title", side: "naka", id: 5, otherId: 2005 };
const REQUEUE = { type: "requeue-question", side: "naka", id: 5 };
const PAGE_MESSAGES: [string, unknown][] = [
  ["a forget-binding", { type: "forget-binding" }],
  ["a reset", { type: "reset" }],
  ["a forget-handled", { type: "forget-handled", contentId: 3 }],
  ["a handled-titles", { type: "handled-titles" }],
  ["a cancel-retry", { type: "cancel-retry", contentId: 3 }],
];
// Ruling 14: every question message, the reads and the answers, is tried from each untrusted sender.
const QUESTION_MESSAGES: [string, unknown][] = [
  ["an open-questions", { type: "open-questions" }],
  ["a removal-offer", { type: "removal-offer", contentId: 3 }],
  ["a page-lists", { type: "page-lists" }],
  ["an answer-question", ANSWER],
  ["an answer-removal", REMOVAL],
  ["a hide-question", HIDE],
  ["a search-titles", SEARCH],
  ["a link-title", LINK],
  ["a requeue-question", REQUEUE],
];

const FINISHED = {
  type: "finished",
  source: "threshold",
  progress: 0.9,
  contentId: 3,
};

function fakeTimer() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 0;
  const timer: Timer = {
    set: (fn, ms) => {
      next += 1;
      pending.set(next, { fn, ms });
      return next;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
  };
  const fire = () => {
    const due = [...pending.values()];
    pending.clear();
    for (const { fn } of due) fn();
  };
  return { timer, pending, fire };
}

function recordingJobs(over: Partial<Jobs> = {}) {
  const calls: string[] = [];
  const snapshot: StatusSnapshot = { mode: "simulation" };
  const jobs: Jobs = {
    syncJob: async (trigger: Trigger) => {
      calls.push(`sync:${trigger}`);
    },
    retryPending: async () => true,
    retryNext: async (since: number) => {
      calls.push(`retry:${since}`);
      return false;
    },
    finishJob: async (msg: FinishedMessage) => {
      calls.push(`finish:${JSON.stringify(msg)}`);
    },
    setMode: async (mode: Mode) => {
      calls.push(`mode:${mode}`);
    },
    setSettings: async (thresholds, pauseFromPercent) => {
      calls.push(
        `settings:${JSON.stringify({ thresholds, pauseFromPercent })}`,
      );
    },
    rate: async (msg) => {
      calls.push(`rate:${JSON.stringify(msg)}`);
    },
    dismissRating: async (msg) => {
      calls.push(`dismiss:${JSON.stringify(msg)}`);
    },
    answerQuestion: async (msg) => {
      calls.push(`answer:${JSON.stringify(msg)}`);
    },
    answerRemoval: async (msg) => {
      calls.push(`removal:${JSON.stringify(msg)}`);
    },
    hideQuestion: async (msg) => {
      calls.push(`hide:${JSON.stringify(msg)}`);
    },
    statusSnapshot: async () => {
      calls.push("status");
      return snapshot;
    },
    ratingCard: async (msg) => {
      calls.push(`card:${JSON.stringify(msg)}`);
      return { card: null, pauseFromPercent: 0 };
    },
    ratingCards: async () => {
      calls.push("cards");
      return { cards: [] };
    },
    openQuestions: async (answering) => {
      calls.push(`open-questions:${JSON.stringify(answering)}`);
      return { questions: [] };
    },
    removalOffer: async (contentId, answering) => {
      calls.push(`removal-offer:${contentId}:${JSON.stringify(answering)}`);
      return { offer: null };
    },
    pageLists: async (answering) => {
      calls.push(`page-lists:${JSON.stringify(answering)}`);
      return { questions: [], unlinked: [] };
    },
    linkTitle: async (msg) => {
      calls.push(`link:${JSON.stringify(msg)}`);
    },
    requeueQuestion: async (msg) => {
      calls.push(`requeue:${JSON.stringify(msg)}`);
    },
    forget: async () => {
      calls.push("forget");
    },
    reset: async () => {
      calls.push("reset");
    },
    forgetHandled: async (msg) => {
      calls.push(`forget-handled:${JSON.stringify(msg)}`);
    },
    forgetHandledFromTab: async (msg) => {
      calls.push(`forget-handled-tab:${JSON.stringify(msg)}`);
    },
    cancelRetry: async (msg) => {
      calls.push(`cancel-retry:${JSON.stringify(msg)}`);
    },
    handledTitles: async (cancelling) => {
      calls.push(`handled-titles:${JSON.stringify(cancelling)}`);
      return {
        titles: [{ key: "movie:3", label: "Trois" }],
        waiting: [],
        cancelling,
      };
    },
    searchTitles: async (msg) => {
      calls.push(`search:${JSON.stringify(msg)}`);
      return { candidates: [] };
    },
    ficheInfo: async (tabId, msg) => {
      calls.push(`fiche-info:${tabId}:${JSON.stringify(msg)}`);
      return { state: "notfound" };
    },
    ficheSeason: async (tabId, msg) => {
      calls.push(`fiche-season:${tabId}:${JSON.stringify(msg)}`);
      return { episodes: [] };
    },
    ficheMine: async (tabId, msg) => {
      calls.push(`fiche-mine:${tabId}:${JSON.stringify(msg)}`);
      return { mine: 6, average: null };
    },
    ficheRate: async (tabId, msg) => {
      calls.push(`fiche-rate:${tabId}:${JSON.stringify(msg)}`);
      return { ok: true };
    },
    ficheLink: async (tabId, msg) => {
      calls.push(`fiche-link:${tabId}:${JSON.stringify(msg)}`);
      return { ok: true };
    },
    dropFicheTab: async (tabId) => {
      calls.push(`drop-fiche-tab:${tabId}`);
    },
    ...over,
  };
  return { jobs, calls, snapshot };
}

const ROUTER_NOW = Date.parse("2026-11-04T12:00:00Z");

function router(over: Partial<Jobs> = {}) {
  const recorded = recordingJobs(over);
  const clock = fakeTimer();
  const answers: unknown[] = [];
  const time = { now: ROUTER_NOW };
  const r = createRouter({
    extensionId: EXT,
    queue: createJobQueue(),
    jobs: recorded.jobs,
    timer: clock.timer,
    now: () => time.now,
  });
  const send = (msg: unknown, sender: object) =>
    r.handle(msg, sender, (answer) => answers.push(answer));
  const dropTab = (tabId: number) => r.dropTab(tabId);
  return { ...recorded, ...clock, answers, send, dropTab, time };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("router: trusted messages become jobs", () => {
  it("naka-ready from the Naka tab starts an automatic sync, unanswered", async () => {
    const r = router();
    expect(r.send({ type: "naka-ready" }, NAKA_TAB)).toBe(false);
    await settle();
    expect(r.calls).toEqual(["sync:naka-ready", `retry:${ROUTER_NOW}`]);
    expect(r.answers).toEqual([]);
  });

  it("playlist-changed is debounced: one sync, 5 s after the last change", async () => {
    const r = router();
    r.send({ type: "playlist-changed" }, NAKA_TAB);
    r.send({ type: "playlist-changed" }, NAKA_TAB);
    r.send({ type: "playlist-changed" }, NAKA_TAB);
    await settle();
    expect(r.calls).toEqual([]);
    expect([...r.pending.values()].map((p) => p.ms)).toEqual([
      PLAYLIST_DEBOUNCE_MS,
    ]);
    r.fire();
    await settle();
    expect(r.calls).toEqual(["sync:playlist", `retry:${ROUTER_NOW}`]);
    r.send({ type: "playlist-changed" }, NAKA_TAB);
    r.fire();
    await settle();
    expect(r.calls).toEqual([
      "sync:playlist",
      `retry:${ROUTER_NOW}`,
      "sync:playlist",
      `retry:${ROUTER_NOW}`,
    ]);
  });

  it("resync from the status page is the button", async () => {
    const r = router();
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toEqual(["sync:button", `retry:${ROUTER_NOW}`]);
  });

  it("a step that answers true queues one more step, each its own job", async () => {
    const answers = [true, true, false];
    const r = router({
      retryNext: async (since: number) => {
        r.calls.push(`retry:${since}`);
        return answers.shift() ?? false;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    r.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toEqual([
      "sync:button",
      `retry:${ROUTER_NOW}`,
      "mode:live",
      `retry:${ROUTER_NOW}`,
      `retry:${ROUTER_NOW}`,
    ]);
  });

  it("a step that answers false queues no other", async () => {
    const r = router();
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    expect(r.calls.filter((c) => c.startsWith("retry:"))).toHaveLength(1);
  });

  // A2: one waiting step, after the last sync, with the earliest time: a sync stamps its run at its
  // start, so the later time alone would miss the first sync's success.
  it("a sync queued while a retry step waits merges them: one step, last, with the earlier time", async () => {
    const r = router();
    r.send({ type: "resync" }, STATUS_PAGE);
    r.time.now = ROUTER_NOW + 60_000;
    r.send({ type: "naka-ready" }, NAKA_TAB);
    r.time.now = ROUTER_NOW + 120_000;
    r.send({ type: "naka-ready" }, NAKA_TAB);
    await settle();
    expect(r.calls).toEqual([
      "sync:button",
      "sync:naka-ready",
      "sync:naka-ready",
      `retry:${ROUTER_NOW}`,
    ]);
  });

  it("a retry step already started is not merged: the next sync queues its own, with its own time", async () => {
    const r = router();
    let release = (): void => {};
    let first = true;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    r.jobs.retryNext = async (since: number) => {
      r.calls.push(`retry:${since}`);
      if (first) {
        first = false;
        await blocked;
      }
      return false;
    };
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    r.time.now = ROUTER_NOW + 60_000;
    r.send({ type: "naka-ready" }, NAKA_TAB);
    release();
    await settle();
    expect(r.calls).toEqual([
      "sync:button",
      `retry:${ROUTER_NOW}`,
      "sync:naka-ready",
      `retry:${ROUTER_NOW + 60_000}`,
    ]);
  });

  it("a chain step queued while a sync's step waits merges with it", async () => {
    const answers = [true, false];
    const r = router({
      retryNext: async (since: number) => {
        r.calls.push(`retry:${since}`);
        const next = answers.shift() ?? false;
        if (next) {
          r.time.now = ROUTER_NOW + 60_000;
          r.send({ type: "naka-ready" }, NAKA_TAB);
        }
        return next;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toEqual([
      "sync:button",
      `retry:${ROUTER_NOW}`,
      "sync:naka-ready",
      `retry:${ROUTER_NOW}`,
    ]);
  });

  it("finished from the Naka tab gives the parsed message to the finish job", async () => {
    const r = router();
    r.send({ ...FINISHED, title: "forged", token: "x" }, NAKA_TAB);
    await settle();
    expect(r.calls).toEqual([`finish:${JSON.stringify(FINISHED)}`]);
  });

  it("set-mode from the status page saves the mode", async () => {
    const r = router();
    r.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toEqual(["mode:live"]);
  });

  it("set-settings from the status page becomes a settings job with the parsed values, unanswered", async () => {
    const r = router();
    expect(r.send({ ...SETTINGS, mode: "live", x: 1 }, STATUS_PAGE)).toBe(
      false,
    );
    await settle();
    expect(r.calls).toEqual([
      `settings:${JSON.stringify({
        thresholds: SETTINGS.thresholds,
        pauseFromPercent: 30,
      })}`,
    ]);
    expect(r.answers).toEqual([]);
  });

  it("set-settings is queued behind the running job, like set-mode", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    r.send(SETTINGS, STATUS_PAGE);
    await settle();
    expect(r.calls.some((c) => c.startsWith("settings:"))).toBe(false);
    blocker.open();
    await settle();
    expect(r.calls.some((c) => c.startsWith("settings:"))).toBe(true);
  });

  it("rate from the Naka tab becomes a rate job with the parsed message, answered at once", async () => {
    const r = router();
    expect(r.send({ ...RATE, productId: 99, token: "x" }, NAKA_TAB)).toBe(
      false,
    );
    expect(r.answers).toEqual([{ ok: true }]);
    await settle();
    expect(r.calls).toEqual([`rate:${JSON.stringify(RATE)}`]);
    expect(r.answers).toEqual([{ ok: true }]);
  });

  it("dismiss-rating from the Naka tab becomes a dismiss job, answered at once", async () => {
    const r = router();
    expect(r.send(DISMISS, NAKA_TAB)).toBe(false);
    expect(r.answers).toEqual([{ ok: true }]);
    await settle();
    expect(r.calls).toEqual([`dismiss:${JSON.stringify(DISMISS)}`]);
    expect(r.answers).toEqual([{ ok: true }]);
  });

  it("a responder that throws on rate or dismiss-rating stops neither job", async () => {
    const recorded = recordingJobs();
    const r = createRouter({
      extensionId: EXT,
      queue: createJobQueue(),
      jobs: recorded.jobs,
      timer: fakeTimer().timer,
      now: () => ROUTER_NOW,
    });
    const answered: unknown[] = [];
    const respond = (answer: unknown) => {
      answered.push(answer);
      throw new Error("The message port closed.");
    };
    expect(r.handle(RATE, NAKA_TAB, respond)).toBe(false);
    expect(r.handle(DISMISS, NAKA_TAB, respond)).toBe(false);
    await settle();
    expect(answered).toEqual([{ ok: true }, { ok: true }]);
    expect(recorded.calls).toEqual([
      `rate:${JSON.stringify(RATE)}`,
      `dismiss:${JSON.stringify(DISMISS)}`,
    ]);
  });

  it("rating-card and rating-cards from the Naka tab are answered, and run no job", async () => {
    const r = router({
      ratingCard: async () => ({ card: null, pauseFromPercent: 40 }),
      ratingCards: async () => ({ cards: [] }),
    });
    expect(r.send(CARD, NAKA_TAB)).toBe(true);
    expect(r.send({ type: "rating-cards" }, NAKA_TAB)).toBe(true);
    await settle();
    expect(r.answers).toEqual([
      { card: null, pauseFromPercent: 40 },
      { cards: [] },
    ]);
  });

  it("the question reads are answered outside the queue, with the keys being answered", async () => {
    const r = router({
      openQuestions: async () => ({ questions: [] }),
      pageLists: async () => ({ questions: [], unlinked: [] }),
      removalOffer: async () => ({ offer: null }),
    });
    expect(r.send({ type: "open-questions" }, NAKA_TAB)).toBe(true);
    expect(r.send({ type: "removal-offer", contentId: 3 }, NAKA_TAB)).toBe(
      true,
    );
    expect(r.send({ type: "page-lists" }, STATUS_PAGE)).toBe(true);
    await settle();
    expect(r.answers).toEqual([
      { questions: [] },
      { offer: null },
      { questions: [], unlinked: [] },
    ]);
  });

  it("the question reads get the answering keys of the queue, empty until an answer is queued", async () => {
    const r = router();
    r.send({ type: "open-questions" }, NAKA_TAB);
    r.send({ type: "removal-offer", contentId: 3 }, NAKA_TAB);
    r.send({ type: "page-lists" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toEqual([
      "open-questions:[]",
      "removal-offer:3:[]",
      "page-lists:[]",
    ]);
  });

  it("a question read that rejects is answered undefined at once", async () => {
    const boom = async () => {
      throw new Error("store down");
    };
    const r = router({
      openQuestions: boom,
      removalOffer: boom,
      pageLists: boom,
    });
    r.send({ type: "open-questions" }, NAKA_TAB);
    r.send({ type: "removal-offer", contentId: 3 }, NAKA_TAB);
    r.send({ type: "page-lists" }, STATUS_PAGE);
    await settle();
    expect(r.answers).toEqual([undefined, undefined, undefined]);
  });

  it("a rating read that rejects is answered undefined at once, with no unhandled rejection", async () => {
    const r = router({
      ratingCard: async () => {
        throw new Error("store down");
      },
      ratingCards: async () => {
        throw new Error("store down");
      },
    });
    expect(r.send(CARD, NAKA_TAB)).toBe(true);
    expect(r.send({ type: "rating-cards" }, NAKA_TAB)).toBe(true);
    await settle();
    expect(r.answers).toEqual([undefined, undefined]);
  });

  it("a rejected read whose responder throws becomes no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
      const r = createRouter({
        extensionId: EXT,
        queue: createJobQueue(),
        jobs: recordingJobs({
          ratingCard: async () => {
            throw new Error("store down");
          },
        }).jobs,
        timer: fakeTimer().timer,
        now: () => ROUTER_NOW,
      });
      const answered: unknown[] = [];
      const respond = (answer: unknown) => {
        answered.push(answer);
        throw new Error("The message port closed.");
      };
      expect(r.handle(CARD, NAKA_TAB, respond)).toBe(true);
      await settle();
      await settle();
      expect(answered).toEqual([undefined]);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", listener);
    }
  });

  it("status from the status page is answered with the snapshot", async () => {
    const r = router();
    expect(r.send({ type: "status" }, STATUS_PAGE)).toBe(true);
    await settle();
    expect(r.calls).toEqual(["status"]);
    expect(r.answers).toEqual([r.snapshot]);
  });

  it("a status page without a tab is trusted too", async () => {
    const r = router();
    r.send({ type: "status" }, { id: EXT, url: STATUS_URL });
    await settle();
    expect(r.answers).toHaveLength(1);
  });
});

describe("router: everything else is ignored, unanswered", () => {
  const ignored: [string, unknown, object][] = [
    ["a message from https://naka.cx.evil.com/", { type: "naka-ready" }, EVIL],
    ["a finished from https://naka.cx.evil.com/", FINISHED, EVIL],
    ["a message from an iframe", FINISHED, IFRAME],
    ["a message from another extension", FINISHED, OTHER_EXTENSION],
    ["a sender with no id", { type: "status" }, { url: STATUS_URL }],
    ["an unknown type", { type: "wipe-everything" }, STATUS_PAGE],
    ["a malformed finished", { ...FINISHED, progress: 2 }, NAKA_TAB],
    ["not an object", "naka-ready", NAKA_TAB],
    [
      "set-mode from the Naka tab",
      { type: "set-mode", mode: "live" },
      NAKA_TAB,
    ],
    ["resync from the Naka tab", { type: "resync" }, NAKA_TAB],
    ["status from the Naka tab", { type: "status" }, NAKA_TAB],
    ["naka-ready from the status page", { type: "naka-ready" }, STATUS_PAGE],
    ["finished from the status page", FINISHED, STATUS_PAGE],
    [
      "playlist-changed from the status page",
      { type: "playlist-changed" },
      STATUS_PAGE,
    ],
    ["a set-settings from the Naka tab", SETTINGS, NAKA_TAB],
    [
      "a set-settings with an off-grid threshold",
      { ...SETTINGS, thresholds: { film: 0.5, episode: 0.8 } },
      STATUS_PAGE,
    ],
    [
      "a set-settings with a percent of 100",
      { ...SETTINGS, pauseFromPercent: 100 },
      STATUS_PAGE,
    ],
    ["a rate from the status page", RATE, STATUS_PAGE],
    ["a dismiss-rating from the status page", DISMISS, STATUS_PAGE],
    ["a rating-card from the status page", CARD, STATUS_PAGE],
    [
      "a rating-cards from the status page",
      { type: "rating-cards" },
      STATUS_PAGE,
    ],
    ["a page-lists from the Naka tab", { type: "page-lists" }, NAKA_TAB],
    [
      "an open-questions from the status page",
      { type: "open-questions" },
      STATUS_PAGE,
    ],
    [
      "a removal-offer from the status page",
      { type: "removal-offer", contentId: 3 },
      STATUS_PAGE,
    ],
    [
      "a removal-offer without a content id",
      { type: "removal-offer" },
      NAKA_TAB,
    ],
    ["a rate with a rating of 0", { ...RATE, rating: 0 }, NAKA_TAB],
    ["a rate with a rating of 11", { ...RATE, rating: 11 }, NAKA_TAB],
    ["a rate with an unknown label", { ...RATE, label: "season" }, NAKA_TAB],
    ["a hide-question from the status page", HIDE, STATUS_PAGE],
    [
      "an answer-question without a choice",
      { type: "answer-question", side: "naka", id: 5 },
      NAKA_TAB,
    ],
    [
      "an answer-question with a text choice",
      { ...ANSWER, choice: "2005" },
      NAKA_TAB,
    ],
    ["an answer-question with choice 0", { ...ANSWER, choice: 0 }, NAKA_TAB],
    [
      "an answer-question with an unknown side",
      { ...ANSWER, side: "x" },
      NAKA_TAB,
    ],
    ["an answer-removal with remove 1", { ...REMOVAL, remove: 1 }, NAKA_TAB],
    [
      "an answer-removal without a SensCritique id",
      { ...REMOVAL, scId: undefined },
      NAKA_TAB,
    ],
    ["a hide-question with a bad key", { ...HIDE, key: "hide:x" }, NAKA_TAB],
    ...[...RATING_MESSAGES, ...QUESTION_MESSAGES, ...PAGE_MESSAGES].flatMap(
      ([name, msg]) =>
        [
          ["https://naka.cx.evil.com/", EVIL],
          ["an iframe", IFRAME],
          ["another extension", OTHER_EXTENSION],
          ["a sender with no id", { url: PLAYER, frameId: 0 }],
        ].map(([from, sender]): [string, unknown, object] => [
          `${name} from ${from as string}`,
          msg,
          sender as object,
        ]),
    ),
  ];

  it.each(ignored)("%s", async (_name, msg, sender) => {
    const r = router();
    expect(r.send(msg, sender)).toBe(false);
    r.fire();
    await settle();
    expect(r.calls).toEqual([]);
    expect(r.answers).toEqual([]);
  });

  it("the message is parsed before the sender is looked at", () => {
    const read: string[] = [];
    const sender = new Proxy(NAKA_TAB, {
      get(target, key, receiver) {
        read.push(String(key));
        return Reflect.get(target, key, receiver);
      },
    });
    const r = router();
    r.send({ type: "nothing" }, sender);
    expect(read).toEqual([]);
    r.send({ type: "naka-ready" }, sender);
    expect(read).toContain("id");
  });
});

describe("router: one waiting rate per title and label", () => {
  const rateOf = (rating: number, over: object = {}) => ({
    ...RATE,
    rating,
    ...over,
  });
  const rates = (calls: string[]) => calls.filter((c) => c.startsWith("rate:"));

  it("three rates for the same key and label sent while a sync runs give one job, with the third rating", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    for (const rating of [5, 6, 9]) r.send(rateOf(rating), NAKA_TAB);
    blocker.open();
    await settle();
    expect(rates(r.calls)).toEqual([`rate:${JSON.stringify(rateOf(9))}`]);
  });

  it("different labels or different keys are different jobs", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    r.send(rateOf(5), NAKA_TAB);
    r.send(rateOf(6, { label: "série" }), NAKA_TAB);
    r.send(rateOf(7, { contentId: 4 }), NAKA_TAB);
    blocker.open();
    await settle();
    expect(rates(r.calls)).toHaveLength(3);
  });

  it("a rate for a running job queues behind it", async () => {
    const running = latch();
    const ratings: number[] = [];
    const r = router({
      rate: async (msg) => {
        ratings.push(msg.rating);
        if (ratings.length === 1) await running.opened;
      },
    });
    r.send(rateOf(5), NAKA_TAB);
    await settle();
    r.send(rateOf(8), NAKA_TAB);
    running.open();
    await settle();
    expect(ratings).toEqual([5, 8]);
  });

  it("a rate sent again after its job ended runs again", async () => {
    const r = router();
    r.send(rateOf(5), NAKA_TAB);
    await settle();
    r.send(rateOf(5), NAKA_TAB);
    await settle();
    expect(rates(r.calls)).toHaveLength(2);
  });
});

describe("router: the owner's answers are queued, one waiting per question", () => {
  const blockedRouter = (over: Partial<Jobs> = {}) => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
      ...over,
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    return { ...r, blocker };
  };
  const answered = (calls: string[]) =>
    calls.filter((c) => /^(answer|removal|hide):/.test(c));

  it("each answer is queued and answered { ok: true } at once, from the Naka tab and from the page", async () => {
    const r = router();
    expect(r.send(ANSWER, NAKA_TAB)).toBe(false);
    expect(r.send({ ...ANSWER, id: 6 }, STATUS_PAGE)).toBe(false);
    expect(r.send(REMOVAL, NAKA_TAB)).toBe(false);
    expect(r.send({ ...REMOVAL, nakaId: 22 }, STATUS_PAGE)).toBe(false);
    expect(r.send(HIDE, NAKA_TAB)).toBe(false);
    expect(r.answers).toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
    await settle();
    expect(r.calls).toEqual([
      `answer:${JSON.stringify(ANSWER)}`,
      `answer:${JSON.stringify({ ...ANSWER, id: 6 })}`,
      `removal:${JSON.stringify(REMOVAL)}`,
      `removal:${JSON.stringify({ ...REMOVAL, nakaId: 22 })}`,
      `hide:${JSON.stringify(HIDE)}`,
    ]);
  });

  it("a « none » answer keeps its null choice", async () => {
    const r = router();
    r.send({ ...ANSWER, choice: null, extra: 1 }, NAKA_TAB);
    await settle();
    expect(r.calls).toEqual([
      `answer:${JSON.stringify({ ...ANSWER, choice: null })}`,
    ]);
  });

  it("an answer-removal from an untrusted sender does nothing", async () => {
    const r = router();
    for (const sender of [EVIL, IFRAME, OTHER_EXTENSION, {}]) {
      expect(r.send(REMOVAL, sender)).toBe(false);
    }
    await settle();
    expect(r.calls).toEqual([]);
    expect(r.answers).toEqual([]);
  });

  it("answering lists a waiting key, then the running key, then nothing: open-questions carries it", async () => {
    const running = latch();
    const r = blockedRouter({
      answerRemoval: async () => {
        await running.opened;
      },
    });
    await settle();
    r.send(REMOVAL, NAKA_TAB);
    r.send({ type: "open-questions" }, NAKA_TAB);
    await settle();
    r.blocker.open();
    await settle();
    r.send({ type: "open-questions" }, NAKA_TAB);
    await settle();
    running.open();
    await settle();
    r.send({ type: "open-questions" }, NAKA_TAB);
    await settle();
    expect(r.calls.filter((c) => c.startsWith("open-questions"))).toEqual([
      'open-questions:["removal:sc:21:1021"]',
      'open-questions:["removal:sc:21:1021"]',
      "open-questions:[]",
    ]);
  });

  it("the keys of the brief: ambiguity:<side>:<id> and removal:<removeFrom>:<nakaId>:<scId>; a hide is never answering", async () => {
    const r = blockedRouter();
    await settle();
    r.send({ ...ANSWER, side: "sc", id: 1021, choice: 21 }, STATUS_PAGE);
    r.send({ ...REMOVAL, removeFrom: "naka" }, STATUS_PAGE);
    r.send({ ...HIDE, key: "removal:sc:21:1021" }, NAKA_TAB);
    r.send({ type: "page-lists" }, STATUS_PAGE);
    await settle();
    expect(r.calls.filter((c) => c.startsWith("page-lists"))).toEqual([
      'page-lists:["ambiguity:sc:1021","removal:naka:21:1021"]',
    ]);
    r.blocker.open();
    await settle();
  });

  it("two answer-removal for one key while it waits: one job, with the latest message", async () => {
    const r = blockedRouter();
    await settle();
    r.send({ ...REMOVAL, remove: true }, NAKA_TAB);
    r.send({ ...REMOVAL, remove: false }, STATUS_PAGE);
    r.blocker.open();
    await settle();
    expect(answered(r.calls)).toEqual([
      `removal:${JSON.stringify({ ...REMOVAL, remove: false })}`,
    ]);
  });

  it("two answers for one question while it waits: one job, the latest choice", async () => {
    const r = blockedRouter();
    await settle();
    r.send({ ...ANSWER, choice: 1005 }, NAKA_TAB);
    r.send(ANSWER, NAKA_TAB);
    r.blocker.open();
    await settle();
    expect(answered(r.calls)).toEqual([`answer:${JSON.stringify(ANSWER)}`]);
  });

  it("a hide-question for a question whose answer-question waits: both jobs run (separate keys)", async () => {
    const r = blockedRouter();
    await settle();
    r.send(ANSWER, NAKA_TAB);
    r.send(HIDE, NAKA_TAB);
    r.blocker.open();
    await settle();
    expect(answered(r.calls)).toEqual([
      `answer:${JSON.stringify(ANSWER)}`,
      `hide:${JSON.stringify(HIDE)}`,
    ]);
  });

  it("an answer and a removal of the same ids are different keys", async () => {
    const r = blockedRouter();
    await settle();
    r.send(REMOVAL, NAKA_TAB);
    r.send({ ...REMOVAL, removeFrom: "naka" }, NAKA_TAB);
    r.send({ ...ANSWER, id: 21 }, NAKA_TAB);
    r.blocker.open();
    await settle();
    expect(answered(r.calls)).toHaveLength(3);
  });

  it("a title with no card shows its question sending while its answer waits", async () => {
    const r = blockedRouter();
    await settle();
    r.send({ ...ANSWER, id: 3 }, NAKA_TAB);
    r.send(CARD, NAKA_TAB);
    await settle();
    expect(r.answers.at(-1)).toMatchObject({ questionSending: true });
    r.blocker.open();
    await settle();
  });
});

describe("router: rating reads are answered outside the queue", () => {
  it("a rating-card is answered while a sync still runs, then the sync ends", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    r.send(CARD, NAKA_TAB);
    r.send({ type: "rating-cards" }, NAKA_TAB);
    await settle();
    expect(r.answers).toHaveLength(2);
    blocker.open();
    await settle();
  });

  it("a rate job is queued behind the running job, a read is not", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    r.send(RATE, NAKA_TAB);
    r.send(CARD, NAKA_TAB);
    await settle();
    expect(r.calls.some((c) => c.startsWith("rate:"))).toBe(false);
    expect(r.answers).toEqual([
      { ok: true },
      { card: null, pauseFromPercent: 0, sending: ["film"] },
    ]);
    blocker.open();
    await settle();
    expect(r.calls.some((c) => c.startsWith("rate:"))).toBe(true);
  });
});

function latch() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

const finishedFor = (
  contentId: number,
  progress = 0.9,
  extra: Record<string, unknown> = {},
) => ({ type: "finished", source: "threshold", progress, contentId, ...extra });

const finishes = (calls: string[]) =>
  calls.filter((call) => call.startsWith("finish:"));

describe("router: finishes are bounded", () => {
  it("a burst of 1000 distinct ids queues at most 20 finish jobs, unanswered", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    for (let id = 1; id <= 1000; id += 1) {
      expect(r.send(finishedFor(id), NAKA_TAB)).toBe(false);
    }
    blocker.open();
    await settle();
    expect(finishes(r.calls)).toHaveLength(MAX_QUEUED_FINISHES);
    expect(r.answers).toEqual([]);
  });

  it("a slot frees up when a finish job ends", async () => {
    const r = router();
    for (let id = 1; id <= 25; id += 1) r.send(finishedFor(id), NAKA_TAB);
    await settle();
    for (let id = 26; id <= 30; id += 1) r.send(finishedFor(id), NAKA_TAB);
    await settle();
    expect(finishes(r.calls)).toHaveLength(MAX_QUEUED_FINISHES + 5);
  });

  it("duplicates of a queued key give one job, run with the highest progress received", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    r.send(finishedFor(3, 0.85), NAKA_TAB);
    r.send(finishedFor(3, 0.95), NAKA_TAB);
    r.send(finishedFor(3, 0.95, { source: "explicit" }), NAKA_TAB);
    r.send(finishedFor(3, 0.9), NAKA_TAB);
    r.send(finishedFor(7, 0.9, { season: 1, episode: 1 }), NAKA_TAB);
    r.send(finishedFor(7, 0.9, { season: 1, episode: 2 }), NAKA_TAB);
    blocker.open();
    await settle();
    expect(finishes(r.calls)).toEqual([
      `finish:${JSON.stringify(finishedFor(3, 0.95, { source: "explicit" }))}`,
      `finish:${JSON.stringify(finishedFor(7, 0.9, { season: 1, episode: 1 }))}`,
      `finish:${JSON.stringify(finishedFor(7, 0.9, { season: 1, episode: 2 }))}`,
    ]);
  });

  it("a message for a key whose job is running is queued, and runs after it", async () => {
    const running = latch();
    const progresses: number[] = [];
    const r = router({
      finishJob: async (msg) => {
        progresses.push(msg.progress);
        if (progresses.length === 1) await running.opened;
      },
    });
    r.send(finishedFor(3, 0.85), NAKA_TAB);
    await settle();
    expect(progresses).toEqual([0.85]);
    r.send(finishedFor(3, 0.9), NAKA_TAB);
    running.open();
    await settle();
    expect(progresses).toEqual([0.85, 0.9]);
  });
});

// The router on the REAL jobs, with fake sites that know every content id.
function floodWorld() {
  const area = memoryArea();
  area.data.set("state", emptyState());
  const naka = fakeNaka({
    playlistIds: async () => [],
    contentById: async (id) => ({
      contentId: id,
      tmdbId: 9000 + id,
      mediaType: "movie",
      title: `Film ${id}`,
      releaseDate: "2001-01-01",
    }),
  });
  const sc = fakeSc({
    search: async (q, universe) =>
      universe === "movie"
        ? [
            {
              productId: 100000 + Number(q.slice(5)),
              title: q,
              url: "/film/x",
              universe: 1,
              year: 2001,
            },
          ]
        : [],
  });
  const blocker = latch();
  let first = true;
  const real = tabRunning(naka.client, () => "77").tabs;
  const tabs: TabsPort = {
    query: async (url) => {
      if (first) {
        first = false;
        await blocker.opened;
      }
      return real.query(url);
    },
    send: (tabId, msg) => real.send(tabId, msg),
  };
  const jobs = createJobs({
    store: createStore(area),
    tabs,
    sc: sc.client,
    scUsername: async () => "owner",
    limiters: { naka: countingLimiter([], "n"), sc: countingLimiter([], "s") },
    now: () => Date.parse("2026-11-04T12:00:00Z"),
    today: () => "2026-11-04",
    timer: { set: () => 0, clear: () => undefined },
  });
  const r = createRouter({
    extensionId: EXT,
    queue: createJobQueue(),
    jobs,
    timer: fakeTimer().timer,
    now: () => Date.parse("2026-11-04T12:00:00Z"),
  });
  const send = (msg: unknown, sender: object) =>
    r.handle(msg, sender, () => undefined);
  return { area, sc, naka, blocker, send };
}

describe("router and jobs: a forged flood", () => {
  it("at most 30 finishes an hour reach handleFinish", async () => {
    const w = floodWorld();
    w.blocker.open();
    for (let round = 0; round < 3; round += 1) {
      for (let id = 1; id <= 1000; id += 1) {
        w.send(
          finishedFor(round * 1000 + id, 1, { source: "explicit" }),
          NAKA_TAB,
        );
      }
      await settle();
    }
    const contentReads = w.naka.calls.filter((c) =>
      c.startsWith("contentById"),
    );
    expect(contentReads).toHaveLength(MAX_FINISHES_PER_WINDOW);
    expect(w.sc.calls.filter((c) => c.startsWith("markDone"))).toHaveLength(30);
    expect(parseSettings(w.area.data.get("settings")).finishWindow?.count).toBe(
      MAX_FINISHES_PER_WINDOW,
    );
    expect(parseSettings(w.area.data.get("settings")).lastFinish?.error).toBe(
      "finish-limit",
    );
  });

  it("a 0.85 mark queued behind a sync, then the 0.9 mark, under the film threshold of 0.9: the finish completes", async () => {
    const w = floodWorld();
    w.send({ type: "resync" }, STATUS_PAGE);
    w.send(finishedFor(3, 0.85), NAKA_TAB);
    w.send(finishedFor(3, 0.9), NAKA_TAB);
    w.blocker.open();
    await settle();
    expect(w.sc.calls).toContain("markDone:100003:2026-11-04");
    expect(parseSettings(w.area.data.get("settings")).lastFinish).toMatchObject(
      {
        key: "movie:3",
        outcome: "done",
      },
    );
  });
});

describe("router: one queue", () => {
  function gate() {
    let open: () => void = () => undefined;
    const opened = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { opened, open };
  }

  it("a job starts only after the one before it ended", async () => {
    const first = gate();
    const events: string[] = [];
    const r = router({
      syncJob: async () => {
        events.push("sync start");
        await first.opened;
        events.push("sync end");
      },
      finishJob: async () => {
        events.push("finish start");
      },
      statusSnapshot: async () => {
        events.push("status");
        return {};
      },
      setMode: async () => {
        events.push("mode");
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    r.send(FINISHED, NAKA_TAB);
    r.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    await settle();
    expect(events).toEqual(["sync start"]);
    first.open();
    await settle();
    expect(events).toEqual(["sync start", "sync end", "finish start", "mode"]);
  });

  it("a debounced sync waits for the queue too", async () => {
    const first = gate();
    const events: string[] = [];
    const r = router({
      finishJob: async () => {
        events.push("finish start");
        await first.opened;
        events.push("finish end");
      },
      syncJob: async (trigger) => {
        events.push(`sync ${trigger}`);
      },
    });
    r.send(FINISHED, NAKA_TAB);
    r.send({ type: "playlist-changed" }, NAKA_TAB);
    r.fire();
    await settle();
    expect(events).toEqual(["finish start"]);
    first.open();
    await settle();
    expect(events).toEqual(["finish start", "finish end", "sync playlist"]);
  });

  it("a job that rejects does not stop the next one", async () => {
    const r = router({
      syncJob: async () => {
        throw new Error("boom");
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    r.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toEqual([`retry:${ROUTER_NOW}`, "mode:live"]);
  });

  it("a snapshot that rejects is not answered", async () => {
    const r = router({
      statusSnapshot: async () => {
        throw new Error("boom");
      },
    });
    expect(r.send({ type: "status" }, STATUS_PAGE)).toBe(true);
    await settle();
    expect(r.answers).toEqual([]);
  });

  it("a status answer channel that throws becomes no unhandled rejection (M4)", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
      const r = createRouter({
        extensionId: EXT,
        queue: createJobQueue(),
        jobs: recordingJobs().jobs,
        timer: fakeTimer().timer,
        now: () => ROUTER_NOW,
      });
      const respond = () => {
        throw new Error("The message port closed.");
      };
      expect(r.handle({ type: "status" }, STATUS_PAGE, respond)).toBe(true);
      await settle();
      await settle();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", listener);
    }
  });
});

// Ruling 20: the status is answered at once, outside the queue, read-only. It says which job runs and which
// mode a queued set-mode will apply: both live in memory, lost with the queue on a worker restart.
describe("router: the status answer waits for no job", () => {
  function gated() {
    const sync = latch();
    const finish = latch();
    const events: string[] = [];
    const r = router({
      syncJob: async () => {
        events.push("sync start");
        await sync.opened;
        events.push("sync end");
      },
      finishJob: async () => {
        events.push("finish start");
        await finish.opened;
      },
      setMode: async (mode) => {
        events.push(`mode ${mode}`);
      },
    });
    const status = async () => {
      r.send({ type: "status" }, STATUS_PAGE);
      await settle();
      return r.answers.at(-1) as StatusSnapshot;
    };
    return { r, sync, finish, events, status };
  }

  it("a status sent during a running sync is answered before the sync ends, and holds running", async () => {
    const g = gated();
    g.r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    g.r.time.now += 90_000;
    const answer = await g.status();
    expect(g.events).toEqual(["sync start"]);
    expect(answer).toEqual({
      mode: "simulation",
      running: { kind: "sync", since: ROUTER_NOW },
    });
    g.sync.open();
    await settle();
    expect(await g.status()).toEqual({ mode: "simulation" });
  });

  it("a running finish is named as such", async () => {
    const g = gated();
    g.r.send(FINISHED, NAKA_TAB);
    await settle();
    expect((await g.status()).running).toEqual({
      kind: "finish",
      since: ROUTER_NOW,
    });
    g.finish.open();
    await settle();
    expect(await g.status()).not.toHaveProperty("running");
  });

  it("a retry step with nothing waiting shows no finish in progress", async () => {
    const check = latch();
    const r = router({
      retryPending: async () => {
        await check.opened;
        return false;
      },
      retryNext: async () => {
        await check.opened;
        return false;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    r.send({ type: "status" }, STATUS_PAGE);
    await settle();
    expect(r.answers.at(-1)).not.toHaveProperty("running");
    check.open();
    await settle();
    expect(r.calls.filter((c) => c.startsWith("retry:"))).toEqual([]);
  });

  it("a retry step with an entry waiting shows a finish in progress", async () => {
    const step = latch();
    const r = router({
      retryPending: async () => true,
      retryNext: async () => {
        await step.opened;
        return false;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    r.send({ type: "status" }, STATUS_PAGE);
    await settle();
    expect(r.answers.at(-1)).toMatchObject({
      running: { kind: "finish" },
    });
    step.open();
    await settle();
  });

  it("a set-mode queued behind a sync shows pendingMode until it is applied", async () => {
    const g = gated();
    g.r.send({ type: "resync" }, STATUS_PAGE);
    g.r.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    await settle();
    expect(await g.status()).toMatchObject({ pendingMode: "live" });
    g.sync.open();
    await settle();
    expect(g.events).toEqual(["sync start", "sync end", "mode live"]);
    expect(await g.status()).toEqual({ mode: "simulation" });
  });

  it("two queued set-modes: the later one is pending until it is applied", async () => {
    const gates = [latch(), latch()];
    const events: string[] = [];
    const r = router({
      syncJob: async () => {
        const gate = gates[events.filter((e) => e === "sync").length];
        events.push("sync");
        await gate?.opened;
      },
      setMode: async (mode) => {
        events.push(`mode ${mode}`);
      },
    });
    const pending = async () => {
      r.send({ type: "status" }, STATUS_PAGE);
      await settle();
      return (r.answers.at(-1) as StatusSnapshot).pendingMode;
    };
    r.send({ type: "resync" }, STATUS_PAGE);
    r.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    r.send({ type: "resync" }, STATUS_PAGE);
    r.send({ type: "set-mode", mode: "simulation" }, STATUS_PAGE);
    await settle();
    expect(await pending()).toBe("simulation");
    gates[0]?.open();
    await settle();
    expect(events).toEqual(["sync", "mode live", "sync"]);
    expect(await pending()).toBe("simulation");
    gates[1]?.open();
    await settle();
    expect(events).toEqual(["sync", "mode live", "sync", "mode simulation"]);
    expect(await pending()).toBeUndefined();
  });

  const SETTINGS_MESSAGE = {
    type: "set-settings",
    thresholds: { film: 0.95, episode: 0.8 },
    pauseFromPercent: 50,
  } as const;

  it("a set-settings queued behind a sync shows pendingSettings until it is applied", async () => {
    const g = gated();
    g.r.send({ type: "resync" }, STATUS_PAGE);
    g.r.send(SETTINGS_MESSAGE, STATUS_PAGE);
    await settle();
    expect(await g.status()).toMatchObject({ pendingSettings: true });
    g.sync.open();
    await settle();
    expect(await g.status()).not.toHaveProperty("pendingSettings");
  });

  it("a set-settings that is running shows pendingSettings", async () => {
    const gate = latch();
    const r = router({
      setSettings: async () => {
        await gate.opened;
      },
    });
    const pending = async () => {
      r.send({ type: "status" }, STATUS_PAGE);
      await settle();
      return (r.answers.at(-1) as StatusSnapshot).pendingSettings;
    };
    r.send(SETTINGS_MESSAGE, STATUS_PAGE);
    await settle();
    expect(await pending()).toBe(true);
    gate.open();
    await settle();
    expect(await pending()).toBeUndefined();
  });

  it("a rejected set-settings releases the mark", async () => {
    const r = router({
      setSettings: async () => {
        throw new Error("storage");
      },
    });
    r.send(SETTINGS_MESSAGE, STATUS_PAGE);
    await settle();
    r.send({ type: "status" }, STATUS_PAGE);
    await settle();
    expect(r.answers.at(-1)).not.toHaveProperty("pendingSettings");
  });

  it("forget-binding and reset from the status page run their job, answered at once", async () => {
    const r = router();
    expect(r.send({ type: "forget-binding", x: 1 }, STATUS_PAGE)).toBe(false);
    expect(r.send({ type: "reset" }, STATUS_PAGE)).toBe(false);
    expect(r.answers).toEqual([{ ok: true }, { ok: true }]);
    await settle();
    expect(r.calls).toEqual(["forget", "reset"]);
  });

  it("forget-handled from the status page and from a Naka tab each queue one job, answered at once", async () => {
    const r = router();
    const msg = { type: "forget-handled", contentId: 3, season: 1, episode: 2 };
    expect(r.send({ ...msg, title: "forged" }, STATUS_PAGE)).toBe(false);
    expect(r.send(msg, NAKA_TAB)).toBe(false);
    expect(r.answers).toEqual([{ ok: true }, { ok: true }]);
    await settle();
    expect(r.calls).toEqual([
      `forget-handled:${JSON.stringify(msg)}`,
      `forget-handled-tab:${JSON.stringify(msg)}`,
    ]);
  });

  it("forget-handled runs on the queue, behind a running sync", async () => {
    const g = gated();
    g.r.send({ type: "resync" }, STATUS_PAGE);
    g.r.send({ type: "forget-handled", contentId: 3 }, NAKA_TAB);
    await settle();
    expect(g.r.calls.filter((c) => c.startsWith("forget-handled"))).toEqual([]);
    g.sync.open();
    await settle();
    expect(
      g.r.calls.filter((c) => c.startsWith("forget-handled")),
    ).toHaveLength(1);
  });

  it("handled-titles from the status page is answered from the read, outside the queue", async () => {
    const g = gated();
    g.r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    expect(g.r.send({ type: "handled-titles" }, STATUS_PAGE)).toBe(true);
    await settle();
    expect(g.r.answers.at(-1)).toEqual({
      titles: [{ key: "movie:3", label: "Trois" }],
      waiting: [],
      cancelling: [],
    });
    g.sync.open();
  });

  it("a queued cancel-retry hides its key from handled-titles until its job ends", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    const msg = { type: "cancel-retry", contentId: 3 };
    expect(r.send(msg, STATUS_PAGE)).toBe(false);
    r.send({ type: "handled-titles" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toContain('handled-titles:["movie:3"]');
    blocker.open();
    await settle();
    expect(r.calls).toContain(`cancel-retry:${JSON.stringify(msg)}`);
    r.send({ type: "handled-titles" }, STATUS_PAGE);
    await settle();
    expect(r.calls.at(-1)).toBe("handled-titles:[]");
  });

  it("two cancel-retry of one key keep it hidden until the second job ends", async () => {
    const second = latch();
    let runs = 0;
    const r = router({
      cancelRetry: async () => {
        runs += 1;
        if (runs === 2) await second.opened;
      },
    });
    const msg = { type: "cancel-retry", contentId: 3 };
    r.send(msg, STATUS_PAGE);
    r.send(msg, STATUS_PAGE);
    await settle();
    expect(runs).toBe(2);
    r.send({ type: "handled-titles" }, STATUS_PAGE);
    await settle();
    expect(r.calls.at(-1)).toBe('handled-titles:["movie:3"]');
    second.open();
    await settle();
    r.send({ type: "handled-titles" }, STATUS_PAGE);
    await settle();
    expect(r.calls.at(-1)).toBe("handled-titles:[]");
  });

  it("cancel-retry from a Naka tab is ignored", async () => {
    const r = router();
    expect(r.send({ type: "cancel-retry", contentId: 3 }, NAKA_TAB)).toBe(
      false,
    );
    await settle();
    expect(r.calls).toEqual([]);
  });

  it("handled-titles from a Naka tab is ignored", async () => {
    const r = router();
    expect(r.send({ type: "handled-titles" }, NAKA_TAB)).toBe(false);
    await settle();
    expect(r.calls).toEqual([]);
    expect(r.answers).toEqual([]);
  });

  it("forget-binding and reset from a Naka tab are ignored", async () => {
    const r = router();
    expect(r.send({ type: "forget-binding" }, NAKA_TAB)).toBe(false);
    expect(r.send({ type: "reset" }, NAKA_TAB)).toBe(false);
    await settle();
    expect(r.calls).toEqual([]);
    expect(r.answers).toEqual([]);
  });

  it("a reset queued behind a sync shows pendingActions until it is applied, then nothing", async () => {
    const g = gated();
    g.r.send({ type: "resync" }, STATUS_PAGE);
    g.r.send({ type: "reset" }, STATUS_PAGE);
    await settle();
    expect(await g.status()).toMatchObject({ pendingActions: ["reset"] });
    g.r.send({ type: "forget-binding" }, STATUS_PAGE);
    await settle();
    expect(await g.status()).toMatchObject({
      pendingActions: ["forget", "reset"],
    });
    g.sync.open();
    await settle();
    expect(await g.status()).not.toHaveProperty("pendingActions");
  });

  it("a rejected reset releases the mark", async () => {
    const r = router({
      reset: async () => {
        throw new Error("storage");
      },
    });
    r.send({ type: "reset" }, STATUS_PAGE);
    await settle();
    r.send({ type: "status" }, STATUS_PAGE);
    await settle();
    expect(r.answers.at(-1)).not.toHaveProperty("pendingActions");
  });

  it("an idle worker answers the snapshot alone", async () => {
    const g = gated();
    expect(await g.status()).toEqual({ mode: "simulation" });
    expect(g.r.calls).toEqual(["status"]);
  });

  it("a job that ends while the snapshot is read is still said running: the page asks again", async () => {
    const sync = latch();
    const read = latch();
    const r = router({
      syncJob: () => sync.opened,
      statusSnapshot: async () => {
        await read.opened;
        return { mode: "live" };
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    r.send({ type: "status" }, STATUS_PAGE);
    sync.open();
    await settle();
    read.open();
    await settle();
    expect(r.answers).toEqual([
      { mode: "live", running: { kind: "sync", since: ROUTER_NOW } },
    ]);
  });

  it("a job that starts while the snapshot is read is said running", async () => {
    const sync = latch();
    const read = latch();
    const r = router({
      syncJob: () => sync.opened,
      statusSnapshot: async () => {
        await read.opened;
        return { mode: "live" };
      },
    });
    r.send({ type: "status" }, STATUS_PAGE);
    r.time.now += 1000;
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    read.open();
    await settle();
    expect(r.answers).toEqual([
      {
        mode: "live",
        running: { kind: "sync", since: ROUTER_NOW + 1000 },
      },
    ]);
  });
});

// End to end through createWorker: the real SensCritique client and session reader on a fake fetch, the
// real Naka client inside a fake tab. Both tokens are markers that must stay where they belong.
const SC_TOKEN = "SCTOKENMARKER0123456789abcdefXY";
const NAKA_TOKEN = "NAKA-TOKEN-MARKER-5e1f";

type Call = { url: string; init: Parameters<Fetch>[1]; at: number };
type Clock = { time: number };

const json = (value: unknown, status = 200) => ({
  ok: status === 200,
  status,
  text: async () => JSON.stringify(value),
});

function homePage(loggedIn: boolean): string {
  const pageProps = loggedIn
    ? { cookies: { SC_AUTH: SC_TOKEN }, meInfos: { username: "owner" } }
    : {};
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    { props: { pageProps } },
  )}</script></body></html>`;
}

const scProduct = (id: number) => ({
  id,
  title: `Film ${id - 1000}`,
  url: `/film/x/${id}`,
  universe: 1,
  dateRelease: `${2000 + id - 1000}-01-01`,
});

function apollo(body: {
  operationName: string;
  variables: Record<string, unknown>;
}) {
  const { operationName, variables } = body;
  if (operationName === "UserCollection") {
    const products = variables.universe === "movie" ? [scProduct(1002)] : [];
    return json({
      data: { user: { collection: { products, total: products.length } } },
    });
  }
  if (operationName === "SearchProductExplorer") {
    const films = JSON.stringify(variables.filters).includes("movie");
    const found = { "Film 1": 1001, "Film 3": 1003 }[String(variables.query)];
    const items = films && found !== undefined ? [scProduct(found)] : [];
    return json({ data: { searchProductExplorer: { items } } });
  }
  if (operationName === "ProductCurrentUserInfos") {
    const id = variables.id as number;
    return json({
      data: {
        product: {
          id,
          universe: 1,
          currentUserInfos: {
            productId: id,
            isDone: false,
            isWished: id === 1002,
            rating: null,
          },
        },
      },
    });
  }
  return json({ data: { [operationName]: { ok: true } } });
}

function scFetch(loggedIn: boolean, clock: Clock) {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init, at: clock.time });
    if (url === "https://www.senscritique.com/") {
      return { ok: true, status: 200, text: async () => homePage(loggedIn) };
    }
    if (url === "https://apollo.senscritique.com/") {
      return apollo(JSON.parse(init.body ?? "{}"));
    }
    return json({}, 404);
  };
  return { fetch, calls };
}

const nakaEntry = (id: number) => ({
  id,
  tmdbId: 9000 + id,
  mediaType: "movie",
  title: `Film ${id}`,
  releaseDate: `${2000 + id}-01-01`,
});

function nakaFetch(clock: Clock) {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init, at: clock.time });
    const path = url.replace("https://naka.cx/api/v1", "");
    if (path === "/playlist/ids") return json({ contentIds: [1], limit: 500 });
    if (path.startsWith("/browse/search")) {
      return json({ data: path.includes("Film%202") ? [nakaEntry(2)] : [] });
    }
    if (path === "/browse/1") return json(nakaEntry(1));
    if (path === "/browse/3") return json(nakaEntry(3));
    if (path === "/playlist" && init.method === "POST") return json({});
    return json({}, 404);
  };
  return { fetch, calls };
}

function worker(loggedIn = true, start = "2026-11-04T12:00:00Z") {
  const clock: Clock = { time: Date.parse(start) };
  const storage = memoryArea();
  const sc = scFetch(loggedIn, clock);
  const naka = nakaFetch(clock);
  const client = createNakaClient({
    fetch: naka.fetch,
    token: () => NAKA_TOKEN,
  });
  const traffic = { sent: [] as unknown[], returned: [] as unknown[] };
  const { tabs } = tabRunning(client, () => "77", traffic);
  const answers: unknown[] = [];
  const r = createWorker({
    extensionId: EXT,
    session: memoryArea(),
    storage,
    tabs,
    fetch: sc.fetch,
    timer: { set: () => 0, clear: () => undefined },
    now: () => clock.time,
    sleep: async (ms) => {
      clock.time += ms;
    },
  });
  const send = (msg: unknown, sender: object) =>
    r.handle(msg, sender, (answer) => answers.push(answer));
  return { storage, sc, naka, traffic, answers, send };
}

describe("worker end to end: a SensCritique request that never answers", () => {
  it.each([
    "https://www.senscritique.com/",
    "https://apollo.senscritique.com/",
  ])(
    "to %s is aborted at 30 s, the run fails as unavailable, and the next job runs",
    async (stuck) => {
      const storage = memoryArea();
      const armed: { fn: () => void; ms: number }[] = [];
      const timer: Timer = {
        set: (fn, ms) => {
          armed.push({ fn, ms });
          return armed.length;
        },
        clear: () => undefined,
      };
      const signals: AbortSignal[] = [];
      const answering = scFetch(true, { time: 0 }).fetch;
      const hanging: Fetch = (url, init) =>
        url !== stuck
          ? answering(url, init)
          : new Promise((_resolve, reject) => {
              if (init.signal) signals.push(init.signal);
              init.signal?.addEventListener("abort", () =>
                reject(new Error("aborted")),
              );
            });
      const client = createNakaClient({
        fetch: nakaFetch({ time: 0 }).fetch,
        token: () => NAKA_TOKEN,
      });
      const answers: unknown[] = [];
      const r = createWorker({
        extensionId: EXT,
        session: memoryArea(),
        storage,
        tabs: tabRunning(client, () => "77").tabs,
        fetch: hanging,
        timer,
        now: () => Date.parse("2026-11-04T12:00:00Z"),
        sleep: async () => undefined,
      });
      r.handle({ type: "resync" }, STATUS_PAGE, () => undefined);
      await settle();
      // The status does not wait for the stuck run (Ruling 20): it says a sync runs.
      r.handle({ type: "status" }, STATUS_PAGE, (a) => answers.push(a));
      await settle();
      expect(answers).toHaveLength(1);
      expect(answers[0]).toMatchObject({ running: { kind: "sync" } });
      expect(answers[0]).not.toHaveProperty("lastRun");
      expect(signals).toHaveLength(1);
      const abort = armed.filter((a) => a.ms === 30_000);
      expect(abort.length).toBeGreaterThan(0);
      for (const { fn } of abort) fn();
      await settle();
      r.handle({ type: "status" }, STATUS_PAGE, (a) => answers.push(a));
      await settle();
      expect(answers).toHaveLength(2);
      expect(answers[1]).not.toHaveProperty("running");
      expect((answers[1] as StatusSnapshot).lastRun).toMatchObject({
        trigger: "button",
        outcome: "failed",
        error: "unavailable",
      });
    },
  );
});

const WWW_HOME = "https://www.senscritique.com/";
const APOLLO_HOST = "https://apollo.senscritique.com/";

// Films 1, 3, 4 and 5 on the Naka playlist and on no SensCritique list: a run searches SensCritique for
// each of them.
const PLAYLIST = [1, 3, 4, 5];

function nakaPlaylist(ids: number[]): Fetch {
  return async (url) => {
    const path = url.replace("https://naka.cx/api/v1", "");
    if (path === "/playlist/ids") return json({ contentIds: ids, limit: 500 });
    if (path.startsWith("/browse/search")) return json({ data: [] });
    const id = Number(path.replace("/browse/", ""));
    return ids.includes(id) ? json(nakaEntry(id)) : json({}, 404);
  };
}

const wishlistReads = (answered: Call[]) =>
  answered.filter((c) => (c.init.body ?? "").includes('"UserCollection"'))
    .length;

// A worker whose requests to `stuck` hang, once `hangs` holds over the requests answered so far, until
// their 30 s timer fires. `requests` logs every SensCritique request in order, `hung` the ones that hung.
function stallingWorker(stuck: string, hangs: (answered: Call[]) => boolean) {
  const storage = memoryArea();
  const armed: (() => void)[] = [];
  const timer: Timer = {
    set: (fn, ms) => {
      if (ms === 30_000) armed.push(fn);
      return armed.length;
    },
    clear: () => undefined,
  };
  const answering = scFetch(true, { time: 0 });
  const requests: string[] = [];
  const hung: string[] = [];
  const fetch: Fetch = (url, init) => {
    requests.push(url);
    if (url !== stuck || !hangs(answering.calls)) {
      return answering.fetch(url, init);
    }
    hung.push(url);
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () =>
        reject(new Error("aborted")),
      );
    });
  };
  const client = createNakaClient({
    fetch: nakaPlaylist(PLAYLIST),
    token: () => NAKA_TOKEN,
  });
  const answers: unknown[] = [];
  const clock: Clock = { time: Date.parse("2026-11-04T12:00:00Z") };
  const r = createWorker({
    extensionId: EXT,
    session: memoryArea(),
    storage,
    tabs: tabRunning(client, () => "77").tabs,
    fetch,
    timer,
    now: () => clock.time,
    sleep: async (ms) => {
      clock.time += ms;
    },
  });
  const send = (msg: unknown, sender: object) =>
    r.handle(msg, sender, (answer) => answers.push(answer));
  // Lets 30 s pass for every request armed so far, until the worker makes no new request.
  const runOut = async () => {
    for (let round = 0; round < 20; round += 1) {
      await settle();
      if (armed.length === 0) return;
      for (const fn of armed.splice(0)) fn();
    }
    throw new Error("the worker kept making requests");
  };
  const lastRun = async () => {
    send({ type: "status" }, STATUS_PAGE);
    await settle();
    return (answers.at(-1) as StatusSnapshot).lastRun;
  };
  return { storage, requests, hung, send, runOut, lastRun };
}

describe("worker end to end: a SensCritique site that stops answering (K4)", () => {
  it.each([WWW_HOME, APOLLO_HOST])(
    "%s hanging mid-run costs one 30 s timeout (the search port on Apollo, the write port on the home page, which searches never read), not one per title",
    async (stuck) => {
      const w = stallingWorker(
        stuck,
        (answered) => wishlistReads(answered) >= 2,
      );
      w.send({ type: "resync" }, STATUS_PAGE);
      await w.runOut();
      expect(w.hung).toEqual([stuck]);
      expect(w.requests.at(-1)).toBe(stuck);
      expect(await w.lastRun()).toMatchObject({
        trigger: "button",
        outcome: "ok",
        error: "unavailable",
      });
    },
  );

  it("a home page hanging from the start fails the run at the binding check", async () => {
    const w = stallingWorker(WWW_HOME, () => true);
    w.send({ type: "resync" }, STATUS_PAGE);
    await w.runOut();
    expect(w.requests).toEqual([WWW_HOME]);
    expect(w.hung).toEqual([WWW_HOME]);
    expect(w.storage.ops).not.toContain("get:state");
    expect(await w.lastRun()).toMatchObject({
      outcome: "failed",
      error: "unavailable",
    });
    expect(w.storage.data.get("settings")).not.toHaveProperty("binding");
  });

  it("a home page hanging from the start fails a finish at the binding check, before any state write", async () => {
    const w = stallingWorker(WWW_HOME, () => true);
    w.send({ ...FINISHED, contentId: 3 }, NAKA_TAB);
    await w.runOut();
    expect(w.requests).toEqual([WWW_HOME]);
    expect(w.storage.ops).not.toContain("set:state");
    expect(w.storage.data.get("settings")).toMatchObject({
      finishWindow: { count: 1 },
      lastFinish: { key: "movie:3", outcome: "failed", error: "unavailable" },
    });
  });
});

describe("worker end to end: the tokens stay where they belong", () => {
  it("a live sync writes, and neither token reaches storage, a message or an answer", async () => {
    const w = worker();
    w.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    w.send({ type: "naka-ready" }, NAKA_TAB);
    w.send({ type: "status" }, STATUS_PAGE);
    await settle();
    const ops = w.sc.calls.map(
      (c) => JSON.parse(c.init.body ?? "{}").operationName,
    );
    expect(ops).toContain("ProductWish");
    expect(w.naka.calls.some((c) => c.init.method === "POST")).toBe(true);

    const stored = strings([...w.storage.data.values()]);
    const shown = strings(w.answers);
    const crossed = strings([w.traffic.sent, w.traffic.returned]);
    for (const token of [SC_TOKEN, NAKA_TOKEN]) {
      expect(stored.some((s) => s.includes(token))).toBe(false);
      expect(shown.some((s) => s.includes(token))).toBe(false);
      expect(crossed.some((s) => s.includes(token))).toBe(false);
    }
    expect(w.answers).toHaveLength(1);
  });

  it("the SensCritique token goes only to Apollo, as the raw authorization header, without cookies", async () => {
    const w = worker();
    w.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    w.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    for (const { url, init } of w.sc.calls) {
      const carries =
        JSON.stringify(init).includes(SC_TOKEN) || url.includes(SC_TOKEN);
      if (!carries) continue;
      expect(url).toBe("https://apollo.senscritique.com/");
      expect(init.headers.authorization).toBe(SC_TOKEN);
      expect(init.credentials).toBe("omit");
      expect(init.body ?? "").not.toContain(SC_TOKEN);
    }
    expect(
      w.sc.calls.some((c) => c.init.headers.authorization === SC_TOKEN),
    ).toBe(true);
    for (const { url, init } of w.naka.calls) {
      expect(url.startsWith("https://naka.cx/api/v1/")).toBe(true);
      expect(init.headers.authorization).toBe(`Bearer ${NAKA_TOKEN}`);
      expect(url).not.toContain(NAKA_TOKEN);
      expect(init.body ?? "").not.toContain(NAKA_TOKEN);
    }
  });

  it("a logged-out SensCritique home page gives sc-session, with no SensCritique write", async () => {
    const w = worker(false);
    w.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    w.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    w.send({ type: "status" }, STATUS_PAGE);
    await settle();
    expect(
      w.sc.calls.every((c) => c.url === "https://www.senscritique.com/"),
    ).toBe(true);
    expect(w.naka.calls.some((c) => c.init.method === "POST")).toBe(false);
    const snapshot = w.answers[0] as StatusSnapshot;
    expect(snapshot.lastRun).toMatchObject({
      outcome: "failed",
      error: "sc-session",
    });
  });

  it("a logged-out SensCritique home page stops a finish after the content read, before any state write", async () => {
    const w = worker(false);
    w.send({ ...FINISHED, contentId: 3 }, NAKA_TAB);
    await settle();
    // Ruling 18: the local pre-check reads the state once; handleFinish never runs.
    expect(w.storage.ops.filter((op) => op === "get:state")).toHaveLength(1);
    expect(w.storage.ops).not.toContain("set:state");
    expect(w.naka.calls.map((c) => c.url)).toEqual([
      "https://naka.cx/api/v1/browse/3",
    ]);
    expect(w.sc.calls.map((c) => c.url)).toEqual([
      "https://www.senscritique.com/",
    ]);
    expect(w.storage.data.get("settings")).toMatchObject({
      lastFinish: { key: "movie:3", outcome: "failed", error: "sc-session" },
    });
  });
});

// The strings of a value that contain one of the markers.
const leaksOf = (values: unknown, markers: string[]): string[] =>
  strings(values).filter((text) => markers.some((m) => text.includes(m)));

const operationsOf = (calls: Call[]): string[] =>
  calls.map((c) => JSON.parse(c.init.body ?? "{}").operationName);

async function settleAll(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await settle();
}

describe("worker end to end: ratings", () => {
  async function ratedFilm() {
    const w = worker();
    w.send({ ...FINISHED, contentId: 3 }, NAKA_TAB);
    await settleAll();
    w.send({ type: "rating-card", contentId: 3 }, NAKA_TAB);
    await settleAll();
    w.send({ type: "rate", contentId: 3, label: "film", rating: 7 }, NAKA_TAB);
    await settleAll();
    w.send({ type: "rating-card", contentId: 3 }, NAKA_TAB);
    await settleAll();
    w.send({ type: "rating-cards" }, NAKA_TAB);
    await settleAll();
    return w;
  }

  it("a finish makes the card, one rate sends one ProductRate, and the answers follow the card", async () => {
    const w = await ratedFilm();
    const ops = operationsOf(w.sc.calls);
    expect(ops.filter((op) => op === "ProductRate")).toHaveLength(1);
    expect(ops).not.toContain("ProductUnwish");
    const [before, answeredRate, after, cards] = w.answers as {
      card?: { pending: string[]; given: object };
      cards?: unknown[];
    }[];
    expect(answeredRate).toEqual({ ok: true });
    expect(before?.card?.pending).toEqual(["film"]);
    expect(after?.card?.pending).toEqual([]);
    expect(after?.card?.given).toEqual({ film: 7 });
    expect(cards?.cards).toEqual([]);
    const rated = w.sc.calls.find((c) =>
      (c.init.body ?? "").includes('"ProductRate"'),
    );
    expect(JSON.parse(rated?.init.body ?? "{}").variables).toMatchObject({
      rating: 7,
    });
  });

  it("neither token reaches the stored ratings, the answers, or what crossed to the tab", async () => {
    const w = await ratedFilm();
    const markers = [SC_TOKEN, NAKA_TOKEN];
    expect(w.storage.data.has("ratings")).toBe(true);
    expect(leaksOf([...w.storage.data.values()], markers)).toEqual([]);
    expect(leaksOf(w.answers, markers)).toEqual([]);
    expect(leaksOf([w.traffic.sent, w.traffic.returned], markers)).toEqual([]);
  });

  it("the scan fires on a planted marker (positive control)", async () => {
    const w = await ratedFilm();
    const planted = [...w.answers, { card: { title: `x ${SC_TOKEN}` } }];
    expect(leaksOf(planted, [SC_TOKEN])).toHaveLength(1);
    expect(leaksOf({ ratings: [`y${NAKA_TOKEN}`] }, [NAKA_TOKEN])).toHaveLength(
      1,
    );
  });

  it("the SensCritique token goes only to Apollo for the rating, as the raw authorization header", async () => {
    const w = await ratedFilm();
    const rating = w.sc.calls.filter((c) =>
      (c.init.body ?? "").includes('"ProductRate"'),
    );
    expect(rating).toHaveLength(1);
    expect(rating[0]?.url).toBe("https://apollo.senscritique.com/");
    expect(rating[0]?.init.headers.authorization).toBe(SC_TOKEN);
    expect(rating[0]?.init.body ?? "").not.toContain(SC_TOKEN);
  });

  it("a rate from the status page, and one from a forged sender, send nothing", async () => {
    const w = worker();
    const rate = { type: "rate", contentId: 3, label: "film", rating: 7 };
    w.send(rate, STATUS_PAGE);
    w.send(rate, EVIL);
    w.send(rate, IFRAME);
    await settleAll();
    expect(w.sc.calls).toEqual([]);
    expect(w.naka.calls).toEqual([]);
    expect(w.storage.data.has("ratings")).toBe(false);
  });
});

describe("worker end to end: the shared limiters", () => {
  const spacing = (calls: Call[]) =>
    calls.slice(1).map((call, i) => call.at - (calls[i] as Call).at);

  it("SensCritique searches and Naka reads are each 2 s apart", async () => {
    const w = worker();
    w.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    const searches = w.sc.calls.filter((c) =>
      (c.init.body ?? "").includes("SearchProductExplorer"),
    );
    const reads = w.naka.calls.filter((c) => c.url.includes("/browse/"));
    expect(searches).toHaveLength(2);
    expect(reads).toHaveLength(2);
    for (const gap of [...spacing(searches), ...spacing(reads)]) {
      expect(gap).toBeGreaterThanOrEqual(2000);
    }
  });
});

// Ruling 20 (spec §5, probe 3): SearchProductExplorer answers without a token; a search reads no session.
describe("worker end to end: searches read no session", () => {
  const TWENTY = Array.from({ length: 20 }, (_, i) => i + 1);
  const operation = (call: Call): string =>
    call.url === WWW_HOME
      ? "home"
      : String(JSON.parse(call.init.body ?? "{}").operationName);

  it("a first sync of 20 titles reads the home page for none of its 40 searches", async () => {
    const clock: Clock = { time: Date.parse("2026-11-04T12:00:00Z") };
    const sc = scFetch(true, clock);
    const client = createNakaClient({
      fetch: nakaPlaylist(TWENTY),
      token: () => NAKA_TOKEN,
    });
    const r = createWorker({
      extensionId: EXT,
      session: memoryArea(),
      storage: memoryArea(),
      tabs: tabRunning(client, () => "77").tabs,
      fetch: sc.fetch,
      timer: { set: () => 0, clear: () => undefined },
      now: () => clock.time,
      sleep: async (ms) => {
        clock.time += ms;
      },
    });
    r.handle({ type: "resync" }, STATUS_PAGE, () => undefined);
    await settle();
    const ops = sc.calls.map(operation);
    const searches = sc.calls.filter(
      (c) => operation(c) === "SearchProductExplorer",
    );
    expect(searches).toHaveLength(40);
    for (const search of searches) {
      expect(search.url).toBe(APOLLO_HOST);
      expect(search.init.headers).toStrictEqual({
        "content-type": "application/json",
      });
      expect(search.init.credentials).toBe("omit");
    }
    // The binding, each wishlist read (one page each here) and each product state read the session;
    // nothing else does.
    const count = (name: string) => ops.filter((op) => op === name).length;
    expect(count("home")).toBe(
      1 + count("UserCollection") + count("ProductCurrentUserInfos"),
    );
    ops.forEach((op, i) => {
      if (op === "home") expect(ops[i + 1]).not.toBe("SearchProductExplorer");
    });
  });
});

describe("worker end to end: a finish is dated in the owner's time zone", () => {
  const before = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "Pacific/Kiritimati";
  });

  afterAll(() => {
    process.env.TZ = before;
  });

  it("10:30 UTC on 4 November is the 5th in Kiritimati", async () => {
    const w = worker(true, "2026-11-04T10:30:00Z");
    w.send({ ...FINISHED, contentId: 3 }, NAKA_TAB);
    await settle();
    const dated = w.sc.calls
      .map((c) => JSON.parse(c.init.body ?? "{}"))
      .find((body) => body.operationName === "SetProductDateDone");
    expect(dated?.variables).toEqual({ productId: 1003, date: "2026-11-05" });
  });
});

// M10 and M12: the first real use, end to end through createWorker with the real clients, and the real
// snapshot read by the page's own view model.
describe("worker end to end: a first naka-ready in simulation", () => {
  const NB = "\u202F";
  const SC_WRITES = [
    "ProductWish",
    "ProductUnwish",
    "ProductDone",
    "SetProductDateDone",
    "ProductUndone",
    "ProductRate",
  ];
  const operations = (w: ReturnType<typeof worker>) =>
    w.sc.calls
      .filter((c) => c.url === APOLLO_HOST)
      .map((c) => String(JSON.parse(c.init.body ?? "{}").operationName));

  it("writes nothing on either site, and records a preview with sides and titles", async () => {
    const w = worker();
    w.send({ type: "naka-ready" }, NAKA_TAB);
    await settle();
    const ops = operations(w);
    expect(ops).toContain("SearchProductExplorer");
    for (const write of SC_WRITES) expect(ops).not.toContain(write);
    expect(w.naka.calls.filter((c) => c.init.method !== "GET")).toEqual([]);
    expect(w.naka.calls.map((c) => c.url)).not.toContain(
      "https://naka.cx/api/v1/playlist",
    );
    const run = parseSettings(w.storage.data.get("settings")).lastRun;
    expect(run).toMatchObject({
      trigger: "naka-ready",
      mode: "simulation",
      outcome: "ok",
    });
    expect(run?.preview).toEqual([
      { side: "sc", title: "Film 1", year: 2001, type: "film" },
      { side: "naka", title: "Film 2", year: 2002, type: "film" },
    ]);
  });

  it("the real status answer, read by the page's view model, gives the expected page", async () => {
    const w = worker();
    w.send({ type: "naka-ready" }, NAKA_TAB);
    await settle();
    w.send({ type: "status" }, STATUS_PAGE);
    await settle();
    expect(w.answers).toHaveLength(1);
    expect(toStatusView(w.answers[0], localFormat("UTC"))).toEqual({
      kind: "ready",
      headline: `Simulation${NB}: vos listes ne sont pas modifiées. Les fins de visionnage sont enregistrées sur SensCritique.`,
      mode: "simulation",
      switchLabel: "Activer les écritures",
      switchDisabled: false,
      actionsDisabled: false,
      inProgress: false,
      previewCount: 2,
      next: [],
      lines: [
        `Comptes liés${NB}: owner sur SensCritique, compte Naka n°\u00A077`,
        `Dernière synchronisation (simulation)${NB}: 04/11/2026 12:00 (ouverture de Naka)`,
        `Prévus${NB}: 2`,
        `Reportés (10 écritures au plus par passage)${NB}: 0`,
        `Déjà vus sur SensCritique${NB}: 0`,
        `Pas encore examinés${NB}: 0`,
        "Rien en attente",
        `Notes \u00E0 donner${NB}: aucune`,
      ],
      preview: [
        `Envies SensCritique${NB}: Film 1 (2001, film)`,
        `Ma liste Naka${NB}: Film 2 (2002, film)`,
      ],
      settingsPending: false,
      settings: toSettingsView({ film: 0.9, episode: 0.8 }, 0),
    });
  });
});

describe("router: the manual link family (B6)", () => {
  it("search-titles from the status page is answered by the job, outside the queue", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
      searchTitles: async () => ({
        candidates: [{ id: 1, title: "A", type: "film" }],
      }),
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    expect(r.send(SEARCH, STATUS_PAGE)).toBe(true);
    await settle();
    expect(r.answers).toEqual([
      { candidates: [{ id: 1, title: "A", type: "film" }] },
    ]);
    blocker.open();
  });

  it("link-title and requeue-question from the status page are queued and answered { ok: true } at once", async () => {
    const r = router();
    expect(r.send(LINK, STATUS_PAGE)).toBe(false);
    expect(r.send(REQUEUE, STATUS_PAGE)).toBe(false);
    expect(r.answers).toEqual([{ ok: true }, { ok: true }]);
    await settle();
    expect(r.calls).toEqual([
      `link:${JSON.stringify(LINK)}`,
      `requeue:${JSON.stringify(REQUEUE)}`,
    ]);
  });

  it("the message keeps its known keys only", async () => {
    const r = router();
    r.send({ ...LINK, token: "T" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toEqual([`link:${JSON.stringify(LINK)}`]);
  });

  it("a second link of the same title replaces the waiting one (queue key link:naka:5)", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    r.send(LINK, STATUS_PAGE);
    r.send({ ...LINK, otherId: 2006 }, STATUS_PAGE);
    blocker.open();
    await settle();
    expect(r.calls.filter((c) => c.startsWith("link:"))).toEqual([
      `link:${JSON.stringify({ ...LINK, otherId: 2006 })}`,
    ]);
  });

  it("a waiting link is reported as answering by its key, a waiting requeue by its row's key (R1)", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    r.send(LINK, STATUS_PAGE);
    r.send(REQUEUE, STATUS_PAGE);
    r.send({ type: "page-lists" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toContain('page-lists:["link:naka:5","ambiguity:naka:5"]');
    blocker.open();
  });

  it("a requeue is answering only while it waits: the row unlocks once it has run (R1)", async () => {
    const r = router();
    r.send(REQUEUE, STATUS_PAGE);
    await settle();
    r.send({ type: "page-lists" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toContain("page-lists:[]");
  });

  it("a malformed query or id is no message", async () => {
    const r = router();
    for (const bad of [
      { ...SEARCH, query: "" },
      { ...SEARCH, query: "x".repeat(201) },
      { ...SEARCH, query: 5 },
      { ...SEARCH, side: "x" },
      { ...LINK, otherId: 0 },
      { ...LINK, otherId: "2005" },
      { ...LINK, otherId: undefined },
      { ...REQUEUE, id: -1 },
    ]) {
      expect(r.send(bad, STATUS_PAGE)).toBe(false);
    }
    await settle();
    expect(r.calls).toEqual([]);
    expect(r.answers).toEqual([]);
  });

  it("link-title, search-titles and requeue-question from a Naka tab are ignored (Review Focus 1)", async () => {
    const r = router();
    for (const msg of [LINK, SEARCH, REQUEUE]) {
      expect(r.send(msg, NAKA_TAB)).toBe(false);
    }
    await settle();
    expect(r.calls).toEqual([]);
    expect(r.answers).toEqual([]);
  });
});

describe("router: the title page messages", () => {
  const FICHE_TAB = { ...NAKA_TAB, tab: { id: 42, url: PLAYER } };
  const FICHE_INFO = {
    type: "fiche-info",
    contentId: 5,
    tmdbId: 9005,
    mediaType: "movie",
    title: "Solaris",
  };
  const FICHE_SEASON = { type: "fiche-season", contentId: 5, season: 2 };
  const FICHE_MINE = { type: "fiche-mine", contentId: 5, productId: 2005 };

  it("fiche-info, fiche-season and fiche-mine are answered outside the queue, for the sending tab", async () => {
    const r = router();
    expect(r.send(FICHE_INFO, FICHE_TAB)).toBe(true);
    expect(r.send(FICHE_SEASON, FICHE_TAB)).toBe(true);
    expect(r.send(FICHE_MINE, FICHE_TAB)).toBe(true);
    await settle();
    expect(r.calls).toEqual([
      `fiche-info:42:${JSON.stringify(FICHE_INFO)}`,
      `fiche-season:42:${JSON.stringify(FICHE_SEASON)}`,
      `fiche-mine:42:${JSON.stringify(FICHE_MINE)}`,
    ]);
    expect(r.answers).toEqual([
      { state: "notfound" },
      { episodes: [] },
      { mine: 6, average: null },
    ]);
  });

  it("a fiche-season above season 100 is refused: no job, no answer", async () => {
    const r = router();
    expect(r.send({ ...FICHE_SEASON, season: 101 }, FICHE_TAB)).toBe(false);
    await settle();
    expect(r.calls).toEqual([]);
    expect(r.answers).toEqual([]);
  });

  it("a fiche read that rejects is answered undefined at once", async () => {
    const r = router({
      ficheMine: async () => {
        throw new Error("not issued");
      },
    });
    expect(r.send(FICHE_MINE, FICHE_TAB)).toBe(true);
    await settle();
    expect(r.answers).toEqual([undefined]);
  });

  it("a Naka sender with no tab id is ignored", async () => {
    const r = router();
    expect(r.send(FICHE_INFO, NAKA_TAB)).toBe(false);
    await settle();
    expect(r.calls).toEqual([]);
    expect(r.answers).toEqual([]);
  });

  it("the fiche reads from the status page are ignored", async () => {
    const r = router();
    const page = { ...STATUS_PAGE, tab: { id: 42, url: STATUS_URL } };
    expect(r.send(FICHE_INFO, page)).toBe(false);
    await settle();
    expect(r.calls).toEqual([]);
  });

  const FICHE_RATE = {
    type: "fiche-rate",
    contentId: 5,
    target: "film",
    productId: 2005,
    rating: 7,
  };
  const FICHE_LINK = { type: "fiche-link", contentId: 5, productId: 2005 };

  it("fiche-rate and fiche-link run for the sending tab and are answered with their job's answer", async () => {
    const r = router({
      ficheRate: async () => ({ error: "finish-limit" }),
    });
    expect(r.send(FICHE_RATE, FICHE_TAB)).toBe(true);
    expect(r.send(FICHE_LINK, FICHE_TAB)).toBe(true);
    await settle();
    expect(r.calls).toEqual([`fiche-link:42:${JSON.stringify(FICHE_LINK)}`]);
    expect(r.answers).toEqual([{ error: "finish-limit" }, { ok: true }]);
  });

  it("the fiche writes wait on the one queue: they start after the job before them ends", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const r = router({ setMode: () => held });
    r.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    r.send(FICHE_RATE, FICHE_TAB);
    r.send(FICHE_LINK, FICHE_TAB);
    await settle();
    expect(r.answers).toEqual([]);
    expect(r.calls).toEqual([]);
    release();
    await settle();
    expect(r.calls).toEqual([
      `fiche-rate:42:${JSON.stringify(FICHE_RATE)}`,
      `fiche-link:42:${JSON.stringify(FICHE_LINK)}`,
    ]);
    expect(r.answers).toEqual([{ ok: true }, { ok: true }]);
  });

  it("a fiche write that rejects is answered undefined", async () => {
    const r = router({
      ficheLink: async () => {
        throw new Error("not issued");
      },
    });
    r.send(FICHE_LINK, FICHE_TAB);
    await settle();
    expect(r.answers).toEqual([undefined]);
  });

  it("the fiche writes from the status page are ignored", async () => {
    const r = router();
    const page = { ...STATUS_PAGE, tab: { id: 42, url: STATUS_URL } };
    expect(r.send(FICHE_RATE, page)).toBe(false);
    expect(r.send(FICHE_LINK, page)).toBe(false);
    await settle();
    expect(r.calls).toEqual([]);
  });

  it("a removed tab drops its issued products", () => {
    const r = router();
    r.dropTab(42);
    expect(r.calls).toEqual(["drop-fiche-tab:42"]);
  });
});

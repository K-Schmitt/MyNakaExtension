import { describe, expect, it } from "vitest";
import type { FinishedMessage } from "../src/content/playback-tracker";
import { emptyState, type SyncState } from "../src/core/state";
import type {
  AnswerQuestionMessage,
  AnswerRemovalMessage,
} from "../src/ext/question-messages";
import type { Jobs } from "../src/sw/jobs";
import { beginAnswer } from "./runtime-answer-oracles";
import { oracleOf } from "./runtime-oracles";
import {
  answerStatus,
  clockFor,
  createWorld,
  LIVE_TAB,
  observed,
  ownerEdit,
  scFor,
  sentFinish,
  setThresholds,
  storageFor,
  tabsFor,
  type World,
} from "./runtime-world";

// Positive controls of the runtime fuzz's oracles (tests/runtime-oracles.ts): for each one, a hand-made trace
// that breaks its rule must make it fire, and a clean trace must not. Without these, a green fuzz could
// mean an oracle that can never fire.

const ORPHAN = 101;

// A world with no randomness left: no flaky write, no failing storage, no orphan tab, nothing stored.
function quietWorld(): World {
  const w = createWorld(1);
  w.r = () => 0.5;
  w.failRate = 0;
  w.orphans = [];
  w.storage.clear();
  return w;
}

const fired = (w: World): string[] => w.violations.map(oracleOf);

function latch() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

function fakeJobs(over: Partial<Jobs> = {}): Jobs {
  return {
    syncJob: async () => undefined,
    finishJob: async () => undefined,
    setMode: async () => undefined,
    setSettings: async () => undefined,
    rate: async () => undefined,
    dismissRating: async () => undefined,
    answerQuestion: async () => undefined,
    answerRemoval: async () => undefined,
    hideQuestion: async () => undefined,
    linkTitle: async () => undefined,
    requeueQuestion: async () => undefined,
    forget: async () => undefined,
    reset: async () => undefined,
    forgetHandled: async () => undefined,
    forgetHandledFromTab: async () => undefined,
    handledTitles: async () => ({ titles: [] }),
    searchTitles: async () => ({ candidates: [] }),
    statusSnapshot: async () => ({}),
    ratingCard: async () => ({ card: null, pauseFromPercent: 0 }),
    ratingCards: async () => ({ cards: [] }),
    openQuestions: async () => ({ questions: [] }),
    removalOffer: async () => ({ offer: null }),
    pageLists: async () => ({ questions: [], unlinked: [] }),
    ...over,
  };
}

const live = (w: World, extra: Record<string, unknown> = {}) =>
  w.storage.set("settings", { mode: "live", ...extra });

const film = (
  source: FinishedMessage["source"],
  progress: number,
): FinishedMessage => ({ type: "finished", source, progress, contentId: 1 });

const episode = (
  source: FinishedMessage["source"],
  progress: number,
): FinishedMessage => ({
  type: "finished",
  source,
  progress,
  contentId: 1,
  season: 1,
  episode: 2,
});

const same = (threshold: number) => ({ film: threshold, episode: threshold });

// A finish job running for `msg`, which a Naka tab sent.
function finishing(w: World, msg: FinishedMessage): void {
  sentFinish(w, msg);
  w.current = { kind: "finish", msg };
}

describe("O1 never two jobs at once", () => {
  it("fires when two jobs overlap", async () => {
    const w = quietWorld();
    w.allowed.set("sync:button", 2);
    const gate = latch();
    const jobs = observed(w, 0, fakeJobs({ syncJob: () => gate.opened }));
    const both = Promise.all([jobs.syncJob("button"), jobs.syncJob("button")]);
    gate.open();
    await both;
    expect(fired(w)).toEqual(["O1 two jobs at once"]);
  });

  it("stays silent for jobs one after the other, and for a status answer during a job", async () => {
    const w = quietWorld();
    w.allowed.set("sync:button", 2);
    w.allowed.set("status", 1);
    const gate = latch();
    const jobs = observed(w, 0, fakeJobs({ syncJob: () => gate.opened }));
    const first = jobs.syncJob("button");
    await jobs.statusSnapshot();
    gate.open();
    await first;
    await jobs.syncJob("button");
    expect(w.violations).toEqual([]);
  });
});

describe("O2 stored values always parse", () => {
  it("fires on an invalid state and on invalid settings", async () => {
    const w = quietWorld();
    const area = storageFor(w, 0);
    await area.set({ state: { ...emptyState(), threshold: 2 } });
    await area.set({ settings: { mode: "paused" } });
    expect(fired(w)).toEqual(["O2 invalid storage", "O2 invalid storage"]);
  });

  it("stays silent on valid ones", async () => {
    const w = quietWorld();
    await storageFor(w, 0).set({
      state: emptyState(),
      settings: { mode: "live" },
    });
    expect(w.violations).toEqual([]);
  });
});

describe("O3 no list write in simulation", () => {
  it("fires on a wish while the stored mode is simulation", async () => {
    const w = quietWorld();
    w.storage.set("settings", { mode: "simulation" });
    w.current = { kind: "sync" };
    await scFor(w, 0).wish(1001);
    expect(fired(w)).toEqual(["O3 write in simulation"]);
  });

  it("stays silent in live mode", async () => {
    const w = quietWorld();
    live(w);
    w.current = { kind: "sync" };
    await scFor(w, 0).wish(1001);
    expect(w.violations).toEqual([]);
  });
});

describe("O4 no write and no state save for other accounts", () => {
  it("fires on a wish and on a state save while another account is signed in", async () => {
    const w = quietWorld();
    live(w, { binding: { scUsername: "owner" } });
    w.scAccount = "other";
    w.current = { kind: "sync" };
    await scFor(w, 0).wish(1001);
    await storageFor(w, 0).set({ state: emptyState() });
    expect(fired(w)).toEqual(["O4 binding", "O4 binding"]);
  });

  it("stays silent for the bound accounts", async () => {
    const w = quietWorld();
    live(w, { binding: { scUsername: "owner", nakaAccount: "77" } });
    w.current = { kind: "sync" };
    await scFor(w, 0).wish(1001);
    await storageFor(w, 0).set({ state: emptyState() });
    expect(w.violations).toEqual([]);
  });
});

describe("O5 no re-add after the owner removed a title", () => {
  function addFilmOne(w: World) {
    w.current = { kind: "sync", found: [LIVE_TAB], tried: new Set() };
    return tabsFor(w, 0).send(LIVE_TAB, {
      type: "naka-call",
      call: "add",
      contentId: 1,
    });
  }

  it("fires when a title seen in both lists, then removed from Naka, is added back", async () => {
    const w = quietWorld();
    live(w);
    w.playlist.add(1);
    w.wishlist.add(1001);
    w.seenBoth.add(1);
    ownerEdit(w, 1, "naka");
    await addFilmOne(w);
    expect(fired(w)).toEqual(["O5 re-add"]);
  });

  it("stays silent when no completed run had seen it in both", async () => {
    const w = quietWorld();
    live(w);
    w.playlist.add(1);
    w.wishlist.add(1001);
    ownerEdit(w, 1, "naka");
    await addFilmOne(w);
    expect(w.violations).toEqual([]);
  });
});

describe("O6 no re-wish of a film its finish settled", () => {
  async function markFilmOneDone(w: World) {
    finishing(w, film("explicit", 1));
    await scFor(w, 0).markDone(1001, "2026-11-04");
    w.current = { kind: "sync" };
  }

  it("fires on a wish of the film after its markDone", async () => {
    const w = quietWorld();
    live(w);
    await markFilmOneDone(w);
    await scFor(w, 0).wish(1001);
    expect(fired(w)).toEqual(["O6 re-wish"]);
  });

  it("stays silent for another film", async () => {
    const w = quietWorld();
    live(w);
    await markFilmOneDone(w);
    await scFor(w, 0).wish(1002);
    expect(w.violations).toEqual([]);
  });
});

describe("O7 a job or a status answer only for a message its sender may send", () => {
  it("fires on a job, and on a status answer, that no message allowed", async () => {
    const w = quietWorld();
    const jobs = observed(w, 0, fakeJobs());
    await jobs.syncJob("button");
    await jobs.statusSnapshot();
    expect(fired(w)).toEqual(["O7 forged message", "O7 forged message"]);
  });

  it("stays silent for allowed ones", async () => {
    const w = quietWorld();
    w.allowed.set("sync:button", 1);
    w.allowed.set("status", 1);
    const jobs = observed(w, 0, fakeJobs());
    await jobs.syncJob("button");
    await jobs.statusSnapshot();
    expect(w.violations).toEqual([]);
  });
});

describe("O8 forbidden writes", () => {
  it("fires on a rating, an undone, a Naka removal and an unwish of a series", async () => {
    const w = quietWorld();
    const sc = scFor(w, 0);
    await sc.rate(1001, 8);
    await sc.unmarkDone(1001);
    w.current = { kind: "sync", found: [LIVE_TAB], tried: new Set() };
    await tabsFor(w, 0).send(LIVE_TAB, {
      type: "naka-call",
      call: "remove",
      contentId: 1,
    });
    finishing(w, { ...film("explicit", 1), contentId: 11 });
    await sc.unwish(1011);
    expect(fired(w)).toEqual([
      "O8 forbidden write",
      "O8 forbidden write",
      "O8 forbidden write",
      "O8 forbidden write",
    ]);
  });

  it("stays silent on the unwish of a film", async () => {
    const w = quietWorld();
    finishing(w, film("explicit", 1));
    await scFor(w, 0).unwish(1001);
    expect(w.violations).toEqual([]);
  });
});

describe("O9 no finish write once the hour's 30 finishes are spent", () => {
  async function finishWith(count: number) {
    const w = quietWorld();
    live(w, { finishWindow: { from: w.time - 1000, count } });
    finishing(w, film("explicit", 1));
    clockFor(w)();
    await scFor(w, 0).markDone(1001, "2026-11-04");
    return w;
  }

  it("fires on a markDone by a job that started with 30 finishes spent", async () => {
    expect(fired(await finishWith(30))).toEqual(["O9 finish budget"]);
  });

  it("stays silent with 29", async () => {
    expect((await finishWith(29)).violations).toEqual([]);
  });
});

describe("O10 no tabs call once the job lost its tab", () => {
  const ACCOUNT = { type: "naka-account" } as const;

  async function pinnedThenRefused() {
    const w = quietWorld();
    const tabs = tabsFor(w, 0);
    w.current = { kind: "sync" };
    await tabs.query("https://naka.cx/*");
    await tabs.send(LIVE_TAB, ACCOUNT);
    w.tabOpen = false;
    await expect(tabs.send(LIVE_TAB, ACCOUNT)).rejects.toThrow();
    return { w, tabs };
  }

  it("allows the one query that classifies the loss of a pinned tab", async () => {
    const { w, tabs } = await pinnedThenRefused();
    await tabs.query("https://naka.cx/*");
    expect(fired(w)).toEqual([]);
  });

  it("fires on a second query after the pinned tab refused a send", async () => {
    const { w, tabs } = await pinnedThenRefused();
    await tabs.query("https://naka.cx/*");
    await tabs.query("https://naka.cx/*");
    expect(fired(w)).toEqual(["O10 lost tab"]);
  });

  it("fires on a send to another tab after the allowed query", async () => {
    const { w, tabs } = await pinnedThenRefused();
    w.orphans = [ORPHAN];
    await tabs.query("https://naka.cx/*");
    await expect(tabs.send(ORPHAN, ACCOUNT)).rejects.toThrow();
    expect(fired(w)).toEqual(["O10 lost tab"]);
  });

  it("fires on a send after the pinned tab refused a send", async () => {
    const { w, tabs } = await pinnedThenRefused();
    await expect(tabs.send(LIVE_TAB, ACCOUNT)).rejects.toThrow();
    expect(fired(w)).toEqual(["O10 lost tab"]);
  });

  it("fires on a call after every tab found refused", async () => {
    const w = quietWorld();
    w.orphans = [ORPHAN];
    w.tabOpen = false;
    const tabs = tabsFor(w, 0);
    w.current = { kind: "sync" };
    await tabs.query("https://naka.cx/*");
    await expect(tabs.send(ORPHAN, ACCOUNT)).rejects.toThrow();
    await expect(tabs.send(ORPHAN, ACCOUNT)).rejects.toThrow();
    expect(fired(w)).toEqual(["O10 lost tab"]);
  });

  it("stays silent while the pinned tab answers, an orphan refused before it", async () => {
    const w = quietWorld();
    w.orphans = [ORPHAN];
    const tabs = tabsFor(w, 0);
    w.current = { kind: "sync" };
    await tabs.query("https://naka.cx/*");
    await expect(tabs.send(ORPHAN, ACCOUNT)).rejects.toThrow();
    await tabs.send(LIVE_TAB, ACCOUNT);
    await tabs.send(LIVE_TAB, ACCOUNT);
    expect(w.violations).toEqual([]);
  });
});

describe("O11 one tab per job, tried in query order", () => {
  const ACCOUNT = { type: "naka-account" } as const;

  async function job(w: World, calls: (string | number)[]) {
    const tabs = tabsFor(w, 0);
    w.current = { kind: "sync" };
    for (const call of calls) {
      if (call === "query") await tabs.query("https://naka.cx/*");
      else await tabs.send(call as number, ACCOUNT).catch(() => undefined);
    }
  }

  it.each([
    ["a send before any query", [LIVE_TAB]],
    ["a try out of query order", ["query", LIVE_TAB]],
    ["a send to another tab once pinned", ["query", ORPHAN, LIVE_TAB, ORPHAN]],
    ["a query once pinned", ["query", ORPHAN, LIVE_TAB, "query"]],
  ] as const)("fires on %s", async (_name, calls) => {
    const w = quietWorld();
    w.orphans = [ORPHAN];
    await job(w, [...calls]);
    expect(fired(w)).toEqual(["O11 one tab per job"]);
  });

  it("stays silent for the query, the tries in order, then the pinned tab only", async () => {
    const w = quietWorld();
    w.orphans = [ORPHAN];
    await job(w, ["query", ORPHAN, LIVE_TAB, LIVE_TAB]);
    expect(w.violations).toEqual([]);
  });
});

describe("O12 a status answer never writes storage", () => {
  it("fires on a write made inside a status answer", async () => {
    const w = quietWorld();
    await answerStatus(() =>
      storageFor(w, 0).set({ settings: { mode: "live" } }),
    );
    expect(fired(w)).toEqual(["O12 read-only status"]);
  });

  it("stays silent for its reads, and for a job's write while an answer waits", async () => {
    const w = quietWorld();
    const area = storageFor(w, 0);
    const gate = latch();
    const answer = answerStatus(async () => {
      await gate.opened;
      return area.get("settings");
    });
    await area.set({ settings: { mode: "live" } });
    gate.open();
    await answer;
    expect(w.violations).toEqual([]);
  });
});

describe("O13 a finish write needs a complete viewing", () => {
  async function markDone(w: World) {
    await scFor(w, 0).markDone(1001, "2026-11-04");
    return fired(w);
  }

  it("fires below the stored threshold", async () => {
    const w = quietWorld();
    setThresholds(w, same(0.9));
    finishing(w, film("threshold", 0.85));
    expect(await markDone(w)).toEqual(["O13 threshold rule"]);
  });

  it("fires for an episode at 0.85 under an episode threshold of 0.9", async () => {
    const w = quietWorld();
    setThresholds(w, { film: 0.8, episode: 0.9 });
    finishing(w, episode("threshold", 0.85));
    expect(await markDone(w)).toEqual(["O13 threshold rule"]);
  });

  it("judges an episode by the episode threshold, a film by the film's", async () => {
    const ep = quietWorld();
    setThresholds(ep, { film: 0.99, episode: 0.8 });
    finishing(ep, episode("threshold", 0.8));
    expect(await markDone(ep)).toEqual([]);
    const fm = quietWorld();
    setThresholds(fm, { film: 0.99, episode: 0.8 });
    finishing(fm, film("threshold", 0.95));
    expect(await markDone(fm)).toEqual(["O13 threshold rule"]);
  });

  it("judges the threshold stored at the write: 0.95 fails under 0.99", async () => {
    const w = quietWorld();
    setThresholds(w, same(0.85));
    finishing(w, film("threshold", 0.95));
    setThresholds(w, same(0.99));
    expect(await markDone(w)).toEqual(["O13 threshold rule"]);
  });

  it("with nothing stored, judges the spec's defaults: 90 % for a film, 80 % for an episode", async () => {
    const low = quietWorld();
    finishing(low, film("threshold", 0.89));
    expect(await markDone(low)).toEqual(["O13 threshold rule"]);
    const high = quietWorld();
    finishing(high, film("threshold", 0.9));
    expect(await markDone(high)).toEqual([]);
    const lowEpisode = quietWorld();
    finishing(lowEpisode, episode("threshold", 0.79));
    expect(await markDone(lowEpisode)).toEqual(["O13 threshold rule"]);
    const highEpisode = quietWorld();
    finishing(highEpisode, episode("threshold", 0.8));
    expect(await markDone(highEpisode)).toEqual([]);
  });

  it("fires on a message no Naka tab sent, and outside a finish job", async () => {
    const forged = quietWorld();
    forged.current = { kind: "finish", msg: film("explicit", 1) };
    expect(await markDone(forged)).toEqual(["O13 threshold rule"]);
    const sync = quietWorld();
    sync.current = { kind: "sync" };
    await scFor(sync, 0).unwish(1001);
    expect(fired(sync)).toEqual(["O13 threshold rule"]);
  });

  it("stays silent for an explicit vu at any progress, and at the threshold", async () => {
    const explicit = quietWorld();
    setThresholds(explicit, same(0.99));
    finishing(explicit, film("explicit", 0.1));
    expect(await markDone(explicit)).toEqual([]);
    const reached = quietWorld();
    setThresholds(reached, same(0.95));
    finishing(reached, film("threshold", 0.95));
    expect(await markDone(reached)).toEqual([]);
  });
});

// The stored state of an answer's start, as the worker would have saved it.
const stored = (w: World, over: Partial<SyncState>): void => {
  w.storage.set("state", { ...emptyState(), ...over });
};

const PAIR_ONE = { nakaId: 1, scId: 1001 };
const removalItem = (removeFrom: "naka" | "sc") => ({
  kind: "removal" as const,
  removeFrom,
  pair: PAIR_ONE,
  asked: false,
});

const REMOVE: AnswerRemovalMessage = {
  type: "answer-removal",
  removeFrom: "sc",
  ...PAIR_ONE,
  remove: true,
};

// An answer job running for `msg`, which the owner's click sent.
function answeringWith(
  w: World,
  msg: AnswerRemovalMessage | AnswerQuestionMessage,
) {
  w.current = beginAnswer(w, msg);
  w.current.found = [LIVE_TAB];
  w.current.tried = new Set();
}

function addToNaka(w: World) {
  w.current = { kind: "sync", found: [LIVE_TAB], tried: new Set() };
  return tabsFor(w, 0).send(LIVE_TAB, {
    type: "naka-call",
    call: "add",
    contentId: 1,
  });
}

function removeFromNaka(w: World) {
  return tabsFor(w, 0).send(LIVE_TAB, {
    type: "naka-call",
    call: "remove",
    contentId: 1,
  });
}

describe("O14 a removal write needs a remove answer and a real removal", () => {
  const mapped = { mapping: [PAIR_ONE] };

  async function unwishWith(msg: AnswerRemovalMessage, listedBoth: boolean) {
    const w = quietWorld();
    w.playlist.delete(1);
    stored(w, mapped);
    if (listedBoth) w.lastRunBoth.add(1);
    answeringWith(w, msg);
    await scFor(w, 0).unwish(1001);
    return w;
  }

  it("fires on an unwish of a mapped pair the world never listed on Naka", async () => {
    expect(fired(await unwishWith(REMOVE, false))).toEqual([
      "O14 removal write",
    ]);
  });

  it("fires on an unwish for a « Non », and for a pair the Naka list shows again", async () => {
    expect(fired(await unwishWith({ ...REMOVE, remove: false }, true))).toEqual(
      ["O14 removal write"],
    );
    const back = quietWorld();
    stored(back, mapped);
    back.lastRunBoth.add(1);
    back.playlist.add(1);
    answeringWith(back, REMOVE);
    await scFor(back, 0).unwish(1001);
    expect(fired(back)).toEqual(["O14 removal write"]);
  });

  it("fires on an unwish of a settled pair, and of another product than the message's", async () => {
    const settled = quietWorld();
    settled.playlist.delete(1);
    stored(settled, { ...mapped, settled: [PAIR_ONE] });
    settled.lastRunBoth.add(1);
    answeringWith(settled, REMOVE);
    await scFor(settled, 0).unwish(1001);
    expect(fired(settled)).toEqual(["O14 removal write"]);
    const other = quietWorld();
    stored(other, { ...mapped, pending: [removalItem("sc")] });
    answeringWith(other, REMOVE);
    await scFor(other, 0).unwish(1002);
    expect(fired(other)).toEqual(["O14 removal write"]);
  });

  it("fires on the wrong side and on a second write for one message", async () => {
    const side = quietWorld();
    stored(side, { pending: [removalItem("sc")] });
    answeringWith(side, { ...REMOVE, removeFrom: "naka" });
    await scFor(side, 0).unwish(1001);
    expect(fired(side)).toEqual(["O14 removal write"]);
    const twice = quietWorld();
    stored(twice, { pending: [removalItem("sc")] });
    answeringWith(twice, REMOVE);
    await scFor(twice, 0).unwish(1001);
    await scFor(twice, 0).unwish(1001);
    expect(fired(twice)).toEqual(["O14 removal write"]);
  });

  it("fires on a removeFromPlaylist with no stored removal on Naka's side", async () => {
    const w = quietWorld();
    w.playlist.add(1);
    stored(w, { ...mapped, pending: [removalItem("sc")] });
    answeringWith(w, { ...REMOVE, removeFrom: "naka" });
    await removeFromNaka(w);
    expect(fired(w)).toEqual(["O14 removal write"]);
  });

  it("stays silent for a stored removal, on either side", async () => {
    const sc = quietWorld();
    stored(sc, { pending: [removalItem("sc")] });
    answeringWith(sc, REMOVE);
    await scFor(sc, 0).unwish(1001);
    const naka = quietWorld();
    naka.playlist.add(1);
    stored(naka, { pending: [removalItem("naka")] });
    answeringWith(naka, { ...REMOVE, removeFrom: "naka" });
    await removeFromNaka(naka);
    expect(sc.violations).toEqual([]);
    expect(naka.violations).toEqual([]);
    expect(naka.playlist.has(1)).toBe(false);
  });

  it("stays silent for a mapped, unsettled pair listed on both sides at the last run", async () => {
    expect((await unwishWith(REMOVE, true)).violations).toEqual([]);
  });
});

describe("O15 no write back to the side a « Non » left", () => {
  const NON: AnswerRemovalMessage = { ...REMOVE, remove: false };

  async function answeredNon(closes: boolean) {
    const w = quietWorld();
    live(w);
    w.playlist.delete(1);
    stored(w, { pending: [removalItem("sc")] });
    w.allowed.set("answer", 1);
    const jobs = observed(
      w,
      0,
      fakeJobs({
        answerRemoval: async () => {
          if (closes) stored(w, {});
        },
      }),
    );
    await jobs.answerRemoval(NON);
    return w;
  }

  it("fires on an add to Naka after a « Non » closed the removal from SensCritique", async () => {
    const w = await answeredNon(true);
    await addToNaka(w);
    expect(fired(w)).toEqual(["O15 written back"]);
  });

  it("fires on a wish after a « Non » to a removal from Naka", async () => {
    const w = quietWorld();
    live(w);
    stored(w, { pending: [removalItem("naka")] });
    w.allowed.set("answer", 1);
    const jobs = observed(
      w,
      0,
      fakeJobs({ answerRemoval: async () => stored(w, {}) }),
    );
    await jobs.answerRemoval({ ...NON, removeFrom: "naka" });
    w.current = { kind: "sync" };
    await scFor(w, 0).wish(1001);
    expect(fired(w)).toEqual(["O15 written back"]);
  });

  it("stays silent once the owner added the title back there", async () => {
    const w = await answeredNon(true);
    ownerEdit(w, 1, "naka");
    w.playlist.delete(1);
    await addToNaka(w);
    expect(w.violations).toEqual([]);
  });

  it("stays silent while the removal is still stored, and for the other side", async () => {
    const kept = await answeredNon(false);
    await addToNaka(kept);
    expect(kept.violations).toEqual([]);
    const other = await answeredNon(true);
    other.current = { kind: "sync" };
    await scFor(other, 0).wish(1001);
    expect(other.violations).toEqual([]);
  });
});

describe("O16 a choice outside the stored candidates changes nothing", () => {
  const ASK = {
    kind: "ambiguity" as const,
    side: "naka" as const,
    id: 1,
    candidateIds: [1001],
    candidates: [{ id: 1001, title: "Film 1", type: "film" as const }],
    finish: "movie:1",
  };
  const choose = (choice: number | null): AnswerQuestionMessage => ({
    type: "answer-question",
    side: "naka",
    id: 1,
    choice,
  });

  async function chose(choice: number | null, change: boolean) {
    const w = quietWorld();
    stored(w, { pending: [ASK] });
    w.allowed.set("answer", 1);
    const jobs = observed(
      w,
      0,
      fakeJobs({
        answerQuestion: async () => {
          if (change) stored(w, { pending: [], mapping: [PAIR_ONE] });
        },
      }),
    );
    await jobs.answerQuestion(choose(choice));
    return w;
  }

  it("fires on a state change after a choice that is no candidate", async () => {
    expect(fired(await chose(1002, true))).toEqual(["O16 stray choice"]);
  });

  it("fires on a finish write by a stray choice, and by a question that waited on none", async () => {
    const stray = quietWorld();
    stored(stray, { pending: [ASK] });
    answeringWith(stray, choose(1002));
    await scFor(stray, 0).markDone(1001, "2026-11-04");
    expect(fired(stray)).toEqual(["O16 stray choice"]);
    const none = quietWorld();
    stored(none, { pending: [{ ...ASK, finish: undefined }] });
    answeringWith(none, choose(1001));
    await scFor(none, 0).markDone(1001, "2026-11-04");
    expect(fired(none)).toEqual(["O16 stray choice"]);
  });

  it("stays silent for a candidate that changes the state, « Aucun » and a stray choice that changes nothing", async () => {
    expect((await chose(1001, true)).violations).toEqual([]);
    expect((await chose(null, true)).violations).toEqual([]);
    expect((await chose(1002, false)).violations).toEqual([]);
  });

  it("stays silent for the finish a candidate choice runs", async () => {
    const w = quietWorld();
    stored(w, { pending: [ASK] });
    answeringWith(w, choose(1001));
    await scFor(w, 0).markDone(1001, "2026-11-04");
    expect(w.violations).toEqual([]);
  });
});

describe("O4 on the state saves of answers", () => {
  const mismatched = (): World => {
    const w = quietWorld();
    live(w, { binding: { scUsername: "owner" } });
    w.scAccount = "other";
    return w;
  };
  const save = (w: World) => storageFor(w, 0).set({ state: emptyState() });
  const ASK = {
    kind: "ambiguity" as const,
    side: "naka" as const,
    id: 1,
    candidateIds: [1001],
  };
  const CHOOSE: AnswerQuestionMessage = {
    type: "answer-question",
    side: "naka",
    id: 1,
    choice: 1001,
  };

  it("fires on the state save of a remove answer", async () => {
    const w = mismatched();
    answeringWith(w, REMOVE);
    await save(w);
    expect(fired(w)).toEqual(["O4 binding"]);
  });

  it("fires on the block « Non » (no stored item): it rests on a Naka read", async () => {
    const w = mismatched();
    answeringWith(w, { ...REMOVE, remove: false });
    await save(w);
    expect(fired(w)).toEqual(["O4 binding"]);
  });

  it("stays silent on the « Non » of a stored removal: nothing is read", async () => {
    const w = mismatched();
    stored(w, { pending: [removalItem("sc")] });
    answeringWith(w, { ...REMOVE, remove: false });
    await save(w);
    expect(w.violations).toEqual([]);
  });

  it("stays silent on the choice's own save, and fires on the save of the finish it runs", async () => {
    const w = mismatched();
    stored(w, { pending: [{ ...ASK, finish: "movie:1" }] });
    answeringWith(w, CHOOSE);
    await save(w);
    expect(w.violations).toEqual([]);
    await save(w);
    expect(fired(w)).toEqual(["O4 binding"]);
  });

  const settle = (w: World, lastFinish: object | undefined) =>
    w.storage.set("settings", {
      ...(w.storage.get("settings") as object),
      lastFinish,
    });
  const FAILED = {
    at: 1,
    key: "movie:1",
    outcome: "failed",
    error: "no-naka-tab",
  };
  const withNote = (w: World) => {
    const state = w.storage.get("state") as SyncState;
    return storageFor(w, 0).set({ state: { ...state, retryFinishes: [] } });
  };

  it("stays silent on the waiting note", async () => {
    const w = mismatched();
    stored(w, { pending: [{ ...ASK, finish: "movie:1" }] });
    answeringWith(w, CHOOSE);
    await save(w);
    settle(w, FAILED);
    await withNote(w);
    expect(w.violations).toEqual([]);
  });

  it("fires on the finish's save after a stale no-naka-tab lastFinish", async () => {
    const w = mismatched();
    settle(w, FAILED);
    stored(w, { pending: [{ ...ASK, finish: "movie:1" }] });
    answeringWith(w, CHOOSE);
    await save(w);
    await withNote(w);
    expect(fired(w)).toEqual(["O4 binding"]);
  });
});

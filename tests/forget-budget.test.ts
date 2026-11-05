import { describe, expect, it } from "vitest";
import {
  emptyState,
  type PendingItem,
  type SyncState,
} from "../src/core/state";
import { parseSettings } from "../src/ext/settings";
import { createStore } from "../src/ext/store";
import { createJobQueue } from "../src/sw/job-queue";
import { createJobs, type JobDeps, type Jobs } from "../src/sw/jobs";
import { createRouter } from "../src/sw/router";
import { answerWorld, NOW, PAIR } from "./answer-world";
import { ambiguity } from "./question-fixtures";
import { filmCard } from "./rating-fixtures";

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const PLAYER = "https://naka.cx/player?id=3&type=movie";
const NAKA_TAB = { id: EXT, url: PLAYER, frameId: 0, tab: { url: PLAYER } };
const STATUS_URL = `chrome-extension://${EXT}/status.html`;
const STATUS_PAGE = { id: EXT, url: STATUS_URL, tab: { url: STATUS_URL } };
const HOUR = 3_600_000;
const settle = () => new Promise((resolve) => setImmediate(resolve));

const keyOf = (n: number) => `movie:${n}`;
const many = (count: number): SyncState => ({
  ...emptyState(),
  mapping: [PAIR],
  handled: Array.from({ length: count }, (_, i) => keyOf(i + 1)),
  handledTitles: Object.fromEntries(
    Array.from({ length: count }, (_, i) => [keyOf(i + 1), `T${i + 1}`]),
  ),
});
const forget = (contentId: number) =>
  ({ type: "forget-handled", contentId }) as const;

function routerOver(jobs: Jobs) {
  return createRouter({
    extensionId: EXT,
    queue: createJobQueue(),
    jobs,
    timer: { set: () => 0, clear: () => undefined },
    now: () => NOW,
  });
}

const send = (r: ReturnType<typeof routerOver>, msg: unknown, sender: object) =>
  r.handle(msg, sender, () => undefined);

describe("forgets asked by a Naka tab are budgeted", () => {
  it("11 forgets from a Naka tab within an hour: 10 run, the 11th changes nothing", async () => {
    const w = answerWorld({ state: many(12) });
    const r = routerOver(w.jobs);
    for (let n = 1; n <= 11; n += 1) send(r, forget(n), NAKA_TAB);
    await settle();
    expect(w.state().handled).toEqual([keyOf(11), keyOf(12)]);
    expect(w.settings().forgetWindow).toEqual({ from: NOW, count: 10 });
  });

  it("the window persists: a fresh router over the same store still refuses", async () => {
    const w = answerWorld({ state: many(12) });
    const first = routerOver(w.jobs);
    for (let n = 1; n <= 10; n += 1) send(first, forget(n), NAKA_TAB);
    await settle();
    const restarted = routerOver(
      createJobs({ store: createStore(w.area) } as unknown as JobDeps),
    );
    send(restarted, forget(11), NAKA_TAB);
    await settle();
    expect(w.state().handled).toEqual([keyOf(11), keyOf(12)]);
  });

  it("a full window refused: no state save, no site call", async () => {
    const w = answerWorld({
      state: many(3),
      settings: { mode: "simulation", forgetWindow: { from: NOW, count: 10 } },
    });
    await w.jobs.forgetHandledFromTab(forget(1));
    expect(w.stateSaves()).toBe(0);
    expect(w.network()).toEqual([]);
    expect(w.settings().forgetWindow).toEqual({ from: NOW, count: 10 });
  });

  it("an hour later the window opens again; so does a clock set back", async () => {
    for (const from of [NOW - HOUR, NOW + 5 * HOUR]) {
      const w = answerWorld({
        state: many(3),
        settings: { mode: "simulation", forgetWindow: { from, count: 10 } },
      });
      await w.jobs.forgetHandledFromTab(forget(1));
      expect(w.state().handled).toEqual([keyOf(2), keyOf(3)]);
      expect(w.settings().forgetWindow).toEqual({ from: NOW, count: 1 });
    }
  });

  it("the orphan-card drop counts against the budget", async () => {
    const w = answerWorld({ state: many(1) });
    w.area.data.set("ratings", [filmCard({ key: keyOf(77), contentId: 77 })]);
    await w.jobs.forgetHandledFromTab(forget(77));
    expect(w.cards()).toEqual([]);
    expect(w.settings().forgetWindow).toEqual({ from: NOW, count: 1 });
  });

  it("11 forged forgets for never-handled ids spend no slot; a real one still does", async () => {
    const w = answerWorld({ state: many(2) });
    for (let n = 101; n <= 111; n += 1) {
      await w.jobs.forgetHandledFromTab(forget(n));
    }
    expect(w.settings().forgetWindow).toBeUndefined();
    expect(w.stateSaves()).toBe(0);
    await w.jobs.forgetHandledFromTab(forget(1));
    expect(w.state().handled).toEqual([keyOf(2)]);
    expect(w.settings().forgetWindow).toEqual({ from: NOW, count: 1 });
  });

  it("a key held by nothing leaves a full window as it was", async () => {
    const w = answerWorld({
      state: many(1),
      settings: { mode: "simulation", forgetWindow: { from: NOW, count: 9 } },
    });
    await w.jobs.forgetHandledFromTab(forget(500));
    expect(w.settings().forgetWindow).toEqual({ from: NOW, count: 9 });
  });

  it("15 « Oublier » from the status page: 15 forgets, none counted", async () => {
    const w = answerWorld({ state: many(15) });
    const r = routerOver(w.jobs);
    for (let n = 1; n <= 15; n += 1) send(r, forget(n), STATUS_PAGE);
    await settle();
    expect(w.state().handled).toEqual([]);
    expect(w.settings()).not.toHaveProperty("forgetWindow");
  });

  it("the status page still forgets when the tab's budget is spent", async () => {
    const w = answerWorld({
      state: many(2),
      settings: { mode: "simulation", forgetWindow: { from: NOW, count: 10 } },
    });
    await w.jobs.forgetHandled(forget(1));
    expect(w.state().handled).toEqual([keyOf(2)]);
  });
});

describe("waiting forgets from a Naka tab are deduped and capped", () => {
  function gatedJobs() {
    let open: () => void = () => undefined;
    const opened = new Promise<void>((resolve) => {
      open = resolve;
    });
    const ran: string[] = [];
    const jobs = {
      syncJob: async () => opened,
      forgetHandledFromTab: async (m: { contentId: number }) => {
        ran.push(`tab:${m.contentId}`);
      },
      forgetHandled: async (m: { contentId: number }) => {
        ran.push(`page:${m.contentId}`);
      },
    } as unknown as Jobs;
    return { jobs, ran, open };
  }

  it("3 identical waiting forgets give one job", async () => {
    const g = gatedJobs();
    const r = routerOver(g.jobs);
    send(r, { type: "resync" }, STATUS_PAGE);
    for (let i = 0; i < 3; i += 1) send(r, forget(5), NAKA_TAB);
    send(r, forget(6), NAKA_TAB);
    g.open();
    await settle();
    expect(g.ran).toEqual(["tab:5", "tab:6"]);
  });

  it("a key can be forgotten again once its job ran", async () => {
    const g = gatedJobs();
    const r = routerOver(g.jobs);
    send(r, forget(5), NAKA_TAB);
    await settle();
    send(r, forget(5), NAKA_TAB);
    await settle();
    expect(g.ran).toEqual(["tab:5", "tab:5"]);
  });

  it("at most 20 distinct forgets wait", async () => {
    const g = gatedJobs();
    const r = routerOver(g.jobs);
    send(r, { type: "resync" }, STATUS_PAGE);
    for (let n = 1; n <= 30; n += 1) send(r, forget(n), NAKA_TAB);
    g.open();
    await settle();
    expect(g.ran).toHaveLength(20);
  });

  it("the status page's forgets are neither deduped nor capped", async () => {
    const g = gatedJobs();
    const r = routerOver(g.jobs);
    send(r, { type: "resync" }, STATUS_PAGE);
    for (let n = 1; n <= 25; n += 1) send(r, forget(5), STATUS_PAGE);
    g.open();
    await settle();
    expect(g.ran.filter((x) => x.startsWith("page:"))).toHaveLength(25);
  });
});

describe("forgetting clears the finish waiting on that title", () => {
  const withQuestions = (): SyncState => {
    const mine: PendingItem = ambiguity(21, { finish: "movie:21" });
    const other: PendingItem = ambiguity(22, { finish: "movie:22" });
    return { ...many(0), pending: [mine, other] };
  };

  it("a question whose finish is the forgotten key loses it; the others keep theirs", async () => {
    const w = answerWorld({ state: withQuestions() });
    await w.jobs.forgetHandled(forget(21));
    expect(w.state().pending).toEqual([
      ambiguity(21),
      ambiguity(22, { finish: "movie:22" }),
    ]);
  });

  it("the same when the tab asks, and the key was never handled", async () => {
    const w = answerWorld({ state: withQuestions() });
    await w.jobs.forgetHandledFromTab(forget(21));
    expect(w.state().pending[0]).toEqual(ambiguity(21));
    expect(w.network()).toEqual([]);
  });

  it("a settings file with a forgetWindow parses, a count above the budget does not", () => {
    const ok = { mode: "live", forgetWindow: { from: 1, count: 10 } };
    expect(parseSettings(ok)).toEqual(ok);
    expect(() =>
      parseSettings({ mode: "live", forgetWindow: { from: 1, count: 11 } }),
    ).toThrow();
    expect(parseSettings({ mode: "live" })).toEqual({ mode: "live" });
  });
});

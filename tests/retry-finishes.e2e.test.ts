// Finishes waiting for a Naka tab, end to end: the REAL router, queue and jobs over the runtime world (fake sites, a Naka tab running the
// real tab handler), the oracles of the fuzz watching every write. One deterministic scenario per test.
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/core/rate-limiter";
import { emptyState, type SyncState } from "../src/core/state";
import { createStore } from "../src/ext/store";
import { createJobQueue } from "../src/sw/job-queue";
import { createJobs, type Jobs } from "../src/sw/jobs";
import { createRouter } from "../src/sw/router";
import { askQuestion } from "./runtime-answers";
import {
  clockFor,
  createWorld,
  observed,
  scFor,
  scOf,
  scUsernameFor,
  storageFor,
  tabsFor,
  type World,
} from "./runtime-world";

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const STATUS = `chrome-extension://${EXT}/status.html`;
const PLAYER = "https://naka.cx/player?id=1&type=movie";
const NAKA_TAB = { id: EXT, url: PLAYER, frameId: 0, tab: { url: PLAYER } };
const STATUS_PAGE = { id: EXT, url: STATUS, tab: { url: STATUS } };
const MINUTE = 60_000;

type Harness = {
  w: World;
  send(msg: object, from: "tab" | "page"): Promise<void>;
  /** How many retry steps the router queued. */
  retrySteps(): number;
};

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

// A world where nothing fails by chance and the owner is in live mode with an empty state.
function calmWorld(): World {
  const w = createWorld(1);
  w.r = () => 0.5;
  w.orphans = [];
  w.playlist.clear();
  w.wishlist.clear();
  w.done.clear();
  w.storage.set("settings", { mode: "live" });
  w.storage.set("state", emptyState());
  return w;
}

function startHarness(w: World, beforeRetry?: () => void): Harness {
  let steps = 0;
  const clock = {
    now: () => w.time,
    sleep: async (ms: number) => {
      w.time += ms;
    },
  };
  const jobs: Jobs = createJobs({
    store: createStore(storageFor(w, 0)),
    tabs: tabsFor(w, 0),
    sc: scFor(w, 0),
    scUsername: scUsernameFor(w, 0),
    limiters: {
      naka: createRateLimiter(clock, 1, 2000),
      sc: createRateLimiter(clock, 1, 2000),
    },
    now: clockFor(w),
    today: () => "2026-11-04",
    timer: { set: () => 0, clear: () => undefined },
  });
  // A step that answered « continue » forever would starve the event loop: cap it, and count the steps.
  const counted: Jobs = {
    ...jobs,
    retryNext: async (since) => {
      steps += 1;
      if (steps <= 20) beforeRetry?.();
      return steps > 20 ? false : jobs.retryNext(since);
    },
  };
  const router = createRouter({
    extensionId: EXT,
    queue: createJobQueue(),
    jobs: observed(w, 0, counted),
    timer: { set: () => 0, clear: () => undefined },
    now: () => w.time,
  });
  return {
    w,
    retrySteps: () => steps,
    send: async (msg, from) => {
      const type = (msg as { type: string }).type;
      if (type === "naka-ready" || type === "resync") {
        const key = type === "resync" ? "sync:button" : "sync:naka-ready";
        w.allowed.set(key, (w.allowed.get(key) ?? 0) + 1);
        w.allowed.set("retry", (w.allowed.get("retry") ?? 0) + 1);
      }
      if (type === "answer-question") {
        w.allowed.set("answer", (w.allowed.get("answer") ?? 0) + 1);
      }
      router.handle(msg, from === "tab" ? NAKA_TAB : STATUS_PAGE, () => {});
      await settle();
    },
  };
}

const state = (w: World): SyncState => w.storage.get("state") as SyncState;
const writes = (w: World): string[] =>
  w.log.filter((l) => /^(finish|runner|answer) /.test(l));
const finishWrites = (w: World): string[] =>
  w.log.filter((l) => l.startsWith("finish "));
const windowCount = (w: World): number | undefined =>
  (w.storage.get("settings") as { finishWindow?: { count: number } })
    .finishWindow?.count;

// The hour's 30 finishes are spent, as 30 finishes of the owner would leave them.
function spendBudget(w: World): void {
  const settings = w.storage.get("settings") as object;
  w.storage.set("settings", {
    ...settings,
    finishWindow: { from: w.time, count: 30 },
  });
}

/** An open question for a film, answered from the status page while no Naka tab is open. */
async function answerWithoutTab(h: Harness): Promise<number> {
  const { w } = h;
  askQuestion(w);
  const asked = state(w).pending.find((p) => p.kind === "ambiguity");
  if (asked?.kind !== "ambiguity") throw new Error("no question was asked");
  const film = asked.id;
  w.playlist.add(film);
  w.wishlist.add(scOf(film));
  w.tabOpen = false;
  await h.send(
    { type: "answer-question", side: "naka", id: film, choice: scOf(film) },
    "page",
  );
  w.tabOpen = true;
  return film;
}

describe("the retry of a finish, end to end", () => {
  it("an answer sent with no Naka tab marks the title seen after the next sync", async () => {
    const h = startHarness(calmWorld());
    const { w } = h;
    const film = await answerWithoutTab(h);
    expect(finishWrites(w)).toEqual([]);
    expect(state(w).retryFinishes).toHaveLength(1);
    expect(w.done.has(scOf(film))).toBe(false);

    w.time += MINUTE;
    await h.send({ type: "naka-ready" }, "tab");

    expect(w.done.has(scOf(film))).toBe(true);
    expect(finishWrites(w).filter((l) => l.includes("markDone"))).toEqual([
      `finish markDone ${scOf(film)}`,
    ]);
    expect(state(w).retryFinishes ?? []).toEqual([]);
    expect(state(w).handled).toContain(`movie:${film}`);
    expect(w.violations).toEqual([]);
  });

  it("a retry after « Synchroniser » on the status page marks the title seen", async () => {
    const h = startHarness(calmWorld());
    const { w } = h;
    const film = await answerWithoutTab(h);
    expect(w.done.has(scOf(film))).toBe(false);

    w.time += MINUTE;
    await h.send({ type: "resync" }, "page");

    expect(w.done.has(scOf(film))).toBe(true);
    expect(state(w).retryFinishes).toBeUndefined();
    expect(state(w).handled).toContain(`movie:${film}`);
    expect(w.violations).toEqual([]);
  });

  it("cancel undoes the link and the next sync asks again", async () => {
    const h = startHarness(calmWorld());
    const { w } = h;
    const film = await answerWithoutTab(h);
    expect(state(w).mapping.some((p) => p.nakaId === film)).toBe(true);
    // A sync sees the pair in both lists (it enters the snapshot) while the hour's budget keeps the retry waiting.
    spendBudget(w);
    w.time += MINUTE;
    await h.send({ type: "naka-ready" }, "tab");
    expect(state(w).snapshot.some((p) => p.nakaId === film)).toBe(true);
    expect(state(w).retryFinishes).toHaveLength(1);

    await h.send({ type: "cancel-retry", contentId: film }, "page");
    expect(state(w).mapping.some((p) => p.nakaId === film)).toBe(false);
    expect(state(w).snapshot.some((p) => p.nakaId === film)).toBe(false);
    expect(state(w).retryLast.some((p) => p.nakaId === film)).toBe(false);
    expect(state(w).retryFinishes ?? []).toEqual([]);

    w.time += 15 * MINUTE;
    await h.send({ type: "naka-ready" }, "tab");

    expect(finishWrites(w)).toEqual([]);
    expect(w.done.has(scOf(film))).toBe(false);
    expect(state(w).mapping.some((p) => p.nakaId === film)).toBe(false);
    expect(
      state(w).pending.some((p) => p.kind === "ambiguity" && p.id === film),
    ).toBe(true);
    expect(writes(w)).toEqual([]);
    expect(w.violations).toEqual([]);
  });

  it("a retry that meets a lost session takes one slot and stops", async () => {
    const w = calmWorld();
    // The sync succeeds; the session is lost just before the retry step runs.
    let armed = false;
    const h = startHarness(w, () => {
      if (armed) w.nakaLoggedIn = false;
    });
    await h.send({ type: "naka-ready" }, "tab");
    w.time += MINUTE;
    await answerWithoutTab(h);
    await answerWithoutTab(h);
    const spent = windowCount(w);
    expect(state(w).retryFinishes).toHaveLength(2);
    const before = h.retrySteps();

    armed = true;
    w.time += 15 * MINUTE;
    await h.send({ type: "naka-ready" }, "tab");

    expect(h.retrySteps() - before).toBe(1);
    expect(windowCount(w)).toBe((spent ?? 0) + 1);
    expect(state(w).retryFinishes).toHaveLength(2);
    expect(finishWrites(w)).toEqual([]);
    expect(w.violations).toEqual([]);
  });

  // Two Naka tabs that load together queue two syncs; their retries make one step, one slot.
  it("two naka-ready at once retry a waiting finish once", async () => {
    const w = calmWorld();
    let armed = false;
    const h = startHarness(w, () => {
      if (armed) w.nakaLoggedIn = false;
    });
    await h.send({ type: "naka-ready" }, "tab");
    w.time += MINUTE;
    await answerWithoutTab(h);
    const spent = windowCount(w);
    const before = h.retrySteps();

    armed = true;
    w.time += 15 * MINUTE;
    await Promise.all([
      h.send({ type: "naka-ready" }, "tab"),
      h.send({ type: "naka-ready" }, "tab"),
    ]);

    expect(h.retrySteps() - before).toBe(1);
    expect(windowCount(w)).toBe((spent ?? 0) + 1);
    expect(state(w).retryFinishes).toHaveLength(1);
    expect(finishWrites(w)).toEqual([]);
    expect(w.violations).toEqual([]);
  });

  it("a throttled sync runs no retry and spends no slot", async () => {
    const h = startHarness(calmWorld());
    const { w } = h;
    await h.send({ type: "naka-ready" }, "tab");
    w.time += MINUTE;
    await answerWithoutTab(h);
    const spent = windowCount(w);
    expect(spent).toBe(1);

    w.nakaLoggedIn = false;
    for (let i = 0; i < 3; i++) {
      w.time += MINUTE;
      await h.send({ type: "naka-ready" }, "tab");
    }

    expect(windowCount(w)).toBe(spent);
    expect(state(w).retryFinishes).toHaveLength(1);
    expect(finishWrites(w)).toEqual([]);
    expect(w.violations).toEqual([]);
  });

  it("a finish that keeps waiting stops the batch", async () => {
    const h = startHarness(calmWorld());
    const { w } = h;
    await h.send({ type: "naka-ready" }, "tab");
    w.time += MINUTE;
    await answerWithoutTab(h);
    await answerWithoutTab(h);
    expect(state(w).retryFinishes).toHaveLength(2);
    // The hour's budget is spent: the first retry is refused, and the second would be refused too.
    spendBudget(w);
    const before = h.retrySteps();

    w.time += 15 * MINUTE;
    await h.send({ type: "naka-ready" }, "tab");

    expect(h.retrySteps() - before).toBe(1);
    expect(state(w).retryFinishes).toHaveLength(2);
    expect(finishWrites(w)).toEqual([]);
    expect(w.violations).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/core/rate-limiter";
import { createStore } from "../src/ext/store";
import { createJobQueue } from "../src/sw/job-queue";
import { createJobs } from "../src/sw/jobs";
import type { Timer } from "../src/sw/naka-proxy";
import { createRouter } from "../src/sw/router";
import {
  clockFor,
  createWorld,
  EPISODES,
  FILMS,
  type JobKey,
  observed,
  oracleOf,
  ownerEdit,
  SERIES,
  scFor,
  scUsernameFor,
  storageFor,
  TITLES,
  tabsFor,
  type World,
} from "./runtime-world";

// Model-based fuzz of the whole worker (router, queue, jobs, ports, Plan 2's runSync and handleFinish)
// against an in-memory world. It interleaves the five message kinds from their senders, forged messages
// from the wrong sender or a look-alike site, worker restarts (the in-memory queue, limiters and
// debounce lost, storage kept), store failures, expired sessions on both sites, a closed tab, account
// switches and the owner's list edits.
// Oracles, checked at each write (tests/runtime-world.ts):
//   O1 never two jobs at once (per worker);
//   O2 the stored state always passes parseState (and the settings parseSettings);
//   O3 no list write while the stored mode is simulation;
//   O4 no write and no state save while the bound accounts are not the signed-in ones;
//   O5 Plan 2's re-add: no title written back to a side the owner removed it from, once a completed run
//      had seen it in both lists;
//   O6 Plan 2's re-wish: no wish of a film whose finish saved, unwished or marked it done;
//   O7 a job runs only for a message its sender may send (forged ones are ignored);
//   O9 no SensCritique finish write by a job that started with the hour's 30 finishes spent (the stored
//      count itself never exceeds 30: O2);
//   O10 once a send of a job failed (its tab lost), no later tabs call of that job (Ruling 17);
//   plus: never a removal from Naka, an "undone", a rating, or an unwish of anything but a film.

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const STATUS_URL = `chrome-extension://${EXT}/status.html`;
const PLAYER = "https://naka.cx/player?id=1&type=movie";
const NAKA_TAB = { id: EXT, url: PLAYER, frameId: 0, tab: { url: PLAYER } };
const STATUS_PAGE = { id: EXT, url: STATUS_URL, tab: { url: STATUS_URL } };
const LOOK_ALIKE = {
  id: EXT,
  url: "https://naka.cx.evil.com/",
  frameId: 0,
  tab: { url: "https://naka.cx.evil.com/" },
};

const SEEDS = 450;
const STEPS = 50;

type Worker = {
  handle(msg: unknown, sender: object): void;
  fire(): void;
};

function startWorker(w: World): Worker {
  const gen = w.gen;
  // Like setTimeout: clearing a timer that fired, or none, does nothing.
  const due = new Map<number, () => void>();
  let next = 0;
  const debounce: Timer = {
    set: (fn) => {
      next += 1;
      due.set(next, fn);
      return next;
    },
    clear: (handle) => {
      due.delete(handle as number);
    },
  };
  const clock = {
    now: () => w.time,
    sleep: async (ms: number) => {
      w.time += ms;
    },
  };
  const jobs = createJobs({
    store: createStore(storageFor(w, gen)),
    tabs: tabsFor(w, gen),
    sc: scFor(w, gen),
    scUsername: scUsernameFor(w, gen),
    limiters: {
      naka: createRateLimiter(clock, 1, 2000),
      sc: createRateLimiter(clock, 1, 2000),
    },
    now: clockFor(w),
    today: () => "2026-11-04",
    timer: { set: () => 0, clear: () => undefined },
  });
  const router = createRouter({
    extensionId: EXT,
    queue: createJobQueue(),
    jobs: observed(w, gen, jobs),
    timer: debounce,
  });
  return {
    handle: (msg, sender) => {
      router.handle(msg, sender, () => undefined);
    },
    fire: () => {
      const fns = [...due.values()];
      due.clear();
      for (const fn of fns) fn();
    },
  };
}

const drain = () => new Promise((resolve) => setImmediate(resolve));

function pick<T>(w: World, items: readonly T[]): T {
  return items[Math.floor(w.r() * items.length)] as T;
}

function finishedFor(w: World): Record<string, unknown> {
  const n = w.r() < 0.1 ? 99 : pick(w, TITLES);
  const base = {
    type: "finished",
    source: w.r() < 0.4 ? "explicit" : "threshold",
    progress: w.r() < 0.5 ? pick(w, [0.85, 0.9, 0.95, 0.99, 1]) : w.r(),
    contentId: n,
  };
  if (FILMS.includes(n) || w.r() < 0.1) return base;
  return { ...base, season: 1, episode: 1 + Math.floor(w.r() * EPISODES) };
}

type Sent = { msg: unknown; sender: object; key?: JobKey };

function trustedMessage(w: World): Sent {
  const a = w.r();
  if (a < 0.25) {
    return {
      msg: { type: "naka-ready" },
      sender: NAKA_TAB,
      key: "sync:naka-ready",
    };
  }
  if (a < 0.4) {
    return {
      msg: { type: "playlist-changed" },
      sender: NAKA_TAB,
      key: "sync:playlist",
    };
  }
  if (a < 0.52)
    return { msg: { type: "resync" }, sender: STATUS_PAGE, key: "sync:button" };
  if (a < 0.78) return { msg: finishedFor(w), sender: NAKA_TAB, key: "finish" };
  if (a < 0.9) {
    const mode = w.r() < 0.7 ? "live" : "simulation";
    return {
      msg: { type: "set-mode", mode },
      sender: STATUS_PAGE,
      key: "mode",
    };
  }
  return { msg: { type: "status" }, sender: STATUS_PAGE, key: "status" };
}

// A message its sender may not send: a status-page type from the Naka tab, a Naka type from the status
// page, or anything from a look-alike site.
function forgedMessage(w: World): Sent {
  const statusTypes = [
    { type: "set-mode", mode: "live" },
    { type: "resync" },
    { type: "status" },
  ];
  const nakaTypes = [
    { type: "naka-ready" },
    { type: "playlist-changed" },
    finishedFor(w),
  ];
  const a = w.r();
  if (a < 0.4) return { msg: pick(w, statusTypes), sender: NAKA_TAB };
  if (a < 0.7) return { msg: pick(w, nakaTypes), sender: STATUS_PAGE };
  return { msg: pick(w, [...statusTypes, ...nakaTypes]), sender: LOOK_ALIKE };
}

function send(w: World, worker: Worker): void {
  const sent = w.r() < 0.75 ? trustedMessage(w) : forgedMessage(w);
  if (sent.key !== undefined) {
    w.allowed.set(sent.key, (w.allowed.get(sent.key) ?? 0) + 1);
  }
  w.log.push(`msg ${JSON.stringify(sent.msg)}${sent.key ? "" : " (forged)"}`);
  worker.handle(sent.msg, sent.sender);
}

function switchAccount(w: World): void {
  if (w.r() < 0.5) w.scAccount = w.scAccount === "owner" ? "other" : "owner";
  else w.nakaAccount = w.nakaAccount === "77" ? "88" : "77";
  w.log.push(`accounts ${w.scAccount}/${w.nakaAccount}`);
}

// Outages start rarely and end quickly, at any moment, a job running or not.
function outages(w: World): void {
  const flip = (up: boolean, what: string): boolean => {
    const next = up ? w.r() >= 0.03 : w.r() < 0.35;
    if (next !== up) w.log.push(`${what} ${next ? "back" : "lost"}`);
    return next;
  };
  w.scLoggedIn = flip(w.scLoggedIn, "sc session");
  w.nakaToken = flip(w.nakaToken, "naka token");
  w.nakaLoggedIn = flip(w.nakaLoggedIn, "naka login");
  w.tabOpen = flip(w.tabOpen, "naka tab");
}

// A binge, or a page script flooding the worker: many explicit "vu" for distinct episodes at once.
function burst(w: World, worker: Worker): void {
  const count = 10 + Math.floor(w.r() * 30);
  for (let i = 0; i < count; i++) {
    const msg = {
      type: "finished",
      source: "explicit",
      progress: 1,
      contentId: pick(w, SERIES),
      season: 1,
      episode: 1 + Math.floor(w.r() * EPISODES),
    };
    w.allowed.set("finish", (w.allowed.get("finish") ?? 0) + 1);
    worker.handle(msg, NAKA_TAB);
  }
  w.log.push(`burst of ${count} finishes`);
}

async function step(w: World, worker: Worker): Promise<Worker> {
  w.time += Math.floor(w.r() * 8 * 60_000);
  outages(w);
  const a = w.r();
  if (a < 0.5) {
    const count = 1 + Math.floor(w.r() * 3);
    for (let i = 0; i < count; i++) send(w, worker);
  } else if (a < 0.6) {
    await drain();
    ownerEdit(w, pick(w, TITLES), w.r() < 0.5 ? "naka" : "sc");
  } else if (a < 0.625) {
    await drain();
    switchAccount(w);
  } else if (a < 0.665) {
    w.gen += 1;
    w.log.push("worker restart");
    return startWorker(w);
  } else if (a < 0.7) {
    burst(w, worker);
  } else if (a < 0.77) {
    worker.fire();
  } else if (a < 0.86) {
    await drain();
  }
  const yields = Math.floor(w.r() * 25);
  for (let i = 0; i < yields; i++) await Promise.resolve();
  return worker;
}

type Stats = World["stats"];

async function simulate(
  seed: number,
): Promise<{ violations: string[]; stats: Stats }> {
  const w = createWorld(seed);
  let worker = startWorker(w);
  for (let i = 0; i < STEPS; i++) worker = await step(w, worker);
  await drain();
  worker.fire();
  await drain();
  return { violations: w.violations, stats: w.stats };
}

describe("runtime fuzz: the worker against an in-memory world", () => {
  it(`finds no violation over ${SEEDS} fixed seeds`, async () => {
    const violations: string[] = [];
    const totals: Stats = {
      liveWrites: 0,
      finishWrites: 0,
      simulatedPlans: 0,
      otherAccount: 0,
      frozen: 0,
      protections: 0,
      guards: 0,
      spentBudgets: 0,
      lostTabs: 0,
    };
    for (let seed = 1; seed <= SEEDS; seed++) {
      const result = await simulate(seed);
      violations.push(...result.violations);
      for (const key of Object.keys(totals) as (keyof Stats)[]) {
        totals[key] += result.stats[key];
      }
    }
    const byOracle: Record<string, number> = {};
    for (const found of violations) {
      byOracle[oracleOf(found)] = (byOracle[oracleOf(found)] ?? 0) + 1;
    }
    expect(byOracle).toEqual({});
    expect(violations.slice(0, 3)).toEqual([]);
    // Every oracle's situation arises (measured: 712 list writes, 4799 finish writes, 694 simulated
    // runs with planned writes, 851 jobs stopped by the binding, 468 calls of dead workers, 501
    // protected sides, 462 guarded films, 321 finish jobs started with the hour's budget spent, 133
    // jobs that lost their tab).
    for (const [situation, count] of Object.entries(totals)) {
      expect(count, situation).toBeGreaterThan(100);
    }
  }, 20_000);
});

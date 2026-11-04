// Test-only in-memory world for the runtime fuzz: both sites, the Naka tab (running the REAL tab handler),
// the storage area, and the oracles, checked at the moment each write happens.
//
// A worker restart bumps the generation: every port built for an older generation then hangs forever, so
// a job of a dead worker stops at its next await (Review Focus 3) and never touches the world again.
// The owner switches accounts and edits the lists only while no job runs (the fuzz drains the queue
// first), so every oracle compares a write with the world the job itself checked.

import { AsyncLocalStorage } from "node:async_hooks";
import { handleNakaCall } from "../src/content/naka-bridge";
import type { FinishedMessage } from "../src/content/playback-tracker";
import {
  FINISH_WINDOW_MS,
  MAX_FINISHES_PER_WINDOW,
} from "../src/ext/finish-window";
import type { ToNakaTab } from "../src/ext/messages";
import { parseSettings, type Settings } from "../src/ext/settings";
import { parseState } from "../src/ext/state-schema";
import type { StorageArea } from "../src/ext/store";
import type { NakaClient, NakaItem } from "../src/naka/naka-client";
import { NakaUnavailableError } from "../src/naka/naka-errors";
import type { ScClient } from "../src/sc/sc-client";
import {
  ScUnauthenticatedError,
  ScUnavailableError,
} from "../src/sc/sc-errors";
import type { ScWishItem } from "../src/sc/wishlist-page";
import type { Jobs } from "../src/sw/jobs";
import type { TabsPort } from "../src/sw/naka-proxy";

export const FILMS = [1, 2, 3, 4];
export const SERIES = [11, 12];
export const TITLES = [...FILMS, ...SERIES];
export const EPISODES = 40;

type Side = "naka" | "sc";

export const scOf = (n: number): number => n + 1000;
const isFilm = (n: number): boolean => FILMS.includes(n);
const isFilmProduct = (id: number): boolean =>
  FILMS.some((n) => scOf(n) === id);
const episodeProduct = (series: number, e: number): number =>
  5000 + series * 10 + e;
const universeOf = (id: number): number => {
  if (isFilmProduct(id)) return 1;
  return SERIES.some((n) => scOf(n) === id) ? 4 : 32;
};

const nakaItem = (n: number): NakaItem => ({
  contentId: n,
  tmdbId: 9000 + n,
  mediaType: isFilm(n) ? "movie" : "tv",
  title: isFilm(n) ? `Film ${n}` : `Serie ${n}`,
  releaseDate: `${2000 + n}-01-01`,
});

const scItem = (n: number): ScWishItem => ({
  productId: scOf(n),
  title: isFilm(n) ? `Film ${n}` : `Serie ${n}`,
  url: isFilm(n) ? `/film/x/${scOf(n)}` : `/serie/x/${scOf(n)}`,
  universe: isFilm(n) ? 1 : 4,
  year: 2000 + n,
});

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const forever = <T>(): Promise<T> => new Promise<T>(() => undefined);
const wire = (value: unknown): unknown =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export type JobKey =
  | "sync:naka-ready"
  | "sync:playlist"
  | "sync:button"
  | "finish"
  | "mode"
  | "status";

// What the world saw of a job's tabs: the tabs it last found, the ones it tried, the one it pinned.
type TabTrace = {
  found?: number[];
  tried?: Set<number>;
  pinned?: number;
  tabLost?: boolean;
};

type Context = (
  | { kind: "sync"; nakaAt?: Set<number>; scAt?: Set<number> }
  | { kind: "finish"; msg: FinishedMessage; spent?: boolean }
  | { kind: "other" }
) &
  TabTrace;

// The tab with Naka's content script. Orphan tabs (opened before the install, or kept across an
// extension reload) listen to nothing, and come first in the query's answer.
export const LIVE_TAB = 1;
const ORPHAN_TABS = [101, 102];

export type World = ReturnType<typeof createWorld>;

export function createWorld(seed: number) {
  const r = rng(seed);
  const w = {
    r,
    seed,
    time: Date.parse("2026-11-04T08:00:00Z"),
    playlist: new Set<number>(),
    wishlist: new Set<number>(),
    done: new Set<number>(),
    scAccount: "owner",
    scLoggedIn: true,
    nakaAccount: "77",
    nakaLoggedIn: true,
    nakaToken: true,
    tabOpen: true,
    orphans: ORPHAN_TABS.slice(0, Math.floor(r() * 3)),
    failRate: 0.03,
    storage: new Map<string, unknown>(),
    gen: 0,
    log: [] as string[],
    violations: [] as string[],
    seenBoth: new Set<number>(),
    protectedFrom: new Map<number, Side>(),
    guarded: new Map<number, string>(),
    active: new Map<number, number>(),
    current: undefined as Context | undefined,
    allowed: new Map<JobKey, number>(),
    invoked: new Map<JobKey, number>(),
    // How often each oracle's situation arose: a fuzz that never reaches it proves nothing.
    stats: {
      liveWrites: 0,
      finishWrites: 0,
      simulatedPlans: 0,
      otherAccount: 0,
      frozen: 0,
      protections: 0,
      guards: 0,
      spentBudgets: 0,
      lostTabs: 0,
      orphanTries: 0,
      pinnedPastOrphan: 0,
      statusDuringJob: 0,
    },
  };
  for (const n of TITLES) {
    if (r() < 0.5) w.playlist.add(n);
    if (r() < 0.5) w.wishlist.add(scOf(n));
    if (isFilm(n) && r() < 0.2) w.done.add(scOf(n));
  }
  return w;
}

const ORACLES: [string, RegExp][] = [
  ["O1 two jobs at once", /two jobs at once/],
  ["O2 invalid storage", /invalid (state|settings) w/],
  ["O3 write in simulation", /in simulation/],
  ["O4 binding", /after a binding mismatch/],
  ["O5 re-add", /re-add of/],
  ["O6 re-wish", /re-wish of/],
  ["O7 forged message", /ran without a message/],
  ["O9 finish budget", /hour's finishes spent/],
  ["O10 lost tab", /after the job lost its tab/],
  ["O11 one tab per job", /pinned tab|out of query order|before any tab query/],
  ["O12 read-only status", /a status answer wrote/],
];

// The oracle a violation belongs to, for the fuzz's failure message.
export function oracleOf(found: string): string {
  return (
    ORACLES.find(([, pattern]) => pattern.test(found))?.[0] ??
    "O8 forbidden write"
  );
}

function violation(w: World, what: string): void {
  w.violations.push(`seed ${w.seed}: ${what} | ${w.log.slice(-12).join("; ")}`);
}

// A port of a dead worker: the job that called it stops here, as the worker died at this await.
function frozen<T>(w: World): Promise<T> {
  w.stats.frozen += 1;
  return forever<T>();
}

// Plan 2's re-wish oracle: from now on, no run may wish this film again.
function guard(w: World, id: number, why: string): void {
  w.guarded.set(id, why);
  w.stats.guards += 1;
}

function stored<T>(
  w: World,
  key: string,
  parse: (raw: unknown) => T,
): T | undefined {
  try {
    return parse(w.storage.get(key));
  } catch {
    return undefined;
  }
}

const settingsOf = (w: World): Settings | undefined =>
  stored(w, "settings", parseSettings);

// Oracle: no write and no state save while the bound accounts are not the ones signed in.
function checkBinding(w: World, what: string): void {
  const binding = settingsOf(w)?.binding;
  if (binding === undefined) return;
  const sc = w.scLoggedIn ? w.scAccount : undefined;
  const naka = w.nakaLoggedIn ? w.nakaAccount : undefined;
  const otherSc = sc !== undefined && sc !== binding.scUsername;
  const otherNaka =
    naka !== undefined &&
    binding.nakaAccount !== undefined &&
    naka !== binding.nakaAccount;
  if (otherSc || otherNaka) violation(w, `${what} after a binding mismatch`);
}

// Oracles of a list write (a wish, a playlist add): live mode only, the binding, Plan 2's re-add and re-wish.
function checkListWrite(w: World, side: Side, id: number): void {
  w.stats.liveWrites += 1;
  if ((settingsOf(w)?.mode ?? "simulation") !== "live") {
    violation(w, `${side} write ${id} in simulation`);
  }
  checkBinding(w, `${side} write ${id}`);
  const n = side === "naka" ? id : id - 1000;
  if (w.protectedFrom.get(n) === side) {
    violation(w, `re-add of ${n} to ${side} after the owner removed it`);
  }
  if (side === "sc" && w.guarded.has(id)) {
    violation(w, `re-wish of ${id} after ${w.guarded.get(id)}`);
  }
}

function flaky(w: World, what: string): void {
  if (w.r() < 0.1) {
    w.log.push(`${what} failed`);
    throw new Error(`${what} failed`);
  }
}

// A completed run (its state saved) saw the pairs that were in both lists when it read them.
function onStateSave(w: World): void {
  const ctx = w.current;
  if (ctx?.kind === "sync" && ctx.nakaAt && ctx.scAt) {
    for (const n of TITLES) {
      if (ctx.nakaAt.has(n) && ctx.scAt.has(scOf(n))) w.seenBoth.add(n);
    }
  }
  if (ctx?.kind === "finish" && isFilm(ctx.msg.contentId)) {
    const id = scOf(ctx.msg.contentId);
    if (!w.guarded.has(id)) guard(w, id, "a save of its finish");
  }
}

// Counts a new run record: a simulated run that planned writes, or a job stopped by the binding.
function countRecord(w: World, next: Settings | undefined): void {
  const before = settingsOf(w);
  const run = next?.lastRun;
  if (
    run === undefined ||
    JSON.stringify(run) === JSON.stringify(before?.lastRun)
  )
    return;
  if (run.mode === "simulation" && (run.preview?.length ?? 0) > 0)
    w.stats.simulatedPlans += 1;
  if (run.error === "other-account") w.stats.otherAccount += 1;
}

function onWrite(w: World, key: string, value: unknown): void {
  if (key === "state") {
    try {
      parseState(value);
    } catch {
      violation(w, "an invalid state was stored");
    }
    checkBinding(w, "state save");
    onStateSave(w);
  }
  if (key === "settings") {
    let next: Settings | undefined;
    try {
      next = parseSettings(value);
    } catch {
      violation(w, "invalid settings were stored");
    }
    countRecord(w, next);
  }
}

// The status answers in flight. AsyncLocalStorage follows an answer's own promise chain and no other, so
// a storage write made inside it is the answer's, whatever job runs meanwhile (Ruling 20).
const answering = new AsyncLocalStorage<true>();

export function answerStatus<T>(read: () => Promise<T>): Promise<T> {
  return answering.run(true, read);
}

// Oracle O12: a status answer never writes storage.
export function checkStatusWrite(w: World, keys: string[]): void {
  if (answering.getStore() === true)
    violation(w, `a status answer wrote ${keys.join(",")}`);
}

export function storageFor(w: World, gen: number): StorageArea {
  return {
    get: async (key) => {
      if (gen !== w.gen) return frozen(w);
      if (w.r() < w.failRate) throw new Error("storage read failed");
      return w.storage.has(key)
        ? { [key]: structuredClone(w.storage.get(key)) }
        : {};
    },
    set: async (items) => {
      if (gen !== w.gen) return frozen(w);
      checkStatusWrite(w, Object.keys(items));
      if (w.r() < w.failRate) throw new Error("storage write failed");
      for (const [key, value] of Object.entries(items)) {
        onWrite(w, key, value);
        w.storage.set(key, structuredClone(value));
      }
    },
  };
}

function nakaGate(w: World, label: string): void {
  if (!w.nakaToken || !w.nakaLoggedIn)
    throw new NakaUnavailableError("no token");
  if (w.r() < w.failRate) {
    throw new NakaUnavailableError(`Naka ${label}: HTTP 429`, 429);
  }
}

function nakaClient(w: World): NakaClient {
  return {
    playlistIds: async () => {
      nakaGate(w, "playlist");
      const list = [...w.playlist];
      if (w.current?.kind === "sync") w.current.nakaAt ??= new Set(list);
      return list;
    },
    addToPlaylist: async (id) => {
      nakaGate(w, "add");
      checkListWrite(w, "naka", id);
      w.log.push(`runner add naka ${id}`);
      flaky(w, `add naka ${id}`);
      w.playlist.add(id);
    },
    removeFromPlaylist: async (id) => {
      violation(w, `removeFromPlaylist ${id}`);
    },
    search: async (q) => {
      nakaGate(w, "search");
      return TITLES.filter((n) => nakaItem(n).title === q).map(nakaItem);
    },
    contentById: async (id) => {
      nakaGate(w, "content");
      return TITLES.includes(id) ? nakaItem(id) : undefined;
    },
  };
}

// Oracle O10 (Ruling 17): once the job's pinned tab refused a send, or every tab it found did, its tab is
// lost, and the job calls the tabs no more.
export function checkTabCall(w: World): void {
  if (w.current?.tabLost)
    violation(w, "a tabs call after the job lost its tab");
}

// Oracle O11 (Rulings 9 and 20): a job finds its tabs, tries them in their query order until one
// answers, and then sends to that pinned tab only, with no new lookup.
export function checkQuery(w: World): void {
  const ctx = w.current;
  if (ctx?.pinned !== undefined)
    violation(w, `a tab query after the job pinned tab ${ctx.pinned}`);
}

export function checkSend(w: World, tabId: number): void {
  const ctx = w.current;
  if (ctx === undefined) return;
  if (ctx.pinned !== undefined) {
    if (tabId !== ctx.pinned)
      violation(w, `a send to tab ${tabId}, not the pinned tab ${ctx.pinned}`);
    return;
  }
  if (ctx.found === undefined) {
    violation(w, `a send to tab ${tabId} before any tab query`);
    return;
  }
  const next = ctx.found.find((id) => !ctx.tried?.has(id));
  if (tabId !== next) violation(w, `a try of tab ${tabId} out of query order`);
}

function loseTab(ctx: TabTrace, w: World): void {
  if (ctx.tabLost) return;
  ctx.tabLost = true;
  w.stats.lostTabs += 1;
}

// A tab with no content script, or the live tab once closed: the send rejects, as Chrome's does.
function refuse(w: World, tabId: number): never {
  const ctx = w.current;
  if (ORPHAN_TABS.includes(tabId)) w.stats.orphanTries += 1;
  if (ctx !== undefined && ctx.pinned === tabId) loseTab(ctx, w);
  if (ctx !== undefined && ctx.pinned === undefined) {
    ctx.tried ??= new Set();
    ctx.tried.add(tabId);
    if (ctx.found?.every((id) => ctx.tried?.has(id))) loseTab(ctx, w);
  }
  throw new Error(
    "Could not establish connection. Receiving end does not exist.",
  );
}

function pin(w: World, ctx: TabTrace, tabId: number): void {
  ctx.pinned = tabId;
  if ((ctx.tried?.size ?? 0) > 0) w.stats.pinnedPastOrphan += 1;
}

function found(w: World): number[] {
  return [...w.orphans, ...(w.tabOpen ? [LIVE_TAB] : [])];
}

export function tabsFor(w: World, gen: number): TabsPort {
  return {
    query: async () => {
      if (gen !== w.gen) return frozen(w);
      checkTabCall(w);
      checkQuery(w);
      const ids = found(w);
      if (w.current !== undefined) {
        w.current.found = ids;
        w.current.tried = new Set();
      }
      return ids.map((id) => ({ id }));
    },
    send: async (tabId, msg) => {
      if (gen !== w.gen) return frozen(w);
      checkTabCall(w);
      checkSend(w, tabId);
      if (tabId !== LIVE_TAB || !w.tabOpen) refuse(w, tabId);
      const ctx = w.current;
      const account = () => (w.nakaLoggedIn ? w.nakaAccount : undefined);
      const reply = await handleNakaCall(
        wire(msg) as ToNakaTab,
        nakaClient(w),
        account,
      );
      if (gen !== w.gen) return frozen(w);
      if (ctx !== undefined && ctx.pinned === undefined) pin(w, ctx, tabId);
      return wire(reply);
    },
  };
}

function scSession(w: World): void {
  if (!w.scLoggedIn) throw new ScUnauthenticatedError();
}

function scItems(w: World, universe: number): ScWishItem[] {
  return TITLES.filter((n) => w.wishlist.has(scOf(n)))
    .map(scItem)
    .filter((item) => item.universe === universe);
}

function scReads(
  w: World,
  gen: number,
): Pick<ScClient, "readWishlist" | "search" | "productState" | "seasonInfo"> {
  return {
    readWishlist: async (universe) => {
      if (gen !== w.gen) return frozen(w);
      scSession(w);
      if (w.r() < w.failRate)
        throw new ScUnavailableError("SensCritique UserCollection: HTTP 500");
      if (w.current?.kind === "sync") w.current.scAt ??= new Set(w.wishlist);
      return scItems(w, universe === "movie" ? 1 : 4);
    },
    search: async (q, universe) => {
      if (gen !== w.gen) return frozen(w);
      if (w.r() < w.failRate) {
        throw new ScUnavailableError(
          "SensCritique SearchProductExplorer: HTTP 429",
        );
      }
      const wanted = universe === "movie" ? 1 : 4;
      return TITLES.map(scItem).filter(
        (i) => i.title === q && i.universe === wanted,
      );
    },
    productState: async (id) => {
      if (gen !== w.gen) return frozen(w);
      scSession(w);
      return {
        isDone: w.done.has(id),
        isWished: w.wishlist.has(id),
        universe: universeOf(id),
      };
    },
    seasonInfo: async (series, season) => {
      if (gen !== w.gen) return frozen(w);
      const n = series - 1000;
      return {
        seasonProductId: 4000 + n,
        episodes: Array.from({ length: EPISODES }, (_, i) => ({
          productId: episodeProduct(n, i + 1),
          season,
          episode: i + 1,
          title: `Episode ${i + 1}`,
        })),
      };
    },
  };
}

export function scFor(w: World, gen: number): ScClient {
  // false for a dead worker; throws, as the client does, when the session is gone.
  const mayWrite = () => {
    if (gen !== w.gen) return false;
    scSession(w);
    return true;
  };
  return {
    ...scReads(w, gen),
    wish: async (id) => {
      if (!mayWrite()) return frozen(w);
      checkListWrite(w, "sc", id);
      w.log.push(`runner wish ${id}`);
      flaky(w, `wish ${id}`);
      w.wishlist.add(id);
    },
    unwish: async (id) => {
      if (!mayWrite()) return frozen(w);
      checkFinishWrite(w, `unwish ${id}`);
      w.stats.finishWrites += 1;
      if (!isFilmProduct(id)) violation(w, `unwish of ${id}, not a film`);
      w.log.push(`finish unwish ${id}`);
      flaky(w, `unwish ${id}`);
      w.wishlist.delete(id);
      if (!w.guarded.has(id)) guard(w, id, "its unwish");
    },
    markDone: async (id) => {
      if (!mayWrite()) return frozen(w);
      checkFinishWrite(w, `markDone ${id}`);
      w.stats.finishWrites += 1;
      w.log.push(`finish markDone ${id}`);
      flaky(w, `markDone ${id}`);
      w.done.add(id);
      if (isFilmProduct(id) && !w.guarded.has(id)) guard(w, id, "its markDone");
    },
    unmarkDone: async (id) => {
      violation(w, `unmarkDone ${id}`);
    },
    rate: async (id) => {
      violation(w, `rate ${id}`);
    },
  };
}

// The finish job reads the clock once, right after its settings: the oracle judges the hour's budget
// there, from the stored window, as the spec words it.
export function clockFor(w: World): () => number {
  return () => {
    const ctx = w.current;
    if (ctx?.kind === "finish" && ctx.spent === undefined) {
      const stored = settingsOf(w)?.finishWindow;
      ctx.spent =
        stored !== undefined &&
        w.time >= stored.from &&
        w.time - stored.from < FINISH_WINDOW_MS &&
        stored.count >= MAX_FINISHES_PER_WINDOW;
      if (ctx.spent) w.stats.spentBudgets += 1;
    }
    return w.time;
  };
}

// Oracles of a finish write: the binding, and the hour's budget (at most 30 finishes per window).
function checkFinishWrite(w: World, what: string): void {
  checkBinding(w, what);
  if (w.current?.kind === "finish" && w.current.spent) {
    violation(w, `${what} with the hour's finishes spent`);
  }
}

export function scUsernameFor(w: World, gen: number): () => Promise<string> {
  return async () => {
    if (gen !== w.gen) return frozen(w);
    scSession(w);
    return w.scAccount;
  };
}

// Oracle O7: every job, and every status answer, comes from a message its sender may send.
export function checkInvoked(w: World, key: JobKey): void {
  w.invoked.set(key, (w.invoked.get(key) ?? 0) + 1);
  if ((w.invoked.get(key) ?? 0) > (w.allowed.get(key) ?? 0)) {
    violation(w, `${key} ran without a message from its sender`);
  }
}

// The jobs as the router sees them, counted, with the oracle O1 "never two jobs at once" per worker. The
// status answer is no job (Ruling 20): O1 does not count it, O7 and O12 judge it.
export function observed(w: World, gen: number, jobs: Jobs): Jobs {
  const run = async <T>(
    key: JobKey,
    ctx: Context,
    job: () => Promise<T>,
  ): Promise<T> => {
    checkInvoked(w, key);
    if ((w.active.get(gen) ?? 0) > 0) violation(w, `two jobs at once (${key})`);
    w.active.set(gen, (w.active.get(gen) ?? 0) + 1);
    // A dead worker's queue may still start a job (it freezes at its first world call): it must not take
    // the place of the live worker's job, or that job's writes would be credited to it.
    if (gen === w.gen) w.current = ctx;
    try {
      return await job();
    } finally {
      w.active.set(gen, (w.active.get(gen) ?? 1) - 1);
      if (w.current === ctx) w.current = undefined;
    }
  };
  return {
    syncJob: (trigger) =>
      run(`sync:${trigger}`, { kind: "sync" }, () => jobs.syncJob(trigger)),
    finishJob: (msg) =>
      run("finish", { kind: "finish", msg }, () => jobs.finishJob(msg)),
    setMode: (mode) => run("mode", { kind: "other" }, () => jobs.setMode(mode)),
    statusSnapshot: () => {
      checkInvoked(w, "status");
      if (gen === w.gen && w.current !== undefined)
        w.stats.statusDuringJob += 1;
      return answerStatus(() => jobs.statusSnapshot());
    },
  };
}

// The owner's own list edits (Plan 2's re-add oracle): removing a title from a side while a completed
// run had seen it in both lists protects that side; adding it back lifts the protection.
export function ownerEdit(w: World, n: number, side: Side): void {
  const id = side === "naka" ? n : scOf(n);
  const list = side === "naka" ? w.playlist : w.wishlist;
  if (list.has(id)) {
    const both = w.playlist.has(n) && w.wishlist.has(scOf(n));
    list.delete(id);
    if (both && w.seenBoth.has(n)) {
      w.protectedFrom.set(n, side);
      w.stats.protections += 1;
    }
    w.seenBoth.delete(n);
    w.log.push(`owner remove ${side} ${n}`);
  } else {
    list.add(id);
    w.protectedFrom.delete(n);
    w.log.push(`owner add ${side} ${n}`);
  }
}

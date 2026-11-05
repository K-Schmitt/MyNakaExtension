// Test-only in-memory world for the runtime fuzz: both sites, the Naka tab (running the REAL tab handler)
// and the storage area. The oracles it calls, checked at the moment each write happens, live in
// tests/runtime-oracles.ts.
//
// A worker restart bumps the generation: every port built for an older generation then hangs forever, so
// a job of a dead worker stops at its next await (Review Focus 3) and never touches the world again.
// The owner switches accounts and edits the lists only while no job runs (the fuzz drains the queue
// first), so every oracle compares a write with the world the job itself checked.

import { handleNakaCall } from "../src/content/naka-bridge";
import type { FinishedMessage } from "../src/content/playback-tracker";
import {
  FINISH_WINDOW_MS,
  MAX_FINISHES_PER_WINDOW,
} from "../src/ext/finish-window";
import type { ToNakaTab } from "../src/ext/messages";
import type { AnswerMessage } from "../src/ext/question-messages";
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
import {
  type AnswerContext,
  beginAnswer,
  checkAnswerFinish,
  checkRemovalWrite,
  endAnswer,
  isLocalAnswer,
} from "./runtime-answer-oracles";
import {
  answering,
  checkBinding,
  checkListWrite,
  checkQueryCall,
  checkSend,
  checkStatusWrite,
  checkTabCall,
  guard,
  settingsOf,
  violation,
} from "./runtime-oracles";

export const FILMS = [1, 2, 3, 4];
export const SERIES = [11, 12];
export const TITLES = [...FILMS, ...SERIES];
export const EPISODES = 40;

export type Side = "naka" | "sc";

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
  | "rating"
  | "answer"
  | "settings"
  | "status";

// What the world saw of a job's tabs: the tabs it last found, the ones it tried, the one it pinned.
type TabTrace = {
  found?: number[];
  tried?: Set<number>;
  pinned?: number;
  tabLost?: boolean;
  /** The pinned tab refused: the job may make ONE tabs.query to tell a changed tab from a closed one. */
  lossQuery?: boolean;
};

type Context = (
  | { kind: "sync"; nakaAt?: Set<number>; scAt?: Set<number>; saved?: true }
  | { kind: "finish"; msg: FinishedMessage; spent?: boolean }
  | { kind: "other" }
  | AnswerContext
) &
  TabTrace;

// The thresholds the owner may store per kind, and the spec's defaults when none is stored.
export const THRESHOLDS = [0.8, 0.85, 0.9, 0.95, 0.99];
export type KindThresholds = { film: number; episode: number };
const SPEC_DEFAULT_THRESHOLDS: KindThresholds = { film: 0.9, episode: 0.8 };

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
    // The titles listed on BOTH sides when the last completed run read its lists (O14's own record).
    lastRunBoth: new Set<number>(),
    // After a « Non »: title -> the side it left, until the owner adds it back there (O15).
    declined: new Map<number, Side>(),
    protectedFrom: new Map<number, Side>(),
    guarded: new Map<number, string>(),
    active: new Map<number, number>(),
    current: undefined as Context | undefined,
    allowed: new Map<JobKey, number>(),
    invoked: new Map<JobKey, number>(),
    // Every finished message a Naka tab sent, as the world built it (O13 judges from these).
    sentFinishes: [] as FinishedMessage[],
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
      incompleteFinishes: 0,
      removalAnswers: 0,
      blockAnswers: 0,
      questionAnswers: 0,
      hides: 0,
      removalWrites: 0,
      declines: 0,
      candidateChoices: 0,
      strayChoices: 0,
    },
  };
  for (const n of TITLES) {
    if (r() < 0.5) w.playlist.add(n);
    if (r() < 0.5) w.wishlist.add(scOf(n));
    if (isFilm(n) && r() < 0.2) w.done.add(scOf(n));
  }
  // Most owners have stored thresholds, any of the grid per kind; the others have the defaults.
  if (r() < 0.75) setThresholds(w, randomThresholds(r));
  return w;
}

export function randomThresholds(r: () => number): KindThresholds {
  const pick = () => THRESHOLDS[Math.floor(r() * THRESHOLDS.length)] ?? 0.9;
  return { film: pick(), episode: pick() };
}

// The owner's thresholds, written into the settings as the options page would between two jobs.
export function setThresholds(w: World, thresholds: KindThresholds): void {
  const settings = w.storage.get("settings") ?? { mode: "simulation" };
  w.storage.set("settings", { ...(settings as object), thresholds });
  w.log.push(`thresholds ${thresholds.film}/${thresholds.episode}`);
}

// The thresholds stored right now, read from the raw stored value, not through the code's parser.
export function storedThresholds(w: World): KindThresholds {
  const raw = (
    w.storage.get("settings") as { thresholds?: unknown } | undefined
  )?.thresholds as Partial<KindThresholds> | undefined;
  if (raw === undefined) return SPEC_DEFAULT_THRESHOLDS;
  const bad = Number.POSITIVE_INFINITY;
  return {
    film: typeof raw.film === "number" ? raw.film : bad,
    episode: typeof raw.episode === "number" ? raw.episode : bad,
  };
}

// The world's own rule for the kind of a message: an episode has both a season and an episode.
export function kindOfMessage(msg: FinishedMessage): "film" | "episode" {
  return msg.season !== undefined && msg.episode !== undefined
    ? "episode"
    : "film";
}

// What the world sends as a Naka tab: recorded, so that O13 judges a finish from the world's own copy.
export function sentFinish(w: World, msg: FinishedMessage): void {
  w.sentFinishes.push(msg);
  const threshold = storedThresholds(w)[kindOfMessage(msg)];
  const complete = msg.source === "explicit" || msg.progress >= threshold;
  if (!complete) w.stats.incompleteFinishes += 1;
}

// A port of a dead worker: the job that called it stops here, as the worker died at this await.
function frozen<T>(w: World): Promise<T> {
  w.stats.frozen += 1;
  return forever<T>();
}

function flaky(w: World, what: string): void {
  if (w.r() < 0.1) {
    w.log.push(`${what} failed`);
    throw new Error(`${what} failed`);
  }
}

// A finish that parked behind an open question of its title (D4) is not handled yet: its film may still
// be wished once the owner answers.
function waitsOnQuestion(state: unknown, contentId: number): boolean {
  const pending = (state as { pending?: { side?: string; id?: number }[] })
    .pending;
  return (pending ?? []).some((p) => p.side === "naka" && p.id === contentId);
}

// O14's record: the titles on both sides when the last completed run ended, its own writes included (the
// run's final lists, as the world holds them: the owner edits only between jobs).
function recordFinalLists(w: World): void {
  w.lastRunBoth.clear();
  for (const n of TITLES) {
    if (w.playlist.has(n) && w.wishlist.has(scOf(n))) w.lastRunBoth.add(n);
  }
}

// A completed run (its state saved) saw the pairs that were in both lists when it read them.
function onStateSave(w: World, value: unknown): void {
  const ctx = w.current;
  if (ctx?.kind === "sync" && ctx.nakaAt && ctx.scAt) {
    ctx.saved = true;
    recordFinalLists(w);
    for (const n of TITLES) {
      if (ctx.nakaAt.has(n) && ctx.scAt.has(scOf(n))) w.seenBoth.add(n);
    }
  }
  if (
    ctx?.kind === "finish" &&
    isFilm(ctx.msg.contentId) &&
    !waitsOnQuestion(value, ctx.msg.contentId)
  ) {
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
    if (!isLocalAnswer(w)) checkBinding(w, "state save");
    onStateSave(w, value);
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

export function answerStatus<T>(read: () => Promise<T>): Promise<T> {
  return answering.run(true, read);
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
      if (w.current?.kind !== "answer") {
        violation(w, `removeFromPlaylist ${id}`);
        return;
      }
      nakaGate(w, "remove");
      checkRemovalWrite(w, "naka", id);
      w.log.push(`answer remove naka ${id}`);
      flaky(w, `remove naka ${id}`);
      w.playlist.delete(id);
    },
    search: async (q) => {
      nakaGate(w, "search");
      return TITLES.filter((n) => nakaItem(n).title === q).map(nakaItem);
    },
    contentById: async (id) => {
      nakaGate(w, "content");
      return TITLES.includes(id) ? nakaItem(id) : undefined;
    },
    availableSeasons: async () => {
      nakaGate(w, "seasons");
      return undefined;
    },
  };
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
  if (ctx !== undefined && ctx.pinned === tabId) {
    ctx.lossQuery = !ctx.tabLost;
    loseTab(ctx, w);
  }
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
      checkQueryCall(w);
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
        rating: null,
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
      if (
        w.current?.kind === "answer" &&
        w.current.msg.type === "answer-removal"
      )
        return removeFromSc(w, id);
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
    if (
      (ctx?.kind === "finish" || ctx?.kind === "answer") &&
      ctx.spent === undefined
    ) {
      const stored = settingsOf(w)?.finishWindow;
      ctx.spent =
        stored !== undefined &&
        w.time >= stored.from &&
        w.time - stored.from < FINISH_WINDOW_MS &&
        stored.count >= MAX_FINISHES_PER_WINDOW;
      if (ctx.spent && ctx.kind === "finish") w.stats.spentBudgets += 1;
    }
    return w.time;
  };
}

// Oracles of a finish write: the binding, and the hour's budget (at most 30 finishes per window).
function checkFinishWrite(w: World, what: string): void {
  checkBinding(w, what);
  const ctx = w.current;
  if ((ctx?.kind === "finish" || ctx?.kind === "answer") && ctx.spent) {
    violation(w, `${what} with the hour's finishes spent`);
  }
  if (ctx?.kind === "answer") checkAnswerFinish(w, what);
  else checkViewing(w, what);
}

// The unwish of a removal answer: « Retirer aussi… » from SensCritique, judged by O14.
function removeFromSc(w: World, id: number): void {
  checkRemovalWrite(w, "sc", id);
  w.log.push(`answer unwish ${id}`);
  flaky(w, `unwish ${id}`);
  w.wishlist.delete(id);
}

const sameFinish = (a: FinishedMessage, b: FinishedMessage): boolean =>
  a.source === b.source &&
  a.progress === b.progress &&
  a.contentId === b.contentId &&
  a.season === b.season &&
  a.episode === b.episode;

// Oracle O13 (the owner's first rule): a SensCritique finish write comes from a finished message a Naka
// tab sent, explicit or with a progress at least the threshold of its kind stored when the write
// happens. It is judged from the world's own copy of the message and the raw stored settings, never from
// the code.
export function checkViewing(w: World, what: string): void {
  const ctx = w.current;
  if (ctx?.kind !== "finish") {
    violation(w, `${what} outside a finish job`);
    return;
  }
  const sent = w.sentFinishes.find((m) => sameFinish(m, ctx.msg));
  if (sent === undefined) {
    violation(w, `${what} for a finished message never sent`);
    return;
  }
  const threshold = storedThresholds(w)[kindOfMessage(sent)];
  if (sent.source !== "explicit" && !(sent.progress >= threshold)) {
    violation(
      w,
      `${what} from an incomplete viewing (${sent.progress} < ${threshold})`,
    );
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
type Run = <T>(key: JobKey, ctx: Context, job: () => Promise<T>) => Promise<T>;

// An answer job: O14 to O16 judge it from the state it started from (tests/runtime-answer-oracles.ts).
async function answerRun(
  w: World,
  msg: AnswerMessage,
  run: Run,
  job: () => Promise<void>,
): Promise<void> {
  const ctx = beginAnswer(w, msg);
  await run("answer", ctx, job);
  endAnswer(w, ctx);
}

export function observed(w: World, gen: number, jobs: Jobs): Jobs {
  const run: Run = async (key, ctx, job) => {
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
      if (w.current === ctx) {
        if (ctx.kind === "sync" && ctx.saved) recordFinalLists(w);
        w.current = undefined;
      }
    }
  };
  return {
    syncJob: (trigger) =>
      run(`sync:${trigger}`, { kind: "sync" }, () => jobs.syncJob(trigger)),
    finishJob: (msg) =>
      run("finish", { kind: "finish", msg }, () => jobs.finishJob(msg)),
    setMode: (mode) => run("mode", { kind: "other" }, () => jobs.setMode(mode)),
    setSettings: (thresholds, pauseFromPercent) =>
      run("settings", { kind: "other" }, () =>
        jobs.setSettings(thresholds, pauseFromPercent),
      ),
    rate: (msg) => run("rating", { kind: "other" }, () => jobs.rate(msg)),
    dismissRating: (msg) =>
      run("rating", { kind: "other" }, () => jobs.dismissRating(msg)),
    answerQuestion: (msg) =>
      answerRun(w, msg, run, () => jobs.answerQuestion(msg)),
    answerRemoval: (msg) =>
      answerRun(w, msg, run, () => jobs.answerRemoval(msg)),
    hideQuestion: (msg) => answerRun(w, msg, run, () => jobs.hideQuestion(msg)),
    // The fuzz sends no manual link (B6 has its own tests): these pass through unobserved.
    linkTitle: (msg) => jobs.linkTitle(msg),
    requeueQuestion: (msg) => jobs.requeueQuestion(msg),
    forget: () => jobs.forget(),
    reset: () => jobs.reset(),
    // The fuzz sends no unticked « vu » (B8b has its own tests): these pass through unobserved.
    forgetHandled: (msg) => jobs.forgetHandled(msg),
    handledTitles: () => jobs.handledTitles(),
    searchTitles: (msg) => jobs.searchTitles(msg),
    ratingCard: (msg) => jobs.ratingCard(msg),
    ratingCards: () => jobs.ratingCards(),
    openQuestions: (answering) => jobs.openQuestions(answering),
    removalOffer: (contentId, answering) =>
      jobs.removalOffer(contentId, answering),
    pageLists: (answering) => jobs.pageLists(answering),
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
    if (w.declined.get(n) === side) w.declined.delete(n);
    w.protectedFrom.delete(n);
    w.log.push(`owner add ${side} ${n}`);
  }
}

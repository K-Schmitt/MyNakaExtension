// Test-only oracles of the runtime fuzz: the rules a write or a call must obey, checked at the moment it
// happens against the world's own record (tests/runtime-world.ts). Each one reports to `w.violations`;
// tests/runtime-oracles.test.ts holds a positive control for each, so a green fuzz cannot mean an oracle
// that never fires.

import { AsyncLocalStorage } from "node:async_hooks";
import { parseSettings, type Settings } from "../src/ext/settings";
import type { Side, World } from "./runtime-world";

export const ORACLES: [string, RegExp][] = [
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
  ["O13 threshold rule", /incomplete viewing|never sent|outside a finish job/],
  ["O14 removal write", /removal write/],
  ["O15 written back", /written back after a Non/],
  ["O16 stray choice", /changed by an answer to a non-candidate/],
];

// The oracle a violation belongs to, for the fuzz's failure message.
export function oracleOf(found: string): string {
  return (
    ORACLES.find(([, pattern]) => pattern.test(found))?.[0] ??
    "O8 forbidden write"
  );
}

export function violation(w: World, what: string): void {
  w.violations.push(`seed ${w.seed}: ${what} | ${w.log.slice(-12).join("; ")}`);
}

// Plan 2's re-wish oracle: from now on, no run may wish this film again.
export function guard(w: World, id: number, why: string): void {
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

export const settingsOf = (w: World): Settings | undefined =>
  stored(w, "settings", parseSettings);

// Oracle: no write and no state save while the bound accounts are not the ones signed in.
export function checkBinding(w: World, what: string): void {
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
export function checkListWrite(w: World, side: Side, id: number): void {
  w.stats.liveWrites += 1;
  if ((settingsOf(w)?.mode ?? "simulation") !== "live") {
    violation(w, `${side} write ${id} in simulation`);
  }
  checkBinding(w, `${side} write ${id}`);
  const n = side === "naka" ? id : id - 1000;
  if (w.protectedFrom.get(n) === side) {
    violation(w, `re-add of ${n} to ${side} after the owner removed it`);
  }
  if (w.declined.get(n) === side) {
    violation(w, `${side} write ${id} written back after a Non`);
  }
  if (side === "sc" && w.guarded.has(id)) {
    violation(w, `re-wish of ${id} after ${w.guarded.get(id)}`);
  }
}

// The status answers in flight. AsyncLocalStorage follows an answer's own promise chain and no other, so
// a storage write made inside it is the answer's, whatever job runs meanwhile (Ruling 20).
export const answering = new AsyncLocalStorage<true>();

// Oracle O12: a status answer never writes storage.
export function checkStatusWrite(w: World, keys: string[]): void {
  if (answering.getStore() === true)
    violation(w, `a status answer wrote ${keys.join(",")}`);
}

// Oracle O10 (Ruling 17): once the job's pinned tab refused a send, or every tab it found did, its tab is
// lost, and the job calls the tabs no more, but for the one query that classifies a pinned tab's loss.
export function checkTabCall(w: World): void {
  if (w.current?.tabLost)
    violation(w, "a tabs call after the job lost its tab");
}

// The one query a job makes right after its pinned tab refused (naka-tab-changed or no-naka-tab); any
// other call on a lost tab is O10's, any query once pinned is O11's.
export function checkQueryCall(w: World): void {
  const ctx = w.current;
  if (ctx?.tabLost && ctx.lossQuery) {
    ctx.lossQuery = false;
    return;
  }
  checkTabCall(w);
  checkQuery(w);
}

// Oracle O11 (Rulings 9 and 20): a job finds its tabs, tries them in their query order until one
// answers, and then sends to that pinned tab only, with no new lookup. A lost tab is O10's.
export function checkQuery(w: World): void {
  const ctx = w.current;
  if (ctx?.tabLost) return;
  if (ctx?.pinned !== undefined)
    violation(w, `a tab query after the job pinned tab ${ctx.pinned}`);
}

export function checkSend(w: World, tabId: number): void {
  const ctx = w.current;
  if (ctx === undefined || ctx.tabLost) return;
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

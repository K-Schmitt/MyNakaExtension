// Test-only oracles O14-O16 of the runtime fuzz: the owner's answers (B5a). Each judges what a removal
// write or an answer did from the world's own record and the RAW stored state, never from the code's
// parsers or its presence data (an oracle that restates the code's rule cannot see its holes).

import type {
  AnswerMessage,
  AnswerRemovalMessage,
} from "../src/ext/question-messages";
import { checkBinding, violation } from "./runtime-oracles";
import type { Side, World } from "./runtime-world";

type RawPair = { nakaId: number; scId: number };
type RawItem = {
  kind?: string;
  removeFrom?: Side;
  pair?: RawPair;
  side?: Side;
  id?: number;
  candidateIds?: number[];
  finish?: string;
};
type RawLastFinish = { key?: string; error?: string };
type RawState = {
  pending?: RawItem[];
  mapping?: RawPair[];
  settled?: RawPair[];
};

export const rawState = (w: World): RawState =>
  (w.storage.get("state") ?? {}) as RawState;

const samePair = (a: RawPair, b: RawPair): boolean =>
  a.nakaId === b.nakaId && a.scId === b.scId;

export const pairOf = (msg: { nakaId: number; scId: number }): RawPair => ({
  nakaId: msg.nakaId,
  scId: msg.scId,
});

export function storedRemoval(w: World, removeFrom: Side, pair: RawPair) {
  return (rawState(w).pending ?? []).some(
    (item) =>
      item.kind === "removal" &&
      item.removeFrom === removeFrom &&
      item.pair !== undefined &&
      samePair(item.pair, pair),
  );
}

export function storedQuestion(w: World, side: Side, id: number) {
  return (rawState(w).pending ?? []).find(
    (item) => item.kind === "ambiguity" && item.side === side && item.id === id,
  );
}

export const isMapped = (w: World, pair: RawPair): boolean =>
  (rawState(w).mapping ?? []).some((known) => samePair(known, pair));

export const isSettled = (w: World, pair: RawPair): boolean =>
  (rawState(w).settled ?? []).some((known) => samePair(known, pair));

/** An answer job in flight: what the oracles need of the state it started from. */
export type AnswerContext = {
  kind: "answer";
  msg: AnswerMessage;
  /** List writes made so far for this one message. */
  writes: number;
  before: string | undefined;
  candidateIds?: number[];
  finish?: string;
  /** The raw `lastFinish` record when the job started. */
  lastFinishBefore?: string;
  /** The pair was a stored removal when the job started. */
  removal: boolean;
  /** State saves made so far by this job. */
  saves: number;
  spent?: boolean;
};

const rawLastFinish = (w: World): RawLastFinish | undefined =>
  (w.storage.get("settings") as { lastFinish?: RawLastFinish } | undefined)
    ?.lastFinish;

export function beginAnswer(w: World, msg: AnswerMessage): AnswerContext {
  const ctx: AnswerContext = {
    kind: "answer",
    msg,
    writes: 0,
    saves: 0,
    before: JSON.stringify(w.storage.get("state")),
    lastFinishBefore: JSON.stringify(rawLastFinish(w)),
    removal:
      msg.type === "answer-removal" &&
      storedRemoval(w, msg.removeFrom, pairOf(msg)),
  };
  if (msg.type === "answer-question") {
    const question = storedQuestion(w, msg.side, msg.id);
    ctx.candidateIds = question?.candidateIds ?? [];
    ctx.finish = question?.finish;
  }
  return ctx;
}

const OFFSET = 1000;

// O15 and O16, once the job is over: a « Non » that closed a stored removal declines the title on the side
// it left; a choice outside the stored candidates must have left the state as it was.
export function endAnswer(w: World, ctx: AnswerContext): void {
  const { msg } = ctx;
  if (msg.type === "answer-removal" && !msg.remove && ctx.removal) {
    if (!storedRemoval(w, msg.removeFrom, pairOf(msg))) {
      w.declined.set(msg.nakaId, msg.removeFrom === "sc" ? "naka" : "sc");
      w.stats.declines += 1;
    }
  }
  const stray =
    msg.type === "answer-question" &&
    msg.choice !== null &&
    !ctx.candidateIds?.includes(msg.choice);
  if (stray && JSON.stringify(w.storage.get("state")) !== ctx.before) {
    violation(
      w,
      `state changed by an answer to a non-candidate (${msg.choice})`,
    );
  }
}

// O14: a removal write is the one write of an « Retirer aussi… » answer, on the side the message names,
// for a pair that was a stored removal, or (the block's case) a mapped, unsettled pair that the world's
// own record says was listed on both sides at the last completed run and that Naka does not list now.
export function checkRemovalWrite(w: World, side: Side, id: number): void {
  const ctx = w.current;
  if (ctx?.kind !== "answer" || ctx.msg.type !== "answer-removal") {
    violation(w, `${side} removal write ${id} outside an answer-removal job`);
    return;
  }
  const { msg } = ctx;
  w.stats.removalWrites += 1;
  checkBinding(w, `${side} removal write ${id}`);
  const wanted = side === "sc" ? msg.scId : msg.nakaId;
  if (!msg.remove || side !== msg.removeFrom || id !== wanted) {
    violation(w, `${side} removal write ${id} the message did not ask`);
  }
  ctx.writes += 1;
  if (ctx.writes > 1)
    violation(w, `a second removal write ${id} for one message`);
  if (!mayRemove(w, side, msg)) {
    violation(
      w,
      `${side} removal write ${id} of a pair neither stored nor listed on both sides`,
    );
  }
}

function mayRemove(w: World, side: Side, msg: AnswerRemovalMessage): boolean {
  const pair = pairOf(msg);
  if (storedRemoval(w, side, pair)) return true;
  return (
    side === "sc" &&
    w.lastRunBoth.has(msg.nakaId) &&
    msg.scId === msg.nakaId + OFFSET &&
    isMapped(w, pair) &&
    !isSettled(w, pair) &&
    !w.playlist.has(msg.nakaId)
  );
}

// The finish a candidate choice runs (D4): never from a choice outside the stored candidates, and only
// for a question that waited on a finish. Any other answer job writing a finish is outside a finish job.
export function checkAnswerFinish(w: World, what: string): void {
  const ctx = w.current;
  if (ctx?.kind !== "answer" || ctx.msg.type !== "answer-question") {
    violation(w, `${what} outside a finish job`);
    return;
  }
  const { choice } = ctx.msg;
  const candidate = choice !== null && ctx.candidateIds?.includes(choice);
  if (!candidate || ctx.finish === undefined) {
    violation(w, `state changed by an answer to a non-candidate: ${what}`);
  }
}

// Written here on purpose: an oracle must not restate the code's list (STARTS_WAITING).
const NO_TAB_ERRORS = ["no-naka-tab", "naka-session"];

const withoutRetries = (state: unknown): string => {
  const { retryFinishes: _retries, ...rest } = (state ?? {}) as RawState & {
    retryFinishes?: unknown;
  };
  return JSON.stringify(rest);
};

// I2's note that a finish waits for a Naka tab: the state saved is the stored one but for `retryFinishes`,
// and the finish of the question's own title failed, in this job, for lack of that tab or session.
function isWaitingNote(w: World, ctx: AnswerContext, saved: unknown): boolean {
  if (withoutRetries(saved) !== withoutRetries(w.storage.get("state"))) {
    return false;
  }
  const last = rawLastFinish(w);
  const changed = JSON.stringify(last) !== ctx.lastFinishBefore;
  return (
    changed &&
    last?.key === ctx.finish &&
    last?.error !== undefined &&
    NO_TAB_ERRORS.includes(last.error)
  );
}

// A state save the binding check does not judge: the answer only edits the stored questions (D10), with
// no site read behind it. That is a dismissal, the « Non » of a STORED removal (the zero-network path),
// and a choice's own save, the first of its job. The saves after it are those of the finish the choice
// runs, which checks the binding itself, but for the waiting note (isWaitingNote), saved after a finish
// that failed for lack of a Naka tab (I2; the retry checks the binding). The block « Non » (no stored
// item) rests on a Naka read, and « Retirer aussi… » on its job's binding check: O4 judges both.
export function isLocalAnswer(w: World, saved: unknown): boolean {
  const ctx = w.current;
  if (ctx?.kind !== "answer") return false;
  const { msg } = ctx;
  ctx.saves += 1;
  if (msg.type === "answer-removal") return !msg.remove && ctx.removal;
  if (msg.type === "answer-question") {
    return ctx.saves === 1 || (ctx.saves === 2 && isWaitingNote(w, ctx, saved));
  }
  return true;
}

// The owner's answers as the runtime fuzz sends them (B5a's messages): « Retirer aussi… » and « Non » for
// the stored removals, the same for random mapped pairs (the block's case, which no stored question
// backs), and the choices of an open question, stored candidates and stray ids alike. A message is sent
// by the sender that may send it, or, for the forged ones, by one that may not. The oracles that judge
// what the worker does with them: tests/runtime-answer-oracles.ts.

import type { Side } from "../src/core/state";
import { rawState } from "./runtime-answer-oracles";
import { FILMS, scOf, TITLES, type World } from "./runtime-world";

export type AnswerRole = "naka-tab" | "status-page";
export type AnswerSend = { msg: unknown; role: AnswerRole };

function pick<T>(w: World, items: readonly T[]): T {
  return items[Math.floor(w.r() * items.length)] as T;
}

const other = (side: Side): Side => (side === "sc" ? "naka" : "sc");
const role = (w: World): AnswerRole =>
  w.r() < 0.5 ? "naka-tab" : "status-page";

function removalOf(
  w: World,
  removeFrom: Side,
  pair: { nakaId: number; scId: number },
): AnswerSend {
  w.stats.removalAnswers += 1;
  const msg = {
    type: "answer-removal",
    removeFrom,
    ...pair,
    remove: w.r() < 0.6,
  };
  return { msg, role: role(w) };
}

// A pending removal, sometimes with the wrong side (the worker must refuse it).
function storedRemovalAnswer(w: World): AnswerSend | undefined {
  const items = (rawState(w).pending ?? []).filter(
    (item) => item.kind === "removal" && item.pair !== undefined,
  );
  if (items.length === 0) return undefined;
  const item = pick(w, items);
  const side = item.removeFrom ?? "sc";
  return removalOf(w, w.r() < 0.85 ? side : other(side), item.pair as never);
}

// The block's case: a mapped pair no question backs; and sometimes a pair nobody mapped.
function blockAnswer(w: World): AnswerSend {
  w.stats.blockAnswers += 1;
  const mapped = rawState(w).mapping ?? [];
  const known = mapped.length > 0 && w.r() < 0.85 ? pick(w, mapped) : undefined;
  const nakaId = known?.nakaId ?? pick(w, TITLES);
  const scId = known?.scId ?? scOf(pick(w, TITLES));
  return removalOf(w, w.r() < 0.9 ? "sc" : "naka", { nakaId, scId });
}

function strayId(w: World, side: Side): number {
  return side === "naka" ? scOf(pick(w, TITLES)) : pick(w, TITLES);
}

// An open question's candidate, none (null), or an id the question never listed.
function questionAnswer(w: World): AnswerSend {
  w.stats.questionAnswers += 1;
  const open = (rawState(w).pending ?? []).filter(
    (item) => item.kind === "ambiguity",
  );
  const item = open.length > 0 ? pick(w, open) : undefined;
  const side = item?.side ?? pick(w, ["naka", "sc"] as Side[]);
  const id =
    item?.id ?? (side === "naka" ? pick(w, TITLES) : scOf(pick(w, TITLES)));
  const candidates = item?.candidateIds ?? [];
  const a = w.r();
  let choice: number | null = strayId(w, side);
  if (a < 0.1) choice = null;
  else if (a < 0.6 && candidates.length > 0) choice = pick(w, candidates);
  if (choice !== null && candidates.includes(choice))
    w.stats.candidateChoices += 1;
  else if (choice !== null) w.stats.strayChoices += 1;
  return { msg: { type: "answer-question", side, id, choice }, role: role(w) };
}

// The answer the lever of the I2 situation sends: a candidate of an open Naka question that waits on a finish.
export function waitingAnswer(w: World): AnswerSend | undefined {
  const open = (rawState(w).pending ?? []).filter(
    (item) =>
      item.kind === "ambiguity" &&
      item.side === "naka" &&
      item.finish !== undefined,
  );
  const item = open.length > 0 ? pick(w, open) : undefined;
  const choice = item?.candidateIds?.[0];
  if (item === undefined || choice === undefined) return undefined;
  w.stats.questionAnswers += 1;
  w.stats.candidateChoices += 1;
  const msg = { type: "answer-question", side: "naka", id: item.id, choice };
  return { msg, role: role(w) };
}

function hideAnswer(w: World): AnswerSend | undefined {
  const items = rawState(w).pending ?? [];
  if (items.length === 0) return undefined;
  const item = pick(w, items);
  w.stats.hides += 1;
  const key =
    item.kind === "removal" && item.pair
      ? `removal:${item.removeFrom}:${item.pair.nakaId}:${item.pair.scId}`
      : `ambiguity:${item.side}:${item.id}`;
  return { msg: { type: "hide-question", key }, role: "naka-tab" };
}

// One answer from a sender that may send it.
export function answerSend(w: World): AnswerSend {
  const a = w.r();
  if (a < 0.3) return storedRemovalAnswer(w) ?? blockAnswer(w);
  if (a < 0.55) return blockAnswer(w);
  if (a < 0.9) return questionAnswer(w);
  return hideAnswer(w) ?? questionAnswer(w);
}

export type ForgedAnswer = { msg: unknown; from: "look-alike" | AnswerRole };

// An answer a sender may not send: from a look-alike site, or a hide from the status page.
export function forgedAnswer(w: World): ForgedAnswer {
  const sent = answerSend(w);
  const msg = sent.msg as { type: string; remove?: boolean };
  if (msg.type === "hide-question") return { msg, from: "status-page" };
  if (msg.type === "answer-removal") msg.remove = true;
  return { msg, from: "look-alike" };
}

type RawStateLike = { pending?: unknown[]; mapping?: { nakaId: number }[] };
const isMappedNaka = (state: RawStateLike, n: number): boolean =>
  (state.mapping ?? []).some((pair) => pair.nakaId === n);

// A sync that found two products for a film asks the owner: the question the worker stored, with its
// candidates and the finish that waits on it (D4). The world has no duplicate titles, so it stores the
// question itself, between two jobs, as the owner's list edits are.
export function askQuestion(w: World): void {
  const state = w.storage.get("state") as RawStateLike | undefined;
  if (state === undefined) return;
  const unmapped = FILMS.filter((m) => !isMappedNaka(state, m));
  if (unmapped.length === 0) return;
  const n = pick(w, unmapped);
  const candidateIds = [scOf(n)];
  const candidate = (id: number) => ({
    id,
    title: `Film ${id - 1000}`,
    type: "film",
  });
  const asked = {
    kind: "ambiguity",
    side: "naka",
    id: n,
    candidateIds,
    title: `Film ${n}`,
    candidates: candidateIds.map(candidate),
    finish: `movie:${n}`,
  };
  const pending = (state.pending ?? []) as {
    kind?: string;
    side?: string;
    id?: number;
  }[];
  if (
    pending.some(
      (p) => p.kind === "ambiguity" && p.side === "naka" && p.id === n,
    )
  )
    return;
  w.storage.set("state", { ...state, pending: [...pending, asked] });
  w.log.push(`question asked naka ${n}`);
}

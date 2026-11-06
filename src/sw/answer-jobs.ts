// The owner's answer to a title question, and the dismissal of a question from the home panel. The worker
// takes nothing from the message for a site write: the choice must be one of the STORED candidates of an
// OPEN question (core/questions), else the answer is refused and nothing is saved. A candidate choice then
// runs the one finish the question waited on (D4), through the finish job: its pre-check, its budget and
// its binding check. « Aucun de ceux-là » never runs it. Answers work in both modes (design §2.8).

import type { FinishedMessage } from "../content/playback-tracker";
import { idsOfKey } from "../core/finish-event";
import type { Pair } from "../core/list-diff";
import {
  type AmbiguityItem,
  chooseCandidate,
  chooseNone,
  hideQuestion,
  openAmbiguity,
  type QuestionKey,
} from "../core/questions";
import {
  addRetry,
  type RetryFinish,
  type WaitingQuestion,
} from "../core/retry-finishes";
import { type SyncState, samePair } from "../core/state";
import type {
  AnswerQuestionMessage,
  HideQuestionMessage,
} from "../ext/question-messages";
import type { Store } from "../ext/store";
import { recordAnswer } from "./answer-log";
import { explicitFinish } from "./explicit-finish";
import { finishJob } from "./finish-job";
import type { JobDeps } from "./job-deps";
import { STARTS_WAITING } from "./retry-rules";
import { toJobError } from "./to-job-error";

type Seed = Omit<RetryFinish, "at">;
type Settled = {
  outcome: "done" | "refused";
  finish?: FinishedMessage;
  seed?: Seed;
};

export function ambiguityTarget({
  side,
  id,
}: AnswerQuestionMessage): QuestionKey {
  return `ambiguity:${side}:${id}`;
}

function answered(
  state: SyncState,
  msg: AnswerQuestionMessage,
): SyncState | undefined {
  return msg.choice === null
    ? chooseNone(state, msg.side, msg.id)
    : chooseCandidate(state, msg.side, msg.id, msg.choice);
}

// The finish that waited on the question. The state schema keeps `finish` on a Naka-side question, and of
// that question's own title (item-schema.ts). Shared with the link by hand (link-job.ts).
export function finishWaitingOn(
  question: AmbiguityItem | undefined,
): FinishedMessage | undefined {
  if (question?.finish === undefined) return undefined;
  const ids = idsOfKey(question.finish);
  return ids === undefined ? undefined : explicitFinish(ids);
}

// A candidate choice only: « Aucun de ceux-là » never runs it.
function waitingFinish(
  question: AmbiguityItem | undefined,
  msg: AnswerQuestionMessage,
): FinishedMessage | undefined {
  return msg.choice === null ? undefined : finishWaitingOn(question);
}

function absentFrom(pairs: readonly Pair[], others: readonly Pair[]): Pair[] {
  return pairs.filter((p) => !others.some((o) => samePair(o, p)));
}

// What undoing the answer needs later: the link it made, the links it displaced, the question as it was.
function seedOf(
  before: SyncState,
  after: SyncState,
  question: AmbiguityItem | undefined,
): Seed | undefined {
  if (question?.finish === undefined) return undefined;
  const [pair] = absentFrom(after.mapping, before.mapping);
  if (pair === undefined) return undefined;
  const { finish: key, ...asked }: AmbiguityItem = question;
  const evicted = absentFrom(before.mapping, after.mapping);
  return { key, pair, evicted, question: asked satisfies WaitingQuestion };
}

async function settle(
  store: Pick<Store, "loadState" | "saveState">,
  msg: AnswerQuestionMessage,
): Promise<Settled> {
  const state = await store.loadState();
  const next = answered(state, msg);
  if (next === undefined) return { outcome: "refused" };
  await store.saveState(next);
  const question = openAmbiguity(state, msg.side, msg.id);
  const seed = msg.choice === null ? undefined : seedOf(state, next, question);
  return { outcome: "done", finish: waitingFinish(question, msg), seed };
}

async function keepWaiting(deps: JobDeps, seed: Seed): Promise<void> {
  const state = await deps.store.loadState();
  await deps.store.saveState(addRetry(state, { ...seed, at: deps.now() }));
}

async function finishAnswered(deps: JobDeps, settled: Settled): Promise<void> {
  if (settled.finish === undefined) return;
  const failure = await finishJob(deps, settled.finish);
  if (failure === undefined || !STARTS_WAITING.includes(failure)) return;
  if (settled.seed !== undefined) await keepWaiting(deps, settled.seed);
}

export async function answerQuestionJob(
  deps: JobDeps,
  msg: AnswerQuestionMessage,
): Promise<void> {
  const target = ambiguityTarget(msg);
  let settled: Settled;
  try {
    settled = await settle(deps.store, msg);
  } catch (error) {
    await recordAnswer(
      deps.store,
      target,
      "failed",
      deps.now(),
      toJobError(error),
    );
    return;
  }
  await recordAnswer(deps.store, target, settled.outcome, deps.now());
  await finishAnswered(deps, settled);
}

// Local: no site, no record. A key with no question changes nothing and saves nothing.
export async function hideQuestionJob(
  store: Pick<Store, "loadState" | "saveState">,
  msg: HideQuestionMessage,
): Promise<void> {
  const state = await store.loadState();
  const next = hideQuestion(state, msg.key);
  if (next !== state) await store.saveState(next);
}

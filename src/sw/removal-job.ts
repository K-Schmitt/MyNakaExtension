// The owner's answer to a removal: « Retirer aussi… » (remove) or « Non » (keep). The worker verifies before
// it writes. The answer must match a STORED removal question, or, right after a removal on Naka (the block,
// before any sync asked), a stored mapped pair, not settled, that BOTH sides listed at the last completed
// run, and whose Naka id the job now reads as gone from « Ma liste ». Anything else is refused, with no
// network and no save. A removal reads both sites before its one write, and a title gone from the other
// side or back on its own is `moot`: no write. The binding is checked first: its account read is the
// job's first Naka call, so no write ever is. An EMPTY « Ma liste » is a failed read, never
// "gone": the Naka parser accepts `contentIds: []`, so it proves nothing. Answers work in both modes.

import type { Pair } from "../core/list-diff";
import { listedOnBothAtLastRun } from "../core/listed-on-both";
import {
  closeRemoval,
  findRemoval,
  keepPair,
  type QuestionKey,
} from "../core/questions";
import { type SyncState, samePair } from "../core/state";
import { JobRejected } from "../ext/job-error";
import type { AnswerRemovalMessage } from "../ext/question-messages";
import { UNIVERSE } from "../sc/sc-queries";
import { recordAnswer } from "./answer-log";
import { checkBinding } from "./binding";
import { type JobDeps, jobAccounts, jobNaka } from "./job-deps";
import type { NakaProxy } from "./naka-proxy";
import { toJobError } from "./to-job-error";

type Ending = "done" | "moot" | "refused";
type Answer = { msg: AnswerRemovalMessage; pair: Pair; hasItem: boolean };

/** A wished film or série can be unwished; nothing else is (an episode, a season, an unknown kind). */
const UNWISHABLE: readonly number[] = [UNIVERSE.film, UNIVERSE.serie];

export function removalTarget(msg: AnswerRemovalMessage): QuestionKey {
  return `removal:${msg.removeFrom}:${msg.nakaId}:${msg.scId}`;
}

// The block's case: the owner just removed the title from Naka, and no sync asked yet.
function blockAllowed(state: SyncState, { msg, pair }: Answer): boolean {
  return (
    msg.removeFrom === "sc" &&
    state.mapping.some((mapped) => samePair(mapped, pair)) &&
    !state.settled.some((held) => samePair(held, pair)) &&
    listedOnBothAtLastRun(state, pair)
  );
}

// Whether « Ma liste » holds the id now. An empty list rejects: it is no proof that the title left.
async function listedOnNaka(naka: NakaProxy, nakaId: number): Promise<boolean> {
  const ids = await naka.playlistIds();
  if (ids.length === 0) throw new JobRejected("naka-list-empty");
  return ids.includes(nakaId);
}

// The job's Naka tab, once the accounts are the bound ones.
async function boundNaka(deps: JobDeps): Promise<NakaProxy> {
  const settings = await deps.store.loadSettings();
  const naka = jobNaka(deps);
  await checkBinding(settings.binding, jobAccounts(naka, deps));
  return naka;
}

// « Non » with no stored item: the read must show the title gone from Naka, as the block claimed.
async function keepFromBlock(deps: JobDeps, { msg }: Answer): Promise<Ending> {
  const naka = await boundNaka(deps);
  return (await listedOnNaka(naka, msg.nakaId)) ? "refused" : "done";
}

async function removeFromSc(deps: JobDeps, answer: Answer): Promise<Ending> {
  const { msg, hasItem } = answer;
  const naka = await boundNaka(deps);
  if (await listedOnNaka(naka, msg.nakaId)) return hasItem ? "moot" : "refused";
  const product = await deps.sc.productState(msg.scId);
  if (!product.isWished) return "moot";
  if (!UNWISHABLE.includes(product.universe)) return "refused";
  await deps.sc.unwish(msg.scId);
  return "done";
}

// An empty list fails here too: it would otherwise read as "gone" and close the question.
async function removeFromNaka(deps: JobDeps, { msg }: Answer): Promise<Ending> {
  const naka = await boundNaka(deps);
  if ((await deps.sc.productState(msg.scId)).isWished) return "moot";
  if (!(await listedOnNaka(naka, msg.nakaId))) return "moot";
  await naka.removeFromPlaylist(msg.nakaId);
  return "done";
}

function removal(deps: JobDeps, answer: Answer): Promise<Ending> {
  return answer.msg.removeFrom === "sc"
    ? removeFromSc(deps, answer)
    : removeFromNaka(deps, answer);
}

// `done` and `moot` close the question; a refusal saves nothing.
async function remove(
  deps: JobDeps,
  state: SyncState,
  answer: Answer,
): Promise<Ending> {
  const ending = await removal(deps, answer);
  if (ending !== "refused") {
    await deps.store.saveState(closeRemoval(state, answer.pair));
  }
  return ending;
}

// « Non » settles the pair, so that no sync writes the title back to the side it left.
async function keep(
  deps: JobDeps,
  state: SyncState,
  answer: Answer,
): Promise<Ending> {
  const ending = answer.hasItem ? "done" : await keepFromBlock(deps, answer);
  if (ending === "done") {
    await deps.store.saveState(keepPair(state, answer.pair));
  }
  return ending;
}

async function settle(
  deps: JobDeps,
  msg: AnswerRemovalMessage,
): Promise<Ending> {
  const pair = { nakaId: msg.nakaId, scId: msg.scId };
  const state = await deps.store.loadState();
  const hasItem = findRemoval(state, msg.removeFrom, pair) !== undefined;
  const answer = { msg, pair, hasItem };
  if (!hasItem && !blockAllowed(state, answer)) return "refused";
  return msg.remove ? remove(deps, state, answer) : keep(deps, state, answer);
}

export async function answerRemovalJob(
  deps: JobDeps,
  msg: AnswerRemovalMessage,
): Promise<void> {
  const target = removalTarget(msg);
  let ending: Ending;
  try {
    ending = await settle(deps, msg);
  } catch (error) {
    const code = toJobError(error);
    await recordAnswer(deps.store, target, "failed", deps.now(), code);
    return;
  }
  await recordAnswer(deps.store, target, ending, deps.now());
}

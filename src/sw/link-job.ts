// The owner links a title by hand from the status page (B6), and asks a legacy question again. A link takes
// `otherId` from the message, the one place a message gives an id (Global Constraint): so the worker
// verifies before it saves. The title must be an unlinked entry or an open question (core/questions); BOTH
// kinds are then read on both sites (the Naka item, the SensCritique product) and must be the same, a film
// with a film or a série with a série. The write is local (D10), so no account is checked here: the
// follow-up finish of a waiting question checks its own binding, budget and pre-check. Both modes allow it.

import type { FinishedMessage } from "../content/playback-tracker";
import { dropLegacy, linkByHand, openAmbiguity } from "../core/questions";
import type {
  LinkTitleMessage,
  RequeueQuestionMessage,
} from "../ext/question-messages";
import { UNIVERSE } from "../sc/sc-queries";
import { finishWaitingOn } from "./answer-jobs";
import { recordAnswer } from "./answer-log";
import { finishJob } from "./finish-job";
import { type JobDeps, jobNaka } from "./job-deps";
import { readNakaItem } from "./read-ports";
import { toJobError } from "./to-job-error";

type Kind = "movie" | "tv";
type Ending = "done" | "refused" | "mismatch";
type Linked = { ending: Ending; finish?: FinishedMessage };

const SC_KINDS: Partial<Record<number, Kind>> = {
  [UNIVERSE.film]: "movie",
  [UNIVERSE.serie]: "tv",
};

const ids = (msg: LinkTitleMessage) =>
  msg.side === "naka"
    ? { nakaId: msg.id, scId: msg.otherId }
    : { nakaId: msg.otherId, scId: msg.id };

// The kind of each title as its own site says it; undefined: unreadable, or not a film nor a série.
async function kindsOf(deps: JobDeps, msg: LinkTitleMessage) {
  const { nakaId, scId } = ids(msg);
  const item = await readNakaItem(jobNaka(deps), deps.limiters.naka, nakaId);
  const product = await deps.sc.productState(scId);
  return { naka: item?.mediaType, sc: SC_KINDS[product.universe] };
}

async function linked(deps: JobDeps, msg: LinkTitleMessage): Promise<Linked> {
  const state = await deps.store.loadState();
  const next = linkByHand(state, msg.side, msg.id, msg.otherId);
  if (next === undefined) return { ending: "refused" };
  const kinds = await kindsOf(deps, msg);
  if (kinds.naka === undefined || kinds.sc === undefined) {
    return { ending: "refused" };
  }
  if (kinds.naka !== kinds.sc) return { ending: "mismatch" };
  await deps.store.saveState(next);
  return {
    ending: "done",
    finish: finishWaitingOn(openAmbiguity(state, msg.side, msg.id)),
  };
}

export async function linkTitleJob(
  deps: JobDeps,
  msg: LinkTitleMessage,
): Promise<void> {
  const target = `link:${msg.side}:${msg.id}`;
  let result: Linked;
  try {
    result = await linked(deps, msg);
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
  await recordAnswer(deps.store, target, result.ending, deps.now());
  if (result.finish !== undefined) await finishJob(deps, result.finish);
}

async function dropped(
  deps: Pick<JobDeps, "store">,
  { side, id }: RequeueQuestionMessage,
): Promise<"done" | "refused"> {
  const next = dropLegacy(await deps.store.loadState(), side, id);
  if (next === undefined) return "refused";
  await deps.store.saveState(next);
  return "done";
}

// « Reposer la question »: drops a question stored before 4b, so that the next sync asks it again (D1).
export async function requeueJob(
  deps: Pick<JobDeps, "store" | "now">,
  msg: RequeueQuestionMessage,
): Promise<void> {
  const target = `ambiguity:${msg.side}:${msg.id}`;
  let ending: "done" | "refused";
  try {
    ending = await dropped(deps, msg);
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
  await recordAnswer(deps.store, target, ending, deps.now());
}

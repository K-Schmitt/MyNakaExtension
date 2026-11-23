// After a rating went out, in live mode: the title is « vu » on Naka. With Naka's « Déjà vu » button on
// screen (byTab) the tab clicks it itself, so Naka's page does its own request and its button follows: the
// worker answers `dejaVu: "tab"` and calls no client. Otherwise it writes « vu » through the Naka client.
// Naka's history is a write like « Ma liste »: simulation mode reads and writes nothing. A failure is an
// `{ error }` the caller answers as the step « deja-vu » (the rating has gone out by then).

import type { ContentIds } from "../core/finish-event";
import type { RateOkAnswer, SentWithErrorAnswer } from "../ext/fiche-answers";
import type { JobError } from "../ext/job-error";
import { type JobDeps, jobNaka } from "./job-deps";
import { toJobError } from "./to-job-error";

export type WatchedStep = { dejaVu?: "tab" } | { error: JobError };

async function write(
  deps: JobDeps,
  ids: ContentIds,
  byTab: boolean,
): Promise<WatchedStep> {
  const settings = await deps.store.loadSettings();
  if (settings.mode !== "live") return {};
  if (byTab) return { dejaVu: "tab" };
  await jobNaka(deps).markWatched(ids);
  return {};
}

export async function markedWatched(
  deps: JobDeps,
  ids: ContentIds,
  byTab: boolean,
): Promise<WatchedStep> {
  try {
    return await write(deps, ids, byTab);
  } catch (error) {
    return { error: toJobError(error) };
  }
}

type RatedAnswer = RateOkAnswer | SentWithErrorAnswer;

// One error per answer, the first one: a step that already failed (« Ma liste ») leaves Naka alone, and a
// failed « vu » does not replace an earlier error. An answer that carries the failed local save is kept as it
// is: the tab never clicks over it (its « ok » would hide the error), the client writes « vu » instead.
export async function withWatched(
  deps: JobDeps,
  ids: ContentIds,
  byTab: boolean,
  answer: RatedAnswer,
): Promise<RatedAnswer> {
  if ("step" in answer && answer.step !== "local-save") return answer;
  const step = await markedWatched(deps, ids, byTab && "ok" in answer);
  if ("error" in step) {
    return "ok" in answer
      ? { sent: true, step: "deja-vu", error: step.error }
      : answer;
  }
  if (step.dejaVu === undefined || !("ok" in answer)) return answer;
  return { ...answer, dejaVu: step.dejaVu };
}

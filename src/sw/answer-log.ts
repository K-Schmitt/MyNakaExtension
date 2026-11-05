// The record of the owner's last answer (D8): one `lastAnswer` in the settings, numbered so that the tab and
// the page tell a new outcome from the one they already showed. The settings are loaded first: unreadable
// settings reject here and record nothing (Plan 3: never overwrite unreadable settings, the binding is in
// them). A failure always carries its code, and only a failure does: the settings parser refuses any other
// shape, so a bad record would make every later load fail.

import type { QuestionKey } from "../core/questions";
import type { AnswerOutcome, LastAnswer } from "../ext/answer-record";
import type { JobError } from "../ext/job-error";
import type { Store } from "../ext/store";

export type AnswerLog = Pick<Store, "loadSettings" | "saveSettings">;

export function recordAnswer(
  store: AnswerLog,
  target: QuestionKey,
  outcome: "failed",
  at: number,
  error: JobError,
): Promise<void>;
export function recordAnswer(
  store: AnswerLog,
  target: QuestionKey,
  outcome: Exclude<AnswerOutcome, "failed">,
  at: number,
): Promise<void>;
export async function recordAnswer(
  store: AnswerLog,
  target: QuestionKey,
  outcome: AnswerOutcome,
  at: number,
  error?: JobError,
): Promise<void> {
  const settings = await store.loadSettings();
  const lastAnswer: LastAnswer = {
    seq: (settings.lastAnswer?.seq ?? 0) + 1,
    at,
    target,
    outcome,
    ...(outcome === "failed" && error !== undefined ? { error } : {}),
  };
  await store.saveSettings({ ...settings, lastAnswer });
}

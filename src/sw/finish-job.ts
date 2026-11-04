// One end of viewing (Rulings 13 and 15). In order: the settings; the hour's budget, checked before any read;
// the event built from Naka's catalogue (a read); the binding, before any state load and any write; Plan
// 2's handleFinish; the record. A finish writes in both modes (spec §8quinquies). A content Naka does
// not know, or of the wrong kind, records nothing, though it still counts against the budget.

import type { FinishedMessage } from "../content/playback-tracker";
import { contentKeyOf } from "../core/finish-event";
import { handleFinish } from "../core/finish-handler";
import {
  type FinishWindow,
  isFull,
  windowAt,
  withOneMore,
} from "../ext/finish-window";
import type { JobError } from "../ext/job-error";
import type { FinishRecord, Settings } from "../ext/settings";
import { checkBinding } from "./binding";
import { buildFinishPorts, finishEventOf } from "./finish-ports";
import { type JobDeps, jobAccounts, jobNaka } from "./job-deps";
import { readNakaItem } from "./read-ports";
import { toJobError } from "./to-job-error";

type Done = { outcome: FinishRecord["outcome"]; error?: JobError };

async function attempt(
  deps: JobDeps,
  settings: Settings,
  msg: FinishedMessage,
): Promise<Done | undefined> {
  const naka = jobNaka(deps);
  try {
    const read = (id: number) => readNakaItem(naka, deps.limiters.naka, id);
    const event = await finishEventOf(msg, read);
    if (event === undefined) return undefined;
    await checkBinding(settings.binding, jobAccounts(naka, deps));
    const ports = buildFinishPorts({
      sc: deps.sc,
      limiters: deps.limiters,
      store: deps.store,
      today: deps.today,
    });
    return { outcome: (await handleFinish(event, ports)).kind };
  } catch (error) {
    return { outcome: "failed", error: toJobError(error) };
  }
}

// An ignored candidate (below the threshold, or a later mark of a viewing already handled) never
// replaces the record of the same content: the status keeps what happened to it.
function keepsRecord(settings: Settings, key: string, done: Done) {
  return done.outcome === "ignored" && settings.lastFinish?.key === key;
}

async function refuse(
  deps: JobDeps,
  settings: Settings,
  at: number,
  key: string,
) {
  await deps.store.saveSettings({
    ...settings,
    lastFinish: { at, key, outcome: "failed", error: "finish-limit" },
  });
}

function nextSettings(
  settings: Settings,
  window: FinishWindow,
  record: FinishRecord | undefined,
): Settings {
  const next: Settings = { ...settings, finishWindow: withOneMore(window) };
  if (record !== undefined) next.lastFinish = record;
  return next;
}

export async function finishJob(
  deps: JobDeps,
  msg: FinishedMessage,
): Promise<void> {
  const settings = await deps.store.loadSettings();
  const at = deps.now();
  const key = contentKeyOf(msg);
  const window = windowAt(settings.finishWindow, at);
  if (isFull(window)) {
    await refuse(deps, settings, at, key);
    return;
  }
  const done = await attempt(deps, settings, msg);
  const record =
    done === undefined || keepsRecord(settings, key, done)
      ? undefined
      : { at, key, ...done };
  await deps.store.saveSettings(nextSettings(settings, window, record));
}

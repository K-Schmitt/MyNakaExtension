// One end of viewing (Rulings 13, 15 and 18). In order: the settings; the local pre-check, which stops for
// free a message our own state already decides; the hour's budget; the slot reserved at once, before any
// network call, so that no kill loses the count; the event built from Naka's catalogue (a read); the
// binding, before any network call after that read and before any write; Plan 2's handleFinish; the
// record, saved with the reserved slot. A finish writes in both modes (spec §8quinquies). A content Naka
// does not know, or of the wrong kind, records nothing, though its slot stays spent.

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
import { preCheck } from "./finish-precheck";
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

// One refusal per window is enough to show the limit (K3): the later ones write nothing.
function alreadyRefused(settings: Settings, window: FinishWindow): boolean {
  const last = settings.lastFinish;
  return last?.error === "finish-limit" && last.at >= window.from;
}

async function record(deps: JobDeps, settings: Settings, last: FinishRecord) {
  await deps.store.saveSettings({ ...settings, lastFinish: last });
}

// A finish that needs the network: it takes a slot of the hour's budget, or is refused.
async function counted(
  deps: JobDeps,
  settings: Settings,
  msg: FinishedMessage,
  { at, key }: { at: number; key: string },
): Promise<void> {
  const window = windowAt(settings.finishWindow, at);
  if (isFull(window)) {
    if (alreadyRefused(settings, window)) return;
    await record(deps, settings, {
      at,
      key,
      outcome: "failed",
      error: "finish-limit",
    });
    return;
  }
  const reserved: Settings = { ...settings, finishWindow: withOneMore(window) };
  await deps.store.saveSettings(reserved);
  const done = await attempt(deps, settings, msg);
  if (done === undefined || keepsRecord(settings, key, done)) return;
  await record(deps, reserved, { at, key, ...done });
}

export async function finishJob(
  deps: JobDeps,
  msg: FinishedMessage,
): Promise<void> {
  const settings = await deps.store.loadSettings();
  const at = deps.now();
  const key = contentKeyOf(msg);
  const check = await preCheck(deps.store, msg, key);
  if (check === "free") return;
  if (check === "go") {
    await counted(deps, settings, msg, { at, key });
    return;
  }
  await record(deps, settings, { at, key, outcome: "failed", ...check });
}

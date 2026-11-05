// One list-sync run: the binding first, then Plan 2's runSync, then the run record. Any failure is
// recorded as a JobError code; the stored state is then the one the run saved, or the one before it.
// A run that completed after a breaker opened or its tab was lost records "ok" with that first code.

import { runSync, type SyncReport } from "../core/sync-runner";
import type { RunRecord, Settings } from "../ext/settings";
import { type Accounts, checkBinding } from "./binding";
import { type FirstStop, firstStop } from "./first-stop";
import { type JobDeps, jobAccounts, jobNaka } from "./job-deps";
import type { NakaProxy } from "./naka-proxy";
import { nextOf, type PreviewItem, previewOf } from "./preview";
import { shouldStartAutoRun } from "./run-throttle";
import { buildSyncPorts } from "./sync-ports";
import { toJobError } from "./to-job-error";

export type Trigger = RunRecord["trigger"];

type Attempt = { record: RunRecord; accounts?: Accounts };
type RunResult = {
  report: SyncReport;
  preview?: PreviewItem[];
  next?: PreviewItem[];
};

// Anything but the button is automatic, and waits out the gap.
const isAutomatic = (trigger: Trigger): boolean => trigger !== "button";

async function runWithPreview(
  deps: JobDeps,
  settings: Settings,
  naka: NakaProxy,
  stop: FirstStop,
): Promise<RunResult> {
  const session = buildSyncPorts({
    naka,
    sc: deps.sc,
    limiters: deps.limiters,
    store: deps.store,
    mode: settings.mode,
    onStop: stop.note,
  });
  const report = await runSync(session.ports);
  const next = await nextOf(session.deferredWrites, session.describe);
  const withNext = next.length === 0 ? { report } : { report, next };
  if (settings.mode === "live") return withNext;
  const { planned, describe } = session;
  return {
    ...withNext,
    preview: await previewOf(planned, report.added, describe),
  };
}

async function attempt(
  deps: JobDeps,
  settings: Settings,
  trigger: Trigger,
  at: number,
): Promise<Attempt> {
  const base = { at, trigger, mode: settings.mode };
  const stop = firstStop();
  const naka = jobNaka(deps, stop.note);
  try {
    const readers = jobAccounts(naka, deps);
    const accounts = await checkBinding(settings.binding, readers);
    const result = await runWithPreview(deps, settings, naka, stop);
    const error = stop.code();
    const ok = { ...base, outcome: "ok" as const, ...result };
    return { record: error === undefined ? ok : { ...ok, error }, accounts };
  } catch (error) {
    return { record: { ...base, outcome: "failed", error: toJobError(error) } };
  }
}

// The accounts of a successful run are the binding (unchanged when it was already set). An automatic
// run counts for the gap whatever its outcome.
function nextSettings(
  settings: Settings,
  trigger: Trigger,
  done: Attempt,
): Settings {
  const next: Settings = { ...settings, lastRun: done.record };
  if (done.accounts !== undefined) next.binding = done.accounts;
  if (isAutomatic(trigger)) next.lastAutoRunAt = done.record.at;
  return next;
}

export async function syncJob(deps: JobDeps, trigger: Trigger): Promise<void> {
  const settings = await deps.store.loadSettings();
  const at = deps.now();
  if (isAutomatic(trigger) && !shouldStartAutoRun(settings.lastAutoRunAt, at)) {
    return;
  }
  const done = await attempt(deps, settings, trigger, at);
  await deps.store.saveSettings(nextSettings(settings, trigger, done));
}

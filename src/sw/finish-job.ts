// One end of viewing: the binding first, then the event built from Naka's catalogue, then Plan 2's
// handleFinish, then the finish record. A finish writes in both modes (spec §8quinquies). A message for a
// content Naka does not know, or of the wrong kind, changes nothing at all.

import type { FinishedMessage } from "../content/playback-tracker";
import { handleFinish } from "../core/finish-handler";
import type { FinishRecord, Settings } from "../ext/settings";
import { checkBinding } from "./binding";
import { buildFinishPorts, finishEventOf } from "./finish-ports";
import { type JobDeps, jobAccounts, jobNaka } from "./job-deps";
import { readNakaItem } from "./read-ports";

type Outcome = FinishRecord["outcome"];

// The content key of the message: the one contentKey gives for every event finishEventOf builds.
export function finishKey(msg: FinishedMessage): string {
  const { contentId, season, episode } = msg;
  return season !== undefined && episode !== undefined
    ? `tv:${contentId}:S${season}E${episode}`
    : `movie:${contentId}`;
}

async function attempt(
  deps: JobDeps,
  settings: Settings,
  msg: FinishedMessage,
): Promise<Outcome | undefined> {
  const naka = jobNaka(deps);
  try {
    await checkBinding(settings.binding, jobAccounts(naka, deps));
    const read = (id: number) => readNakaItem(naka, deps.limiters.naka, id);
    const event = await finishEventOf(msg, read);
    if (event === undefined) return undefined;
    const ports = buildFinishPorts({
      sc: deps.sc,
      limiters: deps.limiters,
      store: deps.store,
      today: deps.today,
    });
    return (await handleFinish(event, ports)).kind;
  } catch {
    return "failed";
  }
}

// An ignored candidate (below the threshold, or a later mark of a viewing already handled) never
// replaces the record of the same content: the status keeps what happened to it.
function keepsRecord(settings: Settings, key: string, outcome: Outcome) {
  return outcome === "ignored" && settings.lastFinish?.key === key;
}

export async function finishJob(
  deps: JobDeps,
  msg: FinishedMessage,
): Promise<void> {
  const settings = await deps.store.loadSettings();
  const at = deps.now();
  const outcome = await attempt(deps, settings, msg);
  if (outcome === undefined) return;
  const key = finishKey(msg);
  if (keepsRecord(settings, key, outcome)) return;
  await deps.store.saveSettings({
    ...settings,
    lastFinish: { at, key, outcome },
  });
}

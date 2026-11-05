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
import {
  type FinishRecord,
  type Settings,
  thresholdsOf,
} from "../ext/settings";
import { checkBinding } from "./binding";
import { buildFinishPorts, finishEventOf } from "./finish-ports";
import { preCheck } from "./finish-precheck";
import { type JobDeps, jobAccounts, jobNaka } from "./job-deps";
import { buildCard, type CardInput, storeCard } from "./rating-card-builder";
import { readNakaItem } from "./read-ports";
import { toJobError } from "./to-job-error";

type Done = { outcome: FinishRecord["outcome"]; error?: JobError };
/** A finish that ended `done` also hands over what its rating card is built from. */
type Attempted = Done & { card?: Omit<CardInput, "at"> };

async function attempt(
  deps: JobDeps,
  settings: Settings,
  msg: FinishedMessage,
): Promise<Attempted | undefined> {
  const naka = jobNaka(deps);
  try {
    const read = (id: number) => readNakaItem(naka, deps.limiters.naka, id);
    const found = await finishEventOf(msg, read);
    if (found === undefined) return undefined;
    const { event, item } = found;
    await checkBinding(settings.binding, jobAccounts(naka, deps));
    const ports = buildFinishPorts({
      sc: deps.sc,
      limiters: deps.limiters,
      store: deps.store,
      today: deps.today,
    });
    const thresholds = thresholdsOf(settings);
    const outcome = await handleFinish(event, ports, thresholds);
    if (outcome.kind !== "done") return { outcome: outcome.kind };
    const { productState } = ports;
    return { outcome: "done", card: { outcome, event, item, productState } };
  } catch (error) {
    return { outcome: "failed", error: toJobError(error) };
  }
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
  const attempted = await attempt(deps, settings, msg);
  if (attempted === undefined) return;
  const { card, ...done } = attempted;
  await record(deps, reserved, { at, key, ...done });
  if (card !== undefined) await keepCard(deps, { ...card, at });
}

// After the finish record: the finish is a fact on SensCritique, the card only a way to rate it. Whatever
// fails here (a read of the saison or the série, the ratings unreadable or unwritable) leaves the record
// as saved and the ratings as they were.
async function keepCard(deps: JobDeps, input: CardInput): Promise<void> {
  try {
    await storeCard(deps.store, await buildCard(input));
  } catch {
    // Nothing more can be recorded.
  }
}

export async function finishJob(
  deps: JobDeps,
  msg: FinishedMessage,
): Promise<void> {
  const settings = await deps.store.loadSettings();
  const at = deps.now();
  const key = contentKeyOf(msg);
  const check = await preCheck(deps.store, msg, key, thresholdsOf(settings));
  if (check === "free") return;
  if (check === "go") {
    await counted(deps, settings, msg, { at, key });
    return;
  }
  await record(deps, settings, { at, key, outcome: "failed", ...check });
}

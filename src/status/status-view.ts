// The status page's view model: pure, French, text only. The answer is untrusted, so it is validated here.

import type { Mode } from "../ext/settings";
import type { StatusSnapshot } from "../sw/status-snapshot";
import { type SettingsView, toSettingsView } from "./settings-view";
import { pendingModeLine, runningLine } from "./status-activity-lines";
import type { StatusFormat } from "./status-format";
import { readSnapshot } from "./status-input";
import {
  finishLine,
  previewLine,
  reportLines,
  runErrorLine,
  runLine,
  snapshotErrorLine,
} from "./status-lines";
import { MODE_TEXT } from "./status-mode-copy";
import { bindingLine, countLines } from "./status-owner-lines";

export type StatusView =
  | { kind: "loading"; message: string }
  | { kind: "no-engine"; message: string }
  | {
      kind: "ready";
      headline: string;
      mode?: Mode;
      switchLabel?: string;
      /** A mode change waits in the worker: a second click would stack another (Ruling 22). */
      switchDisabled: boolean;
      /** A job runs or a mode change waits: the page asks again soon (Ruling 20). */
      inProgress: boolean;
      /** A settings change waits or runs in the worker: the values shown may be the old ones. */
      settingsPending: boolean;
      previewCount: number;
      lines: string[];
      preview: string[];
      /** The « Réglages » section; absent while the settings cannot be read. */
      settings?: SettingsView;
    };

export const LOADING_VIEW: StatusView = {
  kind: "loading",
  message: "Chargement…",
};

const NO_ENGINE_VIEW: StatusView = {
  kind: "no-engine",
  message: "Le moteur ne répond pas, rouvrez cette page",
};

const UNKNOWN_MODE = "Mode inconnu";

const present = <T>(items: (T | undefined)[]): T[] =>
  items.filter((item) => item !== undefined);

function runLines(snapshot: StatusSnapshot, format: StatusFormat): string[] {
  const run = snapshot.lastRun;
  if (run === undefined) return [];
  return present([
    runLine(run, format),
    ...reportLines(run),
    runErrorLine(run),
  ]);
}

// What runs now and what waits, first: the stored records may be older than the job that runs.
function activityLines(
  snapshot: StatusSnapshot,
  format: StatusFormat,
): string[] {
  const { running, pendingMode } = snapshot;
  return present([
    running === undefined ? undefined : runningLine(running, format),
    pendingMode === undefined ? undefined : pendingModeLine(pendingMode),
  ]);
}

function viewLines(snapshot: StatusSnapshot, format: StatusFormat): string[] {
  const { error, binding, lastFinish, counts } = snapshot;
  return present([
    error === undefined ? undefined : snapshotErrorLine(error),
    ...activityLines(snapshot, format),
    binding === undefined ? undefined : bindingLine(binding),
    ...runLines(snapshot, format),
    lastFinish === undefined ? undefined : finishLine(lastFinish, format),
    ...(counts === undefined ? [] : countLines(counts)),
  ]);
}

// What the next live pass would write, each with its target: shown in simulation only.
function previewLines(snapshot: StatusSnapshot): string[] {
  if (snapshot.mode !== "simulation") return [];
  return (snapshot.lastRun?.preview ?? []).map(previewLine);
}

// Both come together or not at all, like the worker's answer.
function settingsOf(snapshot: StatusSnapshot): { settings?: SettingsView } {
  const { thresholds, pauseFromPercent } = snapshot;
  if (thresholds === undefined || pauseFromPercent === undefined) return {};
  return { settings: toSettingsView(thresholds, pauseFromPercent) };
}

function readyView(snapshot: StatusSnapshot, format: StatusFormat): StatusView {
  const preview = previewLines(snapshot);
  const base = {
    ...settingsOf(snapshot),
    kind: "ready" as const,
    inProgress:
      snapshot.running !== undefined ||
      snapshot.pendingMode !== undefined ||
      snapshot.pendingSettings !== undefined,
    switchDisabled: snapshot.pendingMode !== undefined,
    settingsPending: snapshot.pendingSettings !== undefined,
    previewCount: preview.length,
    lines: viewLines(snapshot, format),
    preview,
  };
  if (snapshot.mode === undefined) return { ...base, headline: UNKNOWN_MODE };
  const text = MODE_TEXT[snapshot.mode];
  return { ...base, ...text, mode: snapshot.mode };
}

export function toStatusView(raw: unknown, format: StatusFormat): StatusView {
  const snapshot = readSnapshot(raw);
  return snapshot === undefined ? NO_ENGINE_VIEW : readyView(snapshot, format);
}

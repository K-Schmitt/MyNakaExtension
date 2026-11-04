// The status page's view model: pure, French, text only. The answer is untrusted, so it is validated here.

import type { Mode } from "../ext/settings";
import type { StatusSnapshot } from "../sw/status-snapshot";
import type { StatusFormat } from "./status-format";
import { readSnapshot } from "./status-input";
import {
  finishLine,
  pendingModeLine,
  questionsLine,
  reportLine,
  runErrorLine,
  runLine,
  runningLine,
  snapshotErrorLine,
} from "./status-lines";

export type StatusView =
  | { kind: "loading"; message: string }
  | { kind: "no-engine"; message: string }
  | {
      kind: "ready";
      headline: string;
      mode?: Mode;
      switchLabel?: string;
      /** A job runs or a mode change waits: the page asks again soon (Ruling 20). */
      inProgress: boolean;
      previewCount: number;
      lines: string[];
      preview: string[];
    };

export const LOADING_VIEW: StatusView = {
  kind: "loading",
  message: "Chargement…",
};

const NO_ENGINE_VIEW: StatusView = {
  kind: "no-engine",
  message: "Le moteur ne répond pas, rouvrez cette page",
};

const MODE_TEXT: Record<Mode, { headline: string; switchLabel: string }> = {
  simulation: {
    headline: "Simulation : rien n'est écrit",
    switchLabel: "Activer les écritures",
  },
  live: {
    headline: "Écritures actives",
    switchLabel: "Revenir en simulation",
  },
};

const UNKNOWN_MODE = "Mode inconnu";

function runLines(snapshot: StatusSnapshot, format: StatusFormat): string[] {
  const run = snapshot.lastRun;
  if (run === undefined) return [];
  const lines = [runLine(run, format), reportLine(run), runErrorLine(run)];
  return lines.filter((line) => line !== undefined);
}

// What runs now and what waits, first: the stored records may be older than the job that runs.
function activityLines(
  snapshot: StatusSnapshot,
  format: StatusFormat,
): string[] {
  const { running, pendingMode } = snapshot;
  return [
    running === undefined ? undefined : runningLine(running, format),
    pendingMode === undefined ? undefined : pendingModeLine(pendingMode),
  ].filter((line) => line !== undefined);
}

function viewLines(snapshot: StatusSnapshot, format: StatusFormat): string[] {
  const { error, lastFinish, counts } = snapshot;
  return [
    error === undefined ? undefined : snapshotErrorLine(error),
    ...activityLines(snapshot, format),
    ...runLines(snapshot, format),
    lastFinish === undefined ? undefined : finishLine(lastFinish, format),
    counts === undefined ? undefined : questionsLine(counts),
  ].filter((line) => line !== undefined);
}

// The titles the next live pass would write: shown in simulation only.
function previewTitles(snapshot: StatusSnapshot): string[] {
  if (snapshot.mode !== "simulation") return [];
  return (snapshot.lastRun?.preview ?? []).map((item) => item.title);
}

function readyView(snapshot: StatusSnapshot, format: StatusFormat): StatusView {
  const preview = previewTitles(snapshot);
  const base = {
    kind: "ready" as const,
    inProgress:
      snapshot.running !== undefined || snapshot.pendingMode !== undefined,
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

export function confirmText(count: number): string {
  return `Activer les écritures ? ${count} écriture(s) prévue(s) dans la simulation seront faites au prochain passage.`;
}

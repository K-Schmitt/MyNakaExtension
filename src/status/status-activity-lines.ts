// The sentences about what the worker does now: the job running, and a mode change waiting.

import type { Mode } from "../ext/settings";
import type { Running } from "../sw/activity";
import type { StatusFormat } from "./status-format";
import { MODE_LABELS } from "./status-mode-copy";

export function runningLine(running: Running, format: StatusFormat): string {
  if (running.kind === "finish")
    return "Fin de visionnage en cours de traitement";
  return `Synchronisation en cours depuis ${format.time(running.since)}`;
}

export function pendingModeLine(mode: Mode): string {
  return `Changement de mode en attente\u202F: ${MODE_LABELS[mode]}`;
}

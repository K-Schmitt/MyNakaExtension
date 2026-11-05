// The sentences about the owner's accounts and about what waits for them. The username is remote text: the
// page writes it with textContent.

import { valuesOf } from "../ext/field-checks";
import type { Binding } from "../sw/binding";
import type { Counts } from "../sw/status-snapshot";

// A part that is absent is left out; with neither, there is no line.
export function bindingLine(binding: Partial<Binding>): string | undefined {
  const parts = [
    binding.scUsername === undefined
      ? undefined
      : `${binding.scUsername} sur SensCritique`,
    binding.nakaAccount === undefined
      ? undefined
      : `compte Naka n°\u00A0${binding.nakaAccount}`,
  ].filter((part) => part !== undefined);
  return parts.length === 0
    ? undefined
    : `Comptes liés\u202F: ${parts.join(", ")}`;
}

// A Record: a new count without a label fails to compile.
export const WAITING_LABELS: Record<keyof Counts, string> = {
  openQuestions: "Questions à traiter",
  pendingRemovals: "Retraits à confirmer",
  unlinked: "Titres non reliés",
};

export const COUNT_ORDER = valuesOf<keyof Counts>({
  openQuestions: true,
  pendingRemovals: true,
  unlinked: true,
});

// Each count above zero on its own line; all at zero, one line says so.
export function countLines(counts: Counts): string[] {
  const lines = COUNT_ORDER.filter((key) => counts[key] > 0).map(
    (key) => `${WAITING_LABELS[key]}\u202F: ${counts[key]}`,
  );
  return lines.length === 0 ? ["Rien en attente"] : lines;
}

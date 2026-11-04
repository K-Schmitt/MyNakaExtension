// The sentences about the owner's accounts and about what waits for them. The username is remote text: the
// page writes it with textContent.

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
      : `compte Naka n° ${binding.nakaAccount}`,
  ].filter((part) => part !== undefined);
  return parts.length === 0
    ? undefined
    : `Comptes liés\u202F: ${parts.join(", ")}`;
}

const WAITING: [keyof Counts, string][] = [
  ["openQuestions", "Questions à traiter dans une prochaine version"],
  ["pendingRemovals", "Retraits à confirmer dans une prochaine version"],
  ["unlinked", "Titres non reliés"],
];

// Each count above zero on its own line; all at zero, one line says so.
export function countLines(counts: Counts): string[] {
  const lines = WAITING.filter(([key]) => counts[key] > 0).map(
    ([key, label]) => `${label}\u202F: ${counts[key]}`,
  );
  return lines.length === 0 ? ["Rien en attente"] : lines;
}

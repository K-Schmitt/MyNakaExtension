// The words of each mode: the headline, the switch, the mode's name in a sentence, and the confirmation
// before going live. A finish writes in both modes (spec §8quinquies), and the headline says so.
// French typography: U+202F before « : ; ? ! » and inside « ».

import { MAX_WRITES_PER_RUN } from "../core/sync-writes";
import type { Mode } from "../ext/settings";

export const MODE_TEXT: Record<
  Mode,
  { headline: string; switchLabel: string }
> = {
  simulation: {
    headline:
      "Simulation\u202F: vos listes ne sont pas modifiées. Les fins de visionnage sont enregistrées sur SensCritique.",
    switchLabel: "Activer les écritures",
  },
  live: {
    headline: "Écritures actives",
    switchLabel: "Revenir en simulation",
  },
};

export const MODE_LABELS: Record<Mode, string> = {
  simulation: "simulation",
  live: "écritures actives",
};

const CAP = `Chaque synchronisation fera au plus ${MAX_WRITES_PER_RUN} écritures`;

// `count` is the number of titles in the simulation's preview; one agrees in the singular (Ruling 21).
export function confirmText(count: number): string {
  const ask = "Activer les écritures\u202F?";
  if (count === 0) {
    return `${ask} ${CAP}. La page de l'extension montre les écritures prévues au prochain passage.`;
  }
  const next =
    "La prochaine (bouton «\u202FResynchroniser\u202F» ou prochaine ouverture de Naka)";
  const titles = count === 1 ? "le titre" : `les ${count} titres`;
  return `${ask} ${CAP}. ${next} reprendra ${titles} de l'aperçu, puis les suivants, que cette page montre avant chaque passage.`;
}

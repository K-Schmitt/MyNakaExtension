// The words of each mode: the headline, the switch's help, the mode's name in a sentence, the first-run line
// and the confirmation before going live. A finish writes in both modes (spec §8quinquies); the simulation's
// help says so. Live mode does not name itself in the headline (spec §5).
// French typography: U+202F before « : ; ? ! » and inside « ».

import { MAX_WRITES_PER_RUN } from "../core/sync-writes";
import type { Mode } from "../ext/settings";

export const MODE_TEXT: Record<Mode, { headline: string }> = {
  simulation: {
    headline:
      "Mode simulation actif\u202F: tes listes ne sont pas modifiées. Voir Réglages.",
  },
  live: { headline: "Synchronisation active" },
};

const PRESS = "Clique sur «\u202FResynchroniser\u202F» pour le lancer.";

// What the first pass will do depends on the mode: simulation writes nothing.
export const FIRST_RUN_LINE: Record<Mode, string> = {
  simulation: `Premier passage\u202F: il montrera dans Réglages ce qu’une synchronisation écrirait. ${PRESS}`,
  live: `Premier passage\u202F: il ajoutera aux deux listes les titres qui manquent, au plus ${MAX_WRITES_PER_RUN} écritures. ${PRESS}`,
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
    return `${ask} ${CAP}. La page de l’extension montre les écritures prévues au prochain passage.`;
  }
  const next =
    "La prochaine (bouton «\u202FResynchroniser\u202F» ou prochaine ouverture de Naka)";
  const titles = count === 1 ? "le titre" : `les ${count} titres`;
  return `${ask} ${CAP}. ${next} reprendra ${titles} de l’aperçu, puis les suivants, que cette page montre avant chaque passage.`;
}

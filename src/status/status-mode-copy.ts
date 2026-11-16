// The words of each mode: the headline, the switch's help, the mode's name in a sentence, the first-run line
// and the confirmation before going live. A finish writes in both modes (the simulation covers the lists
// only); the simulation's help says so. Live mode does not name itself in the headline. French typography:
// U+202F before « : ; ? ! » and inside « ».

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

// When the next pass starts: while the first run waits for a click, opening Naka starts nothing.
function nextStart(firstRunPending: boolean): string {
  return firstRunPending
    ? "La prochaine démarre au clic sur «\u202FResynchroniser\u202F»"
    : "La prochaine démarre au bouton «\u202FResynchroniser\u202F» ou à la prochaine ouverture de Naka";
}

// `count` is the number of titles in the simulation's preview; one agrees in the singular. The page lists
// the writes in simulation only, so the confirmation promises no list.
export function confirmText(count: number, firstRunPending: boolean): string {
  const lead = `Activer les écritures\u202F? ${CAP}. ${nextStart(firstRunPending)}`;
  if (count === 0) return `${lead}.`;
  const titles = count === 1 ? "le titre" : `les ${count} titres`;
  return `${lead} et reprendra ${titles} de l’aperçu, puis les suivants.`;
}

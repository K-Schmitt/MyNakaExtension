// What the owner reads for each reason a job stopped. The Record keeps the table exhaustive. French
// typography: U+202F before « : ; ? ! ».

import type { JobError } from "../ext/job-error";

export const JOB_ERROR_LABELS: Record<JobError, string> = {
  "no-naka-tab": "Ouvre ou recharge un onglet Naka",
  "sc-session": "Reconnecte-toi sur SensCritique",
  "naka-session": "Reconnecte-toi sur Naka",
  "other-account": "Compte différent de celui enregistré",
  "stored-state": "État enregistré illisible",
  unavailable: "Site indisponible, nouvel essai au prochain passage",
  "finish-limit":
    "Trop de fins de visionnage en une heure\u202F: réessaie plus tard",
  "naka-list-empty": "Ma liste Naka lue vide\u202F: rien n’a été retiré",
  "naka-tab-changed":
    "L’onglet Naka a changé de page ou a été rechargé\u202F: la suite au prochain passage",
  "naka-content-unknown": "Contenu inconnu de Naka ou d\u2019un autre type",
};

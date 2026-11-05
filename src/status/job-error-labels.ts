// What the owner reads for each reason a job stopped. The Record keeps the table exhaustive. French
// typography: U+202F before « : ; ? ! ».

import type { JobError } from "../ext/job-error";

export const JOB_ERROR_LABELS: Record<JobError, string> = {
  "no-naka-tab": "Ouvrez ou rechargez un onglet Naka",
  "sc-session": "Reconnectez-vous sur SensCritique",
  "naka-session": "Reconnectez-vous sur Naka",
  "other-account": "Compte différent de celui enregistré",
  "stored-state": "État enregistré illisible",
  unavailable: "Site indisponible, nouvel essai au prochain passage",
  "finish-limit":
    "Trop de fins de visionnage en une heure\u202F: réessayez plus tard",
  "naka-list-empty": "Ma liste Naka lue vide\u202F: rien n'a été retiré",
};

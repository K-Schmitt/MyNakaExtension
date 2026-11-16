// The page's two local actions: their words, the confirmation before each, and the lines while one waits.
// They touch storage only, never a site. French typography: U+202F before « : ; ? ! » and inside « ».

import type { ToWorker } from "../ext/messages";
import type { LocalAction } from "../sw/activity";

export const ACTION_COPY = {
  section: "Données enregistrées",
  forget: "Oublier les comptes liés",
  reset: "Réinitialiser",
};

export const CONFIRM_TEXT: Record<LocalAction, string> = {
  forget:
    "Oublier les comptes liés efface seulement le lien enregistré entre ton compte SensCritique et ton compte Naka. Aucun jeton n’est jamais stocké. Le prochain passage liera les comptes connectés à ce moment-là. Oublier les comptes liés\u202F?",
  reset:
    "Réinitialiser efface l’état de synchronisation\u202F: paires, présences, questions, notes en attente et fins déjà traitées. Le prochain passage sera un premier passage, qui ne fait qu’ajouter, sans la mémoire des retraits\u202F: un titre retiré d’un côté et encore présent de l’autre y reviendrait. Il attendra un clic sur «\u202FResynchroniser\u202F». Le mode, les réglages (seuils, pause) et les comptes liés sont gardés. Réinitialiser\u202F?",
};

const PENDING_LINES: Record<LocalAction, string> = {
  forget: "Oubli des comptes liés en attente",
  reset: "Réinitialisation en attente",
};

const MESSAGES: Record<LocalAction, ToWorker> = {
  forget: { type: "forget-binding" },
  reset: { type: "reset" },
};

export function pendingActionLines(
  actions: LocalAction[] | undefined,
): string[] {
  return (actions ?? []).map((action) => PENDING_LINES[action]);
}

export type ActionPorts = {
  send(message: ToWorker): Promise<unknown>;
  confirm(text: string): boolean;
};

// The message goes only after a yes. A rejected send is an absent answer: the next `status` tells the rest.
export async function sendConfirmed(
  ports: ActionPorts,
  action: LocalAction,
): Promise<boolean> {
  if (!ports.confirm(CONFIRM_TEXT[action])) return false;
  try {
    await ports.send(MESSAGES[action]);
  } catch {
    // See above.
  }
  return true;
}

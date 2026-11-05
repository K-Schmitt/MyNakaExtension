// The two ways a finish meets a question: it asks the owner (a new question), or it reminds the owner
// that one is already open (the latest finish waits on it).

import { type CheckedEvent, contentKey } from "./finish-event";
import type { FinishOutcome, FinishPorts } from "./finish-handler";
import { openAmbiguity, toCandidates, withFinish } from "./questions";
import { addPending, type SyncState } from "./state";
import type { Candidate } from "./title-match";

// The question keeps the asked title, what the search listed (capped, so its ids are the stored
// candidates') and the key of this finish, which runs when the owner answers.
export async function askOwner(
  state: SyncState,
  event: CheckedEvent,
  match: { candidateIds: number[]; candidates: Candidate[] },
  ports: Pick<FinishPorts, "save">,
): Promise<FinishOutcome> {
  const candidates = toCandidates(match.candidates, match.candidateIds);
  await ports.save(
    addPending(state, {
      kind: "ambiguity",
      side: "naka",
      id: event.contentId,
      candidateIds: candidates.map((c) => c.id),
      title: event.titled.title,
      candidates,
      finish: contentKey(event),
    }),
  );
  return { kind: "needs-choice", candidateIds: candidates.map((c) => c.id) };
}

// The owner is already asked: the latest finish waits on the question, and nothing else changes.
export async function remindOwner(
  state: SyncState,
  event: CheckedEvent,
  key: string,
  match: { candidateIds: number[] },
  ports: Pick<FinishPorts, "save">,
): Promise<FinishOutcome> {
  if (openAmbiguity(state, "naka", event.contentId)) {
    await ports.save(withFinish(state, event.contentId, key));
  }
  return { kind: "needs-choice", candidateIds: match.candidateIds };
}

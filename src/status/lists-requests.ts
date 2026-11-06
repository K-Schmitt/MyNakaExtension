// What the lists controller asks of the worker: the page-lists and search reads, and the answers' messages.
// Each ask gives a checked value or a plain failure, never a throw.

import type { ToWorker } from "../ext/messages";
import type { PageListsAnswer, UnlinkedOffer } from "../sw/question-offers";
import { readLists, readSearch } from "./lists-input";
import type { ListsView, RowAction, SearchPhase } from "./lists-view";
import type { PageTimer } from "./status-controller";

export type ListsPorts = {
  send(message: ToWorker): Promise<unknown>;
  show(view: ListsView): void;
  timer: PageTimer;
  /** An answer or a link was accepted: the handled titles may have changed. */
  answered?(): void;
};

export function messageOf(action: RowAction):
  | Extract<
      ToWorker,
      {
        type:
          | "answer-question"
          | "answer-removal"
          | "link-title"
          | "requeue-question";
      }
    >
  | undefined {
  switch (action.kind) {
    case "answer-question":
      return {
        type: "answer-question",
        side: action.side,
        id: action.id,
        choice: action.choice,
      };
    case "answer-removal": {
      const { removeFrom, nakaId, scId, remove } = action;
      return { type: "answer-removal", removeFrom, nakaId, scId, remove };
    }
    case "requeue":
      return { type: "requeue-question", side: action.side, id: action.id };
    case "link": {
      const { side, id, otherId } = action;
      return { type: "link-title", side, id, otherId };
    }
    default:
      return undefined;
  }
}

export async function accepted(
  ports: ListsPorts,
  message: ToWorker,
): Promise<boolean> {
  try {
    const reply = await ports.send(message);
    return (reply as { ok?: unknown } | null)?.ok === true;
  } catch {
    return false;
  }
}

export async function askLists(
  ports: ListsPorts,
): Promise<PageListsAnswer | undefined> {
  try {
    return readLists(await ports.send({ type: "page-lists" }));
  } catch {
    return undefined;
  }
}

export async function askSearch(
  ports: ListsPorts,
  item: UnlinkedOffer,
  query: string,
): Promise<SearchPhase> {
  try {
    const reply = readSearch(
      await ports.send({ type: "search-titles", side: item.side, query }),
    );
    if (reply === undefined) return { kind: "error", error: "unavailable" };
    return "error" in reply
      ? { kind: "error", error: reply.error }
      : { kind: "results", candidates: reply.candidates };
  } catch {
    return { kind: "error", error: "unavailable" };
  }
}

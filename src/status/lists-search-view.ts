// The open search of an unlinked row as the page shows it: the field, the message and the results.

import { candidateLabel } from "../content/ui/question-copy";
import type { QuestionCandidate } from "../core/state";
import type { UnlinkedOffer } from "../sw/question-offers";
import { LISTS_COPY, searchErrorLine } from "./lists-copy";
import type { ListsState, SearchPhase, SearchView } from "./lists-view";

function searchMessage(phase: SearchPhase): string | undefined {
  if (phase.kind === "searching") return LISTS_COPY.searching;
  if (phase.kind === "error") return searchErrorLine(phase.error);
  if (phase.kind === "results" && phase.candidates.length === 0) {
    return LISTS_COPY.noResult;
  }
  return undefined;
}

function resultRow(item: UnlinkedOffer, found: QuestionCandidate) {
  const label = candidateLabel(found);
  const { side, id } = item;
  return {
    label,
    relier: {
      label: LISTS_COPY.link,
      aria: `${LISTS_COPY.link} ${label}`,
      action: { kind: "link", side, id, otherId: found.id } as const,
    },
  };
}

export function searchView(
  item: UnlinkedOffer,
  open: NonNullable<ListsState["search"]>,
): SearchView {
  const { phase, query } = open;
  const message = searchMessage(phase);
  return {
    query,
    ...(phase.kind === "empty-query"
      ? { fieldError: LISTS_COPY.emptyQuery }
      : {}),
    ...(message === undefined ? {} : { message }),
    results:
      phase.kind === "results"
        ? phase.candidates.map((found) => resultRow(item, found))
        : [],
  };
}

// The « Questions » and « Titres non reliés » sections as the page shows them. Pure: the worker's lists and
// the page's own state in, rows out. Titles are remote text: the DOM writes them through textContent.

import {
  MISMATCH_LINE,
  MOOT_LINE,
  notSentLine,
  REFUSED_LINE,
  SENDING_LINE,
  UNKNOWN_TITLE,
  UNREACHABLE_LINE,
} from "../content/ui/question-copy";
import { type QuestionChoice, questionView } from "../content/ui/question-view";
import type { QuestionKey } from "../core/questions";
import type { QuestionCandidate, Side } from "../core/state";
import type { LastAnswer } from "../ext/answer-record";
import type { JobError } from "../ext/job-error";
import type {
  PageListsAnswer,
  PageQuestion,
  QuestionOffer,
  UnlinkedOffer,
} from "../sw/question-offers";
import { LISTS_COPY, reasonLine, unlinkedHeading } from "./lists-copy";
import { searchView } from "./lists-search-view";

export type RowAction =
  | { kind: "answer-question"; side: Side; id: number; choice: number | null }
  | {
      kind: "answer-removal";
      removeFrom: Side;
      nakaId: number;
      scId: number;
      remove: boolean;
    }
  | { kind: "requeue"; side: Side; id: number }
  | { kind: "open-search" }
  | { kind: "search" }
  | { kind: "link"; side: Side; id: number; otherId: number };

export type RowButton = { label: string; aria?: string; action: RowAction };
export type SearchView = {
  query: string;
  fieldError?: string;
  message?: string;
  results: { label: string; relier: RowButton }[];
};
export type ListRow = {
  key: QuestionKey;
  heading: string;
  question?: string;
  lines: string[];
  buttons: RowButton[];
  search?: SearchView;
};
export type ListsView = {
  questions: ListRow[];
  unlinked: ListRow[];
  note: string;
};

export type SearchPhase =
  | { kind: "idle" }
  | { kind: "empty-query" }
  | { kind: "searching" }
  | { kind: "results"; candidates: QuestionCandidate[] }
  | { kind: "error"; error: JobError };
export type ListsState = {
  search?: { key: QuestionKey; query: string; phase: SearchPhase };
  /** Rows with an action under way on the page. */
  busy: readonly QuestionKey[];
  /** Rows whose last send did not reach the worker. */
  unsent: readonly QuestionKey[];
  /** The `seq` of the last answer when the page first loaded: older outcomes are not news. */
  seenSeq?: number;
};

export const EMPTY_STATE: ListsState = { busy: [], unsent: [] };

function choiceAction(offer: QuestionOffer, choice: QuestionChoice): RowAction {
  if (offer.kind === "removal") {
    const { removeFrom, pair } = offer;
    const remove = choice.kind === "remove";
    return { kind: "answer-removal", removeFrom, ...pair, remove };
  }
  const { side, id } = offer;
  const picked = choice.kind === "candidate" ? choice.id : null;
  return { kind: "answer-question", side, id, choice: picked };
}

// What the last answer says about this row; a moot one goes to the page note instead.
function answerLine(key: QuestionKey, last?: LastAnswer): string[] {
  if (last === undefined || last.target !== key) return [];
  if (last.outcome === "refused") return [REFUSED_LINE];
  if (last.outcome === "mismatch") return [MISMATCH_LINE];
  if (last.outcome === "failed" && last.error !== undefined) {
    return [notSentLine(last.error)];
  }
  return [];
}

function lockedLines(): Pick<ListRow, "lines" | "buttons"> {
  return { lines: [SENDING_LINE], buttons: [] };
}

function questionRow(
  q: PageQuestion,
  answer: PageListsAnswer,
  state: ListsState,
): ListRow {
  const { key } = q;
  const locked = answer.answering?.includes(key) || state.busy.includes(key);
  if (q.kind === "legacy") {
    const action = { kind: "requeue", side: q.side, id: q.id } as const;
    return {
      key,
      heading: LISTS_COPY.legacy,
      lines: answerLine(key, answer.lastAnswer),
      buttons: [{ label: LISTS_COPY.requeue, action }],
      ...(locked ? lockedLines() : {}),
    };
  }
  const view = questionView(q, []);
  const buttons = view.choices.map(({ choice, label }) => ({
    label,
    action: choiceAction(q, choice),
  }));
  return {
    key,
    heading: view.heading,
    ...(view.question === undefined ? {} : { question: view.question }),
    lines: [
      ...(q.hidden ? [LISTS_COPY.hidden] : []),
      ...answerLine(key, answer.lastAnswer),
    ],
    buttons,
    ...(locked ? lockedLines() : {}),
  };
}

function unlinkedRow(
  item: UnlinkedOffer,
  answer: PageListsAnswer,
  state: ListsState,
): ListRow {
  const { key } = item;
  const locked = answer.answering?.includes(key) || state.busy.includes(key);
  const open = state.search?.key === key ? state.search : undefined;
  const title = item.title === "" ? UNKNOWN_TITLE : item.title;
  return {
    key,
    heading: unlinkedHeading(item.side, title),
    lines: [reasonLine(item.reason), ...answerLine(key, answer.lastAnswer)],
    buttons: [{ label: LISTS_COPY.search, action: { kind: "open-search" } }],
    ...(open === undefined || locked ? {} : { search: searchView(item, open) }),
    ...(locked ? lockedLines() : {}),
  };
}

// A moot outcome is news only when it came after the page loaded.
function noteOf(answer: PageListsAnswer, state: ListsState): string {
  const last = answer.lastAnswer;
  if (last?.outcome !== "moot" || state.seenSeq === undefined) return "";
  return last.seq > state.seenSeq ? MOOT_LINE : "";
}

function withSendFailure(row: ListRow, state: ListsState): ListRow {
  if (!state.unsent.includes(row.key)) return row;
  return { ...row, lines: [...row.lines, UNREACHABLE_LINE] };
}

export function toListsView(
  answer: PageListsAnswer | undefined,
  state: ListsState,
): ListsView {
  if (answer === undefined) return { questions: [], unlinked: [], note: "" };
  return {
    questions: answer.questions.map((q) =>
      withSendFailure(questionRow(q, answer, state), state),
    ),
    unlinked: answer.unlinked.map((u) =>
      withSendFailure(unlinkedRow(u, answer, state), state),
    ),
    note: noteOf(answer, state),
  };
}

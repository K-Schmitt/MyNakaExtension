// The two sections without the DOM: they load the lists, lock a row while its answer is on its way (on the
// page, and in the worker's `answering` keys), run the search of an unlinked row, and send the owner's
// clicks. Everything outside goes through the ports.

import type { QuestionKey } from "../core/questions";
import { checkQuery } from "../core/search-query";
import type { PageListsAnswer } from "../sw/question-offers";
import {
  accepted,
  askLists,
  askSearch,
  type ListsPorts,
  messageOf,
} from "./lists-requests";
import {
  EMPTY_STATE,
  type ListsState,
  type RowAction,
  toListsView,
} from "./lists-view";
import { POLL_MS } from "./page-timer";

export type ListsController = {
  load(): Promise<void>;
  act(key: QuestionKey, action: RowAction): Promise<void>;
  /** The text of the open search field: kept, with no redraw. */
  type(key: QuestionKey, text: string): void;
};

export function createListsController(ports: ListsPorts): ListsController {
  let answer: PageListsAnswer | undefined;
  let state: ListsState = EMPTY_STATE;
  let poll: unknown;
  // The keys whose answer the worker accepted and has not yet been seen to finish.
  const awaiting = new Set<QuestionKey>();
  let loads = 0;
  let searches = 0;
  // The search on its way: the same text for the same row, asked again meanwhile (a held Enter, a double
  // click), sends nothing more. Any later search, open or close bumps `searches` and ends the match.
  let running: { key: QuestionKey; text: string; seq: number } | undefined;
  const isRunning = (key: QuestionKey, text: string) =>
    running?.seq === searches && running.key === key && running.text === text;

  const redraw = () => ports.show(toListsView(answer, state));
  const change = (next: Partial<ListsState>) => {
    state = { ...state, ...next };
    redraw();
  };
  const without = (keys: readonly QuestionKey[], key: QuestionKey) =>
    keys.filter((k) => k !== key);
  const itemOf = (key: QuestionKey) =>
    answer?.unlinked.find((u) => u.key === key);
  const known = (key: QuestionKey) =>
    itemOf(key) !== undefined || answer?.questions.some((q) => q.key === key);
  const locked = (key: QuestionKey) =>
    state.busy.includes(key) || answer?.answering?.includes(key) === true;

  // One poll armed at most, and only while the worker holds an answer or an accepted one is awaited.
  function schedule(): void {
    if (poll !== undefined) ports.timer.clear(poll);
    poll = undefined;
    if ((answer?.answering ?? []).length === 0 && awaiting.size === 0) return;
    poll = ports.timer.set(() => {
      poll = undefined;
      void load();
    }, POLL_MS);
  }

  // True when an awaited answer is no longer in the worker's `answering`: its job has run.
  function releaseRun(read: PageListsAnswer): boolean {
    const busy = read.answering ?? [];
    const done = [...awaiting].filter((key) => !busy.includes(key));
    for (const key of done) awaiting.delete(key);
    return done.length > 0;
  }

  // Only the latest question is answered; a search whose row left the lists is closed and its answer dropped.
  async function load(): Promise<void> {
    loads += 1;
    const mine = loads;
    const read = await askLists(ports);
    if (mine !== loads) return;
    // A failed read after a good one keeps the rows and the poll; only the first load can leave none.
    if (read !== undefined) answer = read;
    const ran = read === undefined ? false : releaseRun(read);
    const open = state.search;
    const closed = open !== undefined && itemOf(open.key) === undefined;
    if (closed) searches += 1;
    const seenSeq =
      state.seenSeq ??
      (read === undefined ? undefined : (read.lastAnswer?.seq ?? -1));
    state = {
      ...state,
      ...(seenSeq === undefined ? {} : { seenSeq }),
      ...(closed ? { search: undefined } : {}),
    };
    redraw();
    schedule();
    if (ran) ports.answered?.();
  }

  function openSearch(key: QuestionKey): void {
    const item = itemOf(key);
    if (item === undefined) return;
    searches += 1;
    change({ search: { key, query: item.title, phase: { kind: "idle" } } });
  }

  async function search(key: QuestionKey): Promise<void> {
    const open = state.search;
    const item = itemOf(key);
    if (open?.key !== key || item === undefined) return;
    let text: string;
    try {
      text = checkQuery(open.query);
    } catch {
      change({ search: { ...open, phase: { kind: "empty-query" } } });
      return;
    }
    if (isRunning(key, text)) return;
    searches += 1;
    const mine = searches;
    running = { key, text, seq: mine };
    change({ search: { ...open, phase: { kind: "searching" } } });
    const phase = await askSearch(ports, item, text);
    if (running?.seq === mine) running = undefined;
    const now = state.search;
    if (mine !== searches || now?.key !== key) return;
    change({ search: { ...now, phase } });
  }

  async function send(key: QuestionKey, action: RowAction): Promise<void> {
    const message = messageOf(action);
    if (message === undefined) return;
    change({ busy: [...state.busy, key], unsent: without(state.unsent, key) });
    const sent = await accepted(ports, message);
    const closing = action.kind === "link" && state.search?.key === key;
    if (closing) searches += 1;
    state = {
      ...state,
      busy: without(state.busy, key),
      unsent: sent ? state.unsent : [...state.unsent, key],
      ...(closing && sent ? { search: undefined } : {}),
    };
    if (sent && (action.kind === "answer-question" || action.kind === "link")) {
      awaiting.add(key);
    }
    await load();
  }

  async function act(key: QuestionKey, action: RowAction): Promise<void> {
    if (!known(key) || locked(key)) return;
    if (action.kind === "open-search") return openSearch(key);
    if (action.kind === "search") return search(key);
    return send(key, action);
  }

  function type(key: QuestionKey, text: string): void {
    const open = state.search;
    if (open?.key !== key) return;
    const phase =
      open.phase.kind === "empty-query"
        ? { kind: "idle" as const }
        : open.phase;
    state = { ...state, search: { ...open, query: text, phase } };
  }

  return { load, act, type };
}

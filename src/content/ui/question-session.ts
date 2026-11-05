// One shown question and its answer, for the Naka blocks and (through the same rules) the page's rows.
// The 4a rating session applied to a question: the lock after a choice, the sending line, the re-asks on
// END_POLL_MS counted from the click, the move-on rule and the unreachable rule. An answer goes out only
// from a trusted click (the render guarantees it). A click within GRACE_MS of the buttons appearing is
// taken for one meant for the page: ignored.
//
// The answer is judged in this order: still sending is "not yet"; then the worker's `lastAnswer` when it
// names this question and is newer than the one the block opened on (its outcome wins even when the
// question is already gone, since a moot job closes it); then the question absent is "answered"; then
// still present is "not yet".
//
// Where the question of a `rating-card` answer comes from (the end and pause blocks): that question
// IGNORES `asked`. A dismissal (« Écarter ») hides a question from the home panel only; the title's own
// end block still asks it.

import type { LastAnswer } from "../../ext/question-offer-schema";
import type { QuestionOffer } from "../../sw/question-offers";
import { graceOver, startGrace } from "./click-grace";
import type { EndTimer } from "./end-poll";
import { pollSchedule } from "./end-poll";
import { UNREACHABLE_LINE } from "./question-copy";
import type { QuestionHandlers } from "./question-render";
import { failureLine, type Shown, viewOf } from "./question-session-view";
import type {
  QuestionAction,
  QuestionChoice,
  QuestionView,
} from "./question-view";

export type QuestionState = {
  present: boolean;
  sending: boolean;
  last?: LastAnswer;
};

export type QuestionPorts = {
  timer: EndTimer;
  now(): number;
  show(view: QuestionView, h: QuestionHandlers): void;
  hide(): void;
  ask(): Promise<QuestionState | undefined>;
  send(choice: QuestionChoice): Promise<boolean>;
  dismiss?(): Promise<boolean>;
};

/** `absentIsDone: false`: a question not stored yet (nothing asked it) is "not yet", not "answered". */
export type QuestionOptions = { absentIsDone?: boolean };

export function createQuestionSession(
  ports: QuestionPorts,
  onClosed: (how: "answered" | "closed") => void,
  options: QuestionOptions = {},
) {
  let current: Shown | undefined;

  function render(s: Shown): void {
    ports.show(viewOf(s), handlersOf(s));
  }

  function close(s: Shown, how: "answered" | "closed"): void {
    if (current !== s) return;
    current = undefined;
    ports.hide();
    onClosed(how);
  }

  // The buttons appear again: the grace counts from now.
  function unlock(s: Shown, error?: string): void {
    s.locked = false;
    startGrace(s, ports.now);
    if (error === undefined) delete s.error;
    else s.error = error;
    render(s);
  }

  function showMoot(s: Shown): void {
    s.mootNotice = true;
    unlock(s);
  }

  // Newer than the open, and about this question: the job's own word.
  function ownAnswer(
    s: Shown,
    last: LastAnswer | undefined,
  ): LastAnswer | undefined {
    return last !== undefined && last.target === s.offer.key && last.seq > s.seq
      ? last
      : undefined;
  }

  function settleOwn(s: Shown, last: LastAnswer): void {
    if (last.outcome === "done") close(s, "answered");
    else if (last.outcome === "moot") showMoot(s);
    else {
      s.seq = last.seq; // a retry waits for a newer answer, not this one again
      unlock(s, failureLine(last));
    }
  }

  // true when the answer settles the wait.
  function judge(s: Shown, state: QuestionState | undefined): boolean {
    if (current !== s) return true; // closed meanwhile: the wait is over, nothing is drawn
    if (state === undefined || state.sending) return false;
    const own = ownAnswer(s, state.last);
    if (own !== undefined) {
      settleOwn(s, own);
      return true;
    }
    if (state.present || options.absentIsDone === false) return false;
    close(s, "answered");
    return true;
  }

  function unreachable(s: Shown): void {
    if (current === s) unlock(s, UNREACHABLE_LINE);
  }

  // Locked from the click until the worker's answer settles. A spent schedule means the job is queued in
  // the worker: the block hides. No answer at all means the worker cannot be reached.
  function lock(s: Shown, send: Promise<boolean>): void {
    s.locked = true;
    delete s.error;
    render(s);
    const stop = pollSchedule(
      () => ports.ask(),
      ports.timer,
      (state) => judge(s, state),
      (answered) => (answered ? close(s, "closed") : unreachable(s)),
    );
    void send
      .catch(() => false)
      .then((sent) => {
        if (sent) return;
        stop();
        unreachable(s);
      });
  }

  function dismiss(s: Shown): void {
    s.locked = true;
    render(s);
    const sent = ports.dismiss?.() ?? Promise.resolve(true);
    void sent
      .catch(() => false)
      .then((ok) => {
        if (ok) close(s, "closed");
        else unreachable(s);
      });
  }

  function act(s: Shown, action: QuestionAction): void {
    if (action === "ecarter") dismiss(s);
    else close(s, "closed");
  }

  function handlersOf(s: Shown): QuestionHandlers {
    const settled = (): boolean =>
      current === s && !s.locked && graceOver(s, ports.now);
    return {
      onChoose: (choice) => settled() && lock(s, ports.send(choice)),
      onAction: (action) => settled() && act(s, action),
    };
  }

  return {
    open(offer: QuestionOffer, actions: QuestionAction[], seq: number): void {
      current = { offer, actions, seq, locked: false, shownAt: ports.now() };
      render(current);
    },
    closeShown(): void {
      if (current !== undefined) close(current, "closed");
    },
    isOpen: (): boolean => current !== undefined,
  };
}

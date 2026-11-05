// One shown rating card and its send, shared by the end block and the pause block: the lock after a
// choice, the sending cue, the re-ask schedule counted from the click, the move-on rule and the
// unreachable rule. A rating goes out only from a trusted click (the render guarantees it), once per
// answer: the block locks after a choice until the worker's next answer.

import type { ContentIds } from "../../core/finish-event";
import type { RatingCard, RatingLabel } from "../../core/rating-cards";
import type { CardAnswer } from "../../sw/rating-answers";
import { type EndTimer, pollUntil } from "./end-poll";
import { type RatingAction, UNREACHABLE_LINE } from "./rating-copy";
import type { RatingHandlers } from "./rating-render";
import type { RatingView } from "./rating-view";
import {
  failureOf,
  labelOf,
  needsConfirm,
  type Session,
  viewFor,
} from "./session-views";
import type { WorkerPort } from "./worker-port";

export type SessionPorts = {
  port: Pick<WorkerPort, "askCard" | "rate" | "dismiss">;
  timer: EndTimer;
  show(view: RatingView, handlers: RatingHandlers): void;
  hide(): void;
};

// The clicked label on the shown card, as it was at the click.
type Snapshot = {
  pending: boolean;
  given: number | undefined;
  failure: string | undefined;
};

const snapshotOf = (card: RatingCard, label: RatingLabel): Snapshot => ({
  pending: card.pending.includes(label),
  given: card.given[label],
  failure: failureOf(card, label),
});

// `absentIsDone`: for a list of cards, where the answer lists only cards with something pending, a card
// missing from the answer has nothing left to ask. For one shown card, a missing card is "not yet".
export type SessionOptions = { absentIsDone?: boolean };

export function createRatingSession(
  ports: SessionPorts,
  onClosed: () => void,
  options: SessionOptions = {},
) {
  let current: Session | undefined;

  function render(s: Session): void {
    ports.show(viewFor(s), handlersOf(s));
  }

  function close(s: Session): void {
    if (current !== s) return;
    current = undefined;
    ports.hide();
    onClosed();
  }

  // The card after an action: the next label, or a failure line; the block unlocks.
  function settle(s: Session, answer: CardAnswer): void {
    const card = answer.card;
    const label = card ? labelOf(card) : undefined;
    if (!card || label === undefined) {
      close(s);
      return;
    }
    s.card = card;
    s.label = label;
    delete s.start;
    if (answer.start !== undefined) s.start = answer.start;
    if (answer.sending?.includes(label)) {
      watch(s);
      return;
    }
    s.locked = false;
    render(s);
  }

  // The worker cannot be reached: the block stays, with the line, and the choices work again.
  function unreachable(s: Session): void {
    if (current !== s) return;
    s.locked = false;
    s.error = UNREACHABLE_LINE;
    render(s);
  }

  // Moved on: the answer has a card where the clicked label left `pending`, or its given rating
  // changed, or its failure changed, all against the card as it was at the click. No card, or a card
  // unchanged on those three, is "not yet".
  function judge(
    s: Session,
    label: RatingLabel,
    at: Snapshot,
    answer: CardAnswer | undefined,
  ): boolean {
    if (current !== s) return true; // closed meanwhile (a play): the wait is over, nothing is drawn
    if (answer?.sending?.includes(label)) return false; // the worker still has the rating to send
    const card = answer?.card;
    if (answer && !card && options.absentIsDone === true) {
      close(s);
      return true;
    }
    if (!answer || !card) return false;
    const left = at.pending && !card.pending.includes(label);
    const rated = card.given[label] !== at.given;
    const failed = failureOf(card, label) !== at.failure;
    if (!left && !rated && !failed) return false;
    if (failed && !left && !rated) showFailure(s, card, label);
    else settle(s, answer);
    return true;
  }

  // A failure on a label that did not leave `pending`: the block stays, unlocked, with its line.
  function showFailure(s: Session, card: RatingCard, label: RatingLabel): void {
    s.card = card;
    s.label = label;
    s.locked = false;
    render(s);
  }

  // Locked from the click until the card says the label left `pending`, or a failure that was not
  // there at the click shows up. A spent schedule means the job is queued in the worker: the block hides.
  function watch(s: Session, send?: Promise<boolean>): void {
    const { label } = s;
    const at = snapshotOf(s.card, label);
    s.locked = true;
    delete s.error;
    render(s);
    const stop = pollUntil(
      ports.port,
      ports.timer,
      s.ids,
      (answer) => judge(s, label, at, answer),
      (answered) => (answered ? close(s) : unreachable(s)),
    );
    void send
      ?.catch(() => false)
      .then((sent) => {
        if (sent) return;
        stop();
        unreachable(s);
      });
  }

  function choose(s: Session, value: number): void {
    if (s.confirming !== undefined) return;
    if (needsConfirm(s)) {
      s.confirming = value;
      render(s);
      return;
    }
    watch(s, ports.port.rate(s.ids, s.label, value));
  }

  function confirm(s: Session, send: boolean): void {
    const value = s.confirming;
    delete s.confirming;
    if (!send || value === undefined) {
      render(s);
      return;
    }
    watch(s, ports.port.rate(s.ids, s.label, value));
  }

  function act(s: Session, action: RatingAction): void {
    if (action === "ignorer") {
      watch(s, ports.port.dismiss(s.ids, s.label));
      return;
    }
    close(s);
  }

  function handlersOf(s: Session): RatingHandlers {
    const live = (): boolean => current === s && !s.locked;
    return {
      onChoose: (value) => live() && choose(s, value),
      onAction: (action) => live() && act(s, action),
      onOther: (label) => {
        if (!live()) return;
        s.label = label;
        render(s);
      },
      onConfirm: (send) => live() && confirm(s, send),
    };
  }

  return {
    open(
      ids: ContentIds,
      card: RatingCard,
      label: RatingLabel,
      start?: number,
      sending: RatingLabel[] = [],
    ): void {
      current = {
        ids,
        card,
        label,
        locked: false,
        ...(start === undefined ? {} : { start }),
      };
      if (sending.includes(label)) watch(current);
      else render(current);
    },
    closeShown(): void {
      if (current !== undefined) close(current);
    },
    isOpen: (): boolean => current !== undefined,
  };
}

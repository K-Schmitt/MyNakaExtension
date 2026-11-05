// One shown rating card and its send, shared by the end block and the pause block: the lock after a
// choice, the sending cue, the re-ask schedule counted from the click, the move-on rule and the
// unreachable rule. A rating goes out only from a trusted click (the render guarantees it), once per
// answer: the block locks after a choice until the worker's next answer. A click that lands within
// GRACE_MS of the label's buttons appearing under the cursor is taken for one meant for the page: ignored.

import type { ContentIds } from "../../core/finish-event";
import type { RatingCard, RatingLabel } from "../../core/rating-cards";
import type { CardAnswer } from "../../sw/rating-answers";
import { type EndTimer, pollUntil } from "./end-poll";
import {
  notSentLine,
  type RatingAction,
  UNREACHABLE_LINE,
} from "./rating-copy";
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

export const GRACE_MS = 400;

export type SessionPorts = {
  port: Pick<WorkerPort, "askCard" | "rate" | "dismiss">;
  timer: EndTimer;
  now(): number;
  show(view: RatingView, handlers: RatingHandlers): void;
  hide(): void;
};

// The clicked label on the shown card, as it was at the click.
type Snapshot = {
  cardless: boolean;
  pending: boolean;
  given: number | undefined;
  failure: string | undefined;
};

const snapshotOf = ({ card, label, viewOnly }: Session): Snapshot => ({
  cardless: viewOnly === true,
  pending: card.pending.includes(label),
  given: card.given[label],
  failure: failureOf(card, label),
});

// `absentIsDone`: for a list of cards, where the answer lists only cards with something pending, a card
// missing from the answer has nothing left to ask. For one shown card, a missing card is "not yet".
export type SessionOptions = { absentIsDone?: boolean };

/** What the opener knows of the card: the answer's start and sending, and whether it is view-only. */
export type Opened = {
  start?: number;
  sending?: RatingLabel[];
  viewOnly?: boolean;
};

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

  // The label's buttons appear again: the grace counts from now.
  function unlock(s: Session): void {
    s.locked = false;
    s.shownAt = ports.now();
    render(s);
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
    delete s.viewOnly;
    delete s.start;
    if (answer.start !== undefined) s.start = answer.start;
    if (answer.sending?.includes(label)) {
      watch(s);
      return;
    }
    unlock(s);
  }

  // The worker cannot be reached: the block stays, with the line, and the choices work again.
  function unreachable(s: Session): void {
    if (current !== s) return;
    s.error = UNREACHABLE_LINE;
    unlock(s);
  }

  // An answer with no card, the label no longer being sent. For a list, the card has nothing left to
  // ask. For a view-only card, the rate job ran without making one: the line says why, the choices work
  // again. For a shown real card, it is "not yet".
  function absent(s: Session, at: Snapshot, answer: CardAnswer): boolean {
    if (options.absentIsDone === true) {
      close(s);
      return true;
    }
    if (!at.cardless) return false;
    s.error = notSentLine(answer.lastFinish);
    unlock(s);
    return true;
  }

  // Moved on: the answer has a card where the clicked label left `pending`, or its given rating
  // changed, or its failure changed, all against the card as it was at the click. A card unchanged on
  // those three is "not yet"; no card is `absent`.
  function judge(
    s: Session,
    label: RatingLabel,
    at: Snapshot,
    answer: CardAnswer | undefined,
  ): boolean {
    if (current !== s) return true; // closed meanwhile (a play): the wait is over, nothing is drawn
    if (answer === undefined) return false;
    if (answer.sending?.includes(label)) return false; // the worker still has the rating to send
    const card = answer.card;
    if (!card) return absent(s, at, answer);
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
    delete s.viewOnly;
    unlock(s);
  }

  // Locked from the click until the card says the label left `pending`, or a failure that was not
  // there at the click shows up. A spent schedule means the job is queued in the worker: the block hides.
  function watch(
    s: Session,
    send?: Promise<boolean>,
    dismissing = false,
  ): void {
    const { label } = s;
    const at = snapshotOf(s);
    s.locked = true;
    delete s.error;
    if (dismissing) s.dismissing = true;
    else delete s.dismissing;
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
      watch(s, ports.port.dismiss(s.ids, s.label), true);
      return;
    }
    close(s);
  }

  function handlersOf(s: Session): RatingHandlers {
    const live = (): boolean => current === s && !s.locked;
    // A clock set back puts the draw in the future: the grace then starts again from now, instead of
    // leaving every button dead until the clock catches up.
    const settled = (): boolean => {
      if (!live()) return false;
      if (ports.now() < s.shownAt) s.shownAt = ports.now();
      return ports.now() - s.shownAt >= GRACE_MS;
    };
    return {
      onChoose: (value) => settled() && choose(s, value),
      onAction: (action) => settled() && act(s, action),
      onOther: (label) => {
        if (!live()) return;
        s.label = label;
        render(s);
      },
      onConfirm: (send) => settled() && confirm(s, send),
    };
  }

  return {
    open(
      ids: ContentIds,
      card: RatingCard,
      label: RatingLabel,
      { start, sending = [], viewOnly = false }: Opened = {},
    ): void {
      current = {
        ids,
        card,
        label,
        locked: false,
        shownAt: ports.now(),
        ...(start === undefined ? {} : { start }),
        ...(viewOnly ? { viewOnly: true } : {}),
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

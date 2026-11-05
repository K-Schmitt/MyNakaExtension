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

export function createRatingSession(ports: SessionPorts, onClosed: () => void) {
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

  function judge(
    s: Session,
    label: RatingLabel,
    before: string | undefined,
    answer: CardAnswer | undefined,
  ): boolean {
    if (answer === undefined) return false;
    const { card } = answer;
    const stillPending = card?.pending.includes(label) === true;
    const fresh = card !== null && failureOf(card, label) !== before;
    if (stillPending && !fresh) return false;
    settle(s, answer);
    return true;
  }

  // Locked from the click until the card says the label left `pending`, or a failure that was not
  // there at the click shows up. A spent schedule means the job is queued in the worker: the block hides.
  function afterAction(s: Session, send: Promise<boolean>): void {
    const { label } = s;
    const before = failureOf(s.card, label);
    s.locked = true;
    delete s.error;
    render(s);
    const stop = pollUntil(
      ports.port,
      ports.timer,
      s.ids,
      (answer) => judge(s, label, before, answer),
      (answered) => (answered ? close(s) : unreachable(s)),
    );
    void send
      .catch(() => false)
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
    afterAction(s, ports.port.rate(s.ids, s.label, value));
  }

  function confirm(s: Session, send: boolean): void {
    const value = s.confirming;
    delete s.confirming;
    if (!send || value === undefined) {
      render(s);
      return;
    }
    afterAction(s, ports.port.rate(s.ids, s.label, value));
  }

  function act(s: Session, action: RatingAction): void {
    if (action === "ignorer") {
      afterAction(s, ports.port.dismiss(s.ids, s.label));
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
    ): void {
      current = {
        ids,
        card,
        label,
        locked: false,
        ...(start === undefined ? {} : { start }),
      };
      render(current);
    },
    isOpen: (): boolean => current !== undefined,
  };
}

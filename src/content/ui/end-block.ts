// The end block: when a viewing ends, it waits for the card, shows its first pending label over the player,
// and walks the chain (épisode, saison, série). A rating goes out only from a trusted click (the render
// guarantees it), once per answer: the block locks after a choice until the worker's next answer.

import { type ContentIds, contentKeyOf } from "../../core/finish-event";
import type { RatingCard, RatingLabel } from "../../core/rating-cards";
import type { CardAnswer } from "../../sw/rating-answers";
import {
  askOrNothing,
  type EndTimer,
  pollUntil,
  startEndPoll,
} from "./end-poll";
import {
  chosenLine,
  type RatingAction,
  SENDING_LINE,
  UNREACHABLE_LINE,
} from "./rating-copy";
import type { RatingHandlers } from "./rating-render";
import { type RatingView, ratingView } from "./rating-view";
import type { WorkerPort } from "./worker-port";

export type { EndTimer } from "./end-poll";

export type EndPorts = {
  port: Pick<WorkerPort, "askCard" | "rate" | "dismiss">;
  timer: EndTimer;
  show(view: RatingView, handlers: RatingHandlers): void;
  hide(): void;
};

// One shown card. `start` is the answer's, and belongs to the card's first pending label only.
type Session = {
  ids: ContentIds;
  card: RatingCard;
  label: RatingLabel;
  start?: number;
  locked: boolean;
  confirming?: number;
  error?: string; // a line of the block's own: the worker did not answer
};

const needsConfirm = ({ card, label }: Session): boolean =>
  label === "série" && !card.seriesFinished;

function viewOf(s: Session): RatingView {
  const view = ratingView(
    s.card,
    s.label,
    s.label === s.card.pending[0] ? s.start : undefined,
  );
  return s.error === undefined ? view : { ...view, error: s.error };
}

// While a rating travels: no button, a cue, until the worker's card says where it went.
function sendingView(s: Session): RatingView {
  return {
    ...viewOf(s),
    choices: [],
    others: [],
    actions: [],
    notice: SENDING_LINE,
  };
}

const failureOf = (card: RatingCard, label: RatingLabel): string | undefined =>
  card.failed?.label === label
    ? `${card.failed.error}@${card.failed.at}`
    : undefined;

function confirmView(s: Session): RatingView {
  return {
    ...viewOf(s),
    choices: [],
    others: [],
    actions: [],
    confirm: true,
    ...(s.confirming === undefined ? {} : { notice: chosenLine(s.confirming) }),
  };
}

// A failed label is shown again with its failure line; otherwise the first pending one.
function labelOf(card: RatingCard): RatingLabel | undefined {
  const failed = card.failed?.label;
  if (failed !== undefined && card.pending.includes(failed)) return failed;
  return card.pending[0];
}

export function createEndBlock(ports: EndPorts) {
  const seen = new Set<string>();
  const queue: ContentIds[] = [];
  let current: Session | undefined;

  function viewFor(s: Session): RatingView {
    if (s.locked) return sendingView(s);
    return s.confirming === undefined ? viewOf(s) : confirmView(s);
  }

  function render(s: Session): void {
    ports.show(viewFor(s), handlersOf(s));
  }

  function display(ids: ContentIds, card: RatingCard, start?: number): void {
    const label = labelOf(card);
    if (label === undefined) return;
    current = {
      ids,
      card,
      label,
      locked: false,
      ...(start === undefined ? {} : { start }),
    };
    render(current);
  }

  function offer(ids: ContentIds, card: RatingCard, start?: number): void {
    if (current === undefined) display(ids, card, start);
    else queue.push(ids);
  }

  async function openNext(): Promise<void> {
    for (let ids = queue.shift(); ids !== undefined; ids = queue.shift()) {
      const answer = await askOrNothing(ports.port, ids);
      if (answer?.card && answer.card.pending.length > 0) {
        offer(ids, answer.card, answer.start);
        return;
      }
    }
  }

  function close(s: Session): void {
    if (current !== s) return;
    current = undefined;
    ports.hide();
    openNext().catch(() => {});
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
    finished(ids: ContentIds): void {
      const key = contentKeyOf(ids);
      if (seen.has(key)) return;
      seen.add(key);
      // A window that found no card to rate is not final: a later finished for the key polls again.
      startEndPoll(
        ports.port,
        ports.timer,
        ids,
        (card, start) => offer(ids, card, start),
        () => seen.delete(key),
      );
    },
    isShown: (): boolean => current !== undefined,
  };
}

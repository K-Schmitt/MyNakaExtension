// The end block: when a viewing ends, it waits for the card, shows its first pending label over the player,
// and walks the chain (épisode, saison, série). A rating goes out only from a trusted click (the render
// guarantees it), once per answer: the block locks after a choice until the worker's next answer.

import { type ContentIds, contentKeyOf } from "../../core/finish-event";
import type { RatingCard, RatingLabel } from "../../core/rating-cards";
import type { CardAnswer } from "../../sw/rating-answers";
import { type EndTimer, startEndPoll } from "./end-poll";
import type { RatingAction } from "./rating-copy";
import type { RatingHandlers } from "./rating-render";
import { type RatingView, ratingView } from "./rating-view";
import type { WorkerPort } from "./worker-port";

export type { EndTimer } from "./end-poll";

export const SETTLE_MS = 2000;

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
};

const needsConfirm = ({ card, label }: Session): boolean =>
  label === "série" && !card.seriesFinished;

function viewOf(s: Session): RatingView {
  return ratingView(
    s.card,
    s.label,
    s.label === s.card.pending[0] ? s.start : undefined,
  );
}

function confirmView(s: Session): RatingView {
  return { ...viewOf(s), choices: [], others: [], actions: [], confirm: true };
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

  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      ports.timer.set(resolve, ms);
    });

  function render(s: Session): void {
    ports.show(
      s.confirming === undefined ? viewOf(s) : confirmView(s),
      handlersOf(s),
    );
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
      const answer = await ports.port.askCard(ids);
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
    void openNext();
  }

  // The worker's answer after an action: the next label, a failure line, or the end of this card.
  function settle(s: Session, answer: CardAnswer | undefined): void {
    const card = answer?.card;
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

  async function afterAction(s: Session, send: Promise<void>): Promise<void> {
    s.locked = true;
    await send;
    await wait(SETTLE_MS);
    settle(s, await ports.port.askCard(s.ids));
  }

  function choose(s: Session, value: number): void {
    if (s.confirming !== undefined) return;
    if (needsConfirm(s)) {
      s.confirming = value;
      render(s);
      return;
    }
    void afterAction(s, ports.port.rate(s.ids, s.label, value));
  }

  function confirm(s: Session, send: boolean): void {
    const value = s.confirming;
    delete s.confirming;
    if (!send || value === undefined) {
      render(s);
      return;
    }
    void afterAction(s, ports.port.rate(s.ids, s.label, value));
  }

  function act(s: Session, action: RatingAction): void {
    if (action === "ignorer") {
      void afterAction(s, ports.port.dismiss(s.ids, s.label));
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
      startEndPoll(ports.port, ports.timer, ids, (card, start) =>
        offer(ids, card, start),
      );
    },
    isShown: (): boolean => current !== undefined,
  };
}

// The block right after a removal from « Ma liste » on Naka: « Retirer aussi de vos envies SensCritique ? ».
// The page reports an id (the MAIN world saw `DELETE /playlist/<id>`); a page script can forge that id, so
// the id alone shows nothing: the worker's `removal-offer` must return an offer (a mapped pair both lists
// held at the last run), and the removal itself needs a trusted click on the block, which the worker then
// verifies again against « Ma liste » before its one write. The block only shows when the overlay is free.

import type { QuestionKey } from "../../core/questions";
import type { RemovalOffer } from "../../sw/question-offers";
import { titleOrNothing } from "./offer-title";
import type { QuestionHandlers } from "./question-render";
import { createQuestionSession, type QuestionPorts } from "./question-session";
import type { QuestionChoice, QuestionView } from "./question-view";
import type { WorkerPort } from "./worker-port";

export type RemovalPorts = Pick<QuestionPorts, "timer" | "now" | "hide"> & {
  /** `key` names the offer being drawn: the home row needs it to tell a stored question of the same pair. */
  show(view: QuestionView, h: QuestionHandlers, key: QuestionKey): void;
  port: Pick<WorkerPort, "askRemovalOffer" | "answerRemoval">;
  titleOf(contentId: number): Promise<string | undefined>;
  /** True when no end or pause block owns the overlay. */
  ownerFree(): boolean;
};

type Open = { contentId: number; key: QuestionKey; pair: RemovalOffer["pair"] };

export function createRemovalBlock(ports: RemovalPorts) {
  let open: Open | undefined;
  let epoch = 0; // each removed() and each close() starts a new one: an older answer opens nothing

  async function ask() {
    if (open === undefined) return undefined;
    const answer = await ports.port.askRemovalOffer(open.contentId);
    if (answer === undefined) return undefined;
    return {
      present: answer.offer !== null,
      sending: answer.answering === true,
      last: answer.lastAnswer,
    };
  }

  function send(choice: QuestionChoice): Promise<boolean> {
    if (open === undefined) return Promise.resolve(false);
    if (choice.kind !== "remove" && choice.kind !== "keep") {
      return Promise.resolve(false);
    }
    const { nakaId, scId } = open.pair;
    return ports.port.answerRemoval(
      "sc",
      nakaId,
      scId,
      choice.kind === "remove",
    );
  }

  const session = createQuestionSession(
    {
      timer: ports.timer,
      now: ports.now,
      show: (view, handlers) => {
        if (open !== undefined) {
          ports.show(view, handlers, open.key);
        }
      },
      hide: ports.hide,
      ask,
      send,
    },
    () => {
      open = undefined;
    },
  );

  async function removed(contentId: number): Promise<void> {
    epoch += 1;
    const mine = epoch;
    const answer = await ports.port.askRemovalOffer(contentId);
    if (answer === undefined || answer.offer === null) return;
    if (answer.answering === true) return;
    const { offer } = answer;
    const title =
      offer.title === ""
        ? await titleOrNothing(ports.titleOf, ports.timer, contentId)
        : offer.title;
    if (mine !== epoch || session.isOpen() || !ports.ownerFree()) return;
    open = { contentId, key: offer.key, pair: offer.pair };
    session.open(
      { ...offer, title },
      ["plus-tard"],
      answer.lastAnswer?.seq ?? 0,
    );
  }

  return {
    removed(contentId: number): void {
      removed(contentId).catch(() => {});
    },
    close(): void {
      epoch += 1;
      session.closeShown();
    },
    isShown: (): boolean => session.isOpen(),
  };
}

// The pause block: when the owner pauses the video, a block over the player offers to rate what plays.
// A rating on a title not yet seen makes the worker mark it seen first (the explicit finish), then rate.
// The send itself is the shared rating session; this file decides whether a pause deserves a block.

import type { ContentIds } from "../../core/finish-event";
import type { RatingCard, RatingLabel } from "../../core/rating-cards";
import type { AmbiguityOffer } from "../../sw/question-offers";
import type { CardAnswer } from "../../sw/rating-answers";
import type { VideoSample } from "../naka-tab";
import { askOrNothing, questionOf } from "./end-poll";
import { createQuestionHost, type HostPorts } from "./question-host";
import { createRatingSession } from "./rating-session";
import type { SessionPorts } from "./session-ports";
import { labelOf } from "./session-views";
import { viewOnlyCard, viewOnlyLabel } from "./view-only-card";

// Naka's next-episode zone: from here a pause is the end of the viewing, not a moment to rate.
const PAUSE_END_ZONE = 0.98;
const PAUSE_AFTER_URL_MS = 3000;
// Naka's page makes each pause reach a capture listener twice.
export const DOUBLE_PAUSE_MS = 1000;

export type PausePorts = Omit<SessionPorts, "onQuestion"> &
  HostPorts & {
    now(): number;
    endShown(): boolean;
    titleOf(contentId: number): Promise<string | undefined>;
  };

type Position = Pick<VideoSample, "currentTime" | "duration">;
type Offer = { card: RatingCard; label: RatingLabel; viewOnly?: boolean };

function progressOf({ currentTime, duration }: Position): number | undefined {
  if (!Number.isFinite(duration) || duration <= 0) return undefined;
  return Number.isFinite(currentTime) ? currentTime / duration : undefined;
}

// A rated title can be rated again: with nothing pending, its first target.
function offerOfCard(card: RatingCard): Offer | undefined {
  const label = labelOf(card) ?? card.targets[0]?.label;
  return label === undefined ? undefined : { card, label };
}

export function createPauseBlock(ports: PausePorts) {
  // The pause being served: the question and a card-less rating's hand-over both need its ids and place.
  let serving: { ids: ContentIds; progress: number; mine: number } | undefined;
  const session = createRatingSession(
    {
      ...ports,
      onQuestion: (found, answer) => {
        if (serving?.mine === epoch) question.open(serving.ids, found, answer);
      },
    },
    () => {},
  );
  const question = createQuestionHost(ports, (ids, linked) => {
    const again = serving;
    if (linked && again?.mine === epoch && again.ids === ids) {
      offer(ids, again.progress, again.mine).catch(() => {});
    }
  });
  let lastUrlAt: number | undefined;
  let lastPauseAt: number | undefined;
  let epoch = 0; // each pause, play, URL change and close starts a new one: an older answer is dropped

  const isDouble = (at: number): boolean =>
    lastPauseAt !== undefined && at - lastPauseAt < DOUBLE_PAUSE_MS;

  const isJustAfterUrl = (at: number): boolean =>
    lastUrlAt !== undefined && at - lastUrlAt < PAUSE_AFTER_URL_MS;

  async function titleOrNothing(
    contentId: number,
  ): Promise<string | undefined> {
    try {
      return await ports.titleOf(contentId);
    } catch {
      return undefined;
    }
  }

  async function viewOnlyOffer(ids: ContentIds): Promise<Offer | undefined> {
    const title = await titleOrNothing(ids.contentId);
    if (title === undefined) return undefined;
    return {
      card: viewOnlyCard(ids, title, ports.now()),
      label: viewOnlyLabel(ids),
      viewOnly: true,
    };
  }

  const offerOf = (ids: ContentIds, answer: CardAnswer) =>
    answer.card ? offerOfCard(answer.card) : viewOnlyOffer(ids);

  async function offer(ids: ContentIds, progress: number, mine: number) {
    const answer = await askOrNothing(ports.port, ids);
    if (answer === undefined) return;
    if (progress < answer.pauseFromPercent / 100) return;
    const found = questionOf(answer);
    if (found !== undefined) {
      askFirst(ids, progress, mine, found, answer);
      return;
    }
    const chosen = await offerOf(ids, answer);
    if (chosen === undefined || epoch !== mine || ports.endShown()) return;
    serving = { ids, progress, mine };
    const { card, label, viewOnly } = chosen;
    const { start, sending } = answer;
    session.open(ids, card, label, { start, sending, viewOnly });
  }

  function askFirst(
    ids: ContentIds,
    progress: number,
    mine: number,
    found: AmbiguityOffer,
    answer: CardAnswer,
  ): void {
    if (epoch !== mine || ports.endShown()) return;
    serving = { ids, progress, mine };
    question.open(ids, found, answer);
  }

  // The shown card or question closes, and an offer still on its way is dropped.
  function close(): void {
    epoch += 1;
    session.closeShown();
    question.closeShown();
  }

  return {
    paused(sample: Position, ids: ContentIds | undefined): void {
      const at = ports.now();
      if (isDouble(at)) return;
      lastPauseAt = at;
      if (ids === undefined || ports.endShown()) return;
      const progress = progressOf(sample);
      if (progress === undefined || progress >= PAUSE_END_ZONE) return;
      if (isJustAfterUrl(at)) return;
      epoch += 1;
      offer(ids, progress, epoch).catch(() => {});
    },
    resumed(): void {
      lastPauseAt = undefined;
      close();
    },
    /** Every URL change, an episode change included: the pause block was for what played before. */
    urlChanged(at: number): void {
      lastUrlAt = at;
      close();
    },
    close,
    isShown: (): boolean => session.isOpen() || question.isOpen(),
  };
}

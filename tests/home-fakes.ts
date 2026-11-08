import { vi } from "vitest";
import type { HomeHandlers, HomePorts } from "../src/content/ui/home-block";
import type { HomeView } from "../src/content/ui/home-view";
import type { QuestionHandlers } from "../src/content/ui/question-render";
import type { RatingHandlers } from "../src/content/ui/rating-render";
import { GRACE_MS } from "../src/content/ui/rating-session";
import type { ContentIds } from "../src/core/finish-event";
import type { QuestionKey } from "../src/core/questions";
import type { RatingCard, RatingLabel } from "../src/core/rating-cards";
import type { Side } from "../src/core/state";
import type {
  OpenQuestionsAnswer,
  QuestionOffer,
} from "../src/sw/question-offers";
import type { CardsAnswer } from "../src/sw/rating-answers";
import { fakeClock } from "./end-block-fakes";

const keyOf = (ids: ContentIds): string =>
  `${ids.contentId}:${ids.season ?? ""}:${ids.episode ?? ""}`;

export const entryOf = (card: RatingCard, start?: number) => ({
  card,
  ...(start === undefined ? {} : { start }),
});

export const questionsOf = (
  ...questions: QuestionOffer[]
): OpenQuestionsAnswer => ({ questions });

export const answerOf = (...cards: RatingCard[]): CardsAnswer => ({
  cards: cards.map((card) => entryOf(card)),
});

// The worker as the home row sees it: `answer` is what the next askCards returns (the test changes it
// to play the worker's progress); sends are recorded and succeed unless `fail.send` is set.
export function homeWorld() {
  const clock = fakeClock();
  const calls: string[] = [];
  const shown: { view: HomeView; handlers: HomeHandlers }[] = [];
  let hidden = 0;
  const state = {
    answer: undefined as CardsAnswer | undefined,
    questions: undefined as OpenQuestionsAnswer | undefined,
    titles: new Map<number, string>(),
    sendOk: true,
  };
  const ports: HomePorts = {
    timer: clock.timer,
    now: clock.now,
    titleOf: async (id) => {
      calls.push(`titleOf ${id}`);
      return state.titles.get(id);
    },
    port: {
      askQuestions: vi.fn(async () => {
        calls.push("askQuestions");
        return state.questions;
      }),
      answerQuestion: vi.fn(
        async (side: Side, id: number, choice: number | null) => {
          calls.push(`answer-question ${side} ${id} ${choice}`);
          return state.sendOk;
        },
      ),
      answerRemoval: vi.fn(
        async (from: Side, nakaId: number, scId: number, remove: boolean) => {
          calls.push(`answer-removal ${from} ${nakaId} ${scId} ${remove}`);
          return state.sendOk;
        },
      ),
      hideQuestion: vi.fn(async (key: QuestionKey) => {
        calls.push(`hide-question ${key}`);
        return state.sendOk;
      }),
      askCards: vi.fn(async () => {
        calls.push("askCards");
        return state.answer;
      }),
      rate: vi.fn(
        async (ids: ContentIds, label: RatingLabel, rating: number) => {
          calls.push(`rate ${keyOf(ids)} ${label} ${rating}`);
          return state.sendOk;
        },
      ),
      dismiss: vi.fn(async (ids: ContentIds, label: RatingLabel) => {
        calls.push(`dismiss ${keyOf(ids)} ${label}`);
        return state.sendOk;
      }),
    },
    show: (view, handlers) => {
      shown.push({ view, handlers });
    },
    hide: () => {
      hidden++;
    },
  };
  const last = () => {
    const entry = shown[shown.length - 1];
    if (entry === undefined) throw new Error("nothing shown");
    return entry;
  };
  return {
    ports,
    clock,
    calls,
    shown,
    state,
    hidden: () => hidden,
    /** Steps past the grace of an entry just drawn, so that a click on it counts. */
    ready: () => clock.advance(GRACE_MS),
    last,
    handlersOf: (key: string): RatingHandlers => last().handlers.entry(key),
    viewOf: (key: string) =>
      last().view.entries.find((e) => e.key === key)?.view,
    keys: () => last().view.entries.map((e) => e.key),
    questionHandlersOf: (key: QuestionKey): QuestionHandlers =>
      last().handlers.question(key),
    questionViewOf: (key: QuestionKey) =>
      last().view.questions.find((q) => q.key === key)?.view,
    questionKeys: () => last().view.questions.map((q) => q.key),
  };
}

const READS = ["askCards", "askQuestions", "titleOf"];
const isRead = (call: string): boolean =>
  READS.some((read) => call.startsWith(read));

export const asksOf = (calls: string[]): string[] =>
  calls.filter((c) => c.startsWith("askCards"));
export const questionAsksOf = (calls: string[]): string[] =>
  calls.filter((c) => c.startsWith("askQuestions"));
export const sendsOf = (calls: string[]): string[] =>
  calls.filter((c) => !isRead(c));

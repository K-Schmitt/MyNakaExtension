import { vi } from "vitest";
import type { EndPorts } from "../src/content/ui/end-block";
import type { QuestionHandlers } from "../src/content/ui/question-render";
import type { QuestionView } from "../src/content/ui/question-view";
import type { RatingHandlers } from "../src/content/ui/rating-render";
import { GRACE_MS } from "../src/content/ui/rating-session";
import type { RatingView } from "../src/content/ui/rating-view";
import type { ContentIds } from "../src/core/finish-event";
import type { RatingCard, RatingLabel } from "../src/core/rating-cards";
import type { AmbiguityOffer } from "../src/sw/question-offers";
import type { CardAnswer } from "../src/sw/rating-answers";

export async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

// A fake clock: set() queues, advance(ms) runs what is due in order, flushing microtasks in between.
export function fakeClock() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    timer: {
      set(fn: () => void, ms: number): unknown {
        const id = next++;
        pending.set(id, { at: now + ms, fn });
        return id;
      },
      clear(handle: unknown): void {
        pending.delete(handle as number);
      },
    },
    count: () => pending.size,
    now: () => now,
    async advance(ms: number): Promise<void> {
      const target = now + ms;
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (due === undefined) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await flush();
      }
      now = target;
      await flush();
    },
  };
}

const keyOf = (ids: ContentIds): string =>
  `${ids.contentId}:${ids.season ?? ""}:${ids.episode ?? ""}`;

export const FILM_IDS: ContentIds = { contentId: 9 };
export const EP_IDS: ContentIds = { contentId: 5, season: 1, episode: 1 };
export const OTHER_IDS: ContentIds = { contentId: 7 };

/** The ambiguity a series waits on (content 5): two candidates. */
export const QUESTION: AmbiguityOffer = {
  kind: "ambiguity",
  key: "ambiguity:naka:5",
  side: "naka",
  id: 5,
  title: "Une série",
  candidates: [
    { id: 2005, title: "Une série", year: 2005, type: "serie" },
    { id: 2006, title: "Une série", year: 2006, type: "serie" },
  ],
};

/** A card-less answer: the title waits on `QUESTION`; `over` adds the sending flag or a last answer. */
export function questionAnswer(over: Partial<CardAnswer> = {}): CardAnswer {
  return { card: null, pauseFromPercent: 0, question: QUESTION, ...over };
}

export function answer(card: RatingCard, start?: number): CardAnswer {
  return {
    card,
    pauseFromPercent: 0,
    ...(start === undefined ? {} : { start }),
  };
}

// The worker as the block sees it: answers are scripted per ids, in order; the last one repeats.
export function fakePorts() {
  const clock = fakeClock();
  const scripted = new Map<string, (CardAnswer | undefined)[]>();
  const calls: string[] = [];
  const shown: { view: RatingView; handlers: RatingHandlers }[] = [];
  const questions: { view: QuestionView; handlers: QuestionHandlers }[] = [];
  let hidden = 0;
  const fail = { send: false, ask: false };
  const ports: EndPorts = {
    opening: () => {},
    timer: clock.timer,
    now: clock.now,
    port: {
      askCard: vi.fn(async (ids: ContentIds) => {
        calls.push(`ask ${keyOf(ids)}`);
        if (fail.ask) throw new Error("ask rejected");
        const list = scripted.get(keyOf(ids)) ?? [];
        return list.length > 1 ? list.shift() : list[0];
      }),
      rate: vi.fn(
        async (ids: ContentIds, label: RatingLabel, rating: number) => {
          calls.push(`rate ${keyOf(ids)} ${label} ${rating}`);
          return !fail.send;
        },
      ),
      dismiss: vi.fn(async (ids: ContentIds, label: RatingLabel) => {
        calls.push(`dismiss ${keyOf(ids)} ${label}`);
        return !fail.send;
      }),
      answerQuestion: vi.fn(
        async (side: string, id: number, choice: number | null) => {
          calls.push(`answer ${side} ${id} ${choice}`);
          return !fail.send;
        },
      ),
    },
    showQuestion: (view, handlers) => {
      questions.push({ view, handlers });
    },
    show: (view, handlers) => {
      shown.push({ view, handlers });
    },
    hide: () => {
      hidden++;
    },
  };
  return {
    ports,
    clock,
    fail,
    calls,
    shown,
    questions,
    hidden: () => hidden,
    /** Steps past the grace of a label just drawn, so that a click on it counts. */
    ready: () => clock.advance(GRACE_MS),
    last() {
      const entry = shown[shown.length - 1];
      if (entry === undefined) throw new Error("nothing shown");
      return entry;
    },
    lastQuestion() {
      const entry = questions[questions.length - 1];
      if (entry === undefined) throw new Error("no question shown");
      return entry;
    },
    script(ids: ContentIds, ...list: (CardAnswer | undefined)[]) {
      scripted.set(keyOf(ids), list);
    },
  };
}

export const asks = (calls: string[]): string[] =>
  calls.filter((c) => c.startsWith("ask"));

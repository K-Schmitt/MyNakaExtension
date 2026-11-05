import { vi } from "vitest";
import type { HomeHandlers, HomePorts } from "../src/content/ui/home-block";
import type { HomeView } from "../src/content/ui/home-view";
import type { RatingHandlers } from "../src/content/ui/rating-render";
import { GRACE_MS } from "../src/content/ui/rating-session";
import type { ContentIds } from "../src/core/finish-event";
import type { RatingCard, RatingLabel } from "../src/core/rating-cards";
import type { CardsAnswer } from "../src/sw/rating-answers";
import { fakeClock } from "./end-block-fakes";

const keyOf = (ids: ContentIds): string =>
  `${ids.contentId}:${ids.season ?? ""}:${ids.episode ?? ""}`;

export const entryOf = (card: RatingCard, start?: number) => ({
  card,
  ...(start === undefined ? {} : { start }),
});

export const answerOf = (...cards: RatingCard[]): CardsAnswer => ({
  cards: cards.map((card) => entryOf(card)),
});

// The worker as the home panel sees it: `answer` is what the next askCards returns (the test changes it
// to play the worker's progress); sends are recorded and succeed unless `fail.send` is set.
export function homeWorld() {
  const clock = fakeClock();
  const calls: string[] = [];
  const shown: { view: HomeView; handlers: HomeHandlers }[] = [];
  let hidden = 0;
  const state = {
    answer: undefined as CardsAnswer | undefined,
    sendOk: true,
  };
  const ports: HomePorts = {
    timer: clock.timer,
    now: clock.now,
    port: {
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
  };
}

export const asksOf = (calls: string[]): string[] =>
  calls.filter((c) => c.startsWith("askCards"));
export const sendsOf = (calls: string[]): string[] =>
  calls.filter((c) => !c.startsWith("askCards"));

// The rating card of a finished content, built from what the finish already knows: its `done` outcome, its
// event and the Naka catalogue entry its ONE content read returned (no second Naka read). The season and
// series ends come from the one rule of core/season-end. The owner's rating of a saison or a série is read
// (behind the finish's breaker) only when that label would be asked, so at most two reads.

import { contentKeyOf } from "../core/finish-event";
import type { FinishEvent, FinishOutcome } from "../core/finish-handler";
import {
  type CardTarget,
  pendingOf,
  type RatingCard,
  upsertCard,
} from "../core/rating-cards";
import { type SeasonEnd, seasonEnd } from "../core/season-end";
import type { Store } from "../ext/store";
import type { NakaItem } from "../naka/naka-client";
import type { ProductState } from "../sc/sc-client";

export type DoneOutcome = Extract<FinishOutcome, { kind: "done" }>;

export type CardInput = {
  outcome: DoneOutcome;
  event: FinishEvent;
  item: NakaItem;
  productState(productId: number): Promise<ProductState>;
  at: number;
};

const FILM_END: SeasonEnd = { lastOfSeason: false, seriesFinished: false };

function endOf({ outcome, event, item }: CardInput): SeasonEnd {
  const { season, episode } = event.naka;
  if (season === undefined || episode === undefined) return FILM_END;
  return seasonEnd(
    { season, episode },
    { lastSeason: item.numberOfSeasons },
    outcome.lastOfSeason === true,
  );
}

function isAsked(label: CardTarget["label"], end: SeasonEnd): boolean {
  if (label === "saison") return end.lastOfSeason;
  return label === "série" && end.seriesFinished;
}

async function withCurrent(
  target: CardTarget,
  end: SeasonEnd,
  productState: CardInput["productState"],
): Promise<CardTarget> {
  if (!isAsked(target.label, end)) return target;
  const { rating } = await productState(target.productId);
  return { ...target, current: rating };
}

async function targetsOf(
  input: CardInput,
  end: SeasonEnd,
): Promise<CardTarget[]> {
  const targets: CardTarget[] = [];
  for (const target of input.outcome.ratingTargets) {
    targets.push(await withCurrent(target, end, input.productState));
  }
  return targets;
}

export async function buildCard(input: CardInput): Promise<RatingCard> {
  const { event, item, at } = input;
  const end = endOf(input);
  const targets = await targetsOf(input, end);
  const { season, episode } = event.naka;
  return {
    key: contentKeyOf(event.naka),
    contentId: event.naka.contentId,
    title: item.title,
    ...(season === undefined || episode === undefined
      ? {}
      : { season, episode }),
    at,
    targets,
    pending: pendingOf(targets, end.lastOfSeason, end.seriesFinished),
    given: {},
    seriesFinished: end.seriesFinished,
  };
}

/** Puts the card first in the stored ratings. A store that cannot be read or written rejects. */
export async function storeCard(
  store: Pick<Store, "loadRatings" | "saveRatings">,
  card: RatingCard,
): Promise<void> {
  await store.saveRatings(upsertCard(await store.loadRatings(), card));
}

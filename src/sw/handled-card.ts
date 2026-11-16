// The rating card of a title already handled that has none: finished by an older version, or before
// its card existed. Its explicit finish is free (the pre-check sees it handled), so the pause case makes no
// card and its rate would be refused forever. The card is built READ-ONLY: the stored pair, one Naka
// content read (the job's first Naka call), the SensCritique product of the film or of the episode, and
// its state. No markDone, no unwish, no finish record, no slot of the hour's budget. The rate then goes
// through sendRating, whose binding check runs before the ProductRate. Any doubt makes no card.

import { cardlessLabel } from "../core/cardless-label";
import { contentKeyOf } from "../core/finish-event";
import type { Pair } from "../core/list-diff";
import type { CardTarget, RatingCard } from "../core/rating-cards";
import type { RateMessage } from "../ext/rating-messages";
import type { NakaItem } from "../naka/naka-client";
import { UNIVERSE } from "../sc/sc-queries";
import { findEpisode } from "../sc/season-episodes";
import { type JobDeps, jobNaka } from "./job-deps";
import { storeCard } from "./rating-card-builder";
import { readNakaItem } from "./read-ports";

type Cardless = "film" | "épisode";

const KIND: Record<Cardless, { mediaType: string; universe: number }> = {
  film: { mediaType: "movie", universe: UNIVERSE.film },
  épisode: { mediaType: "tv", universe: UNIVERSE.episode },
};

function cardlessOf(msg: RateMessage): Cardless | undefined {
  const label = cardlessLabel(msg);
  return label === "film" || label === "épisode" ? label : undefined;
}

// The SensCritique product rated under the label: the film itself, or the episode of the mapped series.
async function productOf(
  deps: JobDeps,
  pair: Pair,
  msg: RateMessage,
  label: Cardless,
): Promise<number | undefined> {
  const { season, episode } = msg;
  if (label === "film") return pair.scId;
  if (season === undefined || episode === undefined) return undefined;
  const info = await deps.sc.seasonInfo(pair.scId, season);
  return findEpisode(info.episodes, season, episode)?.productId;
}

// The one target, with the owner's current rating; none when the product is not of the label's kind.
async function targetOf(
  deps: JobDeps,
  pair: Pair,
  msg: RateMessage,
  label: Cardless,
): Promise<CardTarget | undefined> {
  const productId = await productOf(deps, pair, msg, label);
  if (productId === undefined) return undefined;
  const { universe, rating } = await deps.sc.productState(productId);
  if (universe !== KIND[label].universe) return undefined;
  return { label, productId, current: rating };
}

function cardOf(
  msg: RateMessage,
  item: NakaItem,
  target: CardTarget,
  at: number,
): RatingCard {
  const { contentId, season, episode } = msg;
  return {
    key: contentKeyOf(msg),
    contentId,
    title: item.title,
    ...(season === undefined || episode === undefined
      ? {}
      : { season, episode }),
    at,
    targets: [target],
    pending: [target.label],
    given: {},
    seriesFinished: false,
  };
}

/** Builds, stores and returns the card; undefined (nothing stored) when anything does not fit. */
export async function handledCard(
  deps: JobDeps,
  msg: RateMessage,
): Promise<RatingCard | undefined> {
  const label = cardlessOf(msg);
  if (label === undefined) return undefined;
  const { mapping } = await deps.store.loadState();
  const pair = mapping.find((mapped) => mapped.nakaId === msg.contentId);
  if (pair === undefined) return undefined;
  const naka = jobNaka(deps);
  const item = await readNakaItem(naka, deps.limiters.naka, msg.contentId);
  if (item?.mediaType !== KIND[label].mediaType) return undefined;
  const target = await targetOf(deps, pair, msg, label);
  if (target === undefined) return undefined;
  const card = cardOf(msg, item, target, deps.now());
  await storeCard(deps.store, card);
  return card;
}

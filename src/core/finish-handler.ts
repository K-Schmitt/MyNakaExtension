// End of viewing on Naka: marks the title seen on SensCritique, once, and says what can be rated.
//
// Film: the pair is mapped and SETTLED, and that state is saved BEFORE any write, so that no later
// sync can re-wish the film whatever fails or crashes after the save (a settled pair never acts).
// Episode: the series pair is never settled and the series is never unwished; one save, after the write.
// A product already done on SensCritique is never rewritten (its date stays) but still returns its rating
// targets, each with the owner's current rating, so the owner can rate or change it. An episode also says
// whether it is the last of its season (the highest episode number the season lists).
// A product of the wrong kind (a series under a film event, a film listed as an episode) is never
// written: the handler rejects before any save or write.

import type { ProductState } from "../sc/sc-product-state";
import { UNIVERSE } from "../sc/sc-queries";
import { findEpisode, type ScEpisode } from "../sc/season-episodes";
import {
  type CheckedEvent,
  contentKey,
  type FinishEvent,
  parseEvent,
} from "./finish-event";
import { matchOnSc } from "./finish-match";
import type { Pair } from "./list-diff";
import {
  addPending,
  isHandled,
  markHandled,
  type SyncState,
  settlePair,
  upsertMapping,
} from "./state";
import type { Candidate } from "./title-match";
import { isWatchComplete, type Thresholds } from "./watch-trigger";

export type { FinishEvent } from "./finish-event";

export type FinishPorts = {
  searchSc(q: string): Promise<Candidate[]>;
  productState(productId: number): Promise<ProductState>;
  unwish(productId: number): Promise<void>;
  markDone(productId: number, isoDate: string): Promise<void>;
  seasonInfo(
    seriesProductId: number,
    season: number,
  ): Promise<{ seasonProductId?: number; episodes: ScEpisode[] }>;
  today(): string;
  load(): Promise<SyncState>;
  save(state: SyncState): Promise<void>;
};

export type RatingTarget = {
  label: "film" | "épisode" | "saison" | "série";
  productId: number;
  current: number | null;
};

export type FinishOutcome =
  | { kind: "ignored"; reason: "below-threshold" | "already-handled" }
  | { kind: "needs-choice"; candidateIds: number[] }
  | { kind: "not-found" }
  | { kind: "done"; ratingTargets: RatingTarget[]; lastOfSeason?: boolean };

type Found = { state: SyncState; key: string; pair: Pair };

// An explicit "seen" completes whatever the progress; a bad threshold throws for both sources.
// The threshold is the one of the event's kind. Exported for the worker's local pre-check (Ruling 18):
// one rule decides, before and in the handler.
export function isComplete(
  event: Pick<CheckedEvent, "source" | "progress" | "kind">,
  thresholds: Thresholds,
): boolean {
  const signal = {
    progress: event.progress,
    markedWatched: event.source === "explicit",
  };
  return isWatchComplete(signal, thresholds[event.kind]);
}

async function askOwner(
  state: SyncState,
  nakaId: number,
  candidateIds: number[],
  ports: FinishPorts,
): Promise<FinishOutcome> {
  await ports.save(
    addPending(state, {
      kind: "ambiguity",
      side: "naka",
      id: nakaId,
      candidateIds,
    }),
  );
  return { kind: "needs-choice", candidateIds };
}

async function finishFilm(
  { state, key, pair }: Found,
  ports: FinishPorts,
): Promise<FinishOutcome> {
  const { isDone, isWished, universe, rating } = await ports.productState(
    pair.scId,
  );
  if (universe !== UNIVERSE.film) {
    throw new Error("finish: the SensCritique product is not a film");
  }
  const state1 = settlePair(state, pair);
  await ports.save(state1);
  if (isWished) await ports.unwish(pair.scId);
  if (!isDone) await ports.markDone(pair.scId, ports.today());
  await ports.save(markHandled(state1, key));
  const film = {
    label: "film",
    productId: pair.scId,
    current: rating,
  } as const;
  return { kind: "done", ratingTargets: [film] };
}

function episodeTargets(
  episode: { productId: number; current: number | null },
  seasonProductId: number | undefined,
  seriesId: number,
): RatingTarget[] {
  const season =
    seasonProductId === undefined
      ? []
      : [
          {
            label: "saison",
            productId: seasonProductId,
            current: null,
          } as const,
        ];
  return [
    { label: "épisode", ...episode },
    ...season,
    { label: "série", productId: seriesId, current: null },
  ];
}

function isLastOfSeason(
  episodes: ScEpisode[],
  season: number,
  number: number,
): boolean {
  const numbers = episodes
    .filter((e) => e.season === season)
    .map((e) => e.episode);
  return number === Math.max(...numbers);
}

async function finishEpisode(
  { state, key, pair }: Found,
  { season, episode }: { season: number; episode: number },
  ports: FinishPorts,
): Promise<FinishOutcome> {
  const info = await ports.seasonInfo(pair.scId, season);
  const found = findEpisode(info.episodes, season, episode);
  if (!found) return { kind: "not-found" };
  const { isDone, universe, rating } = await ports.productState(
    found.productId,
  );
  if (universe !== UNIVERSE.episode) {
    throw new Error("finish: the SensCritique product is not an episode");
  }
  if (!isDone) await ports.markDone(found.productId, ports.today());
  await ports.save(markHandled(state, key));
  const ratingTargets = episodeTargets(
    { productId: found.productId, current: rating },
    info.seasonProductId,
    pair.scId,
  );
  const lastOfSeason = isLastOfSeason(info.episodes, season, episode);
  return { kind: "done", ratingTargets, lastOfSeason };
}

export async function handleFinish(
  input: FinishEvent,
  ports: FinishPorts,
  thresholds: Thresholds,
): Promise<FinishOutcome> {
  const event = parseEvent(input);
  const state = await ports.load();
  if (!isComplete(event, thresholds)) {
    return { kind: "ignored", reason: "below-threshold" };
  }
  const key = contentKey(event);
  if (isHandled(state, key)) {
    return { kind: "ignored", reason: "already-handled" };
  }
  const match = await matchOnSc(state, event.contentId, event.titled, ports);
  if (match.kind === "not-found") return { kind: "not-found" };
  if (match.kind === "asked") {
    return { kind: "needs-choice", candidateIds: match.candidateIds };
  }
  if (match.kind === "needs-choice") {
    return askOwner(state, event.contentId, match.candidateIds, ports);
  }
  const mapped = match.isNew ? upsertMapping(state, match.pair) : state;
  const found = { state: mapped, key, pair: match.pair };
  return event.kind === "film"
    ? finishFilm(found, ports)
    : finishEpisode(found, event, ports);
}

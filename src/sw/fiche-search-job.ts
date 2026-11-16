// « Chercher » on the title page (fiche-search): the owner's own words searched on SensCritique, in the
// universe of Naka's item for the tab's page (a film's or a series'), one SC limiter slot. Only for the
// content the tab's page shows (fiche-registry), else it rejects before any request. Read-only: the
// results, each product once and at most MAX_SEARCH_RESULTS in SensCritique's order, are issued to the
// tab's page as candidates (fiche-roles), added to the ones it holds, so that fiche-link may link one
// after a trusted click. A failed read rejects and issues nothing. One fiche-search per tab is in flight:
// a newer one of the same tab supersedes it (fiche-tab-turns); its reads still waiting are then skipped
// when their slot comes, and it answers no candidates and issues nothing.

import { nakaToTitled, scToCandidate } from "../core/adapt-titles";
import { toCandidates } from "../core/questions";
import type { QuestionCandidate } from "../core/state";
import type { Candidate, MediaType } from "../core/title-match";
import {
  type FicheSearchAnswer,
  MAX_SEARCH_RESULTS,
} from "../ext/fiche-answers";
import type { FicheSearchMessage } from "../ext/fiche-messages";
import { WISH_UNIVERSE } from "../sc/sc-queries";
import type { FicheAsker } from "./fiche-asker";
import { type TabTurn, turnLimiters } from "./fiche-tab-turns";
import { type JobDeps, jobNaka } from "./job-deps";
import { readNakaItem } from "./read-ports";

class NotShownError extends Error {
  constructor() {
    super("fiche: the tab does not show this content");
  }
}

const NONE: FicheSearchAnswer = { candidates: [] };

async function typeOf(
  deps: JobDeps,
  contentId: number,
): Promise<MediaType | undefined> {
  const { naka } = deps.limiters;
  const item = await readNakaItem(jobNaka(deps), naka, contentId);
  return item === undefined ? undefined : nakaToTitled(item).type;
}

// The SC client filters by universe already; a result of another type is still never offered.
async function found(
  deps: JobDeps,
  type: MediaType,
  query: string,
): Promise<Candidate[]> {
  const universe = WISH_UNIVERSE[type];
  const items = await deps.limiters.sc.run(() =>
    deps.sc.search(query, universe),
  );
  const candidates = items.flatMap((item) => scToCandidate(item) ?? []);
  return candidates.filter((candidate) => candidate.type === type);
}

function firstResults(results: readonly Candidate[]): QuestionCandidate[] {
  const ids = [...new Set(results.map((result) => result.id))];
  return toCandidates(results, ids.slice(0, MAX_SEARCH_RESULTS));
}

async function searched(
  deps: JobDeps,
  msg: FicheSearchMessage,
): Promise<QuestionCandidate[]> {
  const type = await typeOf(deps, msg.contentId);
  if (type === undefined) return [];
  return firstResults(await found(deps, type, msg.query));
}

// undefined once a newer fiche-search of the tab started: a failed read of a superseded turn is not one.
async function whileLive<T>(
  turn: TabTurn,
  read: () => Promise<T>,
): Promise<T | undefined> {
  try {
    const value = await read();
    return turn.live() ? value : undefined;
  } catch (error) {
    if (turn.live()) throw error;
    return undefined;
  }
}

async function answered(
  deps: JobDeps,
  { registry, tabId }: FicheAsker,
  msg: FicheSearchMessage,
  turn: TabTurn,
): Promise<FicheSearchAnswer> {
  if (!(await registry.shows(tabId, msg.contentId))) throw new NotShownError();
  const limiters = turnLimiters(deps.limiters, turn);
  const candidates = await whileLive(turn, () =>
    searched({ ...deps, limiters }, msg),
  );
  if (candidates === undefined || !turn.live()) return NONE;
  const ids = candidates.map((candidate) => candidate.id);
  await registry.offer(tabId, msg.contentId, ids);
  return { candidates };
}

export async function ficheSearchJob(
  deps: JobDeps,
  asker: FicheAsker,
  msg: FicheSearchMessage,
  turn: TabTurn,
): Promise<FicheSearchAnswer> {
  try {
    return await answered(deps, asker, msg, turn);
  } finally {
    turn.end();
  }
}

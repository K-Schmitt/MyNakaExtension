// The title page's SensCritique block (fiche-info). The page is untrusted: the worker reads Naka's own
// item for the content and answers notfound unless its TMDB id and media type are the message's (the tab
// takes them from its address); everything after uses Naka's item, never the message's words. Then the
// linked product (mapping, then display links), or a search and matchTitle: a sure match is shown without
// being saved (the list sync stays as it was), an ambiguous one offers its candidates, none is notfound.
// Read-only. The tab's issued products are reset at the start of every fiche-info (nothing of the earlier
// page stays writable during the reads), then hold what the answer named; a failed read rejects (the tab
// shows its error line) and leaves the tab with nothing issued. One fiche-info per tab is in flight: a
// newer one of the same tab supersedes it; its reads still waiting are then skipped when their slot
// comes (the slot goes to the next waiter, fiche-tab-turns), and it answers notfound and leaves the
// registry to the newer one.

import { nakaToTitled } from "../core/adapt-titles";
import { toCandidates } from "../core/questions";
import { type MediaType, matchTitle } from "../core/title-match";
import type { FicheInfo } from "../ext/fiche-answers";
import type { FicheInfoMessage } from "../ext/fiche-messages";
import type { NakaItem } from "../naka/naka-client";
import { linkedProduct } from "./fiche-link-lookup";
import { readFicheProduct } from "./fiche-product";
import type { FicheRegistry } from "./fiche-registry";
import type { FicheTitle } from "./fiche-registry-schema";
import { searchFiche } from "./fiche-search";
import { type TabTurn, turnLimiters } from "./fiche-tab-turns";
import { type JobDeps, jobNaka } from "./job-deps";
import { readNakaItem } from "./read-ports";

export type FicheAsker = { registry: FicheRegistry; tabId: number };

type Resolved = { info: FicheInfo; title?: FicheTitle; candidates: number[] };

const NOT_FOUND: Resolved = { info: { state: "notfound" }, candidates: [] };

async function naka(
  deps: JobDeps,
  msg: FicheInfoMessage,
): Promise<NakaItem | undefined> {
  const item = await readNakaItem(
    jobNaka(deps),
    deps.limiters.naka,
    msg.contentId,
  );
  const same = item?.tmdbId === msg.tmdbId && item.mediaType === msg.mediaType;
  return same ? item : undefined;
}

async function shown(
  deps: JobDeps,
  state: "linked" | "matched",
  productId: number,
  type: MediaType,
): Promise<Resolved> {
  const product = await readFicheProduct(deps, productId, type);
  if (product === undefined) return NOT_FOUND;
  const title = { productId, type };
  return { info: { state, product }, title, candidates: [] };
}

async function searched(deps: JobDeps, item: NakaItem): Promise<Resolved> {
  const titled = nakaToTitled(item);
  const found = await searchFiche(deps, item);
  const match = matchTitle(titled, found);
  if (match.kind === "match") {
    return shown(deps, "matched", match.id, titled.type);
  }
  if (match.kind === "none") return NOT_FOUND;
  const candidates = toCandidates(found, match.ids);
  const ids = candidates.map((candidate) => candidate.id);
  return { info: { state: "choose", candidates }, candidates: ids };
}

async function resolved(
  deps: JobDeps,
  msg: FicheInfoMessage,
): Promise<Resolved> {
  const item = await naka(deps, msg);
  if (item === undefined) return NOT_FOUND;
  const type = nakaToTitled(item).type;
  const linked = await linkedProduct(deps.store, msg.contentId);
  if (linked !== undefined) return shown(deps, "linked", linked, type);
  return searched(deps, item);
}

// The registry is the newest turn's: a superseded one leaves it as the newer one set it.
async function answered(
  deps: JobDeps,
  { registry, tabId }: FicheAsker,
  msg: FicheInfoMessage,
  turn: TabTurn,
): Promise<FicheInfo> {
  let outcome: Resolved = NOT_FOUND;
  await registry.open(tabId, msg.contentId, undefined, []);
  try {
    const limiters = turnLimiters(deps.limiters, turn);
    outcome = await resolved({ ...deps, limiters }, msg);
    return turn.live() ? outcome.info : NOT_FOUND.info;
  } catch (error) {
    if (turn.live()) throw error;
    return NOT_FOUND.info;
  } finally {
    if (turn.live()) {
      const { title, candidates } = outcome;
      await registry.open(tabId, msg.contentId, title, candidates);
    }
  }
}

export async function ficheInfoJob(
  deps: JobDeps,
  asker: FicheAsker,
  msg: FicheInfoMessage,
  turn: TabTurn,
): Promise<FicheInfo> {
  try {
    return await answered(deps, asker, msg, turn);
  } finally {
    turn.end();
  }
}

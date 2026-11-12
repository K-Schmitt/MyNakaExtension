// The title page's SensCritique block (fiche-info). The page is untrusted: the worker reads Naka's own
// item for the content and answers notfound unless its TMDB id and media type are the message's (the tab
// takes them from its address); everything after uses Naka's item, never the message's words. Then the
// linked product (mapping, then display links), or a search and matchTitle: a sure match is shown without
// being saved (the list sync stays as it was), an ambiguous one offers its candidates, none is notfound.
// Read-only. The tab's issued products are reset by every fiche-info, then hold what the answer named; a
// failed read rejects (the tab shows its error line) and leaves the tab with nothing issued.

import { nakaToTitled } from "../core/adapt-titles";
import { toCandidates } from "../core/questions";
import { type MediaType, matchTitle } from "../core/title-match";
import type { FicheInfo } from "../ext/fiche-answers";
import type { FicheInfoMessage } from "../ext/fiche-messages";
import type { NakaItem } from "../naka/naka-client";
import { linkedProduct } from "./fiche-link-lookup";
import { readFicheProduct } from "./fiche-product";
import type { FicheRegistry } from "./fiche-registry";
import { searchFiche } from "./fiche-search";
import { type JobDeps, jobNaka } from "./job-deps";
import { readNakaItem } from "./read-ports";

export type FicheAsker = { registry: FicheRegistry; tabId: number };

type Resolved = { info: FicheInfo; title?: number; issued: number[] };

const NOT_FOUND: Resolved = { info: { state: "notfound" }, issued: [] };

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
  return { info: { state, product }, title: productId, issued: [] };
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
  const issued = candidates.map((candidate) => candidate.id);
  return { info: { state: "choose", candidates }, issued };
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

export async function ficheInfoJob(
  deps: JobDeps,
  { registry, tabId }: FicheAsker,
  msg: FicheInfoMessage,
): Promise<FicheInfo> {
  let outcome: Resolved = NOT_FOUND;
  try {
    outcome = await resolved(deps, msg);
    return outcome.info;
  } finally {
    await registry.open(tabId, msg.contentId, outcome.title, outcome.issued);
  }
}

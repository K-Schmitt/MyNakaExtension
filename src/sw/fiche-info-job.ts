// The title page's SensCritique block (fiche-info): the linked product (mapping, then display links), or a
// search and matchTitle. A sure match is shown without being saved (the list sync stays as it was); an
// ambiguous one offers its candidates; none is notfound. Read-only; what the answer names is issued to
// the asking tab for that content, so that only those products can be written later. A failed read
// rejects (the tab shows its error line) and issues nothing.

import { toCandidates } from "../core/questions";
import { matchTitle } from "../core/title-match";
import type { FicheInfo } from "../ext/fiche-answers";
import type { FicheInfoMessage } from "../ext/fiche-messages";
import { linkedProduct } from "./fiche-link-lookup";
import { readFicheProduct } from "./fiche-product";
import type { FicheRegistry } from "./fiche-registry";
import { ficheTitled, searchFiche } from "./fiche-search";
import type { JobDeps } from "./job-deps";

export type FicheAsker = { registry: FicheRegistry; tabId: number };

async function shown(
  deps: JobDeps,
  asker: FicheAsker,
  msg: FicheInfoMessage,
  state: "linked" | "matched",
  productId: number,
): Promise<FicheInfo> {
  const product = await readFicheProduct(deps, productId);
  asker.registry.issueTitle(asker.tabId, msg.contentId, productId);
  return { state, product };
}

async function searched(
  deps: JobDeps,
  asker: FicheAsker,
  msg: FicheInfoMessage,
): Promise<FicheInfo> {
  const titled = ficheTitled(msg);
  const found = await searchFiche(deps, msg, titled);
  const match = matchTitle(titled, found);
  if (match.kind === "match") {
    return shown(deps, asker, msg, "matched", match.id);
  }
  if (match.kind === "none") return { state: "notfound" };
  const candidates = toCandidates(found, match.ids);
  const ids = candidates.map((candidate) => candidate.id);
  asker.registry.issue(asker.tabId, msg.contentId, ids);
  return { state: "choose", candidates };
}

export async function ficheInfoJob(
  deps: JobDeps,
  asker: FicheAsker,
  msg: FicheInfoMessage,
): Promise<FicheInfo> {
  const linked = await linkedProduct(deps.store, msg.contentId);
  if (linked !== undefined) {
    return shown(deps, asker, msg, "linked", linked);
  }
  return searched(deps, asker, msg);
}

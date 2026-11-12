// « Relier » on the title page without a rating (fiche-link), for a product issued to the asking tab for
// that content. A title the extension knows (unlinked on the Naka side, or with an open question) takes
// the status page's link-title path: both sites read, then the mapping. Any other title gets a
// display-only link (§7 choice 6), kept apart from the mapping and the sync, at most MAX_FICHE_LINKS of
// them: the first key goes before a new one. Unreadable links are replaced (they only spare a search).

import { openAmbiguity } from "../core/questions";
import type { SyncState } from "../core/state";
import { type FicheLinks, MAX_FICHE_LINKS } from "../ext/fiche-links-schema";
import type { FicheLinkMessage } from "../ext/fiche-messages";
import type { Store } from "../ext/store";
import type { FicheAsker } from "./fiche-info-job";
import { assertIssued } from "./fiche-issued";
import type { JobDeps } from "./job-deps";
import { linkTitleJob } from "./link-job";

export type LinkAnswer = { ok: true };

function knownTitle(state: SyncState, contentId: number): boolean {
  const unlinked = state.unlinked.some(
    (item) => item.side === "naka" && item.id === contentId,
  );
  return unlinked || openAmbiguity(state, "naka", contentId) !== undefined;
}

async function storedLinks(store: Store): Promise<FicheLinks> {
  try {
    return await store.loadFicheLinks();
  } catch {
    return {};
  }
}

export function withLink(
  links: FicheLinks,
  contentId: number,
  productId: number,
): FicheLinks {
  const key = String(contentId);
  const others = Object.entries(links).filter(([known]) => known !== key);
  const kept = others.length >= MAX_FICHE_LINKS ? others.slice(1) : others;
  return Object.fromEntries([...kept, [key, productId]]);
}

async function saveDisplayLink(store: Store, msg: FicheLinkMessage) {
  const links = await storedLinks(store);
  await store.saveFicheLinks(withLink(links, msg.contentId, msg.productId));
}

export async function ficheLinkJob(
  deps: JobDeps,
  asker: FicheAsker,
  msg: FicheLinkMessage,
): Promise<LinkAnswer> {
  await assertIssued(asker, msg.contentId, msg.productId);
  const { contentId: id, productId: otherId } = msg;
  if (knownTitle(await deps.store.loadState(), id)) {
    await linkTitleJob(deps, { type: "link-title", side: "naka", id, otherId });
  } else {
    await saveDisplayLink(deps.store, msg);
  }
  return { ok: true };
}

// A film rated from its title page (Q9, Q11, Q12): linked first when it has no pair, then the pause path
// of the rating (rateJob: the card, or the explicit finish with its pre-check, its slot of the hour's
// budget and its binding, then the ProductRate), then out of « Ma liste » (live mode only). An error of
// the rate path is answered and stops there: no list removal; an error of the list removal is answered
// `{ sent: true, error }` (the rating went out). A finish that waited on the film's
// question is not run: rateJob's explicit finish is of the same key. A stored card that would rate another
// product than the one issued refuses the write before any request. Once the link holds, the film's state is
// read and kept as the undo record (fiche-undo-record), before any SensCritique write: after the link's
// checks, so a refused link still sends nothing. A rating that does not go out puts the older record back,
// unless its explicit finish wrote first (D9: then this film's record stays, and its `{ error }` answer
// carries the panel read from the stored record, ruling R2, so « Annuler » shows at once). An answer of a
// rating that went out carries the panel.
// With Naka's « Ma liste » button on screen (listByTab), the tab removes the film itself (fiche-list-removal);
// without it, a film the client removed is noted as listed on the undo record (ruling R10).

import { contentKeyOf } from "../core/finish-event";
import { cardFor } from "../core/rating-cards";
import type { PanelFlags, RateAnswer } from "../ext/fiche-answers";
import type { FicheRateMessage } from "../ext/fiche-messages";
import type { Store } from "../ext/store";
import { linkForRating } from "./fiche-link-pair";
import { leaveNakaList } from "./fiche-list-removal";
import { NotIssuedError } from "./fiche-mine-job";
import { afterRating, storedFlags } from "./fiche-panel-flags";
import {
  type KeptBefore,
  noteListed,
  putBackReplaced,
  recordBefore,
} from "./fiche-undo-record";
import type { JobDeps } from "./job-deps";
import { type RateEnd, rateJob } from "./rating-jobs";

async function assertCardProduct(
  store: Pick<Store, "loadRatings">,
  { contentId, productId }: FicheRateMessage,
): Promise<void> {
  const card = cardFor(await store.loadRatings(), contentKeyOf({ contentId }));
  const film = card?.targets.find((target) => target.label === "film");
  if (film !== undefined && film.productId !== productId) {
    throw new NotIssuedError();
  }
}

/** The panel of the stored record, offered only while it undoes this film; undefined otherwise. */
async function keptPanel(
  deps: JobDeps,
  msg: FicheRateMessage,
  { state }: KeptBefore,
): Promise<PanelFlags | undefined> {
  if (state === undefined) return undefined;
  try {
    const flags = await storedFlags(deps, msg, state);
    return flags.canUndo ? flags : undefined;
  } catch {
    return undefined;
  }
}

// The rating did not go out. Nothing written before it: the older record is put back. Its explicit finish
// wrote (D9): this film's record stays and the answer offers its « Annuler » (R2).
async function notSent(
  deps: JobDeps,
  msg: FicheRateMessage,
  kept: KeptBefore,
  { error, wroteBefore }: Required<Pick<RateEnd, "error">> & RateEnd,
): Promise<RateAnswer> {
  if (!wroteBefore) {
    await putBackReplaced(deps, kept);
    return { error };
  }
  const panel = await keptPanel(deps, msg, kept);
  return panel === undefined ? { error } : { error, panel };
}

export async function rateFilm(
  deps: JobDeps,
  msg: FicheRateMessage,
): Promise<RateAnswer> {
  const { contentId, productId, rating } = msg;
  await assertCardProduct(deps.store, msg);
  await linkForRating(deps.store, { nakaId: contentId, scId: productId });
  const kept = await recordBefore(deps, msg, "film");
  const { error, wroteBefore } = await rateJob(deps, {
    type: "rate",
    contentId,
    label: "film",
    rating,
  });
  if (error !== undefined) {
    return notSent(deps, msg, kept, { error, wroteBefore });
  }
  const leaving = await leaveNakaList(deps, contentId, msg.listByTab === true);
  // The tab could not read the button: the client's removal tells the record (R10).
  if (leaving.removed && msg.inMaListe === undefined) {
    await noteListed(deps, msg);
  }
  return {
    ...leaving.answer,
    panel: afterRating(kept.state, rating, kept.record, deps.now()),
  };
}

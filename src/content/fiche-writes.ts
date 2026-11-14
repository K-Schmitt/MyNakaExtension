// The owner's writes from the title page, each from a trusted click the UI checked: a film rated at once,
// a series after its confirmation, an episode of the shown season, a link to a candidate the worker
// offered (step 7's or a search's). One write at a time; an answer that comes once the visit is over
// changes nothing. A film's rating takes it out of Naka's « Ma liste » with Naka's own button when it is
// on screen (fiche-ma-liste).
// A film's or a series' rating brings the panel's new flags (« Annuler », « Retirer la note », the link).

import type { RateAnswer } from "../ext/fiche-answers";
import type { FicheRateMessage, FicheTarget } from "../ext/fiche-messages";
import { askInfo } from "./fiche-info-reader";
import { rateListFields, removedByTab, setMaListe } from "./fiche-ma-liste";
import {
  contentOf,
  type EpisodePlace,
  type FicheScope,
  storeEpisodes,
  withMine,
} from "./fiche-page";
import { searchOffers } from "./fiche-search";
import { forgetSeasons } from "./fiche-season-reader";
import { watchUndoExpiry } from "./fiche-undo-expiry";
import type { FicheOutcome } from "./fiche-view";

type Ending = { sent: boolean; outcome?: FicheOutcome };

// The worker's answer says whether the rating went out: `{ sent: true, error }` when a later step failed.
function endingOf(answer: RateAnswer | undefined): Ending {
  if (answer === undefined) return { sent: false, outcome: { kind: "failed" } };
  if ("ok" in answer) return { sent: true };
  if ("sent" in answer) {
    return {
      sent: true,
      outcome: { kind: "sent-with-error", error: answer.error },
    };
  }
  return { sent: false, outcome: { kind: "not-sent", error: answer.error } };
}

// An episode's rating names its place: its box shows the rating on its way, then its outcome.
async function sendRate(
  scope: FicheScope,
  msg: FicheRateMessage,
  apply: (rating: number, answer: RateAnswer | undefined) => void,
  place?: EpisodePlace,
): Promise<RateAnswer | undefined> {
  const { page } = scope;
  page.pending = "rating";
  page.outcome = undefined;
  page.ratedEpisode = place;
  scope.show();
  const answer = await scope.ports.rate(msg);
  if (!scope.live()) return answer;
  const ending = endingOf(answer);
  page.pending = undefined;
  page.outcome = ending.outcome;
  if (ending.sent) apply(msg.rating, answer);
  scope.show();
  return answer;
}

function rateMessage(
  contentId: number,
  target: FicheTarget,
  productId: number,
  rating: number,
  place?: EpisodePlace,
): FicheRateMessage {
  return { type: "fiche-rate", contentId, target, productId, rating, ...place };
}

async function sendTitleRate(scope: FicheScope, rating: number) {
  const { page } = scope;
  const product = page.info?.product;
  const contentId = contentOf(page);
  if (product === undefined || contentId === undefined) return;
  const film = page.title.mediaType === "movie";
  const target = film ? "film" : "série";
  const msg = {
    ...rateMessage(contentId, target, product.id, rating),
    ...(film ? rateListFields(scope) : {}),
  };
  const answer = await sendRate(scope, msg, (mine, sent) => {
    if (page.info?.product?.id !== product.id) return;
    const flags = sent !== undefined && "panel" in sent ? sent.panel : {};
    page.info = { ...page.info, product: { ...product, mine, ...flags } };
    watchUndoExpiry(scope);
  });
  if (msg.listByTab === true && removedByTab(answer)) setMaListe(scope, false);
}

export function rateTitle(scope: FicheScope, rating: number): void {
  const { page } = scope;
  if (page.pending !== undefined || page.info?.product === undefined) return;
  if (page.title.mediaType === "movie") {
    void sendTitleRate(scope, rating);
    return;
  }
  page.pending = "confirm-series";
  page.seriesRating = rating;
  scope.show();
}

export function confirmSeries(scope: FicheScope): void {
  const { page } = scope;
  const rating = page.seriesRating;
  if (page.pending !== "confirm-series" || rating === undefined) return;
  page.pending = undefined;
  page.seriesRating = undefined;
  void sendTitleRate(scope, rating);
}

export function cancelSeries(scope: FicheScope): void {
  const { page } = scope;
  if (page.pending !== "confirm-series") return;
  page.pending = undefined;
  page.seriesRating = undefined;
  scope.show();
}

export function rateEpisode(
  scope: FicheScope,
  episode: number,
  rating: number,
): void {
  const { page } = scope;
  const known = page.episodes.get(episode);
  const { season } = page;
  const contentId = contentOf(page);
  if (page.pending !== undefined || known === undefined) return;
  if (season === undefined || contentId === undefined) return;
  const place = { season, episode };
  const msg = rateMessage(contentId, "épisode", known.productId, rating, place);
  const apply = (mine: number) => {
    const episodes = page.read.get(season) ?? new Map();
    storeEpisodes(page, season, withMine(episodes, episode, mine));
  };
  void sendRate(scope, msg, apply, place);
}

function offered(scope: FicheScope, productId: number): boolean {
  const { info } = scope.page;
  if (searchOffers(scope.page, productId)) return true;
  if (info?.state !== "choose") return false;
  return (info.candidates ?? []).some((known) => known.id === productId);
}

export async function link(scope: FicheScope, productId: number) {
  const { page } = scope;
  const contentId = contentOf(page);
  if (page.pending !== undefined || contentId === undefined) return;
  if (!offered(scope, productId)) return;
  page.pending = "link";
  page.outcome = undefined;
  page.ratedEpisode = undefined;
  scope.show();
  const answer = await scope.ports.link({
    type: "fiche-link",
    contentId,
    productId,
  });
  if (!scope.live()) return;
  page.pending = undefined;
  if (answer === undefined) {
    page.outcome = { kind: "failed" };
    scope.show();
    return;
  }
  page.search = undefined;
  forgetSeasons(scope);
  await askInfo(scope);
}

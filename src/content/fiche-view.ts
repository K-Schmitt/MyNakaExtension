// What the title page controller shows: the title's SensCritique info, the shown season's episodes with
// their averages (and the owner's own rating once read), the write on its way and how the last one ended.

import type { FicheInfo } from "../ext/fiche-answers";
import type { JobError } from "../ext/job-error";

export type FicheEpisode = {
  productId: number;
  average: number | null;
  /** SensCritique's title of the episode, when it has one. */
  title?: string;
  /** Absent until read; null when the owner has not rated it. */
  mine?: number | null;
};

export type FicheOutcome =
  /** No answer, or a write the worker refused: the generic error line. */
  | { kind: "failed" }
  /** The rating did not reach SensCritique (the budget, a session…). */
  | { kind: "not-sent"; error: JobError }
  /** The rating reached SensCritique; what came after it (the Ma liste removal) failed. */
  | { kind: "sent-with-error"; error: JobError };

export type FichePending = "rating" | "confirm-series" | "link";

export type FicheView = {
  mediaType: "movie" | "tv";
  /** Absent while the worker has not answered. */
  info?: FicheInfo;
  season?: number;
  episodes: Map<number, FicheEpisode>;
  pending?: FichePending;
  /** The info's or the last write's ending; a season read has its own flag. */
  outcome?: FicheOutcome;
  /** The shown season's episode that `pending` (a rating) or `outcome` is about, when one is. */
  ratedEpisode?: number;
  /** The shown season's episodes could not be read. */
  seasonFailed?: true;
};

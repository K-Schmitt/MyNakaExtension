// What the title page controller shows: the title's SensCritique info, the shown season's episodes with
// their averages (and the owner's own rating once read), the write on its way and how the last one ended.

import type { QuestionCandidate } from "../core/state";
import type { FicheInfo } from "../ext/fiche-answers";
import type { RunStep } from "../ext/fiche-undo-answers";
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
  | { kind: "sent-with-error"; error: JobError }
  /** « Annuler » or « Retirer la note » got no answer, or the worker could not run it. */
  | { kind: "undo-failed"; action: UndoAction }
  /** The worker refused it before any write. */
  | { kind: "undo-refused"; reason: "protected" | "expired" | "unrated" }
  /** « Annuler » stopped at this step: it and what came after were not put back. */
  | { kind: "undo-partial"; failed: RunStep["kind"] };

/** The panel's two writes that take a rating back: « Annuler » and « Retirer la note ». */
export type UndoAction = "undo" | "remove";

/** « Chercher » (spec 8b §2): the searched words, then what came back; `failed` when no answer did. */
export type FicheSearch =
  | { query: string; state: "searching" }
  | { query: string; state: "done"; candidates: QuestionCandidate[] }
  | { query: string; state: "failed" };

export type FichePending = "rating" | "confirm-series" | "link" | UndoAction;

export type FicheView = {
  mediaType: "movie" | "tv";
  /** Absent while the worker has not answered. */
  info?: FicheInfo;
  /** The info's last read was lost: « SensCritique n’a pas pu être lu » and « Réessayer ». */
  infoFailed?: true;
  season?: number;
  episodes: Map<number, FicheEpisode>;
  pending?: FichePending;
  /** The last write's ending; the info's read and a season's read have their own flags. */
  outcome?: FicheOutcome;
  /** The shown season's episode that `pending` (a rating) or `outcome` is about, when one is. */
  ratedEpisode?: number;
  /** The shown season's episodes could not be read. */
  seasonFailed?: true;
  /** The last search of the visit, while SensCritique found nothing. */
  search?: FicheSearch;
  /** The words the search field starts with: the last searched ones, else Naka's title. */
  fieldText?: string;
};

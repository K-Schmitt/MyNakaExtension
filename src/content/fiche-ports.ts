// What the title page controller needs from the tab: the worker's eight fiche answers (already checked,
// undefined when lost or refused), four readings of the page, the reading and click of Naka's « Ma liste » and « Déjà vu » buttons (the « Déjà vu » ports), the
// drawing of its view, the announcement of a visit to the page's relay and the page's timer.

import type { ContentIds } from "../core/finish-event";
import type {
  FicheInfo,
  FicheSearchAnswer,
  MineAnswer,
  RateAnswer,
  SeasonAnswer,
} from "../ext/fiche-answers";
import type {
  FicheInfoMessage,
  FicheLinkMessage,
  FicheMineMessage,
  FicheRateMessage,
  FicheRemoveMessage,
  FicheSearchMessage,
  FicheSeasonMessage,
  FicheUndoMessage,
} from "../ext/fiche-messages";
import type { RemoveAnswer, UndoAnswer } from "../ext/fiche-undo-answers";
import type { PageEvent } from "../ext/messages";
import type { FicheView } from "./fiche-view";
import type { EndTimer } from "./ui/end-poll";

export type FichePorts = {
  info(msg: FicheInfoMessage): Promise<FicheInfo | undefined>;
  season(msg: FicheSeasonMessage): Promise<SeasonAnswer | undefined>;
  mine(msg: FicheMineMessage): Promise<MineAnswer | undefined>;
  rate(msg: FicheRateMessage): Promise<RateAnswer | undefined>;
  link(msg: FicheLinkMessage): Promise<{ ok: true } | undefined>;
  undo(msg: FicheUndoMessage): Promise<UndoAnswer | undefined>;
  remove(msg: FicheRemoveMessage): Promise<RemoveAnswer | undefined>;
  search(msg: FicheSearchMessage): Promise<FicheSearchAnswer | undefined>;
  /** The season the page's dropdown names (« Saison 2 » → 2), if one can be read. */
  shownSeason(): number | undefined;
  /** Whether the page shows its episode grid (`ol.nh-list > li.nh-ep-row`). */
  hasEpisodeGrid(): boolean;
  /** These episode numbers, the ones whose boxes are on screen first. */
  visibleFirst(numbers: readonly number[]): number[];
  /** Naka's « Ma liste » button: undefined when not on screen, else whether it is `.is-active`. */
  maListe(): boolean | undefined;
  /** One programmatic click on that button, when it is on screen. */
  clickMaListe(): void;
  /**
   * Naka's « Déjà vu » (a film, no argument) or the « Vu » of an episode row (its number): undefined when not
   * on screen, else whether it is lit.
   */
  dejaVu(episode?: number): boolean | undefined;
  /** One programmatic click on that button when it is on screen and off. */
  clickDejaVu(episode?: number): void;
  /** The tab's own tracker is told these ids are watched, just before the click that makes Naka say so. */
  noteOwnVu(ids: ContentIds): void;
  /** The tab's address path now; `path` learns it only at the next poll. */
  pathname(): string;
  /** The view of the title page, or undefined off a title page. */
  render(view: FicheView | undefined): void;
  /** Asks the page's MAIN relay to post again the events it kept for this title page path. */
  announceVisit(path: string): void;
  /** The page's timer: « Annuler » stops being offered when its record times out. */
  timer: EndTimer;
};

export type TitlePageEvent = Extract<PageEvent, { kind: "fiche" | "season" }>;

/** What the Naka tab hands the controller. */
export type FicheInput = {
  path(pathname: string): void;
  event(event: TitlePageEvent): void;
};

// What the title page controller needs from the tab: the worker's eight fiche answers (already checked,
// undefined when lost or refused), four readings of the page, the click on Naka's « Ma liste » button, the
// drawing of its view and the announcement of a visit to the page's relay.

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
  /** Whether the page shows its episode grid (`div.dcf-ep-grid`). */
  hasEpisodeGrid(): boolean;
  /** These episode numbers, the ones whose boxes are on screen first. */
  visibleFirst(numbers: readonly number[]): number[];
  /** Naka's « Ma liste » button: undefined when not on screen, else whether it is `.is-active`. */
  maListe(): boolean | undefined;
  /** One programmatic click on that button, when it is on screen. */
  clickMaListe(): void;
  /** The view of the title page, or undefined off a title page. */
  render(view: FicheView | undefined): void;
  /** Asks the page's MAIN relay to post again the events it kept for this title page path. */
  announceVisit(path: string): void;
};

export type TitlePageEvent = Extract<PageEvent, { kind: "fiche" | "season" }>;

/** What the Naka tab hands the controller. */
export type FicheInput = {
  path(pathname: string): void;
  event(event: TitlePageEvent): void;
};

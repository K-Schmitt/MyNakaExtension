// What the title page controller needs from the tab: the worker's five fiche answers (already checked,
// undefined when lost or refused), two readings of the page and the drawing of its view.

import type {
  FicheInfo,
  MineAnswer,
  RateAnswer,
  SeasonAnswer,
} from "../ext/fiche-answers";
import type {
  FicheInfoMessage,
  FicheLinkMessage,
  FicheMineMessage,
  FicheRateMessage,
  FicheSeasonMessage,
} from "../ext/fiche-messages";
import type { PageEvent } from "../ext/messages";
import type { FicheView } from "./fiche-view";

export type FichePorts = {
  info(msg: FicheInfoMessage): Promise<FicheInfo | undefined>;
  season(msg: FicheSeasonMessage): Promise<SeasonAnswer | undefined>;
  mine(msg: FicheMineMessage): Promise<MineAnswer | undefined>;
  rate(msg: FicheRateMessage): Promise<RateAnswer | undefined>;
  link(msg: FicheLinkMessage): Promise<{ ok: true } | undefined>;
  /** The season the page's dropdown names (« Saison 2 » → 2), if one can be read. */
  shownSeason(): number | undefined;
  /** These episode numbers, the ones whose boxes are on screen first. */
  visibleFirst(numbers: readonly number[]): number[];
  /** The view of the title page, or undefined off a title page. */
  render(view: FicheView | undefined): void;
};

export type TitlePageEvent = Extract<PageEvent, { kind: "fiche" | "season" }>;

/** What the Naka tab hands the controller. */
export type FicheInput = {
  path(pathname: string): void;
  event(event: TitlePageEvent): void;
};

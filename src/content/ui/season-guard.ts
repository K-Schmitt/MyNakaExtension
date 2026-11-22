// When the episode rows can be trusted after a season change: Naka may still show the old season's rows for
// a moment, and a star on one would rate the wrong episode. The season on the page is the one Naka's dropdown
// names, read at each pass, since the view learns of a change later (at Naka's season answer or at the tab's
// poll); without a dropdown (a lone season), the view's. The last one is kept: a season replacing another one
// starts the wait on the rows' titles (season-settle). While the wait runs, or while the page's season is not
// the view's (a dropdown naming none, « Spéciaux », never is), the rows stay bare, and one timer runs the pass
// again when the wait may end. The wait never ends while the view is behind the page: Naka's own season request
// may outlast it, and the view catching up over unchanged rows starts it again (season-settle). The first season
// of a visit has no wait.

import type { EndTimer } from "./end-poll";
import {
  catchUp,
  noteRows,
  type SeasonTurn,
  startTurn,
  waitLeft,
} from "./season-settle";

export type SeasonGuardPorts = {
  timer: EndTimer;
  now(): number;
  /** The season Naka's dropdown names: null without a dropdown, undefined when it names none. */
  dropdownSeason(): number | null | undefined;
};

/** A dropdown that names no season: a season of its own, which no view shows. */
const UNNAMED = "unnamed";
type SeasonMark = number | typeof UNNAMED;

export function createSeasonGuard(
  ports: SeasonGuardPorts,
  rerun: () => void,
): {
  /** Whether the rows, with these titles, must stay bare now under a view of this season. */
  hold(viewSeason: number | undefined, rows: string): boolean;
  /** Forgets the season, the wait and its timer. */
  stop(): void;
} {
  let season: SeasonMark | undefined; // the last season shown
  let turn: SeasonTurn | undefined; // the wait after a season change
  let wake: { handle: unknown } | undefined; // the wait's one timer

  function stopWake(): void {
    if (wake !== undefined) ports.timer.clear(wake.handle);
    wake = undefined;
  }

  function wakeIn(ms: number): void {
    stopWake();
    wake = { handle: ports.timer.set(rerun, ms) }; // clearing it once run does nothing
  }

  // While the wait runs, one timer runs the pass again when it may end; it ends only under a view that shows
  // the page's season.
  function waiting(rows: string, viewOnPage: boolean): boolean {
    if (turn === undefined) return false;
    const now = ports.now();
    turn = noteRows(turn, rows, now);
    if (viewOnPage) turn = catchUp(turn, now);
    const left = waitLeft(turn, now);
    if (left > 0) wakeIn(left);
    else {
      stopWake();
      if (viewOnPage) turn = undefined;
    }
    return left > 0;
  }

  // A season replacing another one starts the wait, on the rows as they are when the change is seen.
  function note(next: SeasonMark | undefined, rows: string): void {
    if (next === undefined) return;
    if (season !== undefined && next !== season) {
      turn = startTurn(rows, ports.now());
    }
    season = next;
  }

  // The season the dropdown names; the view's without a dropdown.
  function pageSeason(viewSeason: number | undefined): SeasonMark | undefined {
    const read = ports.dropdownSeason();
    return read === null ? viewSeason : (read ?? UNNAMED);
  }

  return {
    hold(viewSeason, rows) {
      const onPage = pageSeason(viewSeason);
      note(onPage, rows);
      const viewOnPage = onPage === viewSeason;
      return waiting(rows, viewOnPage) || !viewOnPage;
    },
    stop() {
      season = undefined;
      turn = undefined;
      stopWake();
    },
  };
}

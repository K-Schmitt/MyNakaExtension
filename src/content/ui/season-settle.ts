// The wait after a season change, on the titles of the episode rows: Naka may still show the old season's
// rows for a moment. Titles that changed since the change are the new season's rows: they are trusted once
// still for 300 ms. Titles that did not change (a season in Naka's cache, rows redrawn before the change was
// seen, two seasons with the same titles) are trusted once still for 1,000 ms.

export const REDRAWN_STILL_MS = 300;
export const SAME_ROWS_STILL_MS = 1000;

export type SeasonTurn = {
  /** The rows' titles when the season change was seen. */
  before: string;
  /** The rows' titles last seen. */
  rows: string;
  /** When the rows' titles last changed (or the change was seen). */
  stillSince: number;
};

export function startTurn(rows: string, now: number): SeasonTurn {
  return { before: rows, rows, stillSince: now };
}

/** The turn with these titles: the same object for the same titles, the wait started again otherwise. */
export function noteRows(
  turn: SeasonTurn,
  rows: string,
  now: number,
): SeasonTurn {
  return rows === turn.rows ? turn : { ...turn, rows, stillSince: now };
}

/** The ms the rows must still stand still before they are trusted; 0 once they have. */
export function waitLeft(turn: SeasonTurn, now: number): number {
  const still =
    turn.rows !== turn.before ? REDRAWN_STILL_MS : SAME_ROWS_STILL_MS;
  return Math.max(0, turn.stillSince + still - now);
}

// The episode boxes of the shown season: each `li.nh-ep-row` whose number (`span.nh-ep-num`) is the number
// of an episode SensCritique lists gets its badge and its stars; any other box is left bare, never given a
// neighbour's values. Naka redraws its grid, so every change of the page runs the pass again while there are
// episodes to show. When the shown season replaces another, Naka may still show the old season's rows: every
// box stays bare until the rows' titles stood still long enough (season-settle), as a star on an old row
// would rate the wrong episode. The first season of a visit has no wait: its rows and dropdown come together.
// A box's stars stop being watched once its decorations come off, once Naka drops the box, and when the
// episodes are cleared, so a thrown-away box is not kept alive by the watch.

import type { FicheView } from "../fiche-view";
import type { DocLike, ElementLike } from "./dom-like";
import type { EndTimer } from "./end-poll";
import {
  boxWriteOf,
  createDecor,
  drawDecor,
  type EpisodeDecor,
  takeOffDecor,
} from "./fiche-episode-decor";
import type { FicheHandlers } from "./fiche-handlers";
import { episodeNumber } from "./fiche-numbers";
import {
  noteRows,
  type SeasonTurn,
  startTurn,
  waitLeft,
} from "./season-settle";
import type { ReleasableWatch } from "./star-visibility";

export type EpisodeBox = {
  /** The box element: its decoration is kept per box. */
  key: object;
  /** The text of the box's `span.nh-ep-num`, read at each pass. */
  code(): string | null | undefined;
  /** The text of the box's `span.nh-row-title`, read at each pass. */
  title(): string | null | undefined;
  /** Puts the host in the thumb's top-right corner, left of a control of Naka's there; idempotent. */
  placeBadge(host: ElementLike): void;
  /** Puts the host right after `span.nh-row-title`; idempotent. */
  placeStars(host: ElementLike): void;
};

export type FicheEpisodesPorts = {
  doc: Pick<DocLike, "createElement">;
  seen: ReleasableWatch;
  timer: EndTimer;
  now(): number;
  boxes(): EpisodeBox[];
  watch(onChange: () => void): () => void;
};

type Shown = { view: FicheView; handlers: FicheHandlers };

/** The rows as the wait compares them: their titles, one per line. */
const rowsKey = (boxes: EpisodeBox[]): string =>
  boxes.map((box) => box.title() ?? "").join("\n");

export function createFicheEpisodes(ports: FicheEpisodesPorts): {
  draw(view: FicheView, handlers: FicheHandlers): void;
  clear(): void;
} {
  const decors = new WeakMap<object, EpisodeDecor>();
  const drawn = new Map<object, EpisodeDecor>(); // the decorations on the page now, by box
  let shown: Shown | undefined;
  let unwatch: (() => void) | undefined;
  let season: number | undefined; // the last season shown
  let turn: SeasonTurn | undefined; // the wait after a season change
  let wake: { handle: unknown } | undefined; // the wait's one timer

  function takeOff(key: object): void {
    const decor = drawn.get(key);
    if (decor === undefined) return;
    takeOffDecor(decor);
    ports.seen.release(decor);
    drawn.delete(key);
  }

  function takeOffAll(): void {
    for (const key of [...drawn.keys()]) takeOff(key);
  }

  function stopWake(): void {
    if (wake !== undefined) ports.timer.clear(wake.handle);
    wake = undefined;
  }

  function wakeIn(ms: number): void {
    stopWake();
    wake = { handle: ports.timer.set(pass, ms) }; // clearing it once run does nothing
  }

  // A season replacing another one starts the wait, on the rows as they are when the change is seen.
  function noteSeason(next: number | undefined): void {
    if (next === undefined) return;
    if (season !== undefined && next !== season) {
      turn = startTurn(rowsKey(ports.boxes()), ports.now());
    }
    season = next;
  }

  // While the wait runs, every box is bare and one timer runs the pass again when the wait may end.
  function holdBare(boxes: EpisodeBox[]): boolean {
    if (turn === undefined) return false;
    const now = ports.now();
    turn = noteRows(turn, rowsKey(boxes), now);
    const left = waitLeft(turn, now);
    if (left === 0) {
      turn = undefined;
      stopWake();
      return false;
    }
    takeOffAll();
    wakeIn(left);
    return true;
  }

  function decorate(box: EpisodeBox, { view, handlers }: Shown): void {
    const n = episodeNumber(box.code());
    const episode = n === undefined ? undefined : view.episodes.get(n);
    const known = decors.get(box.key);
    if (n === undefined || episode === undefined) {
      takeOff(box.key);
      return;
    }
    const decor = known ?? createDecor(ports.doc);
    decors.set(box.key, decor);
    drawn.set(box.key, decor);
    drawDecor(ports, decor, n, episode, handlers, boxWriteOf(view, n));
    if (episode.average === null) decor.badge.host.remove();
    else box.placeBadge(decor.badge.host);
    box.placeStars(decor.stars.host);
  }

  function pass(): void {
    if (shown === undefined) return;
    const boxes = ports.boxes();
    if (holdBare(boxes)) return;
    const present = new Set(boxes.map((box) => box.key));
    for (const key of [...drawn.keys()]) if (!present.has(key)) takeOff(key);
    for (const box of boxes) decorate(box, shown);
  }

  function stopWatching(): void {
    unwatch?.();
    unwatch = undefined;
  }

  return {
    draw(view, handlers) {
      shown = { view, handlers };
      noteSeason(view.season);
      pass();
      if (view.episodes.size === 0) stopWatching();
      else unwatch ??= ports.watch(pass);
    },
    clear() {
      stopWatching();
      shown = undefined;
      season = undefined;
      turn = undefined;
      stopWake();
      takeOffAll();
    },
  };
}

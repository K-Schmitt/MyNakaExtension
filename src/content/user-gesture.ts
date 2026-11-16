// The owner's last real gesture on the Naka page. A « vu » for a title the player is not playing (the fiche's
// episode list, the player's « Épisodes » panel) counts only right after one: a page script can post a « vu »
// for any id, but it cannot make an event with isTrusted true. One gesture lets one such « vu » through, and
// each « vu » uses up the oldest gesture still recent: ticking three episodes in a row gives three.

// Known limits, stated without a probe: the window assumes Naka's PUT /history/watched, and so the page event,
// follows the click within 3 s; on a slower connection the « vu » arrives too late and does not count. A Naka
// action that marks a whole season or series seen in one click sends several PUTs: one click is one gesture,
// so only the first of them counts.
export const GESTURE_WINDOW_MS = 3000;
// One click fires pointerup then click, and Enter on a button fires a click too: one gesture.
export const GESTURE_MERGE_MS = 300;
export const MAX_GESTURES = 5;

export type GestureEvent = { type: string; isTrusted?: boolean; key?: string };

export type GestureGate = {
  /** Records a trusted click, pointerup, or Enter/Space keydown; anything else is ignored. */
  note(event: GestureEvent): void;
  /** Uses up the oldest gesture still within the window (older ones are dropped): true when there was one. */
  take(): boolean;
};

export type GestureTarget = {
  addEventListener(
    type: string,
    fn: (event: GestureEvent) => void,
    capture: boolean,
  ): void;
};

const GESTURE_TYPES = ["click", "pointerup", "keydown"];
const GESTURE_KEYS = ["Enter", " "];

export function isRecentGesture(
  lastGestureAt: number | undefined,
  now: number,
  windowMs: number,
): boolean {
  if (lastGestureAt === undefined) return false;
  return now >= lastGestureAt && now - lastGestureAt <= windowMs;
}

function isGesture(event: GestureEvent): boolean {
  if (event.isTrusted !== true) return false;
  if (event.type === "keydown") return GESTURE_KEYS.includes(event.key ?? "");
  return GESTURE_TYPES.includes(event.type);
}

// A gesture within GESTURE_MERGE_MS of the last one is the same gesture: its time moves forward.
function remember(gestures: number[], at: number): number[] {
  const last = gestures[gestures.length - 1];
  if (last !== undefined && at >= last && at - last <= GESTURE_MERGE_MS) {
    return [...gestures.slice(0, -1), at];
  }
  return [...gestures, at].slice(-MAX_GESTURES);
}

export function createGestureGate(now: () => number): GestureGate {
  let gestures: number[] = [];
  return {
    note(event) {
      if (isGesture(event)) gestures = remember(gestures, now());
    },
    take() {
      const at = now();
      const recent = gestures.filter((g) =>
        isRecentGesture(g, at, GESTURE_WINDOW_MS),
      );
      gestures = recent.slice(1);
      return recent.length > 0;
    },
  };
}

// Capture phase on the window. A page listener added earlier on the window can still stop the event
// (stopImmediatePropagation): the « vu » off the player is then refused, never let through.
export function listenToGestures(
  target: GestureTarget,
  gate: GestureGate,
): void {
  for (const type of GESTURE_TYPES) {
    target.addEventListener(type, (event) => gate.note(event), true);
  }
}

// The owner's last real gesture on the Naka page. A « vu » for a title the player is not playing (the fiche's
// episode list, the player's « Épisodes » panel) counts only right after one: a page script can post a « vu »
// for any id, but it cannot make an event with isTrusted true. One gesture lets one such « vu » through.

// Naka's PUT /history/watched follows the click within one request round-trip.
export const GESTURE_WINDOW_MS = 3000;

export type GestureEvent = { type: string; isTrusted?: boolean; key?: string };

export type GestureGate = {
  /** Records a trusted click, pointerup, or Enter/Space keydown; anything else is ignored. */
  note(event: GestureEvent): void;
  /** True once per gesture, within the window: the gesture is used up. */
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

export function createGestureGate(now: () => number): GestureGate {
  let lastGestureAt: number | undefined;
  return {
    note(event) {
      if (isGesture(event)) lastGestureAt = now();
    },
    take() {
      const recent = isRecentGesture(lastGestureAt, now(), GESTURE_WINDOW_MS);
      lastGestureAt = undefined;
      return recent;
    },
  };
}

// Capture phase on the window: the page cannot stop the event before the extension sees it.
export function listenToGestures(
  target: GestureTarget,
  gate: GestureGate,
): void {
  for (const type of GESTURE_TYPES) {
    target.addEventListener(type, (event) => gate.note(event), true);
  }
}

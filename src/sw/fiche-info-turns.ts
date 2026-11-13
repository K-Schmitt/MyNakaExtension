// One fiche-info in flight per tab (a page alternating pushState and forged fiche events would otherwise
// queue endless Naka and SensCritique reads on the shared limiters): a tab's new fiche-info starts a new
// turn, which ends the older one's. A read of a turn no longer live when its slot comes is skipped by the
// site's limiter (SkippedError): it takes no slot, and the next waiter goes on at once. Only the tabs with
// a fiche-info in flight are held.

import type { RunOptions } from "../core/rate-limiter";
import type { SiteLimiters } from "./read-ports";

export type InfoTurn = {
  /** Still the tab's newest fiche-info. */
  live(): boolean;
  /** The fiche-info ended: the tab holds no turn, unless a newer one started. */
  end(): void;
};

export type InfoTurns = { start(tabId: number): InfoTurn };

export function createInfoTurns(): InfoTurns {
  const current = new Map<number, object>();
  return {
    start(tabId) {
      const token = {};
      current.set(tabId, token);
      const live = () => current.get(tabId) === token;
      return {
        live,
        end: () => {
          if (live()) current.delete(tabId);
        },
      };
    },
  };
}

/** The site limiters for one turn: once a newer turn started, a read waiting for its slot is skipped. */
export function turnLimiters(
  limiters: SiteLimiters,
  turn: InfoTurn,
): SiteLimiters {
  const guarded = (limiter: SiteLimiters["naka"]): SiteLimiters["naka"] => ({
    run: (task, options?: RunOptions) =>
      limiter.run(task, {
        skip: () => !turn.live() || options?.skip?.() === true,
      }),
  });
  return { naka: guarded(limiters.naka), sc: guarded(limiters.sc) };
}

// The keeper's ports over Naka's hero badges (`div.nh-fiche-badges`): our chip sits right after Naka's own
// rating, or at the end of the badges when there is none. Putting it where it already is does nothing, so the
// keeper cannot loop on its own insertion. Without the badges, nothing is placed.

import type { ElementLike } from "./dom-like";
import type { EndTimer } from "./end-poll";
import type { KeeperPorts } from "./row-keeper";
import { REPRENDRE_WAIT_MS } from "./row-place";

export type HeroBadges = {
  readonly children: Iterable<object>;
  readonly lastElementChild: object | null;
  append(node: ElementLike): void;
};

export type HeroRating = {
  readonly nextElementSibling: object | null;
  after(node: ElementLike): void;
};

export type HeroPlace = {
  /** Naka's badges in the hero, or null when the page shows none. */
  badges(): HeroBadges | null;
  /** Naka's own rating among them, or null. */
  rating(): HeroRating | null;
  watch(onChange: () => void): () => void;
  timer: EndTimer;
};

export function chipPorts(place: HeroPlace, host: ElementLike): KeeperPorts {
  return {
    snapshot() {
      const badges = place.badges();
      if (badges === null) return undefined;
      const children = [...badges.children];
      const rating = place.rating();
      const after =
        rating === null ? -1 : children.indexOf(rating as unknown as object);
      return {
        reprendre:
          after >= 0 ? after : children.findLastIndex((c) => c !== host),
        host: children.indexOf(host),
        age: REPRENDRE_WAIT_MS,
      };
    },
    apply() {
      const rating = place.rating();
      if (rating !== null) {
        if (rating.nextElementSibling !== host) rating.after(host);
        return;
      }
      const badges = place.badges();
      if (badges !== null && badges.lastElementChild !== host)
        badges.append(host);
    },
    detach() {
      host.remove();
    },
    watch: place.watch,
    timer: place.timer,
  };
}

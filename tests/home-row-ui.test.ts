import { describe, expect, it } from "vitest";
import type { TrackLike } from "../src/content/ui/dom-like";
import type { HomeHandlers } from "../src/content/ui/home-block";
import { createHomeRowUi } from "../src/content/ui/home-row-ui";
import { homeView } from "../src/content/ui/home-view";
import type { ListSnapshot } from "../src/content/ui/row-place";
import { filmCard } from "./rating-fixtures";
import {
  descendants,
  FakeDoc,
  type FakeElement,
  fakeVisibility,
} from "./ui-fakes";

const HANDLERS: HomeHandlers = {
  entry: () => ({
    onChoose: () => {},
    onAction: () => {},
    onOther: () => {},
    onConfirm: () => {},
  }),
  question: () => ({ onChoose: () => {}, onAction: () => {} }),
};

const VIEW = homeView([{ card: filmCard({ key: "movie:1", title: "Film" }) }]);

// The row UI over a fake document; the keeper's DOM ports and the size watch are fakes that record.
function world() {
  const doc = new FakeDoc();
  const log: string[] = [];
  const hosts: FakeElement[] = [];
  const watched: { target: TrackLike; fn: () => void; stopped: boolean }[] = [];
  let snap: ListSnapshot = { reprendre: 0, host: -1, age: 0 };
  const vis = fakeVisibility();
  const ui = createHomeRowUi({
    doc,
    seen: vis.seen,
    keeper: (host) => {
      hosts.push(host as FakeElement);
      return {
        snapshot: () => snap,
        apply: (move) => log.push(`apply ${move}`),
        detach: () => log.push("detach"),
        watch: () => {
          log.push("watch");
          return () => log.push("unwatch");
        },
        timer: { set: () => 0, clear: () => {} },
      };
    },
    reducedMotion: () => false,
    watchSize: (target, fn) => {
      const entry = { target, fn, stopped: false };
      watched.push(entry);
      return () => {
        entry.stopped = true;
      };
    },
  });
  const tracks = (): FakeElement[] =>
    hosts.flatMap((h) =>
      descendants(h.shadow).filter((el) => el.className === "mn-track"),
    );
  const arrows = (): FakeElement[] =>
    hosts.flatMap((h) =>
      descendants(h.shadow).filter((el) => el.className === "mn-arrow"),
    );
  return {
    ui,
    doc,
    vis,
    log,
    hosts,
    watched,
    tracks,
    arrows,
    place: (s: ListSnapshot) => {
      snap = s;
    },
  };
}

describe("createHomeRowUi", () => {
  it("makes no element before the first show", () => {
    const w = world();
    expect(w.doc.created).toEqual([]);
    expect(w.hosts).toEqual([]);
  });

  it("show draws the row in the host and starts the keeper", () => {
    const w = world();
    w.ui.show(VIEW, HANDLERS);
    expect(w.hosts).toHaveLength(1);
    expect(w.tracks()).toHaveLength(1);
    expect(w.log).toEqual(["watch", "apply after-reprendre"]);
  });

  it("hide empties the root, stops the keeper and detaches the host", () => {
    const w = world();
    w.ui.show(VIEW, HANDLERS);
    w.ui.hide();
    expect(w.tracks()).toEqual([]);
    expect(w.log).toEqual([
      "watch",
      "apply after-reprendre",
      "unwatch",
      "detach",
    ]);
  });

  it("watches the stars it drew (D7), only the last draw's, and none once hidden", () => {
    const w = world();
    w.ui.show(VIEW, HANDLERS);
    const groups = () =>
      w.hosts.flatMap((h) =>
        descendants(h.shadow).filter((el) => el.className === "mn-stars"),
      );
    expect([...w.vis.observed]).toEqual(groups());
    w.ui.show(VIEW, HANDLERS);
    expect([...w.vis.observed]).toEqual(groups());
    expect(w.vis.observed.size).toBe(1);
    w.ui.hide();
    expect(w.vis.observed.size).toBe(0);
  });

  it("a show after a hide draws again in the same host and starts afresh", () => {
    const w = world();
    w.ui.show(VIEW, HANDLERS);
    w.ui.hide();
    w.place({ reprendre: 0, host: -1, age: 0 }); // Naka's new list, the host not in it
    w.ui.show(VIEW, HANDLERS);
    expect(w.hosts).toHaveLength(1);
    expect(w.tracks()).toHaveLength(1);
    expect(w.log.slice(4)).toEqual(["watch", "apply after-reprendre"]);
  });

  it("the arrows show once the track, drawn before its placement, gets its size", () => {
    const w = world();
    w.ui.show(VIEW, HANDLERS);
    const track = w.tracks()[0] as FakeElement & {
      clientWidth: number;
      scrollWidth: number;
      scrollLeft: number;
    };
    expect(w.watched.map((x) => x.target)).toEqual([track]);
    expect(w.arrows().every((a) => a.attributes.hidden === "")).toBe(true);
    track.scrollLeft = 0;
    track.clientWidth = 300;
    track.scrollWidth = 900;
    w.watched[0]?.fn();
    expect(w.arrows().map((a) => a.attributes.hidden)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("hide stops watching the track's size", () => {
    const w = world();
    w.ui.show(VIEW, HANDLERS);
    w.ui.hide();
    expect(w.watched.map((x) => x.stopped)).toEqual([true]);
  });

  it("a redraw stops watching the old track and watches the new one", () => {
    const w = world();
    w.ui.show(VIEW, HANDLERS);
    w.ui.hide();
    w.ui.show(VIEW, HANDLERS);
    expect(w.watched.map((x) => x.stopped)).toEqual([true, false]);
    expect(w.watched[1]?.target).toBe(w.tracks()[0]);
  });
});

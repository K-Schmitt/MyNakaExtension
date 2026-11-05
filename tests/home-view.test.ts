import { describe, expect, it } from "vitest";
import { homeView } from "../src/content/ui/home-view";
import { SERIES_WARNING } from "../src/content/ui/rating-copy";
import { ratingView } from "../src/content/ui/rating-view";
import { episodeCard, filmCard } from "./rating-fixtures";

const old = filmCard({
  key: "movie:1",
  contentId: 1,
  title: "Ancien",
  at: 100,
});
const newest = filmCard({
  key: "movie:3",
  contentId: 3,
  title: "Récent",
  at: 300,
});
const middle = filmCard({
  key: "movie:2",
  contentId: 2,
  title: "Milieu",
  at: 200,
});

describe("homeView", () => {
  it("is headed « À noter », unfolded by default", () => {
    const view = homeView([{ card: old }]);
    expect(view.heading).toBe("À noter");
    expect(view.folded).toBe(false);
  });

  it("lists the newest first, whatever the stored order", () => {
    const view = homeView([{ card: old }, { card: newest }, { card: middle }]);
    expect(view.entries.map((e) => e.key)).toEqual([
      "movie:3",
      "movie:2",
      "movie:1",
    ]);
  });

  it("gives each entry its heading, the ten choices and Ignorer only", () => {
    const [entry] = homeView([{ card: old }]).entries;
    expect(entry?.view.heading).toBe(ratingView(old, "film").heading);
    expect(entry?.view.choices).toHaveLength(10);
    expect(entry?.view.actions).toEqual(["ignorer"]);
    expect(entry?.view.others).toEqual([]);
  });

  it("shows the first pending label of a card, with its start", () => {
    const card = episodeCard({ pending: ["saison", "série"] });
    const [entry] = homeView([{ card, start: 8 }]).entries;
    expect(entry?.view.heading).toBe(ratingView(card, "saison", 8).heading);
    expect(entry?.view.choices.find((c) => c.value === 8)?.marked).toBe(true);
  });

  it("a série whose series is not finished shows the warning", () => {
    const card = episodeCard({ pending: ["série"], seriesFinished: false });
    const [entry] = homeView([{ card }]).entries;
    expect(entry?.view.warning).toBe(SERIES_WARNING);
  });

  it("keeps the view an entry carries, but only with Ignorer", () => {
    const shown = { ...ratingView(old, "film"), notice: "en cours" };
    const [entry] = homeView([{ card: old, view: shown }]).entries;
    expect(entry?.view.notice).toBe("en cours");
    expect(entry?.view.actions).toEqual(["ignorer"]);
  });

  it("leaves out a card with nothing pending", () => {
    const done = filmCard({ pending: [] });
    expect(homeView([{ card: done }]).entries).toEqual([]);
  });

  it("tells when it is folded", () => {
    expect(homeView([{ card: old }], true).folded).toBe(true);
  });
});

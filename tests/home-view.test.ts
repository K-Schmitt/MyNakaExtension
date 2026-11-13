import { describe, expect, it } from "vitest";
import { homeView } from "../src/content/ui/home-view";
import { questionView } from "../src/content/ui/question-view";
import { SERIES_WARNING } from "../src/content/ui/rating-copy";
import { ratingView } from "../src/content/ui/rating-view";
import type { AmbiguityOffer } from "../src/sw/question-offers";
import { episodeCard, filmCard } from "./rating-fixtures";

const OFFER: AmbiguityOffer = {
  kind: "ambiguity",
  key: "ambiguity:naka:1",
  side: "naka",
  id: 1,
  title: "Dune",
  candidates: [{ id: 10, title: "Dune", year: 2021, type: "film" }],
};
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
  it("gives an entry whose card has a poster the w500 image", () => {
    const card = filmCard({ ...old, image: { posterPath: "/a.jpg" } });
    const [entry] = homeView([{ card }]).entries;
    expect(entry?.image).toBe("https://image.tmdb.org/t/p/w500/a.jpg");
    expect(homeView([{ card: old }]).entries[0]).not.toHaveProperty("image");
  });

  it("fills the tile with the poster, not the backdrop, when Naka gives both", () => {
    const image = { posterPath: "/a.jpg", backdropPath: "/b.jpg" };
    const card = filmCard({ ...old, image });
    const [entry] = homeView([{ card }]).entries;
    expect(entry?.image).toBe("https://image.tmdb.org/t/p/w500/a.jpg");
  });

  it("has no heading and no fold", () => {
    const view = homeView([{ card: old }]);
    expect(view).not.toHaveProperty("heading");
    expect(view).not.toHaveProperty("folded");
    expect(view).not.toHaveProperty("questionsHeading");
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

  it("an entry with no view yet shows its failed label first", () => {
    const card = episodeCard({
      pending: ["épisode", "saison"],
      failed: { label: "saison", error: "unavailable", at: 3 },
    });
    const [entry] = homeView([{ card }]).entries;
    expect(entry?.view.heading).toBe(ratingView(card, "saison").heading);
    expect(entry?.view.error).toBe(ratingView(card, "saison").error);
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

  it("carries the questions after the cards", () => {
    const q = {
      key: "ambiguity:naka:1",
      view: questionView(OFFER, ["ecarter"]),
    };
    expect(homeView([{ card: old }], [q]).questions).toEqual([q]);
    expect(homeView([], [q]).entries).toEqual([]);
    expect(homeView([{ card: old }]).questions).toEqual([]);
  });

  it("carries the live card and drops the question of the same key", () => {
    const live = {
      key: "removal:sc:1:2",
      view: questionView(OFFER, []),
    };
    const same = {
      key: "removal:sc:1:2",
      view: questionView(OFFER, ["ecarter"]),
    };
    const other = {
      key: "ambiguity:naka:1",
      view: questionView(OFFER, ["ecarter"]),
    };
    const view = homeView([], [same, other], live);
    expect(view.live).toEqual(live);
    expect(view.questions).toEqual([other]);
    expect(homeView([], [other])).not.toHaveProperty("live");
  });
});

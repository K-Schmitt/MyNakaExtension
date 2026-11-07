import { describe, expect, it } from "vitest";
import { ratingView } from "../src/content/ui/rating-view";
import { episodeCard, filmCard, target } from "./rating-fixtures";

const NB = "\u202F";

describe("ratingView", () => {
  it("keeps a hostile title as literal text", () => {
    const view = ratingView(
      episodeCard({ title: "<img src=x onerror=1>" }),
      "épisode",
    );
    expect(view.heading).toBe(
      `Noter «${NB}<img src=x onerror=1>${NB}», saison 1, épisode 1`,
    );
  });

  it("a film: heading, ten unmarked choices, three actions, no other", () => {
    const view = ratingView(filmCard(), "film");
    expect(view.heading).toBe(`Noter «${NB}Un film${NB}»`);
    expect(view.choices.map((c) => c.value)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(view.choices.some((c) => c.marked)).toBe(false);
    expect(view.actions).toEqual(["plus-tard", "ignorer", "fermer"]);
    expect(view.others).toEqual([]);
    expect(view.current).toBeUndefined();
    expect(view.warning).toBeUndefined();
    expect(view.error).toBeUndefined();
  });

  it("a label that is not pending offers Fermer only", () => {
    expect(ratingView(filmCard({ pending: [] }), "film").actions).toEqual([
      "fermer",
    ]);
    const card = episodeCard({ pending: ["saison"] });
    expect(ratingView(card, "épisode").actions).toEqual(["fermer"]);
    expect(ratingView(card, "série").actions).toEqual(["fermer"]);
    expect(ratingView(card, "saison").actions).toEqual([
      "plus-tard",
      "ignorer",
      "fermer",
    ]);
  });

  it("a saison with start 8: choice 8 marked and the start line", () => {
    const view = ratingView(episodeCard(), "saison", 8);
    expect(view.heading).toBe(`Noter la saison 1 de «${NB}Une série${NB}»`);
    expect(view.start).toBe(`Moyenne de vos épisodes${NB}: 8`);
    expect(view.choices.filter((c) => c.marked)).toEqual([
      { value: 8, marked: true },
    ]);
  });

  it("marks the current rating too, and shows it", () => {
    const card = episodeCard({
      targets: [target("épisode", 6), target("saison", null)],
    });
    const view = ratingView(card, "épisode");
    expect(view.current).toBe(`Votre note actuelle${NB}: 6`);
    expect(view.choices.find((c) => c.value === 6)?.marked).toBe(true);
  });

  it("a current rating wins over the start: only the current is marked, both lines stay", () => {
    const card = episodeCard({
      targets: [target("épisode", 9), target("saison", 6)],
      pending: [],
    });
    const view = ratingView(card, "saison", 8);
    expect(view.choices.filter((c) => c.marked)).toEqual([
      { value: 6, marked: true },
    ]);
    expect(view.current).toBe(`Votre note actuelle${NB}: 6`);
    expect(view.start).toBe(`Moyenne de vos épisodes${NB}: 8`);
  });

  it("a série not finished: the warning", () => {
    const view = ratingView(episodeCard({ seriesFinished: false }), "série");
    expect(view.warning).toContain("n'est pas finie sur Naka");
  });

  it("a série finished: no warning; an épisode never has one", () => {
    expect(
      ratingView(episodeCard({ seriesFinished: true }), "série").warning,
    ).toBeUndefined();
    expect(
      ratingView(episodeCard({ seriesFinished: false }), "épisode").warning,
    ).toBeUndefined();
  });

  it("a série start line says saisons", () => {
    const view = ratingView(episodeCard(), "série", 7);
    expect(view.start).toBe(`Moyenne de vos saisons${NB}: 7`);
  });

  it("a failure of this label gives the error line; of another label, none", () => {
    const card = episodeCard({
      failed: { label: "saison", error: "sc-session", at: 5 },
    });
    expect(ratingView(card, "saison").error).toBe(
      `La note n'est pas partie${NB}: reconnectez-vous sur SensCritique.`,
    );
    expect(ratingView(card, "épisode").error).toBeUndefined();
  });

  it("the others are the card's other target labels, in chain order", () => {
    expect(ratingView(episodeCard(), "saison").others).toEqual([
      "épisode",
      "série",
    ]);
  });
});

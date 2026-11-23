import { describe, expect, it } from "vitest";
import {
  clickMaListe,
  isInMaListe,
  type MaListeDoc,
  maListeButton,
  maListePorts,
} from "../src/content/ui/ma-liste-button";

/** Naka's button, as a document answers its selector: its classes and the clicks it got. */
function nakaButton(classes: string[]) {
  const names = new Set(["nh-btn", ...classes]);
  return {
    clicks: 0,
    classList: { contains: (name: string) => names.has(name) },
    click() {
      this.clicks += 1;
    },
  };
}

/** Naka's button while the title is in « Ma liste ». */
const inList = () => nakaButton(["is-on"]);
/** Naka's button while the title is out of « Ma liste » (the report's card variant). */
const outOfList = () => nakaButton(["nh-btn-card"]);

function docWith(button: ReturnType<typeof nakaButton> | null) {
  const asked: string[] = [];
  const doc: MaListeDoc = {
    querySelector: (selector) => {
      asked.push(selector);
      return button;
    },
  };
  return { doc, asked };
}

describe("Naka's « Ma liste » button", () => {
  it("is found as the first button of the split control", () => {
    const button = inList();
    const { doc, asked } = docWith(button);
    expect(maListeButton(doc)).toBe(button);
    expect(asked).toEqual(["div.dcpl-split > button.nh-btn:first-child"]);
  });

  it("is in « Ma liste » when it has .is-on", () => {
    expect(isInMaListe(inList())).toBe(true);
    expect(isInMaListe(outOfList())).toBe(false);
  });

  it("is not in « Ma liste » when it has only .nh-btn-card", () => {
    expect(isInMaListe(nakaButton(["nh-btn-card"]))).toBe(false);
  });

  it("is clicked once", () => {
    const button = inList();
    clickMaListe(button);
    expect(button.clicks).toBe(1);
  });
});

describe("the « Ma liste » ports", () => {
  it("read the button's state, undefined off screen", () => {
    expect(maListePorts(docWith(inList()).doc).maListe()).toBe(true);
    expect(maListePorts(docWith(outOfList()).doc).maListe()).toBe(false);
    expect(maListePorts(docWith(null).doc).maListe()).toBeUndefined();
  });

  it("click the button on screen, and nothing off screen", () => {
    const button = outOfList();
    maListePorts(docWith(button).doc).clickMaListe();
    expect(button.clicks).toBe(1);
    expect(() => maListePorts(docWith(null).doc).clickMaListe()).not.toThrow();
  });
});

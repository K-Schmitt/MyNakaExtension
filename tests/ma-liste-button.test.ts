import { describe, expect, it } from "vitest";
import {
  clickMaListe,
  isInMaListe,
  type MaListeDoc,
  maListeButton,
  maListePorts,
} from "../src/content/ui/ma-liste-button";

/** Naka's button, as a document answers its selector: its classes and the clicks it got. */
function nakaButton(active: boolean) {
  const classes = new Set(["dc-btn-soft", ...(active ? ["is-active"] : [])]);
  return {
    clicks: 0,
    classList: { contains: (name: string) => classes.has(name) },
    click() {
      this.clicks += 1;
    },
  };
}

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
  it("is found under the split control", () => {
    const button = nakaButton(true);
    const { doc, asked } = docWith(button);
    expect(maListeButton(doc)).toBe(button);
    expect(asked).toEqual([".dcpl-split > button.dc-btn-soft"]);
  });

  it("is in « Ma liste » when it has .is-active", () => {
    expect(isInMaListe(nakaButton(true))).toBe(true);
    expect(isInMaListe(nakaButton(false))).toBe(false);
  });

  it("is clicked once", () => {
    const button = nakaButton(true);
    clickMaListe(button);
    expect(button.clicks).toBe(1);
  });
});

describe("the « Ma liste » ports", () => {
  it("read the button's state, undefined off screen", () => {
    expect(maListePorts(docWith(nakaButton(true)).doc).maListe()).toBe(true);
    expect(maListePorts(docWith(nakaButton(false)).doc).maListe()).toBe(false);
    expect(maListePorts(docWith(null).doc).maListe()).toBeUndefined();
  });

  it("click the button on screen, and nothing off screen", () => {
    const button = nakaButton(false);
    maListePorts(docWith(button).doc).clickMaListe();
    expect(button.clicks).toBe(1);
    expect(() => maListePorts(docWith(null).doc).clickMaListe()).not.toThrow();
  });
});

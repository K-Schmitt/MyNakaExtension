// Naka's own « Ma liste » button on a title page (spec §5): `.dcpl-split > button.dc-btn-soft`, `.is-active`
// while the title is in the list. Clicking it lets Naka's page send its own request and update the class, so
// the button stays right after our writes (spec §7). Read only, but for that one programmatic click.

import type { FichePorts } from "../fiche-ports";

const BUTTON = ".dcpl-split > button.dc-btn-soft";
const ACTIVE = "is-active";

/** The slice of Naka's button read and clicked here: a real `button` has all of it. */
export type MaListeElement = {
  classList: { contains(name: string): boolean };
  click(): void;
};
export type MaListeDoc = {
  querySelector(selector: string): MaListeElement | null;
};

export function maListeButton(doc: MaListeDoc): MaListeElement | null {
  return doc.querySelector(BUTTON);
}

export function isInMaListe(button: MaListeElement): boolean {
  return button.classList.contains(ACTIVE);
}

export function clickMaListe(button: MaListeElement): void {
  button.click();
}

export function maListePorts(
  doc: MaListeDoc,
): Pick<FichePorts, "maListe" | "clickMaListe"> {
  return {
    maListe() {
      const button = maListeButton(doc);
      return button === null ? undefined : isInMaListe(button);
    },
    clickMaListe() {
      const button = maListeButton(doc);
      if (button !== null) clickMaListe(button);
    },
  };
}

// Naka's own « Ma liste » button on a title page: the first `button.nh-btn` of `div.dcpl-split`. In the list it
// carries `.is-on` and the title « Retirer de Ma liste »; out of it, `.nh-btn-card` and « Ajouter à Ma liste ».
// The second child, `button.dcpl-split-toggle` (playlists), is ignored. Clicking it lets Naka's page send its own
// request and update the class, so the button stays right after our writes. Read only, but for that one click.

import type { FichePorts } from "../fiche-ports";

const BUTTON = "div.dcpl-split > button.nh-btn:first-child";
const ACTIVE = "is-on";

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

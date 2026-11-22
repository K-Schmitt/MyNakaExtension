// The SensCritique chip in the title hero: « ★ 7,4 SC · ta note 8 », in a closed host next to Naka's own
// rating. A trusted click scrolls to our rows in « À propos »; the chip writes nothing. Shown for a linked
// product with an average or a rating, taken off otherwise.

import type { FicheView } from "../fiche-view";
import type { DocLike } from "./dom-like";
import { HERO_CHIP_LABEL, heroChipText } from "./fiche-copy";
import { chipPorts, type HeroPlace } from "./fiche-hero-place";
import { CHIP_SHEET } from "./fiche-styles";
import { createClosedHost } from "./row-host";
import { createRowKeeper } from "./row-keeper";
import { onTrustedClick } from "./trusted";

const CHIP_DECLARATIONS = [
  "all: initial",
  "display: inline-flex",
  "vertical-align: middle",
];

export type HeroChipPorts = HeroPlace & {
  doc: Pick<DocLike, "createElement">;
};

function createChip(ports: HeroChipPorts, onClick: () => void) {
  const { host, root } = createClosedHost(
    ports.doc,
    "span",
    CHIP_DECLARATIONS,
    CHIP_SHEET,
  );
  const button = ports.doc.createElement("button");
  button.setAttribute("type", "button");
  button.className = "mn-chip";
  button.setAttribute("aria-label", HERO_CHIP_LABEL);
  onTrustedClick(button, onClick);
  root.appendChild(button);
  return { button, keeper: createRowKeeper(chipPorts(ports, host)) };
}

export function createHeroChip(ports: HeroChipPorts): {
  show(view: FicheView, reveal: () => void): void;
  hide(): void;
} {
  let made: ReturnType<typeof createChip> | undefined;
  let reveal: () => void = () => {};
  return {
    show(view, onReveal) {
      reveal = onReveal;
      const product = view.info?.product;
      if (
        product === undefined ||
        (product.average === null && product.mine === null)
      ) {
        made?.keeper.stop();
        return;
      }
      made ??= createChip(ports, () => reveal());
      const text = heroChipText(product.average, product.mine);
      if (made.button.textContent !== text) made.button.textContent = text;
      made.keeper.start();
    },
    hide() {
      made?.keeper.stop();
    },
  };
}

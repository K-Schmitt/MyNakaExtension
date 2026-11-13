// The title page UI tests' world: the real controller on the fake ports of its own tests, drawing into the
// panel and the episode boxes on DOM fakes. A click on a star goes through the controller to the ports.

import { createFicheController } from "../src/content/fiche-controller";
import type { FicheView } from "../src/content/fiche-view";
import type { EpisodeBox } from "../src/content/ui/fiche-episodes";
import { createFicheUi } from "../src/content/ui/fiche-ui";
import type { KeeperPorts } from "../src/content/ui/row-keeper";
import { fakePorts } from "./fiche-controller-fakes";
import { descendants, FakeDoc, FakeElement } from "./ui-fakes";

/** An episode box as Naka draws it: thumb (with its code), body (with its title), the hit button over it all. */
export function fakeBox(code: string | undefined) {
  const box = new FakeElement("div");
  const thumb = new FakeElement("div");
  const body = new FakeElement("div");
  const title = new FakeElement("p");
  const hit = new FakeElement("button");
  const codeSpan = new FakeElement("span");
  codeSpan.textContent = code ?? null;
  if (code !== undefined) thumb.appendChild(codeSpan);
  body.appendChild(title);
  for (const part of [thumb, body, hit]) box.appendChild(part);
  const clicks: unknown[] = [];
  box.addEventListener("click", (event) => clicks.push(event));
  const port: EpisodeBox = {
    key: box,
    code: () => (code === undefined ? undefined : codeSpan.textContent),
    placeBadge: (host) => {
      if (host.parentNode !== thumb) thumb.appendChild(host);
    },
    placeStars: (host) => {
      if (host.parentNode !== body) body.appendChild(host);
    },
  };
  return { box, thumb, body, hit, codeSpan, clicks, port };
}

export type FakeBox = ReturnType<typeof fakeBox>;

export const idleKeeper = (): KeeperPorts => ({
  snapshot: () => undefined,
  apply: () => {},
  detach: () => {},
  watch: () => () => {},
  timer: { set: () => 0, clear: () => {} },
});

export function fakeUi(path: string, boxes: FakeBox[] = []) {
  const fake = fakePorts();
  const doc = new FakeDoc();
  const kept = { host: undefined as FakeElement | undefined, detached: 0 };
  let onPageChange: (() => void) | undefined;
  const ui = createFicheUi({
    doc,
    keeper: (host) => {
      kept.host = host as FakeElement;
      return {
        ...idleKeeper(),
        detach: () => {
          kept.detached += 1;
        },
      };
    },
    boxes: () => boxes.map((b) => b.port),
    watch: (fn) => {
      onPageChange = fn;
      return () => {
        onPageChange = undefined;
      };
    },
  });
  const controller = createFicheController({
    ...fake.ports,
    render: (view: FicheView | undefined) => {
      fake.views.push(view);
      ui.render(view, controller);
    },
  });
  controller.path(path);
  return {
    ...fake,
    controller,
    kept,
    pageChanged: () => onPageChange?.(),
    watching: () => onPageChange !== undefined,
  };
}

// A shadow root's elements, without the stylesheet node the fakes fall back to.
const drawn = (host: FakeElement | undefined) =>
  host === undefined
    ? []
    : descendants(host.shadow).filter((el) => el.tag !== "style");

/** The panel's elements, inside its closed shadow root. */
export const panelParts = (kept: { host: FakeElement | undefined }) =>
  drawn(kept.host);

export const texts = (els: FakeElement[]) =>
  els.map((el) => el.textContent ?? "").filter((t) => t !== "");

export const starsOf = (els: FakeElement[]) =>
  els.filter((el) => el.attributes.role === "radio");

export const checked = (els: FakeElement[]) =>
  starsOf(els)
    .filter((el) => el.attributes["aria-checked"] === "true")
    .map((el) => el.attributes["aria-label"]);

export const buttonNamed = (els: FakeElement[], text: string) =>
  els.find((el) => el.tag === "button" && el.textContent === text);

/** The closed hosts we put in an element: the children with a shadow root attached. */
export const hostsIn = (el: FakeElement) =>
  el.children.filter(
    (c): c is FakeElement =>
      c instanceof FakeElement && c.shadowInit.length > 0,
  );

export const shadowParts = drawn;

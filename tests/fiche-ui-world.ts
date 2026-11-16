// The title page UI tests' world: the real controller on the fake ports of its own tests, drawing into a
// fake of Naka's aside (its info panel) and the episode boxes on DOM fakes. A click on a star goes through the controller to the ports.

import { createFicheController } from "../src/content/fiche-controller";
import type { FicheView } from "../src/content/fiche-view";
import type { EpisodeBox } from "../src/content/ui/fiche-episodes";
import { createFicheUi } from "../src/content/ui/fiche-ui";
import { fakePorts } from "./fiche-controller-fakes";
import { descendants, FakeDoc, FakeElement, type FakeNode } from "./ui-fakes";

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

/** Naka's info panel rows (owner's probe, 2026-11-13): « Note TMDB » is the last one on both. */
export const FILM_ROWS = ["Audio", "Titre original", "Sortie", "Note TMDB"];
export const SERIES_ROWS = [
  "Audio",
  "Sous-titres",
  "Titre original",
  "Diffusion",
  "Saisons",
  "Note TMDB",
];

function nakaRow(label: string): FakeElement {
  const row = new FakeElement("div");
  row.className = "dcf-info-row";
  const name = new FakeElement("span");
  name.textContent = label;
  row.appendChild(name);
  row.appendChild(new FakeElement("span"));
  return row;
}

/**
 * Naka's aside as the probe saw it: the poster, `div.dca-panel` with its rows, a bare `div`, then the links.
 * `redraw` makes it all again, as Naka does: a fresh panel, our rows and host left out until put back.
 */
export function fakeAside(labels: readonly string[]) {
  const aside = new FakeElement("aside");
  const naka = new Set<FakeNode>();
  let panel = new FakeElement("div");
  const redraw = () => {
    for (const child of [...aside.children]) aside.drop(child);
    panel = new FakeElement("div");
    panel.className = "dca-panel";
    for (const label of labels) {
      const row = nakaRow(label);
      naka.add(row);
      panel.appendChild(row);
    }
    const links = new FakeElement("div");
    links.className = "flex flex-col gap-2 mt-3.5";
    const parts = [
      new FakeElement("div"),
      panel,
      new FakeElement("div"),
      links,
    ];
    for (const part of parts) aside.appendChild(part);
  };
  redraw();
  return {
    aside,
    redraw,
    panel: () => panel,
    /** The panel's children that are not Naka's: our rows. */
    ours: () => panel.children.filter((c) => !naka.has(c)) as FakeElement[],
    /** The element right after the panel, when it is one of our closed hosts. */
    actions: () => {
      const next = panel.nextElementSibling;
      return next !== null && next.shadowInit.length > 0 ? next : undefined;
    },
  };
}

export type FakeAside = ReturnType<typeof fakeAside>;

export const idleTimer = { set: () => 0, clear: () => {} };

export function fakeUi(path: string, boxes: FakeBox[] = []) {
  const fake = fakePorts();
  const doc = new FakeDoc();
  const kept = fakeAside(path.includes("/tv/") ? SERIES_ROWS : FILM_ROWS);
  const watchers = new Set<() => void>();
  /** The star rows and write buttons' rows watched for D7, and what IntersectionObserver v2 last said of them: `hidden` refuses
   * every row's clicks, `hiddenRows` only those rows'. */
  const stars = {
    hidden: false,
    hiddenRows: new Set<unknown>(),
    rows: [] as FakeElement[],
    /** The slot each watched row was drawn in, in the same order as `rows`. */
    slots: [] as object[],
    /** The slots released, the oldest first. */
    released: [] as object[],
  };
  const ui = createFicheUi({
    doc,
    panel: () => kept.panel(),
    timer: idleTimer,
    boxes: () => boxes.map((b) => b.port),
    seen: Object.assign(
      (row: unknown, slot: object) => {
        stars.rows.push(row as FakeElement);
        stars.slots.push(slot);
        return () => !stars.hidden && !stars.hiddenRows.has(row);
      },
      { release: (slot: object) => stars.released.push(slot) },
    ),
    watch: (fn) => {
      const watcher = () => fn();
      watchers.add(watcher);
      return () => {
        watchers.delete(watcher);
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
    stars,
    pageChanged: () => {
      for (const watcher of [...watchers]) watcher();
    },
    watching: () => watchers.size > 0,
  };
}

/** Every element below a node, through the closed roots we attached (their stylesheet node left out). */
export function deepParts(node: FakeNode): FakeElement[] {
  const all = node.children.flatMap((c): FakeElement[] => {
    if (!(c instanceof FakeElement)) return deepParts(c);
    const shadow = c.shadowInit.length > 0 ? deepParts(c.shadow) : [];
    return [c, ...deepParts(c), ...shadow];
  });
  return all.filter((el) => el.tag !== "style");
}

/** What we drew on the title page: our two rows in the panel, then the actions host after it. */
export const panelParts = (kept: FakeAside): FakeElement[] => {
  const actions = kept.actions();
  return [
    ...kept.ours().flatMap((row) => [row, ...deepParts(row)]),
    ...(actions === undefined ? [] : deepParts(actions.shadow)),
  ];
};

// A shadow root's elements, without the stylesheet node the fakes fall back to.
const drawn = (host: FakeElement | undefined) =>
  host === undefined
    ? []
    : descendants(host.shadow).filter((el) => el.tag !== "style");

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

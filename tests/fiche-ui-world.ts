// The title page UI tests' world: the real controller on the fake ports of its own tests, drawing into a
// fake of Naka's aside (its info panel) and the episode boxes on DOM fakes. A click on a star goes through the controller to the ports.

import { createFicheController } from "../src/content/fiche-controller";
import type { FicheView } from "../src/content/fiche-view";
import type { EpisodeBox } from "../src/content/ui/fiche-episodes";
import { createFicheUi } from "../src/content/ui/fiche-ui";
import { fakePorts } from "./fiche-controller-fakes";
import { descendants, FakeDoc, FakeElement, type FakeNode } from "./ui-fakes";

/**
 * An episode row as Naka's new front draws it (capture `cap-saison-1`): `li.nh-ep-row` > the number
 * (`span.nh-ep-num`), the thumb (`span.nh-ep-thumb`: img, « Vu » button), a span holding the title
 * (`span.nh-row-title`) and the overview, the actions. The whole `li` starts the episode: it hears the
 * input events in `heard` (its clicks in `clicks`).
 */
export function fakeBox(code: string | undefined, title = "Épisode") {
  const box = new FakeElement("li");
  const num = new FakeElement("span");
  num.className = "nh-ep-num";
  num.textContent = code ?? null;
  const thumb = new FakeElement("span");
  thumb.className = "nh-ep-thumb";
  const vu = new FakeElement("button");
  vu.className = "nh-ep-vu";
  vu.textContent = "Vu";
  for (const part of [new FakeElement("img"), vu]) thumb.appendChild(part);
  const body = new FakeElement("span");
  const titleSpan = new FakeElement("span");
  titleSpan.className = "nh-row-title";
  titleSpan.textContent = title;
  const overview = new FakeElement("span");
  overview.className = "nh-ep-overview";
  for (const part of [titleSpan, overview]) body.appendChild(part);
  const actions = new FakeElement("span");
  actions.className = "nh-ep-actions";
  if (code !== undefined) box.appendChild(num);
  for (const part of [thumb, body, actions]) box.appendChild(part);
  const heard: Record<string, unknown[]> = {};
  for (const type of ["click", "pointerdown", "mousedown", "keydown"]) {
    heard[type] = [];
    box.addEventListener(type, (event) => heard[type]?.push(event));
  }
  const clicks = heard.click as unknown[];
  const port: EpisodeBox = {
    key: box,
    code: () => (code === undefined ? undefined : num.textContent),
    title: () => titleSpan.textContent,
    placeBadge: (host) => {
      if (host.parentNode !== thumb) thumb.appendChild(host);
    },
    placeStars: (host) => {
      if (titleSpan.nextElementSibling !== host) titleSpan.after(host);
    },
  };
  return { box, thumb, body, titleSpan, codeSpan: num, clicks, heard, port };
}

export type FakeBox = ReturnType<typeof fakeBox>;

/** The labels of Naka's « À propos » facts (probe 2026-11-22): a film and a series show the same list. */
export const FILM_FACTS = [
  "Sortie",
  "Durée",
  "Audio",
  "Sous-titres",
  "Titre original",
  "Hors ligne",
  "Source",
];
export const SERIES_FACTS = FILM_FACTS;

function nakaFact(label: string): FakeElement {
  const row = new FakeElement("div");
  const term = new FakeElement("dt");
  term.textContent = label;
  row.appendChild(term);
  row.appendChild(new FakeElement("dd"));
  return row;
}

/**
 * Naka's « À propos » column as the probe saw it: `div.nh-sechead`, then `dl.nh-fiche-facts` with one
 * `div > dt + dd` per fact. `redraw` makes it all again, as Naka does: a fresh list, our rows and host left
 * out until put back.
 */
export function fakeAbout(labels: readonly string[]) {
  const about = new FakeElement("div");
  const naka = new Set<FakeNode>();
  let panel = new FakeElement("dl");
  const redraw = () => {
    for (const child of [...about.children]) about.drop(child);
    const head = new FakeElement("div");
    head.className = "nh-sechead";
    panel = new FakeElement("dl");
    panel.className = "nh-fiche-facts";
    for (const label of labels) {
      const row = nakaFact(label);
      naka.add(row);
      panel.appendChild(row);
    }
    about.appendChild(head);
    about.appendChild(panel);
  };
  redraw();
  return {
    about,
    redraw,
    panel: () => panel,
    /** The list's children that are not Naka's: our rows. */
    ours: () => panel.children.filter((c) => !naka.has(c)) as FakeElement[],
    /** The element right after the list, when it is one of our closed hosts. */
    actions: () => {
      const next = panel.nextElementSibling;
      return next !== null && next.shadowInit.length > 0 ? next : undefined;
    },
  };
}

export type FakeAbout = ReturnType<typeof fakeAbout>;

/** Naka's hero badges: a first badge, its own rating, a last badge. `shown: false` is a page without them. */
export function fakeHero() {
  const badges = new FakeElement("div");
  const rating = new FakeElement("span");
  const last = new FakeElement("span");
  for (const badge of [new FakeElement("span"), rating, last])
    badges.appendChild(badge);
  return { badges, rating, shown: true };
}

export const idleTimer = { set: () => 0, clear: () => {} };

export function fakeUi(path: string, boxes: FakeBox[] = []) {
  const fake = fakePorts();
  const doc = new FakeDoc();
  const kept = fakeAbout(path.includes("/tv/") ? SERIES_FACTS : FILM_FACTS);
  const watchers = new Set<() => void>();
  /** The star rows and write buttons' rows watched for visibility, and what IntersectionObserver v2 last said of them: `hidden` refuses
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
  const hero = fakeHero();
  const ui = createFicheUi({
    doc,
    panel: () => kept.panel(),
    timer: idleTimer,
    badges: () => (hero.shown ? hero.badges : null),
    rating: () => (hero.rating.parent === hero.badges ? hero.rating : null),
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
    hero,
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

/** What we drew on the title page: our two rows in the facts list, then the actions host after it. */
export const panelParts = (kept: FakeAbout): FakeElement[] => {
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

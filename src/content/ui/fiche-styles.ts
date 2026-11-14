// The stylesheets of the title page hosts, in Naka's palette (the theme tokens on :host): the actions under
// the info panel (280 px wide), the average badge on an episode's thumb, the stars under its title (the
// panel's « Ta note » row uses them too).

import { themeCss } from "../../ui/theme-tokens";
import { BLOCK_RULES, REDUCED_MOTION_RULE } from "./block-styles";
import { CHOICE_RULES } from "./row-styles";

const v = (name: string): string => `var(--mn-${name})`;

const ACTIONS_RULES = [
  `.mn-fiche-actions{display:flex;flex-direction:column;gap:${v("space-2")};box-sizing:border-box;width:100%;margin-top:${v("space-3")};font:${v("text-body")} ${v("font")};color:${v("color-text")};}`,
  `.mn-fiche-actions .mn-row{margin-top:0;}`,
  `.mn-link{display:inline-block;text-decoration:none;}`,
  `.mn-fiche-actions .mn-title{font:${v("text-body")} ${v("font")};font-weight:600;}`,
  `.mn-fiche-actions .mn-choices{max-height:240px;}`,
  `.mn-thumb img{display:block;width:100%;height:100%;object-fit:cover;}`,
  `.mn-search{flex-wrap:nowrap;gap:${v("space-2")};}`,
  `.mn-field{flex:1 1 auto;min-width:0;box-sizing:border-box;font:inherit;color:${v("color-text")};background:${v("color-surface-raised")};border:1px solid ${v("color-border")};border-radius:${v("radius-sm")};padding:6px 8px;}`,
  `.mn-field::placeholder{color:${v("color-text-secondary")};}`,
  `.mn-field:focus-visible{outline:2px solid ${v("color-accent-text")};outline-offset:2px;}`,
];

const BADGE_RULES = [
  `.mn-badge{display:block;padding:2px 6px;font:600 12px/16px ${v("font")};color:${v("color-on-accent")};background:${v("color-accent")};border-radius:${v("radius-sm")};box-shadow:${v("shadow")};}`,
];

const EPISODE_STARS_RULES = [
  `.mn-row--stars{margin-top:0;gap:${v("space-1")};}`,
  `.mn-row--stars[aria-busy="true"]{opacity:.5;}`,
  `.mn-star{font-size:16px;min-width:0;padding:0 1px;}`,
  `.mn-stars[data-previewing] .mn-star{color:${v("color-star-empty")};}`,
  `.mn-stars[data-previewing] .mn-star.mn-star--lit{color:${v("color-star-filled")};}`,
];

// Its buttons (« Annuler », « Chercher », the candidates) have transitions: the reduced motion rule goes last.
export const ACTIONS_SHEET: string =
  themeCss(":host") +
  [...BLOCK_RULES, ...CHOICE_RULES, ...ACTIONS_RULES].join("") +
  REDUCED_MOTION_RULE;

export const BADGE_SHEET: string = themeCss(":host") + BADGE_RULES.join("");

export const EPISODE_STARS_SHEET: string =
  themeCss(":host") + [...BLOCK_RULES, ...EPISODE_STARS_RULES].join("");

// The « Ta note » row of the info panel: ten stars beside the label leave no room for « 7/10 », which then
// wrapped under them and made the row taller than Naka's (Task 8 stub). The row shows the stars only (plan
// 8, Task 6), right-aligned like Naka's values; the marked star still carries the rating (aria-checked).
const PANEL_STARS_RULES = [
  ".mn-row--stars{flex-wrap:nowrap;justify-content:flex-end;}",
  ".mn-stars-value{display:none;}",
];

export const PANEL_STARS_SHEET: string =
  EPISODE_STARS_SHEET + PANEL_STARS_RULES.join("");

// The stylesheets of the title page hosts, in Naka's palette (the theme tokens on :host): the panel block
// under the info panel (280 px wide), the average badge on an episode's thumb, the stars under its title.

import { themeCss } from "../../ui/theme-tokens";
import { BLOCK_RULES } from "./block-styles";
import { CHOICE_RULES } from "./row-styles";

const v = (name: string): string => `var(--mn-${name})`;

const PANEL_RULES = [
  `.mn-fiche{display:flex;flex-direction:column;gap:${v("space-1")};box-sizing:border-box;width:100%;padding:${v("space-3")};font:${v("text-body")} ${v("font")};color:${v("color-text")};background:${v("color-surface")};border:1px solid ${v("color-border")};border-radius:${v("radius-lg")};}`,
  `.mn-fiche .mn-fiche-head{display:flex;flex-wrap:nowrap;align-items:baseline;justify-content:space-between;gap:${v("space-2")};margin-top:0;}`,
  `.mn-fiche-name{font:${v("text-small")} ${v("font")};font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${v("color-accent-text")};}`,
  `.mn-fiche-average{font:${v("text-title")} ${v("font")};font-weight:600;white-space:nowrap;color:${v("color-text")};}`,
  `.mn-fiche-mine{margin-top:${v("space-2")};font:${v("text-small")} ${v("font")};color:${v("color-text-secondary")};}`,
  `.mn-fiche .mn-row{margin-top:${v("space-1")};}`,
  `.mn-fiche .mn-star{font-size:20px;min-width:0;padding:1px;}`,
  `.mn-fiche .mn-title{font:${v("text-body")} ${v("font")};font-weight:600;}`,
  `.mn-fiche .mn-choices{max-height:240px;}`,
  `.mn-thumb img{display:block;width:100%;height:100%;object-fit:cover;}`,
];

const BADGE_RULES = [
  `.mn-badge{display:block;padding:2px 6px;font:600 12px/16px ${v("font")};color:${v("color-on-accent")};background:${v("color-accent")};border-radius:${v("radius-sm")};box-shadow:${v("shadow")};}`,
];

const EPISODE_STARS_RULES = [
  `.mn-row--stars{margin-top:0;gap:${v("space-1")};}`,
  `.mn-row--stars[aria-busy="true"]{opacity:.5;}`,
  `.mn-star{font-size:16px;min-width:0;padding:0 1px;}`,
];

export const PANEL_SHEET: string =
  themeCss(":host") +
  [...BLOCK_RULES, ...CHOICE_RULES, ...PANEL_RULES].join("");

export const BADGE_SHEET: string = themeCss(":host") + BADGE_RULES.join("");

export const EPISODE_STARS_SHEET: string =
  themeCss(":host") + [...BLOCK_RULES, ...EPISODE_STARS_RULES].join("");

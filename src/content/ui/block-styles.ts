// The stylesheet of the blocks drawn on Naka: the theme tokens, then one rule per class the renderers use.

import { themeCss } from "../../ui/theme-tokens";

const v = (name: string): string => `var(--mn-${name})`;

/** The rules of the cards, shared by the player overlay and the home row. */
export const BLOCK_RULES: string[] = [
  `.mn-card{display:block;font:${v("text-body")} ${v("font")};color:${v("color-text")};background:color-mix(in srgb, ${v("color-surface")} calc(${v("surface-alpha")} * 100%), transparent);border:1px solid ${v("color-border")};border-radius:${v("radius-lg")};padding:${v("space-4")};margin:${v("space-3")};box-shadow:${v("shadow")};}`,
  `.mn-card::before{content:"SensCritique";display:block;font:${v("text-small")} ${v("font")};color:${v("color-accent-text")};text-transform:uppercase;font-weight:600;letter-spacing:.04em;margin-bottom:${v("space-2")};}`,
  `.mn-line{color:${v("color-text-secondary")};}`,
  `.mn-title{font:${v("text-title")} ${v("font")};font-weight:600;color:${v("color-text")};}`,
  `.mn-warning{margin-top:${v("space-2")};color:${v("color-warning-text")};background:${v("color-warning-bg")};padding:${v("space-2")};border-radius:${v("radius-sm")};}`,
  `.mn-error{margin-top:${v("space-2")};color:${v("color-error-text")};background:${v("color-error-bg")};padding:${v("space-2")};border-radius:${v("radius-sm")};}`,
  `.mn-row{display:flex;flex-wrap:wrap;gap:${v("space-2")};margin-top:${v("space-3")};}`,
  `.mn-row--stars{align-items:center;flex-wrap:wrap;}`,
  `.mn-stars{display:flex;gap:0;}`,
  `.mn-star{font:inherit;font-size:22px;line-height:1;min-width:24px;padding:2px;border:0;background:transparent;color:${v("color-star-empty")};cursor:pointer;}`,
  `.mn-star[aria-checked=true],.mn-star:has(~ .mn-star[aria-checked=true]){color:${v("color-star-filled")};}`,
  `.mn-stars:hover .mn-star{color:${v("color-star-empty")};}`,
  `.mn-stars .mn-star:hover,.mn-stars .mn-star:has(~ .mn-star:hover){color:${v("color-star-filled")};}`,
  `.mn-star:focus-visible{outline:2px solid ${v("color-accent-text")};outline-offset:2px;border-radius:${v("radius-sm")};}`,
  `.mn-stars-value{font:${v("text-small")} ${v("font")};color:${v("color-text-secondary")};}`,
  `.mn-btn{font:inherit;color:${v("color-text-secondary")};background:${v("color-surface-raised")};border:1px solid ${v("color-border")};border-radius:${v("radius-sm")};padding:6px 12px;cursor:pointer;transition:background ${v("motion")},border-color ${v("motion")};}`,
  `.mn-btn:hover{background:${v("color-surface-hover")};}`,
  `.mn-btn:focus-visible{outline:2px solid ${v("color-accent-text")};outline-offset:2px;}`,
  `.mn-btn:active{background:${v("color-accent-selected")};}`,
  `.mn-btn--primary{background:${v("color-accent")};color:${v("color-on-accent")};border-color:${v("color-accent")};font-weight:600;}`,
  `.mn-btn--primary:hover{background:${v("color-accent-hover")};}`,
  `.mn-btn--ghost{background:transparent;color:${v("color-accent-text")};border-color:transparent;}`,
  `@media (prefers-reduced-motion: reduce){.mn-btn{transition:none;}}`,
];

export const BLOCK_SHEET: string = themeCss(":host") + BLOCK_RULES.join("");

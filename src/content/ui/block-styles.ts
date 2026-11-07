// The stylesheet of the blocks drawn on Naka: the theme tokens, then one rule per class the renderers use.

import { themeCss } from "../../ui/theme-tokens";

const v = (name: string): string => `var(--mn-${name})`;

const RULES = [
  `.mn-card{display:block;font:${v("text-body")} ${v("font")};color:${v("color-text")};background:color-mix(in srgb, ${v("color-surface")} 96%, transparent);border:1px solid ${v("color-border")};border-radius:${v("radius-lg")};padding:${v("space-4")};margin:${v("space-3")};box-shadow:${v("shadow")};}`,
  `.mn-card::before{content:"SensCritique";display:block;font:${v("text-small")} ${v("font")};color:${v("color-accent-text")};text-transform:uppercase;font-weight:600;letter-spacing:.04em;margin-bottom:${v("space-2")};}`,
  `.mn-title{font:${v("text-title")} ${v("font")};font-weight:600;color:${v("color-text")};}`,
  `.mn-line{color:${v("color-text-secondary")};}`,
  `.mn-warning{color:${v("color-warning-text")};background:${v("color-warning-bg")};padding:${v("space-2")};border-radius:${v("radius-sm")};}`,
  `.mn-error{color:${v("color-error-text")};background:${v("color-error-bg")};padding:${v("space-2")};border-radius:${v("radius-sm")};}`,
  `.mn-row{display:flex;flex-wrap:wrap;gap:${v("space-2")};margin-top:${v("space-3")};}`,
  `.mn-row--grid5{display:grid;grid-template-columns:repeat(5, 1fr);}`,
  `.mn-btn{font:inherit;color:${v("color-text-secondary")};background:${v("color-surface-raised")};border:1px solid ${v("color-border")};border-radius:${v("radius-sm")};padding:6px 12px;cursor:pointer;transition:background ${v("motion")},border-color ${v("motion")};}`,
  `.mn-btn:hover{background:${v("color-surface-hover")};}`,
  `.mn-btn:focus-visible{outline:2px solid ${v("color-accent-text")};outline-offset:2px;}`,
  `.mn-btn:active{background:${v("color-accent-selected")};}`,
  `.mn-btn[aria-pressed=true]{background:${v("color-accent")};color:${v("color-on-accent")};border-color:${v("color-accent")};font-weight:600;}`,
  `.mn-btn--primary{background:${v("color-accent")};color:${v("color-on-accent")};border-color:${v("color-accent")};font-weight:600;}`,
  `.mn-btn--primary:hover{background:${v("color-accent-hover")};}`,
  `.mn-panel{display:block;font:${v("text-body")} ${v("font")};color:${v("color-text")};background:color-mix(in srgb, ${v("color-surface")} 96%, transparent);border:1px solid ${v("color-border")};border-radius:${v("radius-lg")};padding:${v("space-3")};box-shadow:${v("shadow")};}`,
  `.mn-panel-head{display:flex;align-items:center;justify-content:space-between;gap:${v("space-2")};margin-bottom:${v("space-2")};}`,
  `.mn-heading{font:${v("text-title")} ${v("font")};font-weight:600;margin:0;}`,
  `.mn-subheading{font:${v("text-small")} ${v("font")};color:${v("color-text-tertiary")};margin:${v("space-3")} 0 ${v("space-1")};}`,
  `@media (prefers-reduced-motion: reduce){.mn-btn{transition:none;}}`,
];

export const BLOCK_SHEET: string = themeCss(":host") + RULES.join("");

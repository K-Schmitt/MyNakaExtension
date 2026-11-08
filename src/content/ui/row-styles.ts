// The stylesheet of the home row: the theme tokens, the cards' rules, then the header and the track.

import { themeCss } from "../../ui/theme-tokens";
import { BLOCK_RULES } from "./block-styles";

const v = (name: string): string => `var(--mn-${name})`;

const ROW_RULES = [
  ...BLOCK_RULES,
  `.mn-head{display:block;font:${v("text-body")} ${v("font")};color:${v("color-text")};margin-bottom:${v("space-2")};}`,
  `.mn-head-title{font:${v("text-title")} ${v("font")};font-weight:700;color:${v("color-text")};}`,
  `.mn-head-sub{font:${v("text-small")} ${v("font")};color:${v("color-text-secondary")};}`,
  `.mn-track{display:flex;align-items:flex-start;gap:${v("space-3")};overflow-x:auto;}`,
  `.mn-track .mn-card{flex:0 0 auto;width:320px;max-width:100%;margin:0;}`,
].join("");

export const ROW_SHEET: string = themeCss(":host") + ROW_RULES;

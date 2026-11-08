// The stylesheet of the home row: the theme tokens, the cards' rules (lines, stars, buttons), then the
// header with its arrows, the track and the tiles. Sizes are the plan's starting values (spec §6.2):
// tiles 300×420 like Naka's `--cw`, 12 px apart like its `pl-3`, a 16:9 picture, 32×48 choice posters.

import { themeCss } from "../../ui/theme-tokens";
import { BLOCK_RULES } from "./block-styles";

const v = (name: string): string => `var(--mn-${name})`;

const HEAD_RULES = [
  `.mn-head{display:flex;align-items:flex-end;justify-content:space-between;gap:${v("space-3")};font:${v("text-body")} ${v("font")};color:${v("color-text")};margin-bottom:${v("space-3")};}`,
  `.mn-head-text{min-width:0;}`,
  `.mn-head-title{margin:0;font:700 18px/24px ${v("font")};color:${v("color-text")};}`,
  `.mn-head-sub{font:13px/18px ${v("font")};color:${v("color-text-secondary")};}`,
  `.mn-arrows{display:flex;gap:${v("space-2")};flex:0 0 auto;}`,
  `.mn-arrow{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;font:400 22px/1 ${v("font")};color:${v("color-text")};background:${v("color-surface-raised")};border:1px solid ${v("color-border")};border-radius:${v("radius-pill")};cursor:pointer;transition:background ${v("motion")};}`,
  `.mn-arrow:hover{background:${v("color-surface-hover")};}`,
  `.mn-arrow:focus-visible{outline:2px solid ${v("color-accent-text")};outline-offset:2px;}`,
  `.mn-arrow[disabled]{opacity:.4;cursor:default;background:${v("color-surface-raised")};}`,
  `.mn-arrow[hidden]{display:none;}`,
];

const TRACK_RULES = [
  `.mn-track{display:flex;align-items:stretch;gap:12px;padding:4px 0;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;}`,
  `.mn-track::-webkit-scrollbar{display:none;}`,
];

const TILE_RULES = [
  `.mn-tile{flex:0 0 auto;width:300px;height:420px;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;scroll-snap-align:start;font:${v("text-body")} ${v("font")};color:${v("color-text")};background:${v("color-surface")};border:1px solid ${v("color-border")};border-radius:${v("radius-lg")};}`,
  `.mn-art{flex:0 0 auto;width:100%;aspect-ratio:16 / 9;overflow:hidden;background:${v("color-surface-raised")};}`,
  `.mn-art img,.mn-thumb img{display:block;width:100%;height:100%;object-fit:cover;}`,
  `.mn-tile-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:${v("space-1")};padding:${v("space-3")};overflow:hidden;}`,
  `.mn-tile .mn-title{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;flex:0 0 auto;}`,
  `.mn-tile .mn-row{margin-top:${v("space-2")};}`,
  `.mn-tile-body>.mn-row:last-child{margin-top:auto;}`,
  `.mn-tile .mn-star{font-size:20px;min-width:0;padding:2px 1px;}`,
  `.mn-btn--small{font:${v("text-small")} ${v("font")};padding:2px 8px;}`,
];

const CHOICE_RULES = [
  `.mn-choices{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:${v("space-1")};margin-top:${v("space-2")};overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;}`,
  `.mn-choice{display:flex;align-items:center;gap:${v("space-2")};width:100%;flex:0 0 auto;padding:${v("space-1")};text-align:left;}`,
  `.mn-choice-label{min-width:0;overflow-wrap:anywhere;}`,
  `.mn-thumb{flex:0 0 auto;width:32px;height:48px;overflow:hidden;border-radius:4px;background:${v("color-surface-hover")};}`,
  `.mn-choices-foot{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:${v("space-2")};padding-top:${v("space-2")};border-top:1px solid ${v("color-border")};}`,
];

const ROW_RULES = [
  ...BLOCK_RULES,
  ...HEAD_RULES,
  ...TRACK_RULES,
  ...TILE_RULES,
  ...CHOICE_RULES,
].join("");

export const ROW_SHEET: string = themeCss(":host") + ROW_RULES;

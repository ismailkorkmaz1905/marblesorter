// Pure geometry: where the board, funnel, belt and tray columns sit for a given viewport.
import { NCOLS, MAX_CAP } from './levelgen.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// flip: the screen shows this layout mirrored top-to-bottom (board at the bottom, marbles rising).
// The simulation always runs in this unflipped space; only drawing and input are mirrored.
export function computeLayout(vw, vh, top, bottom, W, H, cap, flip = false) {
  const pad = clamp(vw * 0.035, 10, 22);
  const avail = vh - top - bottom;
  const fullW = Math.min(vw - 2 * pad, 520);
  const cx = vw / 2;

  // Trays (bottom)
  const colGap = clamp(fullW * 0.025, 6, 12);
  const trayW = (fullW - colGap * (NCOLS - 1)) / NCOLS;
  const trayH = clamp(trayW * 0.4, 24, 42) * (flip ? 0.85 : 1); // flipped: trays sit up top, keep them slim
  const trayGap = clamp(trayH * 0.18, 4, 8);
  const traysVisible = flip ? (avail > 700 ? 2.8 : 2.2) : avail > 700 ? 3.6 : 2.6;
  const traysH = trayH * traysVisible + trayGap * Math.ceil(traysVisible);
  const trayTop = top + avail - traysH;

  // Belt (stadium loop)
  const r = clamp(vw * 0.055, 16, 28);
  let br = 9;
  let Ls = 0, P = 0;
  for (let k = 0; k < 3; k++) {
    Ls = fullW - 2 * (r + br + 5);
    P = 2 * Ls + 2 * Math.PI * r;
    br = clamp(Math.min(r * 0.62, (P / MAX_CAP) * 0.47), 6, 13);
  }
  const beltOuter = r + br + 5;
  const beltCY = trayTop - 8 - beltOuter;
  const beltTop = beltCY - beltOuter;

  // Board (top) + funnel
  const fp = clamp(vw * 0.025, 8, 14); // frame padding
  const funnelMin = clamp(Math.max(avail * 0.1, fullW * (avail < 600 ? 0.21 : 0.26)), 56, 150); // steep enough to flow
  const boardAvailH = beltTop - funnelMin - top - 6;
  const cell = Math.floor(clamp(Math.min((fullW - 2 * fp) / W, (boardAvailH - 2 * fp) / H), 24, 74));
  const boardW = cell * W, boardH = cell * H;
  const frameW = boardW + 2 * fp, frameH = boardH + 2 * fp;
  const spare = boardAvailH - frameH;
  const frameY = top + 4 + Math.max(0, spare * 0.5);
  const frameX = cx - frameW / 2;
  const boardX = frameX + fp, boardY = frameY + fp;
  const frameBottom = frameY + frameH;
  const neckW = br * 6.4;

  const L = {
    vw, vh, top, pad, cx, fullW,
    cell, W, H, boardX, boardY, boardW, boardH, frameX, frameY, frameW, frameH, fp, frameBottom,
    neckW, neckY: beltTop + 2,
    r, br, Ls, P, beltCY, beltTop, beltOuter,
    trayTop, trayW, trayH, trayGap, colGap, traysH,
    cap, bottom, flip,
  };
  L.colX = Array.from({ length: NCOLS }, (_, k) => cx - fullW / 2 + trayW / 2 + k * (trayW + colGap));
  L.dropS = L.colX.map((x) => sOfBottomX(L, x));
  return L;
}

// s = 0 at top-lane centre (funnel entry), travelling clockwise.
export function beltPoint(L, s) {
  const { Ls, r, cx, beltCY, P } = L;
  s = ((s % P) + P) % P;
  const half = Ls / 2;
  if (s < half) return { x: cx + s, y: beltCY - r };
  s -= half;
  if (s < Math.PI * r) {
    const a = -Math.PI / 2 + s / r;
    return { x: cx + half + Math.cos(a) * r, y: beltCY + Math.sin(a) * r };
  }
  s -= Math.PI * r;
  if (s < Ls) return { x: cx + half - s, y: beltCY + r };
  s -= Ls;
  if (s < Math.PI * r) {
    const a = Math.PI / 2 + s / r;
    return { x: cx - half + Math.cos(a) * r, y: beltCY + Math.sin(a) * r };
  }
  s -= Math.PI * r;
  return { x: cx - half + s, y: beltCY - r };
}

function sOfBottomX(L, x) {
  const half = L.Ls / 2;
  const cxl = clamp(x, L.cx - half, L.cx + half);
  return half + Math.PI * L.r + (L.cx + half - cxl);
}

export function cellRect(L, i) {
  const x = i % L.W, y = (i / L.W) | 0;
  return { x: L.boardX + x * L.cell, y: L.boardY + y * L.cell, s: L.cell };
}

export function cellCenter(L, i) {
  const r = cellRect(L, i);
  return { x: r.x + r.s / 2, y: r.y + r.s / 2 };
}

export function cellAt(L, px, py) {
  const x = Math.floor((px - L.boardX) / L.cell), y = Math.floor((py - L.boardY) / L.cell);
  if (x < 0 || y < 0 || x >= L.W || y >= L.H) return -1;
  return y * L.W + x;
}

export function trayY(L, index, shift) {
  return L.trayTop + index * (L.trayH + L.trayGap) + shift;
}

export function holePos(L, col, index, shift, hole) {
  const x = L.colX[col] + (hole - 1) * (L.trayW / 3.3);
  // trays are always drawn upright, so in a flipped view the hole sits mirrored inside the tray
  return { x, y: trayY(L, index, shift) + L.trayH * (L.flip ? 0.58 : 0.42) };
}

// Screen <-> simulation y for flipped views (the mirror is its own inverse).
export const screenY = (L, y) => (L.flip ? L.vh - y : y);
export const screenTop = (L, y, h) => (L.flip ? L.vh - y - h : y);

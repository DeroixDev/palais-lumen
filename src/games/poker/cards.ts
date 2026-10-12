// Painted playing cards for Salon-Poker: cream paper, brass hairline, ink and crimson pips,
// night-light figures for Bube, Dame and König, and a velvet back with a brass sun medallion.
// Every face is painted once (lazily) into a texture and cached.

import type { Texture } from 'pixi.js';
import { INK, ellipse, fillInk, glowAt, gold, paint, rim, rrect, rgb, seeded, type Ctx } from '../../world/painted/brush';
import { paintEmblem } from '../slots/symbols';
import { fourStar } from '../../core/lumenArt';
import { rankOf, suitOf } from './rules';

export const CW = 120;
export const CH = 168;
const RES = 2;

export const RANK_LABEL = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K', 'A'];
export const SUIT_NAME = ['Pik', 'Herz', 'Karo', 'Kreuz'];
const RED = 0xb8142e;
const BLACK = 0x1e1228;
export const suitColor = (s: number) => (s === 1 || s === 2 ? RED : BLACK);

/** The suit shape, centred on (x, y), about `s` tall. Builds the path only. */
export function suitPath(c: Ctx, suit: number, x: number, y: number, s: number) {
  const h = s / 2;
  c.beginPath();
  if (suit === 1) {
    // Heart.
    c.moveTo(x, y + h);
    c.bezierCurveTo(x - h * 0.2, y + h * 0.55, x - h * 1.05, y + h * 0.15, x - h * 1.0, y - h * 0.35);
    c.bezierCurveTo(x - h * 0.95, y - h * 0.95, x - h * 0.15, y - h * 1.0, x, y - h * 0.45);
    c.bezierCurveTo(x + h * 0.15, y - h * 1.0, x + h * 0.95, y - h * 0.95, x + h * 1.0, y - h * 0.35);
    c.bezierCurveTo(x + h * 1.05, y + h * 0.15, x + h * 0.2, y + h * 0.55, x, y + h);
  } else if (suit === 2) {
    // Diamond with gently curved sides.
    c.moveTo(x, y - h);
    c.quadraticCurveTo(x + h * 0.3, y - h * 0.3, x + h * 0.78, y);
    c.quadraticCurveTo(x + h * 0.3, y + h * 0.3, x, y + h);
    c.quadraticCurveTo(x - h * 0.3, y + h * 0.3, x - h * 0.78, y);
    c.quadraticCurveTo(x - h * 0.3, y - h * 0.3, x, y - h);
  } else if (suit === 0) {
    // Spade: an upside-down heart on a flared stem.
    c.moveTo(x, y - h);
    c.bezierCurveTo(x - h * 0.25, y - h * 0.55, x - h * 1.05, y - h * 0.2, x - h * 0.98, y + h * 0.3);
    c.bezierCurveTo(x - h * 0.92, y + h * 0.75, x - h * 0.3, y + h * 0.8, x - h * 0.08, y + h * 0.42);
    c.quadraticCurveTo(x - h * 0.12, y + h * 0.82, x - h * 0.45, y + h);
    c.lineTo(x + h * 0.45, y + h);
    c.quadraticCurveTo(x + h * 0.12, y + h * 0.82, x + h * 0.08, y + h * 0.42);
    c.bezierCurveTo(x + h * 0.3, y + h * 0.8, x + h * 0.92, y + h * 0.75, x + h * 0.98, y + h * 0.3);
    c.bezierCurveTo(x + h * 1.05, y - h * 0.2, x + h * 0.25, y - h * 0.55, x, y - h);
  } else {
    // Club: three leaves and a stem.
    const r = h * 0.46;
    c.moveTo(x + r, y - h * 0.48);
    c.arc(x, y - h * 0.48, r, 0, Math.PI * 2);
    c.moveTo(x - h * 0.5 + r, y + h * 0.12);
    c.arc(x - h * 0.5, y + h * 0.12, r, 0, Math.PI * 2);
    c.moveTo(x + h * 0.5 + r, y + h * 0.12);
    c.arc(x + h * 0.5, y + h * 0.12, r, 0, Math.PI * 2);
    c.moveTo(x - h * 0.12, y);
    c.quadraticCurveTo(x - h * 0.1, y + h * 0.8, x - h * 0.45, y + h);
    c.lineTo(x + h * 0.45, y + h);
    c.quadraticCurveTo(x + h * 0.1, y + h * 0.8, x + h * 0.12, y);
    c.closePath();
  }
}

function pip(c: Ctx, suit: number, x: number, y: number, s: number, flip = false) {
  c.save();
  if (flip) {
    c.translate(x, y);
    c.rotate(Math.PI);
    c.translate(-x, -y);
  }
  const col = suitColor(suit);
  suitPath(c, suit, x, y, s);
  const g = c.createLinearGradient(0, y - s / 2, 0, y + s / 2);
  g.addColorStop(0, rgb(col === RED ? 0xe0405a : 0x4a3a5a));
  g.addColorStop(1, rgb(col));
  c.fillStyle = g;
  c.fill();
  // A small highlight keeps the pips from looking flat.
  ellipse(c, x - s * 0.18, y - s * 0.18, s * 0.1, s * 0.07);
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fill();
  c.restore();
}

/** Pip spots for 2..10 in a unit box (x, y ∈ [-1, 1]). */
const PIPS: number[][][] = [
  [[0, -1], [0, 1]],
  [[0, -1], [0, 0], [0, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, -0.5], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, -0.5], [-1, 0], [1, 0], [0, 0.5], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [-1, -1 / 3], [1, -1 / 3], [0, 0], [-1, 1 / 3], [1, 1 / 3], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, -2 / 3], [-1, -1 / 3], [1, -1 / 3], [-1, 1 / 3], [1, 1 / 3], [0, 2 / 3], [-1, 1], [1, 1]],
];

function paper(c: Ctx) {
  // Card body: warm cream, rounded, a thin brass line inside.
  rrect(c, 1.5, 1.5, CW - 3, CH - 3, 11);
  const g = c.createLinearGradient(0, 0, CW, CH);
  g.addColorStop(0, '#fffaf0');
  g.addColorStop(0.55, '#f6ead2');
  g.addColorStop(1, '#e6d4b0');
  fillInk(c, g, 2.4);
  const r = seeded(7);
  for (let i = 0; i < 90; i++) {
    c.fillStyle = `rgba(120,90,50,${0.03 + r() * 0.04})`;
    c.fillRect(4 + r() * (CW - 8), 4 + r() * (CH - 8), 1, 1);
  }
  rrect(c, 7, 7, CW - 14, CH - 14, 7);
  c.strokeStyle = 'rgba(176,132,60,0.55)';
  c.lineWidth = 1;
  c.stroke();
}

function corner(c: Ctx, rank: number, suit: number) {
  const col = rgb(suitColor(suit));
  for (const flip of [false, true]) {
    c.save();
    if (flip) {
      c.translate(CW, CH);
      c.rotate(Math.PI);
    }
    c.fillStyle = col;
    c.font = `bold ${rank === 8 ? 25 : 28}px Georgia, "Times New Roman", serif`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText(RANK_LABEL[rank], 19, 33);
    pip(c, suit, 19, 47, 17);
    c.restore();
  }
}

/** Court card vignette: a framed night scene with one of the house's lights. */
function court(c: Ctx, rank: number, suit: number) {
  const x0 = 30, y0 = 22, w = CW - 60, h = CH - 44;
  rrect(c, x0, y0, w, h, 6);
  fillInk(c, gold(c, x0, y0, x0 + w, y0 + h), 1.6);
  rrect(c, x0 + 4, y0 + 4, w - 8, h - 8, 4);
  const red = suitColor(suit) === RED;
  const bg = c.createLinearGradient(0, y0, 0, y0 + h);
  bg.addColorStop(0, red ? '#5a0e26' : '#1c1440');
  bg.addColorStop(1, red ? '#2a0612' : '#0c0820');
  c.fillStyle = bg;
  c.fill();
  c.save();
  rrect(c, x0 + 4, y0 + 4, w - 8, h - 8, 4);
  c.clip();
  const cx = CW / 2;
  const cy = CH / 2;
  glowAt(c, cx, cy - 6, 40, 46, 0xffcf7a, 0.32, 'lighter');
  const r = seeded(rank * 5 + suit);
  for (let i = 0; i < 14; i++) {
    ellipse(c, x0 + 6 + r() * (w - 12), y0 + 6 + r() * (h - 12), 0.8, 0.8);
    c.fillStyle = 'rgba(255,240,210,0.7)';
    c.fill();
  }
  if (rank === 9) {
    // Bube: a candle, the youngest of the lights, on a brass dish.
    glowAt(c, cx, cy - 22, 26, 30, 0xffcf7a, 0.6, 'lighter');
    ellipse(c, cx, cy + 22, 20, 6);
    fillInk(c, gold(c, cx - 20, cy + 16, cx + 20, cy + 28), 1.4);
    rrect(c, cx - 8, cy - 14, 16, 36, 3);
    const wx = c.createLinearGradient(cx - 8, 0, cx + 8, 0);
    wx.addColorStop(0, '#fffaf0');
    wx.addColorStop(1, '#c8a880');
    fillInk(c, wx, 1.4);
    c.beginPath();
    c.moveTo(cx, cy - 40);
    c.bezierCurveTo(cx + 8, cy - 28, cx + 7, cy - 19, cx, cy - 17);
    c.bezierCurveTo(cx - 7, cy - 19, cx - 8, cy - 28, cx, cy - 40);
    const fl = c.createRadialGradient(cx, cy - 22, 1, cx, cy - 26, 14);
    fl.addColorStop(0, '#fffef0');
    fl.addColorStop(0.5, '#ffd35a');
    fl.addColorStop(1, '#e8731f');
    fillInk(c, fl, 1.2);
  } else if (rank === 10) {
    // Dame: the crescent moon with a star at her side.
    c.beginPath();
    c.arc(cx - 2, cy + 6, 26, 0, Math.PI * 2);
    c.arc(cx + 9, cy, 22, 0, Math.PI * 2, true);
    const mg = c.createRadialGradient(cx - 12, cy, 4, cx - 2, cy + 6, 28);
    mg.addColorStop(0, '#fffbe8');
    mg.addColorStop(1, '#d8b060');
    c.fillStyle = mg;
    c.fill('evenodd');
    fourStar(c, cx + 16, cy - 14, 9, red ? '#ffd0dc' : '#fff1c4');
  } else {
    // König: a brass lantern, the king of the night lights.
    c.fillStyle = gold(c, cx - 3, cy - 40, cx + 3, cy - 30);
    c.fillRect(cx - 1.5, cy - 42, 3, 10);
    rrect(c, cx - 16, cy - 32, 32, 8, 3);
    fillInk(c, gold(c, cx - 16, cy - 32, cx + 16, cy - 24), 1.4);
    rrect(c, cx - 13, cy - 24, 26, 40, 5);
    const lg = c.createRadialGradient(cx, cy - 4, 2, cx, cy - 4, 24);
    lg.addColorStop(0, '#fffef0');
    lg.addColorStop(0.5, '#ffd27a');
    lg.addColorStop(1, '#c87a22');
    fillInk(c, lg, 1.6);
    c.strokeStyle = 'rgba(90,50,10,0.7)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(cx, cy - 24);
    c.lineTo(cx, cy + 16);
    c.stroke();
    rrect(c, cx - 16, cy + 16, 32, 8, 3);
    fillInk(c, gold(c, cx - 16, cy + 16, cx + 16, cy + 24), 1.4);
    glowAt(c, cx, cy - 4, 34, 34, 0xffe7a8, 0.45, 'lighter');
    // Crown on top.
    c.beginPath();
    c.moveTo(cx - 12, cy - 42);
    c.lineTo(cx - 12, cy - 52);
    c.lineTo(cx - 6, cy - 46);
    c.lineTo(cx, cy - 56);
    c.lineTo(cx + 6, cy - 46);
    c.lineTo(cx + 12, cy - 52);
    c.lineTo(cx + 12, cy - 42);
    c.closePath();
    fillInk(c, gold(c, cx - 12, cy - 56, cx + 12, cy - 42), 1.2);
  }
  // Suit badge in the lower part of the vignette.
  ellipse(c, cx, y0 + h - 18, 11, 11);
  c.fillStyle = 'rgba(255,246,230,0.92)';
  c.fill();
  pip(c, suit, cx, y0 + h - 18, 14);
  c.restore();
}

function ace(c: Ctx, suit: number) {
  const cx = CW / 2;
  const cy = CH / 2;
  // The house sun spread behind a big pip in a brass ring.
  c.save();
  c.globalAlpha = 0.85;
  paintEmblem(c, cx, cy, 92, { wing: 0xf3dfb0, wingDark: 0xc8a060, body: 0x8a5a1a, eye: 0xfff1c4 }, 1.2);
  c.restore();
  ellipse(c, cx, cy, 26, 26);
  fillInk(c, gold(c, cx - 26, cy - 26, cx + 26, cy + 26), 1.6);
  ellipse(c, cx, cy, 21, 21);
  c.fillStyle = '#fbf3e2';
  c.fill();
  pip(c, suit, cx, cy, 30);
}

const faces = new Map<number, Texture>();

/** Face texture of a card (rank * 4 + suit). */
export function cardTexture(card: number) {
  let t = faces.get(card);
  if (t) return t;
  const rank = rankOf(card);
  const suit = suitOf(card);
  t = paint(CW, CH, (c) => {
    paper(c);
    if (rank <= 8) {
      const n = rank + 2;
      const spots = PIPS[n - 2];
      const ix = 21, iy = 47;
      const s = n >= 9 ? 21 : 23;
      for (const [px, py] of spots) pip(c, suit, CW / 2 + px * ix, CH / 2 + py * iy, s, py > 0.01);
    } else if (rank === 12) ace(c, suit);
    else court(c, rank, suit);
    corner(c, rank, suit);
  }, RES);
  faces.set(card, t);
  return t;
}

let backTex: Texture | null = null;

/** Velvet back with a brass lattice and the moth medallion. */
export function backTexture() {
  backTex ??= paint(CW, CH, (c) => {
    rrect(c, 1.5, 1.5, CW - 3, CH - 3, 11);
    fillInk(c, '#f3e6c8', 2.4);
    rrect(c, 6, 6, CW - 12, CH - 12, 7);
    const g = c.createLinearGradient(0, 6, 0, CH - 6);
    g.addColorStop(0, '#7a1e34');
    g.addColorStop(0.5, '#4a1226');
    g.addColorStop(1, '#260812');
    c.fillStyle = g;
    c.fill();
    c.save();
    rrect(c, 6, 6, CW - 12, CH - 12, 7);
    c.clip();
    c.strokeStyle = 'rgba(224,178,90,0.32)';
    c.lineWidth = 1;
    for (let k = -CH; k < CW + CH; k += 12) {
      c.beginPath();
      c.moveTo(k, 0);
      c.lineTo(k + CH, CH);
      c.moveTo(k + CH, 0);
      c.lineTo(k, CH);
      c.stroke();
    }
    glowAt(c, CW / 2, CH / 2, 50, 60, 0xffcf7a, 0.25, 'lighter');
    c.restore();
    rrect(c, 11, 11, CW - 22, CH - 22, 5);
    c.strokeStyle = gold(c, 0, 0, CW, CH);
    c.lineWidth = 2;
    c.stroke();
    ellipse(c, CW / 2, CH / 2, 30, 30);
    fillInk(c, gold(c, CW / 2 - 30, CH / 2 - 30, CW / 2 + 30, CH / 2 + 30), 1.8);
    rim(c, 0.6, 1.4);
    ellipse(c, CW / 2, CH / 2, 24, 24);
    c.fillStyle = '#0c1026';
    c.fill();
    paintEmblem(c, CW / 2, CH / 2 + 2, 38, { wing: 0xf0c868, wingDark: 0x9a6418, body: 0x5a3010, eye: 0xfff1c4 }, 1.3);
    c.strokeStyle = INK;
  }, RES);
  return backTex;
}

/** Soft rounded shadow the size of a card (tint/alpha it). */
let shadowTex: Texture | null = null;
export function cardShadowTexture() {
  shadowTex ??= paint(CW + 30, CH + 30, (c) => {
    for (let i = 0; i < 6; i++) {
      rrect(c, 15 - i * 2, 15 - i * 2, CW + i * 4, CH + i * 4, 12 + i * 2);
      c.fillStyle = `rgba(0,0,0,${0.12 - i * 0.015})`;
      c.fill();
    }
  }, 1);
  return shadowTex;
}

/** Glowing brass frame for a held card. */
let holdTex: Texture | null = null;
export function holdFrameTexture() {
  holdTex ??= paint(CW + 24, CH + 24, (c) => {
    glowAt(c, (CW + 24) / 2, (CH + 24) / 2, CW * 0.62, CH * 0.62, 0xffcf7a, 0.55, 'lighter');
    rrect(c, 9, 9, CW + 6, CH + 6, 13);
    c.strokeStyle = gold(c, 0, 0, CW, CH);
    c.lineWidth = 4;
    c.stroke();
  }, 2);
  return holdTex;
}

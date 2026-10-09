// Nachtfalter slot symbols in the painted style: chunky ink outlines, soft gradients lit
// from the upper left, rim light and warm glows. Each one is painted once into a texture.

import type { Texture } from 'pixi.js';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, paint, rgb, rim, type Ctx } from '../../world/painted/brush';

export type SymbolId = 'firefly' | 'candle' | 'lantern' | 'key' | 'moon' | 'moth';
export const SYMBOLS: SymbolId[] = ['firefly', 'candle', 'lantern', 'key', 'moon', 'moth'];
export const SYMBOL_NAMES: Record<SymbolId, string> = {
  firefly: 'Glühwürmchen',
  candle: 'Kerze',
  lantern: 'Laterne',
  key: 'Messingschlüssel',
  moon: 'Vollmond',
  moth: 'Goldener Nachtfalter',
};

/** Painting size of one symbol (design units); textures are painted at 1.6× for crisp edges. */
const S = 200;
const LW = 5;

// ---- Shared painted moth ------------------------------------------------------------------

export interface MothColours {
  wing: number;
  wingDark: number;
  body: number;
  eye: number;
}

/** The house moth: four bezier wings with eye spots, a furry body and feathered antennae. Centred on (x, y), s ≈ wingspan. */
export function paintMoth(c: Ctx, x: number, y: number, s: number, col: MothColours, lw = LW) {
  const k = s / 200;
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  for (const side of [-1, 1]) {
    // Forewing.
    c.beginPath();
    c.moveTo(side * 8, -18);
    c.bezierCurveTo(side * 40, -78, side * 92, -78, side * 98, -46);
    c.bezierCurveTo(side * 102, -20, side * 70, 4, side * 10, 6);
    c.closePath();
    const fg = c.createLinearGradient(side * 10, -70, side * 90, 10);
    fg.addColorStop(0, rgb(light(col.wing, 0.45)));
    fg.addColorStop(0.5, rgb(col.wing));
    fg.addColorStop(1, rgb(col.wingDark));
    fillInk(c, fg, lw / k);
    rim(c, 0.55, 2.4 / k);
    // Hindwing.
    c.beginPath();
    c.moveTo(side * 8, 2);
    c.bezierCurveTo(side * 64, 4, side * 80, 40, side * 58, 62);
    c.bezierCurveTo(side * 40, 78, side * 14, 52, side * 6, 24);
    c.closePath();
    const hg = c.createLinearGradient(0, 0, side * 60, 70);
    hg.addColorStop(0, rgb(col.wing));
    hg.addColorStop(1, rgb(dark(col.wingDark, 0.2)));
    fillInk(c, hg, lw / k);
    // Eye spots and vein strokes.
    ellipse(c, side * 62, -38, 13, 11);
    fillInk(c, rgb(col.wingDark), 2.4 / k);
    ellipse(c, side * 62, -38, 6, 5);
    c.fillStyle = rgb(col.eye);
    c.fill();
    ellipse(c, side * 59, -41, 2.4, 2);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fill();
    ellipse(c, side * 40, 34, 8, 7);
    c.fillStyle = rgb(col.wingDark, 0.8);
    c.fill();
    c.strokeStyle = rgb(dark(col.wingDark, 0.3), 0.45);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(side * 12, -10);
    c.quadraticCurveTo(side * 44, -36, side * 84, -54);
    c.moveTo(side * 14, -4);
    c.quadraticCurveTo(side * 50, -12, side * 92, -30);
    c.stroke();
  }
  // Antennae, feathered.
  c.strokeStyle = INK;
  c.lineWidth = 4;
  for (const side of [-1, 1]) {
    c.beginPath();
    c.moveTo(side * 4, -30);
    c.quadraticCurveTo(side * 14, -62, side * 34, -70);
    c.stroke();
    c.lineWidth = 2;
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      const ax = side * (4 + 30 * t);
      const ay = -30 - 40 * t + 6 * t * t;
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(ax + side * 6, ay + 4);
      c.stroke();
    }
    c.lineWidth = 4;
  }
  // Furry body.
  ellipse(c, 0, 8, 12, 40);
  fillInk(c, (() => {
    const g = c.createLinearGradient(-12, 0, 12, 0);
    g.addColorStop(0, rgb(light(col.body, 0.4)));
    g.addColorStop(1, rgb(dark(col.body, 0.35)));
    return g;
  })(), lw / k);
  ellipse(c, 0, -30, 11, 10);
  fillInk(c, rgb(light(col.body, 0.15)), lw / k);
  c.strokeStyle = rgb(dark(col.body, 0.4), 0.6);
  c.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.moveTo(-9, 0 + i * 11);
    c.quadraticCurveTo(0, 5 + i * 11, 9, 0 + i * 11);
    c.stroke();
  }
  ellipse(c, -4, -33, 3, 3);
  c.fillStyle = 'rgba(255,250,230,0.9)';
  c.fill();
  c.restore();
}

// ---- Symbols --------------------------------------------------------------------------------

function firefly(c: Ctx) {
  glowAt(c, 100, 130, 80, 70, 0xc8f24a, 0.55, 'lighter');
  // Wings: translucent, veined.
  for (const side of [-1, 1]) {
    c.save();
    c.translate(100 + side * 26, 78);
    c.rotate(side * -0.55);
    ellipse(c, side * 14, 0, 40, 18);
    c.fillStyle = 'rgba(214,232,255,0.55)';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 3.5;
    c.stroke();
    ellipse(c, side * 8, -6, 22, 6);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fill();
    c.restore();
  }
  // Glowing abdomen.
  ellipse(c, 100, 128, 27, 36);
  const tail = c.createRadialGradient(94, 120, 4, 100, 130, 38);
  tail.addColorStop(0, '#fbffe0');
  tail.addColorStop(0.45, '#d8ff6a');
  tail.addColorStop(1, '#5f8a14');
  fillInk(c, tail, LW);
  for (let i = 0; i < 3; i++) {
    c.strokeStyle = 'rgba(70,100,10,0.35)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(78, 116 + i * 14);
    c.quadraticCurveTo(100, 124 + i * 14, 122, 116 + i * 14);
    c.stroke();
  }
  glowAt(c, 98, 136, 30, 30, 0xf6ffc0, 0.7, 'lighter');
  // Thorax and head.
  ellipse(c, 100, 86, 20, 22);
  fillInk(c, (() => {
    const g = c.createLinearGradient(80, 66, 120, 108);
    g.addColorStop(0, '#6a4a7a');
    g.addColorStop(1, '#22122a');
    return g;
  })(), LW);
  rim(c, 0.5, 2);
  ellipse(c, 100, 60, 16, 14);
  fillInk(c, vRad(c, 94, 54, 18, 0xd8462e), LW);
  for (const side of [-1, 1]) {
    ellipse(c, 100 + side * 7, 58, 4.5, 5);
    c.fillStyle = '#1a0a14';
    c.fill();
    ellipse(c, 99 + side * 7, 56, 1.6, 1.6);
    c.fillStyle = '#ffffff';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 3.5;
    c.beginPath();
    c.moveTo(100 + side * 6, 48);
    c.quadraticCurveTo(100 + side * 14, 26, 100 + side * 30, 22);
    c.stroke();
    ellipse(c, 100 + side * 31, 22, 4.5, 4.5);
    fillInk(c, '#e8ff9a', 2.5);
  }
}

function vRad(c: Ctx, x: number, y: number, r: number, col: number) {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r * 1.2);
  g.addColorStop(0, rgb(light(col, 0.45)));
  g.addColorStop(0.6, rgb(col));
  g.addColorStop(1, rgb(dark(col, 0.35)));
  return g;
}

function candle(c: Ctx) {
  glowAt(c, 100, 46, 70, 70, 0xffb84a, 0.6, 'lighter');
  // Brass dish with a ring handle.
  c.beginPath();
  c.arc(152, 168, 14, 0, Math.PI * 2);
  c.strokeStyle = INK;
  c.lineWidth = 11;
  c.stroke();
  c.strokeStyle = gold(c, 140, 154, 166, 182);
  c.lineWidth = 6;
  c.stroke();
  ellipse(c, 100, 172, 56, 15);
  fillInk(c, gold(c, 44, 160, 156, 186), LW);
  ellipse(c, 100, 166, 44, 9);
  c.fillStyle = 'rgba(80,40,10,0.45)';
  c.fill();
  // Wax column.
  c.beginPath();
  c.moveTo(70, 168);
  c.lineTo(70, 96);
  c.quadraticCurveTo(100, 86, 130, 96);
  c.lineTo(130, 168);
  c.quadraticCurveTo(100, 174, 70, 168);
  c.closePath();
  const w = c.createLinearGradient(70, 0, 130, 0);
  w.addColorStop(0, '#fff8ea');
  w.addColorStop(0.35, '#f6e6c8');
  w.addColorStop(1, '#b89a72');
  fillInk(c, w, LW);
  // Drips.
  c.beginPath();
  c.moveTo(74, 98);
  c.quadraticCurveTo(76, 126, 82, 128);
  c.quadraticCurveTo(88, 126, 88, 96);
  c.moveTo(108, 94);
  c.quadraticCurveTo(110, 114, 116, 114);
  c.quadraticCurveTo(122, 112, 122, 96);
  fillInk(c, '#fffaf0', 3);
  ellipse(c, 100, 96, 28, 7);
  c.fillStyle = '#fff3d6';
  c.fill();
  ellipse(c, 80, 140, 3, 18);
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.fill();
  // Wick and flame.
  c.strokeStyle = INK;
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(100, 96);
  c.lineTo(100, 82);
  c.stroke();
  glowAt(c, 100, 56, 36, 44, 0xffcf7a, 0.9, 'lighter');
  c.beginPath();
  c.moveTo(100, 14);
  c.bezierCurveTo(124, 46, 122, 78, 100, 84);
  c.bezierCurveTo(78, 78, 76, 46, 100, 14);
  const f = c.createRadialGradient(100, 66, 2, 100, 56, 34);
  f.addColorStop(0, '#fffef0');
  f.addColorStop(0.45, '#ffd35a');
  f.addColorStop(1, '#e8531f');
  fillInk(c, f, 4);
  c.beginPath();
  c.moveTo(100, 44);
  c.bezierCurveTo(110, 58, 108, 74, 100, 76);
  c.bezierCurveTo(92, 74, 90, 58, 100, 44);
  c.fillStyle = '#fffbe6';
  c.fill();
}

function lantern(c: Ctx) {
  glowAt(c, 100, 110, 92, 92, 0xffc864, 0.55, 'lighter');
  // Hanging ring.
  c.beginPath();
  c.arc(100, 22, 13, Math.PI * 0.95, Math.PI * 2.05);
  c.strokeStyle = INK;
  c.lineWidth = 11;
  c.stroke();
  c.strokeStyle = gold(c, 86, 8, 114, 30);
  c.lineWidth = 5;
  c.stroke();
  // Roof: stepped art-deco cap.
  c.beginPath();
  c.moveTo(56, 62);
  c.lineTo(144, 62);
  c.lineTo(126, 40);
  c.lineTo(74, 40);
  c.closePath();
  fillInk(c, gold(c, 56, 30, 144, 66), LW);
  rim(c, 0.6, 2);
  c.beginPath();
  c.moveTo(80, 40);
  c.lineTo(100, 26);
  c.lineTo(120, 40);
  c.closePath();
  fillInk(c, gold(c, 80, 26, 120, 40), LW);
  // Glass body.
  c.beginPath();
  c.moveTo(66, 62);
  c.lineTo(134, 62);
  c.lineTo(128, 152);
  c.lineTo(72, 152);
  c.closePath();
  const gl = c.createRadialGradient(96, 100, 6, 100, 108, 62);
  gl.addColorStop(0, '#fffef0');
  gl.addColorStop(0.45, '#ffd76e');
  gl.addColorStop(1, '#c86a1a');
  fillInk(c, gl, LW);
  // Tiny moth fluttering at the flame.
  paintMoth(c, 100, 104, 50, { wing: 0x6a3a14, wingDark: 0x3a1a08, body: 0x3a1a08, eye: 0xffcf7a }, 3);
  // Frame bars.
  c.strokeStyle = INK;
  c.lineWidth = 9;
  c.beginPath();
  c.moveTo(100, 62);
  c.lineTo(100, 152);
  c.stroke();
  c.strokeStyle = gold(c, 96, 62, 104, 152);
  c.lineWidth = 4;
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.beginPath();
  c.moveTo(72, 66);
  c.lineTo(84, 66);
  c.lineTo(80, 146);
  c.lineTo(76, 146);
  c.closePath();
  c.fill();
  // Base.
  c.beginPath();
  c.moveTo(60, 150);
  c.lineTo(140, 150);
  c.lineTo(132, 172);
  c.lineTo(68, 172);
  c.closePath();
  fillInk(c, gold(c, 60, 148, 140, 176), LW);
  rim(c, 0.55, 2);
}

function key(c: Ctx) {
  glowAt(c, 100, 100, 86, 86, 0xf0c25a, 0.35, 'lighter');
  c.save();
  c.translate(100, 102);
  c.rotate(-0.62);
  const metal = gold(c, -80, -30, 80, 30);
  // Shaft and bit as one outline.
  c.beginPath();
  c.moveTo(-14, -9);
  c.lineTo(86, -9);
  c.lineTo(86, 26);
  c.lineTo(76, 26);
  c.lineTo(76, 14);
  c.lineTo(66, 14);
  c.lineTo(66, 32);
  c.lineTo(54, 32);
  c.lineTo(54, 9);
  c.lineTo(-14, 9);
  c.closePath();
  fillInk(c, metal, LW);
  rim(c, 0.65, 2);
  // Collar rings.
  for (const x of [2, 12]) {
    c.beginPath();
    c.rect(x - 3, -13, 6, 26);
    fillInk(c, gold(c, x - 4, -13, x + 4, 13), 3);
  }
  // Ornate bow: quatrefoil with a moth window.
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    c.moveTo(-44 + Math.cos(a) * 22 + 16, Math.sin(a) * 22);
    c.arc(-44 + Math.cos(a) * 22, Math.sin(a) * 22, 16, 0, Math.PI * 2);
  }
  fillInk(c, metal, LW);
  ellipse(c, -44, 0, 30, 30);
  fillInk(c, metal, LW);
  rim(c, 0.6, 2.4);
  ellipse(c, -44, 0, 20, 20);
  fillInk(c, (() => {
    const g = c.createRadialGradient(-50, -6, 2, -44, 0, 22);
    g.addColorStop(0, '#5a2a6a');
    g.addColorStop(1, '#1a0820');
    return g;
  })(), 3);
  c.rotate(0.62);
  const mx = -44 * Math.cos(-0.62);
  const my = -44 * Math.sin(-0.62);
  paintMoth(c, mx, my + 1, 34, { wing: 0xf0c868, wingDark: 0xa0701e, body: 0x6e4a10, eye: 0xfff4c2 }, 2);
  c.restore();
}

function moon(c: Ctx) {
  glowAt(c, 100, 100, 100, 100, 0xbfd0ff, 0.45, 'lighter');
  glowAt(c, 100, 100, 80, 80, 0xfff0c0, 0.5, 'lighter');
  ellipse(c, 100, 100, 66, 66);
  const g = c.createRadialGradient(78, 76, 8, 100, 100, 72);
  g.addColorStop(0, '#fffdf0');
  g.addColorStop(0.55, '#f4e2a8');
  g.addColorStop(1, '#b8904a');
  fillInk(c, g, LW);
  // Soft craters with lit lower rims.
  for (const [x, y, r] of [
    [76, 82, 13],
    [120, 72, 8],
    [118, 120, 16],
    [82, 128, 8],
    [138, 100, 6],
    [98, 104, 5],
  ]) {
    ellipse(c, x, y, r, r * 0.9);
    c.fillStyle = 'rgba(150,108,50,0.32)';
    c.fill();
    c.beginPath();
    c.arc(x, y, r, 0.2, Math.PI - 0.2);
    c.strokeStyle = 'rgba(255,250,230,0.55)';
    c.lineWidth = 2;
    c.stroke();
  }
  // Shadowed lower right limb.
  c.save();
  ellipse(c, 100, 100, 66, 66);
  c.clip();
  ellipse(c, 128, 124, 70, 70);
  c.fillStyle = 'rgba(90,60,120,0.22)';
  c.fill();
  c.restore();
  ellipse(c, 100, 100, 66, 66);
  rim(c, 0.7, 2.6);
  // A small moth silhouette crossing the moon.
  paintMoth(c, 146, 52, 42, { wing: 0x3a2050, wingDark: 0x1a0a28, body: 0x1a0a28, eye: 0xffe7a8 }, 2.5);
  // Twinkles.
  for (const [x, y, r] of [
    [34, 44, 5],
    [170, 150, 4],
    [40, 160, 3],
  ]) {
    c.fillStyle = '#fff6d8';
    c.beginPath();
    c.moveTo(x, y - r * 2);
    c.lineTo(x + r * 0.5, y);
    c.lineTo(x, y + r * 2);
    c.lineTo(x - r * 0.5, y);
    c.closePath();
    c.moveTo(x - r * 2, y);
    c.lineTo(x, y + r * 0.5);
    c.lineTo(x + r * 2, y);
    c.lineTo(x, y - r * 0.5);
    c.closePath();
    c.fill();
  }
}

function moth(c: Ctx) {
  // The wild: a golden moth on a sunburst, lit like a trophy.
  glowAt(c, 100, 100, 100, 100, 0xffc864, 0.8, 'lighter');
  c.save();
  c.translate(100, 100);
  for (let i = 0; i < 16; i++) {
    c.rotate((Math.PI * 2) / 16);
    c.beginPath();
    c.moveTo(-5, 30);
    c.lineTo(0, 98);
    c.lineTo(5, 30);
    c.closePath();
    c.fillStyle = i % 2 ? 'rgba(255,230,150,0.35)' : 'rgba(255,200,90,0.22)';
    c.fill();
  }
  c.restore();
  paintMoth(c, 100, 104, 190, { wing: 0xf0c25a, wingDark: 0x9a6418, body: 0x6e3a10, eye: 0xd8243a });
  glowAt(c, 66, 58, 18, 18, 0xffffff, 0.6, 'lighter');
}

const painters: Record<SymbolId, (c: Ctx) => void> = { firefly, candle, lantern, key, moon, moth };
let textures: Record<SymbolId, Texture> | null = null;

/** Symbol textures (logical size 200×200, painted at 1.6× resolution). */
export function symbolTextures() {
  if (!textures) {
    textures = {} as Record<SymbolId, Texture>;
    for (const id of SYMBOLS) textures[id] = paint(S, S, painters[id], 1.6);
  }
  return textures;
}

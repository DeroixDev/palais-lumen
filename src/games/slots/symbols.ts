// Slot symbols in the painted style: chunky ink outlines, soft gradients lit
// from the upper left, rim light and warm glows. Each one is painted once into a texture.

import type { Texture } from 'pixi.js';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, paint, rgb, rim, type Ctx } from '../../world/painted/brush';

import { SLOT_WILD } from '../../core/brand';
export type SymbolId = 'firefly' | 'candle' | 'lantern' | 'key' | 'moon' | 'moth';
export const SYMBOLS: SymbolId[] = ['firefly', 'candle', 'lantern', 'key', 'moon', 'moth'];
export const SYMBOL_NAMES: Record<SymbolId, string> = {
  firefly: 'Glühwürmchen',
  candle: 'Kerze',
  lantern: 'Laterne',
  key: 'Messingschlüssel',
  moon: 'Vollmond',
  moth: SLOT_WILD,
};

/** Painting size of one symbol (design units); textures are painted at 1.6× for crisp edges. */
const S = 200;
const LW = 5;

// ---- Shared painted emblem ---------------------------------------------------------------

export interface EmblemColours {
  /** Rays, lit. */
  wing: number;
  /** Rays, shaded side. */
  wingDark: number;
  /** Base line and sun rim. */
  body: number;
  /** The sun's bright core. */
  eye: number;
}
/** Older name of the palette type. */
export type MothColours = EmblemColours;

/**
 * The house emblem, painted: a rising half sun with nine tapered rays over a stepped base,
 * chunky ink edges and rim light. Centred on (x, y); s ≈ width.
 */
export function paintEmblem(c: Ctx, x: number, y: number, s: number, col: EmblemColours, lw = LW) {
  const k = s / 200;
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  const by = 34;
  // Rays.
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + ((i + 0.5) / 9) * Math.PI;
    const len = i === 4 ? 104 : i % 2 ? 84 : 96;
    const w = 0.1;
    c.beginPath();
    c.moveTo(Math.cos(a - w) * 40, by + Math.sin(a - w) * 40);
    c.lineTo(Math.cos(a) * len, by + Math.sin(a) * len);
    c.lineTo(Math.cos(a + w) * 40, by + Math.sin(a + w) * 40);
    c.closePath();
    const g = c.createLinearGradient(Math.cos(a) * 40, by + Math.sin(a) * 40, Math.cos(a) * len, by + Math.sin(a) * len);
    g.addColorStop(0, rgb(light(col.wing, 0.35)));
    g.addColorStop(0.6, rgb(col.wing));
    g.addColorStop(1, rgb(col.wingDark));
    fillInk(c, g, lw / k);
  }
  // Half sun.
  c.beginPath();
  c.arc(0, by, 36, Math.PI, Math.PI * 2);
  c.closePath();
  const sg = c.createRadialGradient(-10, by - 20, 2, 0, by, 40);
  sg.addColorStop(0, rgb(light(col.eye, 0.6)));
  sg.addColorStop(0.55, rgb(col.eye));
  sg.addColorStop(1, rgb(dark(col.wing, 0.15)));
  fillInk(c, sg, lw / k);
  rim(c, 0.6, 2.4 / k);
  c.beginPath();
  c.arc(0, by, 22, Math.PI, Math.PI * 2);
  c.strokeStyle = rgb(col.wingDark, 0.55);
  c.lineWidth = 3;
  c.stroke();
  // Stepped base.
  c.beginPath();
  c.rect(-96, by, 192, 12);
  fillInk(c, (() => {
    const g = c.createLinearGradient(0, by, 0, by + 12);
    g.addColorStop(0, rgb(light(col.body, 0.35)));
    g.addColorStop(1, rgb(dark(col.body, 0.2)));
    return g;
  })(), lw / k);
  c.beginPath();
  c.rect(-56, by + 12, 112, 10);
  fillInk(c, rgb(col.body), lw / k);
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
  // The flame inside, on a little wick.
  glowAt(c, 100, 104, 30, 38, 0xfffbe6, 0.8, 'lighter');
  c.beginPath();
  c.moveTo(100, 74);
  c.bezierCurveTo(116, 96, 114, 120, 100, 124);
  c.bezierCurveTo(86, 120, 84, 96, 100, 74);
  const fl = c.createRadialGradient(100, 112, 2, 100, 104, 26);
  fl.addColorStop(0, '#fffef0');
  fl.addColorStop(0.5, '#ffd35a');
  fl.addColorStop(1, '#e8731f');
  fillInk(c, fl, 3);
  c.beginPath();
  c.moveTo(100, 96);
  c.bezierCurveTo(106, 106, 105, 118, 100, 119);
  c.bezierCurveTo(95, 118, 94, 106, 100, 96);
  c.fillStyle = '#fffbe6';
  c.fill();
  c.fillStyle = INK;
  c.fillRect(98.5, 124, 3, 8);
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
  // Ornate bow: quatrefoil with a sun window.
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
  paintEmblem(c, mx, my + 1, 34, { wing: 0xf0c868, wingDark: 0xa0701e, body: 0x6e4a10, eye: 0xfff4c2 }, 2);
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
  // The wild ("Goldener Lüster", ID 'moth' kept for saves and stats): a golden chandelier
  // on a sunburst, lit like a trophy.
  glowAt(c, 100, 100, 100, 100, 0xffc864, 0.8, 'lighter');
  c.save();
  c.translate(100, 104);
  for (let i = 0; i < 16; i++) {
    c.rotate((Math.PI * 2) / 16);
    c.beginPath();
    c.moveTo(-6, 30);
    c.lineTo(0, 98);
    c.lineTo(6, 30);
    c.closePath();
    c.fillStyle = i % 2 ? 'rgba(255,230,150,0.38)' : 'rgba(255,200,90,0.22)';
    c.fill();
  }
  c.restore();
  const metal = (x0: number, y0: number, x1: number, y1: number) => gold(c, x0, y0, x1, y1);
  // Chain and crown.
  c.strokeStyle = INK;
  c.lineWidth = 9;
  c.beginPath();
  c.moveTo(100, 0);
  c.lineTo(100, 40);
  c.stroke();
  c.strokeStyle = metal(96, 0, 104, 40);
  c.lineWidth = 4.5;
  c.stroke();
  for (let i = 0; i < 3; i++) {
    const ww = 30 - i * 8;
    c.beginPath();
    c.rect(100 - ww, 44 - i * 10, ww * 2, 9);
    fillInk(c, metal(100 - ww, 34 - i * 10, 100 + ww, 53 - i * 10), 3.5);
  }
  // Five arms, the middle one in front, each with a candle and a flame.
  const arms: [number, number][] = [[28, 104], [56, 116], [100, 122], [144, 116], [172, 104]];
  for (const [ax, ay] of arms) {
    c.beginPath();
    c.moveTo(100, 112);
    c.bezierCurveTo(100 + (ax - 100) * 0.3, 150, ax, 142, ax, ay + 10);
    c.strokeStyle = INK;
    c.lineWidth = 11;
    c.stroke();
    c.strokeStyle = metal(20, 100, 180, 150);
    c.lineWidth = 6;
    c.stroke();
  }
  // Crystal body.
  c.beginPath();
  c.moveTo(70, 56);
  c.lineTo(130, 56);
  c.lineTo(122, 112);
  c.lineTo(100, 168);
  c.lineTo(78, 112);
  c.closePath();
  const cg = c.createLinearGradient(70, 56, 130, 168);
  cg.addColorStop(0, '#fffdf0');
  cg.addColorStop(0.45, '#ffe08a');
  cg.addColorStop(1, '#b07a2a');
  fillInk(c, cg, LW);
  rim(c, 0.7, 2.4);
  c.strokeStyle = 'rgba(122,78,24,0.55)';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(78, 112);
  c.lineTo(122, 112);
  c.moveTo(100, 56);
  c.lineTo(100, 168);
  c.stroke();
  ellipse(c, 100, 58, 34, 8);
  fillInk(c, metal(66, 50, 134, 66), 4);
  // Drops along the arms.
  for (const [dx, dy] of [[44, 136], [72, 142], [128, 142], [156, 136], [100, 176]]) {
    c.beginPath();
    c.moveTo(dx, dy);
    c.lineTo(dx - 5, dy + 10);
    c.lineTo(dx, dy + 20);
    c.lineTo(dx + 5, dy + 10);
    c.closePath();
    fillInk(c, '#fff4d0', 2.4);
  }
  for (const [ax, ay] of arms) {
    ellipse(c, ax, ay + 10, 13, 5);
    fillInk(c, metal(ax - 13, ay + 5, ax + 13, ay + 15), 3);
    c.beginPath();
    c.rect(ax - 5, ay - 14, 10, 24);
    fillInk(c, '#fff8ea', 3);
    glowAt(c, ax, ay - 26, 22, 26, 0xffd27a, 0.9, 'lighter');
    c.beginPath();
    c.moveTo(ax, ay - 40);
    c.bezierCurveTo(ax + 9, ay - 28, ax + 8, ay - 18, ax, ay - 16);
    c.bezierCurveTo(ax - 8, ay - 18, ax - 9, ay - 28, ax, ay - 40);
    const f = c.createRadialGradient(ax, ay - 22, 1, ax, ay - 26, 14);
    f.addColorStop(0, '#fffef0');
    f.addColorStop(0.5, '#ffd35a');
    f.addColorStop(1, '#e8731f');
    fillInk(c, f, 2.5);
  }
  glowAt(c, 84, 76, 18, 18, 0xffffff, 0.6, 'lighter');
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

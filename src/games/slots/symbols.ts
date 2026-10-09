// Nachtfalter slot symbols, painted once on canvas and turned into textures.

import { Texture } from 'pixi.js';
import { drawMoth } from '../../core/fx';

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

const S = 200;
type Ctx = CanvasRenderingContext2D;

function glow(c: Ctx, x: number, y: number, r: number, color: string) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

function firefly(c: Ctx) {
  glow(c, 100, 128, 70, 'rgba(210,255,90,0.55)');
  // Wings.
  c.fillStyle = 'rgba(200,225,255,0.75)';
  c.beginPath();
  c.ellipse(70, 82, 34, 16, -0.6, 0, Math.PI * 2);
  c.ellipse(130, 82, 34, 16, 0.6, 0, Math.PI * 2);
  c.fill();
  // Glowing tail.
  const tail = c.createRadialGradient(100, 132, 4, 100, 132, 32);
  tail.addColorStop(0, '#fbffd0');
  tail.addColorStop(0.6, '#c8f24a');
  tail.addColorStop(1, '#6f9a1c');
  c.fillStyle = tail;
  c.beginPath();
  c.ellipse(100, 128, 24, 34, 0, 0, Math.PI * 2);
  c.fill();
  // Body and head.
  c.fillStyle = '#3a2a1a';
  c.beginPath();
  c.ellipse(100, 88, 16, 22, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#c0392b';
  c.beginPath();
  c.arc(100, 62, 13, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#3a2a1a';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(95, 52);
  c.quadraticCurveTo(84, 34, 74, 32);
  c.moveTo(105, 52);
  c.quadraticCurveTo(116, 34, 126, 32);
  c.stroke();
}

function candle(c: Ctx) {
  glow(c, 100, 52, 70, 'rgba(255,190,80,0.6)');
  // Flame.
  const f = c.createRadialGradient(100, 62, 2, 100, 56, 26);
  f.addColorStop(0, '#fffbe0');
  f.addColorStop(0.5, '#ffcf4a');
  f.addColorStop(1, '#e8531f');
  c.fillStyle = f;
  c.beginPath();
  c.moveTo(100, 22);
  c.bezierCurveTo(120, 48, 116, 74, 100, 78);
  c.bezierCurveTo(84, 74, 80, 48, 100, 22);
  c.fill();
  c.strokeStyle = '#2a1a10';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(100, 78);
  c.lineTo(100, 88);
  c.stroke();
  // Wax with drips.
  const w = c.createLinearGradient(70, 0, 130, 0);
  w.addColorStop(0, '#d9c8a8');
  w.addColorStop(0.4, '#fff6e6');
  w.addColorStop(1, '#cbb68f');
  c.fillStyle = w;
  c.beginPath();
  c.moveTo(72, 92);
  c.lineTo(128, 92);
  c.lineTo(128, 166);
  c.lineTo(72, 166);
  c.closePath();
  c.fill();
  c.beginPath();
  c.ellipse(84, 104, 6, 16, 0, 0, Math.PI * 2);
  c.ellipse(116, 100, 5, 11, 0, 0, Math.PI * 2);
  c.fill();
  // Brass holder.
  c.fillStyle = '#c9902e';
  c.beginPath();
  c.ellipse(100, 170, 46, 12, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#f0c25a';
  c.beginPath();
  c.ellipse(100, 166, 40, 8, 0, 0, Math.PI * 2);
  c.fill();
}

function lantern(c: Ctx) {
  glow(c, 100, 108, 84, 'rgba(255,200,100,0.55)');
  c.strokeStyle = '#7a5214';
  c.lineWidth = 6;
  c.beginPath();
  c.arc(100, 30, 14, Math.PI, 0);
  c.stroke();
  // Roof.
  c.fillStyle = '#9a6a1c';
  c.beginPath();
  c.moveTo(60, 58);
  c.lineTo(140, 58);
  c.lineTo(122, 36);
  c.lineTo(78, 36);
  c.closePath();
  c.fill();
  // Glass with light.
  const gl = c.createRadialGradient(100, 108, 6, 100, 108, 50);
  gl.addColorStop(0, '#fffbe0');
  gl.addColorStop(0.5, '#ffd36a');
  gl.addColorStop(1, '#d9861f');
  c.fillStyle = gl;
  c.fillRect(68, 60, 64, 96);
  // Frame bars.
  c.strokeStyle = '#7a5214';
  c.lineWidth = 6;
  c.strokeRect(68, 60, 64, 96);
  c.beginPath();
  c.moveTo(100, 60);
  c.lineTo(100, 156);
  c.stroke();
  // Little moth silhouette in the glass.
  drawMoth(c, 100, 112, 44, 'rgba(90,50,10,0.55)', 'rgba(90,50,10,0.7)');
  // Base.
  c.fillStyle = '#9a6a1c';
  c.fillRect(60, 156, 80, 14);
  c.fillStyle = '#f0c25a';
  c.fillRect(64, 158, 72, 4);
}

function key(c: Ctx) {
  glow(c, 100, 100, 80, 'rgba(240,194,90,0.35)');
  c.save();
  c.translate(100, 100);
  c.rotate(-0.6);
  const m = c.createLinearGradient(0, -20, 0, 20);
  m.addColorStop(0, '#fff1c4');
  m.addColorStop(0.5, '#e0b25a');
  m.addColorStop(1, '#8a5e14');
  c.fillStyle = m;
  c.strokeStyle = '#6e4a10';
  c.lineWidth = 3;
  // Shaft.
  c.fillRect(-10, -8, 92, 16);
  c.strokeRect(-10, -8, 92, 16);
  // Bit.
  c.fillRect(56, 8, 12, 24);
  c.fillRect(74, 8, 10, 16);
  c.strokeRect(56, 8, 12, 24);
  c.strokeRect(74, 8, 10, 16);
  // Ornate bow with a moth cut-out.
  c.beginPath();
  c.arc(-40, 0, 36, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#2a1630';
  c.beginPath();
  c.arc(-40, 0, 24, 0, Math.PI * 2);
  c.fill();
  c.rotate(0.6);
  drawMoth(c, -40 * Math.cos(-0.6), -40 * Math.sin(-0.6) + 2, 40, '#e0b25a', '#fff1c4');
  c.restore();
}

function moon(c: Ctx) {
  glow(c, 100, 100, 98, 'rgba(255,240,190,0.55)');
  const g = c.createRadialGradient(84, 80, 10, 100, 100, 66);
  g.addColorStop(0, '#fffbe8');
  g.addColorStop(0.7, '#f3dd9c');
  g.addColorStop(1, '#c9a25a');
  c.fillStyle = g;
  c.beginPath();
  c.arc(100, 100, 64, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(160,120,60,0.35)';
  for (const [x, y, r] of [
    [78, 84, 12],
    [118, 76, 8],
    [116, 118, 15],
    [84, 124, 7],
    [130, 98, 5],
  ]) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
}

function moth(c: Ctx) {
  glow(c, 100, 100, 98, 'rgba(255,215,120,0.75)');
  drawMoth(c, 102, 108, 178, 'rgba(110,70,15,0.7)', 'rgba(110,70,15,0.9)');
  const wing = c.createLinearGradient(20, 40, 180, 160);
  wing.addColorStop(0, '#fff1c4');
  wing.addColorStop(0.5, '#f0c25a');
  wing.addColorStop(1, '#b07a1f');
  drawMoth(c, 100, 104, 178, wing, '#6e4a10', '#fff6e6');
}

const painters: Record<SymbolId, (c: Ctx) => void> = { firefly, candle, lantern, key, moon, moth };
let textures: Record<SymbolId, Texture> | null = null;

export function symbolTextures() {
  if (!textures) {
    textures = {} as Record<SymbolId, Texture>;
    for (const id of SYMBOLS) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      painters[id](cv.getContext('2d')!);
      textures[id] = Texture.from(cv);
    }
  }
  return textures;
}

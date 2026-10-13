// The Mondstein (moonstone): a pale blue faceted cabochon in a thin brass setting with a
// crescent, for menus and the HUD. Painted once (Canvas 2D) and reused.

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture } from '../core/fx';
import { paint } from '../world/painted/brush';

export const STONE_COLOR = 0x9fe8ff;

/** Paints the stone centred on (o, o) with radius r. */
function paintStone(c: CanvasRenderingContext2D, o: number, r: number) {
  const pts = (k: number) => [0, -r * k, r * 0.86 * k, -r * 0.3 * k, r * 0.6 * k, r * 0.8 * k, -r * 0.6 * k, r * 0.8 * k, -r * 0.86 * k, -r * 0.3 * k];
  const poly = (k: number, dy = 0) => {
    const p = pts(k);
    c.beginPath();
    for (let i = 0; i < p.length; i += 2) c.lineTo(o + p[i], o + p[i + 1] + dy);
    c.closePath();
  };
  // Shadow.
  poly(1.02, r * 0.12);
  c.fillStyle = 'rgba(8,4,16,0.45)';
  c.fill();
  // Brass setting.
  poly(1.04);
  const bg = c.createLinearGradient(o - r, o - r, o + r, o + r);
  bg.addColorStop(0, '#fff1c0');
  bg.addColorStop(0.4, '#d9a548');
  bg.addColorStop(1, '#6a4410');
  c.fillStyle = bg;
  c.fill();
  c.strokeStyle = 'rgba(8,10,24,0.9)';
  c.lineWidth = Math.max(1, r * 0.12);
  c.lineJoin = 'round';
  c.stroke();
  // Stone body: deep blue at the bottom right, pale at the upper left.
  poly(0.82);
  const g = c.createLinearGradient(o - r * 0.6, o - r * 0.8, o + r * 0.5, o + r * 0.8);
  g.addColorStop(0, '#e8fbff');
  g.addColorStop(0.35, '#9fe8ff');
  g.addColorStop(0.75, '#3f8fc4');
  g.addColorStop(1, '#1e4a7a');
  c.fillStyle = g;
  c.fill();
  // Facets.
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = Math.max(0.6, r * 0.05);
  const p = pts(0.82);
  for (let i = 0; i < p.length; i += 2) {
    c.beginPath();
    c.moveTo(o + p[i], o + p[i + 1]);
    c.lineTo(o + p[i] * 0.45, o + p[i + 1] * 0.45);
    c.stroke();
  }
  // Highlight facet.
  c.beginPath();
  c.moveTo(o, o - r * 0.82);
  c.lineTo(o - r * 0.7, o - r * 0.25);
  c.lineTo(o - r * 0.2, o - r * 0.1);
  c.closePath();
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fill();
  // Crescent moon inside.
  c.save();
  c.beginPath();
  c.arc(o - r * 0.03, o + r * 0.14, r * 0.3, 0, Math.PI * 2);
  c.arc(o + r * 0.11, o + r * 0.05, r * 0.26, 0, Math.PI * 2, true);
  c.fillStyle = '#fff8e6';
  c.fill('evenodd');
  c.restore();
  // Sparkle.
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.beginPath();
  c.arc(o - r * 0.36, o - r * 0.4, Math.max(0.8, r * 0.09), 0, Math.PI * 2);
  c.fill();
}

let tex: Texture | null = null;
function stoneTexture() {
  return (tex ??= paint(72, 72, (c) => paintStone(c, 36, 30), 2));
}

export function drawStone(r = 12, glow = true) {
  const c = new Container();
  if (glow) {
    const gl = new Sprite(glowTexture());
    gl.anchor.set(0.5);
    gl.width = gl.height = r * 4.6;
    gl.tint = STONE_COLOR;
    gl.alpha = 0.35;
    gl.blendMode = 'add';
    c.addChild(gl);
  }
  const s = new Sprite(stoneTexture());
  s.anchor.set(0.5);
  s.scale.set(r / 30);
  c.addChild(s);
  return c;
}

/** Same stone for the HTML bar. */
export function stoneDataUrl(size = 64) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  paintStone(c, size / 2, size * 0.4);
  return cv.toDataURL();
}

// The Mondstein (moonstone): a pale blue cabochon with a crescent, for menus and the HUD.

import { Container, Graphics, Sprite } from 'pixi.js';
import { glowTexture } from '../core/fx';

export const STONE_COLOR = 0x9fe8ff;

export function drawStone(r = 12, glow = true) {
  const c = new Container();
  if (glow) {
    const gl = new Sprite(glowTexture());
    gl.anchor.set(0.5);
    gl.width = gl.height = r * 5;
    gl.tint = STONE_COLOR;
    gl.alpha = 0.45;
    gl.blendMode = 'add';
    c.addChild(gl);
  }
  const g = new Graphics();
  const pts = (k: number) => [0, -r * k, r * 0.86 * k, -r * 0.3 * k, r * 0.6 * k, r * 0.8 * k, -r * 0.6 * k, r * 0.8 * k, -r * 0.86 * k, -r * 0.3 * k];
  g.poly(pts(1)).fill(0x3a6a9a).stroke({ color: 0x14080f, width: Math.max(1, r * 0.1), alpha: 0.6 });
  g.poly(pts(0.72)).fill(STONE_COLOR);
  g.poly([0, -r * 0.72, r * 0.62, -r * 0.22, 0, 0]).fill({ color: 0xffffff, alpha: 0.45 });
  // Crescent moon inside.
  g.circle(-r * 0.05, r * 0.12, r * 0.32).fill(0xfff6e6);
  g.circle(r * 0.1, r * 0.04, r * 0.28).fill(STONE_COLOR);
  c.addChild(g);
  return c;
}

/** Same stone for the HTML bar. */
export function stoneDataUrl(size = 64) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  const r = size * 0.42;
  const o = size / 2;
  const poly = (k: number, fill: string) => {
    const p = [0, -r * k, r * 0.86 * k, -r * 0.3 * k, r * 0.6 * k, r * 0.8 * k, -r * 0.6 * k, r * 0.8 * k, -r * 0.86 * k, -r * 0.3 * k];
    c.beginPath();
    for (let i = 0; i < p.length; i += 2) c.lineTo(o + p[i], o + p[i + 1]);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  poly(1, '#3a6a9a');
  poly(0.72, '#9fe8ff');
  c.fillStyle = 'rgba(255,255,255,.45)';
  c.beginPath();
  c.moveTo(o, o - r * 0.72);
  c.lineTo(o + r * 0.62, o - r * 0.22);
  c.lineTo(o, o);
  c.fill();
  c.fillStyle = '#fff6e6';
  c.beginPath();
  c.arc(o - r * 0.05, o + r * 0.12, r * 0.32, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#9fe8ff';
  c.beginPath();
  c.arc(o + r * 0.1, o + r * 0.04, r * 0.28, 0, Math.PI * 2);
  c.fill();
  return cv.toDataURL();
}

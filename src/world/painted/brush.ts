// Painting helpers for the painted look: everything is drawn once with Canvas 2D
// (soft gradients, glows, rim light) and turned into a texture. Only CanvasGradient and
// plain fills are used, no ctx.filter, so it looks the same on Safari.

import { CanvasSource, Sprite, Texture } from 'pixi.js';

export type Ctx = CanvasRenderingContext2D;

/** Draws into a fresh canvas of w×h world pixels and returns it as a crisp texture. */
export function paint(w: number, h: number, draw: (c: Ctx) => void, res = 2): Texture {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * res));
  cv.height = Math.max(1, Math.ceil(h * res));
  const c = cv.getContext('2d')!;
  c.scale(res, res);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c);
  return new Texture({ source: new CanvasSource({ resource: cv, resolution: res }) });
}

/**
 * A painted prop: a canvas of w×h where (ax, ay) is the point that stands on the floor.
 * Drawing happens around that point as (0, 0); the sprite is placed so it lands on (x, y).
 */
export function propSprite(x: number, y: number, w: number, h: number, ax: number, ay: number, draw: (c: Ctx) => void, res = 2) {
  const s = new Sprite(
    paint(w, h, (c) => {
      c.translate(ax, ay);
      draw(c);
    }, res),
  );
  s.anchor.set(ax / w, ay / h);
  s.position.set(x, y);
  return s;
}

// ---- Colour -----------------------------------------------------------------------------

export function rgb(n: number, a = 1) {
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function mix(a: number, b: number, k: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
}
export const light = (c: number, k: number) => mix(c, 0xfff4dc, k);
/** Shadows fall towards midnight blue, the night outside the house. */
export const dark = (c: number, k: number) => mix(c, 0x0a0c1c, k);

export const INK = 'rgba(14,10,24,0.88)';
export const GOLD = 0xe0b25a;

/** Vertical gradient from a lit top to a shaded bottom. */
export function vgrad(c: Ctx, y0: number, y1: number, col: number, top = 0.25, bottom = 0.35) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgb(light(col, top)));
  g.addColorStop(0.45, rgb(col));
  g.addColorStop(1, rgb(dark(col, bottom)));
  return g;
}

/** Polished gold, lit from the upper left. */
export function gold(c: Ctx, x0: number, y0: number, x1: number, y1: number) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#fff4c2');
  g.addColorStop(0.25, '#f0c868');
  g.addColorStop(0.55, '#b07a2a');
  g.addColorStop(0.8, '#e6b85a');
  g.addColorStop(1, '#7a4e18');
  return g;
}

/** Radial glow from a colour to transparent; used for light pools and soft shadows. */
export function glowAt(c: Ctx, x: number, y: number, rx: number, ry: number, col: number, a: number, mode: GlobalCompositeOperation = 'source-over') {
  c.save();
  c.globalCompositeOperation = mode;
  c.translate(x, y);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgb(col, a));
  g.addColorStop(0.5, rgb(col, a * 0.45));
  g.addColorStop(1, rgb(col, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, rx, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Soft contact shadow under something standing on the floor. */
export function shadow(c: Ctx, x: number, y: number, rx: number, ry: number, a = 0.5) {
  glowAt(c, x, y, rx, ry, 0x0a0410, a);
  glowAt(c, x, y, rx * 0.6, ry * 0.6, 0x0a0410, a * 0.6);
}

// ---- Shapes -----------------------------------------------------------------------------

export function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

export function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
}

/** Fill the current path, then a dark outline; the chunky outline gives the painted-toy look. */
export function fillInk(c: Ctx, fill: string | CanvasGradient, width = 2) {
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = width;
  c.stroke();
}

/** A thin highlight along the top edge of the current path (rim light). */
export function rim(c: Ctx, a = 0.5, width = 1.5) {
  c.save();
  c.clip();
  c.strokeStyle = `rgba(255,244,220,${a})`;
  c.lineWidth = width * 2;
  c.translate(0.8, 1.6);
  c.stroke();
  c.restore();
}

/** A box seen from the 3/4 view: top face (depth d) and front face (height h). */
export function box(c: Ctx, x: number, y: number, w: number, d: number, h: number, top: number, front: number, r = 4) {
  // Front face.
  rrect(c, x, y + d - r, w, h + r, r);
  fillInk(c, vgrad(c, y + d, y + d + h, front, 0.08, 0.35));
  // Top face.
  rrect(c, x, y, w, d, r);
  const g = c.createLinearGradient(x, y, x + w * 0.3, y + d);
  g.addColorStop(0, rgb(light(top, 0.25)));
  g.addColorStop(1, rgb(top));
  fillInk(c, g);
}

/** Small deterministic random. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Faint painterly strokes over an area, so flat colours feel brushed. */
export function grain(c: Ctx, x: number, y: number, w: number, h: number, n: number, seed: number, alpha = 0.05) {
  const r = seeded(seed);
  for (let i = 0; i < n; i++) {
    const px = x + r() * w;
    const py = y + r() * h;
    const len = 4 + r() * 10;
    c.strokeStyle = r() < 0.5 ? `rgba(255,240,220,${alpha})` : `rgba(10,4,16,${alpha})`;
    c.lineWidth = 1 + r() * 2;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + len, py + (r() - 0.5) * 3);
    c.stroke();
  }
}

// Painted pieces for the crystal salon (floor 4: ice, glass, champagne) and the Moth Queen's
// throne room (floor 5: purple, gold and fire), in the slanted 3/4 view of the foyer.
// Each piece is painted once; small Pixi overlays animate glints, bubbles, flames and the Queen.

import { Container, Graphics, Sprite } from 'pixi.js';
import type { DecorPlacement, RoomTheme } from '../../core/registry';
import type { BuiltDecor } from '../decor';
import { box as rbox, dark, ellipse, fillInk, glowAt, gold, grain, INK, light, paint, propSprite, rgb, rim, rrect, seeded, shadow, vgrad, type Ctx } from './brush';
import { box, ent, flame, glow, kicker } from './foyerProps';

// ---- Helpers ---------------------------------------------------------------------------------

/** Polished metal in the given colour (silver for a white trim, gold for a gold one). */
function metal(c: Ctx, col: number, x0: number, y0: number, x1: number, y1: number) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgb(light(col, 0.7)));
  g.addColorStop(0.25, rgb(light(col, 0.15)));
  g.addColorStop(0.55, rgb(dark(col, 0.45)));
  g.addColorStop(0.8, rgb(light(col, 0.05)));
  g.addColorStop(1, rgb(dark(col, 0.6)));
  return g;
}

const SILVER = 0xc8d8ea;

/** An upright cylinder: side face down to (0, y0), top ellipse h above it. */
function cyl(c: Ctx, rx: number, ry: number, y0: number, h: number, side: string | CanvasGradient, top: string | CanvasGradient, w = 2) {
  c.beginPath();
  c.moveTo(-rx, y0 - h);
  c.lineTo(-rx, y0);
  c.ellipse(0, y0, rx, ry, 0, Math.PI, 0, true);
  c.lineTo(rx, y0 - h);
  c.closePath();
  fillInk(c, side, w);
  ellipse(c, 0, y0 - h, rx, ry);
  fillInk(c, top, w);
}

/** A four-pointed twinkle. */
function star(g: Graphics, x: number, y: number, r: number, alpha: number, col = 0xffffff) {
  if (alpha <= 0.01) return;
  const q = r * 0.22;
  g.moveTo(x, y - r).lineTo(x + q, y - q).lineTo(x + r, y).lineTo(x + q, y + q).lineTo(x, y + r).lineTo(x - q, y + q).lineTo(x - r, y).lineTo(x - q, y - q).closePath().fill({ color: col, alpha });
}

function starC(c: Ctx, x: number, y: number, r: number, a: number) {
  const q = r * 0.22;
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + q, y - q);
  c.lineTo(x + r, y);
  c.lineTo(x + q, y + q);
  c.lineTo(x, y + r);
  c.lineTo(x - q, y + q);
  c.lineTo(x - r, y);
  c.lineTo(x - q, y - q);
  c.closePath();
  c.fillStyle = `rgba(255,255,255,${a})`;
  c.fill();
}

/** One faceted crystal shard standing at (0,0), pointing up. */
function shard(c: Ctx, w: number, h: number, col: number) {
  const sh = -h + w * 0.95;
  const tip = -h;
  const xl = -w / 2;
  const xm = -w * 0.12;
  const xr = w / 2;
  // Silhouette.
  const outline = () => {
    c.beginPath();
    c.moveTo(xl, 2);
    c.lineTo(xl, sh);
    c.lineTo(w * 0.04, tip);
    c.lineTo(xr, sh + 2);
    c.lineTo(xr, 3);
    c.quadraticCurveTo(0, 6, xl, 2);
    c.closePath();
  };
  // Left (lit) face.
  c.beginPath();
  c.moveTo(xl, 2);
  c.lineTo(xl, sh);
  c.lineTo(w * 0.04, tip);
  c.lineTo(xm, sh + 3);
  c.lineTo(xm, 4.5);
  c.closePath();
  let g = c.createLinearGradient(0, tip, 0, 4);
  g.addColorStop(0, rgb(light(col, 0.85), 0.98));
  g.addColorStop(0.5, rgb(light(col, 0.45), 0.92));
  g.addColorStop(1, rgb(col, 0.85));
  c.fillStyle = g;
  c.fill();
  // Right (shaded) face.
  c.beginPath();
  c.moveTo(xm, 4.5);
  c.lineTo(xm, sh + 3);
  c.lineTo(w * 0.04, tip);
  c.lineTo(xr, sh + 2);
  c.lineTo(xr, 3);
  c.closePath();
  g = c.createLinearGradient(0, tip, 0, 4);
  g.addColorStop(0, rgb(light(col, 0.2), 0.95));
  g.addColorStop(0.6, rgb(dark(col, 0.25), 0.9));
  g.addColorStop(1, rgb(dark(col, 0.5), 0.9));
  c.fillStyle = g;
  c.fill();
  // Inner light and facet edges.
  c.save();
  outline();
  c.clip();
  glowAt(c, xm, sh * 0.4, w * 0.6, h * 0.35, 0xffffff, 0.35, 'lighter');
  c.beginPath();
  c.moveTo(xm, 4);
  c.lineTo(xm, sh + 3);
  c.lineTo(w * 0.04, tip);
  c.strokeStyle = 'rgba(255,255,255,0.75)';
  c.lineWidth = 1;
  c.stroke();
  c.beginPath();
  c.moveTo(xl + 1.5, sh + 4);
  c.lineTo(xl + 1.5, -2);
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.lineWidth = 1.6;
  c.stroke();
  c.restore();
  outline();
  c.strokeStyle = rgb(dark(col, 0.75), 0.9);
  c.lineWidth = 1.6;
  c.stroke();
}

/** A painted gold moth emblem (wings, body) centred at (0,0), roughly s wide. */
function mothEmblem(c: Ctx, s: number, gem = '#ff5fa2') {
  const k = s / 40;
  for (const sd of [-1, 1]) {
    c.beginPath();
    c.ellipse(sd * 11 * k, -4 * k, 11 * k, 8 * k, sd * 0.45, 0, Math.PI * 2);
    fillInk(c, gold(c, -20 * k, -14 * k, 20 * k, 6 * k), 1.3);
    c.beginPath();
    c.ellipse(sd * 8 * k, 7 * k, 7 * k, 6 * k, -sd * 0.4, 0, Math.PI * 2);
    fillInk(c, gold(c, -14 * k, 0, 14 * k, 14 * k), 1.2);
    ellipse(c, sd * 11 * k, -5 * k, 2.6 * k, 2 * k);
    c.fillStyle = gem;
    c.fill();
  }
  rrect(c, -2.4 * k, -12 * k, 4.8 * k, 24 * k, 2.4 * k);
  fillInk(c, '#7a4e18', 1.1);
  c.beginPath();
  c.moveTo(-1 * k, -12 * k);
  c.quadraticCurveTo(-6 * k, -20 * k, -10 * k, -19 * k);
  c.moveTo(1 * k, -12 * k);
  c.quadraticCurveTo(6 * k, -20 * k, 10 * k, -19 * k);
  c.strokeStyle = '#c9963e';
  c.lineWidth = 1.2;
  c.stroke();
}

function bez(p0: number, p1: number, p2: number, p3: number, t: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

// ---- The Moth Queen's wings -------------------------------------------------------------------

const FORE = [2, -6, 30, -52, 72, -82, 106, -72, 116, -52, 102, -20, 86, -8] as const;

function wingPath(c: Ctx, part: 'fore' | 'hind') {
  c.beginPath();
  if (part === 'fore') {
    const f = FORE;
    c.moveTo(f[0], f[1]);
    c.bezierCurveTo(f[2], f[3], f[4], f[5], f[6], f[7]);
    c.bezierCurveTo(f[8], f[9], f[10], f[11], f[12], f[13]);
    c.bezierCurveTo(60, 0, 30, 4, 4, 5);
  } else {
    c.moveTo(4, 2);
    c.bezierCurveTo(32, 2, 68, 10, 76, 32);
    c.bezierCurveTo(78, 50, 60, 60, 50, 66);
    c.quadraticCurveTo(50, 92, 38, 100);
    c.quadraticCurveTo(34, 80, 28, 66);
    c.bezierCurveTo(16, 54, 6, 32, 2, 10);
  }
  c.closePath();
}

/** The Queen's right wing, root at (0,0). `flash` paints a white silhouette for hits. */
function paintWing(c: Ctx, flash: boolean) {
  for (const part of ['hind', 'fore'] as const) {
    wingPath(c, part);
    if (flash) {
      c.fillStyle = 'rgba(255,255,255,0.95)';
      c.fill();
      c.strokeStyle = 'rgba(255,240,255,1)';
      c.lineWidth = 3;
      c.stroke();
      continue;
    }
    const g = c.createRadialGradient(0, 0, 4, 0, 0, part === 'fore' ? 118 : 96);
    g.addColorStop(0, '#22092e');
    g.addColorStop(0.3, '#4a1a6e');
    g.addColorStop(0.62, '#8a4ac0');
    g.addColorStop(0.84, '#c98ae0');
    g.addColorStop(0.92, '#e0b25a');
    g.addColorStop(1, '#fff1c4');
    fillInk(c, g, 2.6);
    c.save();
    wingPath(c, part);
    c.clip();
    // Veins fanning out from the root.
    const ends = part === 'fore' ? [[50, -78], [80, -82], [108, -64], [112, -40], [100, -16], [70, -4]] : [[60, 12], [76, 36], [60, 60], [42, 90], [26, 62]];
    for (const [ex, ey] of ends) {
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(ex * 0.5, ey * 0.3, ex, ey);
      c.strokeStyle = 'rgba(240,200,110,0.4)';
      c.lineWidth = 1.1;
      c.stroke();
    }
    // Soft sheen.
    glowAt(c, part === 'fore' ? 46 : 30, part === 'fore' ? -46 : 22, 40, 22, 0xf0d8ff, 0.35, 'lighter');
    c.restore();
    // Eye spot.
    const [ex, ey, er] = part === 'fore' ? [70, -44, 13] : [48, 38, 9];
    glowAt(c, ex, ey, er * 1.8, er * 1.6, 0xffcf7a, 0.35, 'lighter');
    ellipse(c, ex, ey, er, er * 0.85);
    fillInk(c, gold(c, ex - er, ey - er, ex + er, ey + er), 1.4);
    ellipse(c, ex, ey, er * 0.66, er * 0.56);
    c.fillStyle = '#1a0820';
    c.fill();
    ellipse(c, ex + 0.5, ey + 0.5, er * 0.3, er * 0.28);
    c.fillStyle = '#ff5fa2';
    c.fill();
    ellipse(c, ex - er * 0.25, ey - er * 0.25, er * 0.14, er * 0.12);
    c.fillStyle = '#ffffff';
    c.fill();
    // Pearl dots along the outer edge.
    if (part === 'fore') {
      const f = FORE;
      for (let i = 1; i < 12; i++) {
        const tt = i / 12;
        const px = i < 6 ? bez(f[0], f[2], f[4], f[6], 0.55 + tt * 0.8) : bez(f[6], f[8], f[10], f[12], (i - 6) / 6);
        const py = i < 6 ? bez(f[1], f[3], f[5], f[7], 0.55 + tt * 0.8) : bez(f[7], f[9], f[11], f[13], (i - 6) / 6);
        const dx = px * 0.92;
        const dy = py * 0.92;
        ellipse(c, dx, dy, 2, 2);
        c.fillStyle = 'rgba(255,246,220,0.9)';
        c.fill();
      }
    }
  }
  // Rim light on the leading edge.
  c.beginPath();
  c.moveTo(4, -8);
  c.bezierCurveTo(30, -52, 72, -80, 104, -70);
  c.strokeStyle = 'rgba(255,244,220,0.55)';
  c.lineWidth = 2;
  c.stroke();
}

/** The Queen's body: gown, ruff, face, crown, antennae and sceptre, thorax at (0,0). */
function paintQueen(c: Ctx) {
  // Antennae, feathery.
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(s * 4, -34);
    c.quadraticCurveTo(s * 10, -58, s * 26, -64);
    c.strokeStyle = INK;
    c.lineWidth = 3.6;
    c.stroke();
    c.strokeStyle = '#e0b25a';
    c.lineWidth = 1.8;
    c.stroke();
    for (let i = 1; i < 8; i++) {
      const tt = i / 8;
      const px = (1 - tt) * (1 - tt) * s * 4 + 2 * (1 - tt) * tt * s * 10 + tt * tt * s * 26;
      const py = (1 - tt) * (1 - tt) * -34 + 2 * (1 - tt) * tt * -58 + tt * tt * -64;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(px - s * 4, py - 4);
      c.moveTo(px, py);
      c.lineTo(px + s * 3, py + 3.5);
      c.strokeStyle = 'rgba(240,200,110,0.9)';
      c.lineWidth = 1.1;
      c.stroke();
    }
  }
  // Gown / abdomen.
  c.beginPath();
  c.moveTo(-13, -4);
  c.bezierCurveTo(-26, 18, -18, 52, 0, 68);
  c.bezierCurveTo(18, 52, 26, 18, 13, -4);
  c.closePath();
  const gg = c.createLinearGradient(-20, 0, 20, 60);
  gg.addColorStop(0, '#8a3aa8');
  gg.addColorStop(0.5, '#4a1660');
  gg.addColorStop(1, '#1a0626');
  fillInk(c, gg, 2.4);
  c.save();
  c.clip();
  for (const by of [16, 30, 44, 56]) {
    c.beginPath();
    c.ellipse(0, by - 6, 24, 7, 0, 0.15, Math.PI - 0.15);
    c.strokeStyle = gold(c, -20, by, 20, by);
    c.lineWidth = 2.4;
    c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.beginPath();
  c.ellipse(-8, 18, 3.5, 16, 0.15, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // Little arms; the right one holds the sceptre.
  for (const [sx, hx, hy] of [[-11, -16, 16], [11, 18, 12]] as const) {
    c.beginPath();
    c.moveTo(sx, 0);
    c.quadraticCurveTo(sx * 1.8, 8, hx, hy);
    c.strokeStyle = INK;
    c.lineWidth = 7.5;
    c.stroke();
    c.strokeStyle = '#6a2a88';
    c.lineWidth = 5;
    c.stroke();
    ellipse(c, hx, hy, 3.4, 3.4);
    fillInk(c, '#f3e6ff', 1.3);
  }
  c.beginPath();
  c.moveTo(12, 34);
  c.lineTo(25, -16);
  c.strokeStyle = INK;
  c.lineWidth = 4.4;
  c.stroke();
  c.strokeStyle = gold(c, 12, 34, 25, -16);
  c.lineWidth = 2.6;
  c.stroke();
  ellipse(c, 18, 12, 3.4, 3.4);
  fillInk(c, '#f3e6ff', 1.3);
  glowAt(c, 26, -20, 16, 16, 0x9fe8ff, 0.7, 'lighter');
  ellipse(c, 26, -20, 5.5, 5.5);
  const og = c.createRadialGradient(24, -22, 0.5, 26, -20, 6);
  og.addColorStop(0, '#ffffff');
  og.addColorStop(0.5, '#9fe8ff');
  og.addColorStop(1, '#2a7aa8');
  fillInk(c, og, 1.4);
  // Fluffy ruff collar.
  const puffs: [number, number][] = [];
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * (-0.08 + (i / 10) * 1.16);
    puffs.push([Math.cos(a) * 15, -6 + Math.sin(a) * 7]);
  }
  for (const [px, py] of puffs) {
    ellipse(c, px, py, 6.2, 5.6);
    c.strokeStyle = INK;
    c.lineWidth = 3.2;
    c.stroke();
  }
  for (const [px, py] of puffs) {
    ellipse(c, px, py, 6.2, 5.6);
    const pg = c.createRadialGradient(px - 2, py - 2, 0.5, px, py, 6.5);
    pg.addColorStop(0, '#ffffff');
    pg.addColorStop(1, '#e6d6ee');
    c.fillStyle = pg;
    c.fill();
  }
  // Head.
  ellipse(c, 0, -24, 14, 13);
  const hg = c.createRadialGradient(-4, -29, 1, 0, -24, 15);
  hg.addColorStop(0, '#fff6ff');
  hg.addColorStop(0.7, '#e2cdf2');
  hg.addColorStop(1, '#b08ad0');
  fillInk(c, hg, 2.2);
  // Fur tuft.
  for (const [fx, fr] of [[-7, 5], [0, 6], [7, 5]] as const) {
    ellipse(c, fx, -35, fr, 4);
    c.fillStyle = '#fff6ff';
    c.fill();
  }
  glowAt(c, -8, -19, 4, 3, 0xff5fa2, 0.45);
  glowAt(c, 8, -19, 4, 3, 0xff5fa2, 0.45);
  for (const s of [-1, 1]) {
    ellipse(c, s * 5.2, -24, 3.8, 4.8);
    c.fillStyle = '#1a0820';
    c.fill();
    ellipse(c, s * 5.2 - 1.2, -25.8, 1.4, 1.6);
    c.fillStyle = '#ffffff';
    c.fill();
    ellipse(c, s * 5.2 + 1.2, -22.4, 0.7, 0.7);
    c.fillStyle = '#c9a0ff';
    c.fill();
  }
  c.beginPath();
  c.arc(0, -18.5, 2.2, 0.2, Math.PI - 0.2);
  c.strokeStyle = '#5a1a3a';
  c.lineWidth = 1.2;
  c.stroke();
  // Crown.
  c.beginPath();
  c.moveTo(-11, -36);
  c.lineTo(-13, -50);
  c.lineTo(-6, -43);
  c.lineTo(0, -54);
  c.lineTo(6, -43);
  c.lineTo(13, -50);
  c.lineTo(11, -36);
  c.quadraticCurveTo(0, -33, -11, -36);
  c.closePath();
  fillInk(c, gold(c, -13, -54, 13, -34), 1.6);
  for (const [gx, gy, col] of [[-13, -50, '#9fe8ff'], [0, -54, '#ff5fa2'], [13, -50, '#9fe8ff']] as const) {
    ellipse(c, gx, gy, 2.2, 2.2);
    fillInk(c, col, 1);
  }
  ellipse(c, 0, -39, 2.4, 2);
  c.fillStyle = '#ff5fa2';
  c.fill();
}

/** The halo behind the Queen's head: a gold ring with rays. */
function paintHalo(c: Ctx) {
  glowAt(c, 0, 0, 44, 44, 0xffe2a8, 0.5, 'lighter');
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r1 = 26;
    const r2 = i % 2 ? 34 : 40;
    c.beginPath();
    c.moveTo(Math.cos(a - 0.06) * r1, Math.sin(a - 0.06) * r1);
    c.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    c.lineTo(Math.cos(a + 0.06) * r1, Math.sin(a + 0.06) * r1);
    c.closePath();
    c.fillStyle = gold(c, -40, -40, 40, 40);
    c.fill();
  }
  c.beginPath();
  c.arc(0, 0, 27, 0, Math.PI * 2);
  c.arc(0, 0, 22, 0, Math.PI * 2, true);
  c.fillStyle = gold(c, -27, -27, 27, 27);
  c.fill('evenodd');
  c.strokeStyle = INK;
  c.lineWidth = 1.4;
  c.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ellipse(c, Math.cos(a) * 24.5, Math.sin(a) * 24.5, 1.6, 1.6);
    c.fillStyle = i % 2 ? '#9fe8ff' : '#ff5fa2';
    c.fill();
  }
}

// ---- The pieces ---------------------------------------------------------------------------------

export function buildPaintedCrystal(d: DecorPlacement, t: RoomTheme): BuiltDecor[] | null {
  const { x, y } = d;
  const w = d.w ?? 0;
  const rnd = seeded(Math.round(x * 17 + y * 11));
  switch (d.kind) {
    case 'glassPillar': {
      const R = 24;
      const ry = R * 0.42;
      const H = 132;
      const sTop = -16 - H;
      const v = new Container();
      const core = t.crystal ?? 0x9fe8ff;
      v.addChild(
        propSprite(x, y, R * 2 + 70, H + 110, R + 35, H + 82, (c) => {
          shadow(c, 3, 6, R + 22, ry + 9, 0.55);
          // Stepped marble plinth with a silver band.
          const pl = (rx: number) => {
            const g = c.createLinearGradient(-rx, 0, rx, 0);
            g.addColorStop(0, '#f6fbff');
            g.addColorStop(0.45, '#c6d4e4');
            g.addColorStop(1, '#6a7c94');
            return g;
          };
          cyl(c, R + 9, (R + 9) * 0.42, 8, 9, pl(R + 9), '#eef6ff');
          cyl(c, R + 5, (R + 5) * 0.42, -1, 8, pl(R + 5), '#e2eefa');
          ellipse(c, 0, -9, R + 5, (R + 5) * 0.42);
          c.strokeStyle = metal(c, SILVER, -R, 0, R, 0);
          c.lineWidth = 1.6;
          c.stroke();
          // The inner light column, seen through the glass.
          rrect(c, -R * 0.38, sTop + 6, R * 0.76, H - 8, R * 0.38);
          const cg = c.createLinearGradient(-R * 0.4, 0, R * 0.4, 0);
          cg.addColorStop(0, rgb(light(core, 0.6), 0.75));
          cg.addColorStop(0.5, rgb(core, 0.6));
          cg.addColorStop(1, rgb(dark(core, 0.4), 0.6));
          c.fillStyle = cg;
          c.fill();
          glowAt(c, 0, sTop + H * 0.5, R * 0.9, H * 0.55, core, 0.45, 'lighter');
          // A cut diamond floating in the middle.
          const dy = sTop + H * 0.46;
          c.beginPath();
          c.moveTo(-9, dy - 4);
          c.lineTo(-5, dy - 9);
          c.lineTo(5, dy - 9);
          c.lineTo(9, dy - 4);
          c.lineTo(0, dy + 9);
          c.closePath();
          fillInk(c, 'rgba(240,252,255,0.95)', 1.2);
          c.beginPath();
          c.moveTo(-9, dy - 4);
          c.lineTo(9, dy - 4);
          c.moveTo(-3, dy - 4);
          c.lineTo(0, dy + 9);
          c.lineTo(3, dy - 4);
          c.strokeStyle = rgb(dark(core, 0.3), 0.8);
          c.lineWidth = 0.9;
          c.stroke();
          glowAt(c, -2, dy - 4, 6, 6, 0xffffff, 0.9, 'lighter');
          // Glass shaft.
          c.beginPath();
          c.moveTo(-R, sTop);
          c.lineTo(-R, -16);
          c.ellipse(0, -16, R, ry, 0, Math.PI, 0, true);
          c.lineTo(R, sTop);
          c.closePath();
          const gg = c.createLinearGradient(-R, 0, R, 0);
          gg.addColorStop(0, 'rgba(255,255,255,0.55)');
          gg.addColorStop(0.18, 'rgba(210,240,255,0.32)');
          gg.addColorStop(0.55, 'rgba(140,200,240,0.18)');
          gg.addColorStop(0.85, 'rgba(80,130,190,0.32)');
          gg.addColorStop(1, 'rgba(40,70,120,0.55)');
          c.fillStyle = gg;
          c.fill();
          c.strokeStyle = 'rgba(22,14,40,0.8)';
          c.lineWidth = 2;
          c.stroke();
          // Flutes.
          for (let k = -3; k <= 3; k++) {
            const fx = Math.sin((k / 4) * (Math.PI / 2)) * R;
            c.beginPath();
            c.moveTo(fx, sTop + 4);
            c.lineTo(fx, -16 + Math.cos((k / 4) * (Math.PI / 2)) * ry - 2);
            c.strokeStyle = k < 0 ? 'rgba(255,255,255,0.35)' : 'rgba(20,40,80,0.22)';
            c.lineWidth = k < 0 ? 1.4 : 1;
            c.stroke();
          }
          c.fillStyle = 'rgba(255,255,255,0.65)';
          c.fillRect(-R + 4, sTop + 6, 3.5, H - 12);
          c.fillStyle = 'rgba(255,255,255,0.3)';
          c.fillRect(-R + 10, sTop + 6, 1.6, H - 12);
          c.fillStyle = 'rgba(255,255,255,0.35)';
          c.fillRect(R - 5, sTop + 10, 1.4, H - 24);
          // Silver collar at the foot and capital at the head.
          c.beginPath();
          c.ellipse(0, -10, R + 2, (R + 2) * 0.42, 0, Math.PI, 0, true);
          c.lineTo(R + 2, -16);
          c.ellipse(0, -16, R + 2, (R + 2) * 0.42, 0, 0, Math.PI);
          c.closePath();
          fillInk(c, metal(c, SILVER, -R, 0, R, 0), 1.6);
          cyl(c, R + 3, (R + 3) * 0.42, sTop + 2, 6, metal(c, SILVER, -R, 0, R, 0), metal(c, SILVER, -R, -4, R, 4), 1.6);
          cyl(c, R + 9, (R + 9) * 0.42, sTop - 4, 10, pl(R + 9), '#eef6ff');
          for (let k = 0; k < 9; k++) {
            const a = Math.PI * (k / 8);
            ellipse(c, Math.cos(a) * (R + 9), sTop - 6 + Math.sin(a) * (R + 9) * 0.42, 1.6, 1.6);
            c.fillStyle = '#9fb4cc';
            c.fill();
          }
          // A glowing orb crowning the column.
          const oy = sTop - 14 - 13;
          glowAt(c, 0, oy, 28, 26, core, 0.6, 'lighter');
          ellipse(c, 0, oy, 11, 11);
          const og = c.createRadialGradient(-4, oy - 4, 1, 0, oy, 12);
          og.addColorStop(0, '#ffffff');
          og.addColorStop(0.45, rgb(light(core, 0.5)));
          og.addColorStop(1, rgb(dark(core, 0.35)));
          fillInk(c, og, 1.8);
          ellipse(c, 0, sTop - 14, 8, 3);
          fillInk(c, metal(c, SILVER, -8, 0, 8, 0), 1.3);
        }),
      );
      const oy = y + sTop - 27;
      const gl = glow(v, x, y + sTop + H * 0.5, 120, H + 60, core, 0.3);
      const og = glow(v, x, oy, 90, 90, core, 0.5);
      const motes = new Graphics();
      v.addChild(motes);
      const ph = rnd() * 10;
      return [
        ent(v, [box(x, y, 48, 48)], y + 26, (time) => {
          gl.alpha = 0.22 + 0.12 * Math.sin(time * 1.5 + ph);
          og.alpha = 0.4 + 0.15 * Math.sin(time * 1.5 + ph);
          motes.clear();
          for (let i = 0; i < 7; i++) {
            const k = (time * 0.18 + i / 7 + ph) % 1;
            const mx = x + Math.sin(time * 1.3 + i * 2.1) * R * 0.45;
            const my = y - 20 - k * (H - 12);
            motes.circle(mx, my, 1.4).fill({ color: 0xffffff, alpha: Math.sin(k * Math.PI) * 0.85 });
          }
          star(motes, x - R * 0.55, y + sTop + 22 + ((time * 14 + ph * 20) % (H - 40)), 4 + Math.sin(time * 3) * 1.5, 0.5 + 0.4 * Math.sin(time * 2.3 + ph));
        }),
      ];
    }

    case 'crystal': {
      const s = w || 1;
      const col = t.crystal ?? 0x9fe8ff;
      // [x, y, width, height, tilt], back to front.
      const shards: [number, number, number, number, number][] = [
        [-13, -2, 12, 38, -0.32],
        [12, -1, 11, 34, 0.3],
        [0, 0, 16, 56, 0.02],
        [-22, 5, 8, 18, -0.62],
        [21, 6, 7, 15, 0.7],
        [-6, 8, 10, 24, -0.14],
        [8, 9, 9, 20, 0.4],
      ];
      const v = new Container();
      const cl = new Container();
      cl.position.set(x, y);
      cl.addChild(
        propSprite(0, 0, 90 * s, 100 * s, 45 * s, 80 * s, (c) => {
          c.scale(s, s);
          shadow(c, 2, 6, 34, 11, 0.55);
          glowAt(c, 0, 4, 40, 14, col, 0.35, 'lighter');
          // Frosted rock the crystals grow from.
          for (const [rx, ry, rr] of [[-14, 6, 13], [12, 7, 12], [0, 9, 15], [-24, 9, 8], [23, 10, 7]] as const) {
            ellipse(c, rx, ry, rr, rr * 0.55);
            fillInk(c, vgrad(c, ry - rr * 0.55, ry + rr * 0.55, 0x3a3a58, 0.25, 0.4), 1.8);
            ellipse(c, rx - rr * 0.2, ry - rr * 0.3, rr * 0.55, rr * 0.18);
            c.fillStyle = 'rgba(235,248,255,0.55)';
            c.fill();
          }
          for (const [sx, sy, sw, sh, tl] of shards) {
            c.save();
            c.translate(sx, sy);
            c.rotate(tl);
            shard(c, sw, sh, col);
            c.restore();
          }
          // Little loose chips on the floor.
          for (const [px, py] of [[-30, 14], [27, 15], [-2, 18]] as const) {
            c.save();
            c.translate(px, py);
            shard(c, 4, 6, col);
            c.restore();
          }
          glowAt(c, -4, -20, 22, 26, 0xffffff, 0.15, 'lighter');
        }),
      );
      v.addChild(cl);
      const gl = glow(v, x, y - 18 * s, 140 * s, 120 * s, col, 0.4);
      const tw = new Graphics();
      v.addChild(tw);
      const tips = shards.map(([sx, sy, , sh, tl]) => [x + (sx + Math.sin(tl) * sh) * s, y + (sy - Math.cos(tl) * sh) * s]);
      const ph = rnd() * 10;
      const kick = kicker(1200);
      return [
        ent(v, [box(x, y, 36 * s, 30 * s)], y + 10 * s, (time, dt) => {
          const kk = kick.step(dt);
          gl.alpha = 0.3 + 0.15 * Math.sin(time * 1.8 + ph) + kk * 0.6;
          const b = 1 + Math.sin(kk * Math.PI * 5) * 0.05 * kk;
          cl.scale.set(b, 1 / b + kk * 0.04);
          tw.clear();
          tips.forEach(([tx, ty], i) => {
            const k = (time * 0.35 + i * 0.37 + ph) % 1;
            const a = Math.max(0, Math.sin(k * Math.PI * 3)) * (k < 0.34 ? 1 : 0);
            star(tw, tx, ty + 3, (5 + a * 3) * s, a * 0.95);
          });
          if (kk > 0)
            for (let i = 0; i < 10; i++) {
              const e = 1 - kk;
              const a = (i / 10) * Math.PI * 2 + i;
              star(tw, x + Math.cos(a) * (10 + e * 40) * s, y - 20 * s + Math.sin(a) * (8 + e * 26) * s - e * 10, 4 * s, kk, i % 2 ? 0xffffff : col);
            }
        }, kick.poke),
      ];
    }

    case 'iceSwan': {
      const v = new Container();
      v.addChild(
        propSprite(x, y, 120, 160, 60, 124, (c) => {
          shadow(c, 2, 10, 44, 13, 0.55);
          // Draped table under a silver tray.
          rbox(c, -33, -50, 66, 26, 34, 0xf0f6ff, 0xb8cce0, 6);
          c.save();
          rrect(c, -33, -28, 66, 38, 6);
          c.clip();
          for (let k = -27; k <= 27; k += 9) {
            c.beginPath();
            c.moveTo(k, -24);
            c.quadraticCurveTo(k + 3, -8, k, 10);
            c.strokeStyle = 'rgba(40,60,100,0.18)';
            c.lineWidth = 3;
            c.stroke();
            c.beginPath();
            c.moveTo(k + 3, -24);
            c.quadraticCurveTo(k + 6, -8, k + 3, 10);
            c.strokeStyle = 'rgba(255,255,255,0.35)';
            c.lineWidth = 1.4;
            c.stroke();
          }
          c.restore();
          // Silver garland swags along the front.
          for (const sx of [-33, -11, 11]) {
            c.beginPath();
            c.moveTo(sx, -22);
            c.quadraticCurveTo(sx + 11, -10, sx + 22, -22);
            c.strokeStyle = metal(c, SILVER, sx, -22, sx + 22, -12);
            c.lineWidth = 2.2;
            c.stroke();
            ellipse(c, sx + 22, -21, 2.4, 2.4);
            fillInk(c, '#e8f4ff', 1);
          }
          // Tray with crushed ice.
          ellipse(c, 0, -38, 29, 10);
          fillInk(c, metal(c, SILVER, -29, -48, 29, -28), 1.8);
          ellipse(c, 0, -39, 24, 7.5);
          c.fillStyle = '#9fb4cc';
          c.fill();
          for (let i = 0; i < 22; i++) {
            const a = rnd() * Math.PI * 2;
            const r = Math.sqrt(rnd());
            ellipse(c, Math.cos(a) * r * 21, -39 + Math.sin(a) * r * 6, 2.6, 1.8);
            c.fillStyle = rnd() < 0.5 ? 'rgba(240,252,255,0.95)' : 'rgba(180,225,250,0.9)';
            c.fill();
          }
          c.save();
          c.translate(0, -40);
          c.scale(1.22, 1.22);
          c.translate(0, 40);
          const ice = (y0: number, y1: number) => {
            const g = c.createLinearGradient(-20, y0, 16, y1);
            g.addColorStop(0, 'rgba(250,255,255,0.97)');
            g.addColorStop(0.5, 'rgba(200,238,255,0.92)');
            g.addColorStop(1, 'rgba(120,190,230,0.9)');
            return g;
          };
          const iceInk = 'rgba(30,60,110,0.75)';
          const iceFill = (g: CanvasGradient, wdt = 1.8) => {
            c.fillStyle = g;
            c.fill();
            c.strokeStyle = iceInk;
            c.lineWidth = wdt;
            c.stroke();
          };
          // Far wing, raised behind.
          c.beginPath();
          c.moveTo(4, -52);
          c.bezierCurveTo(10, -78, 30, -96, 40, -94);
          c.bezierCurveTo(36, -84, 38, -76, 32, -70);
          c.bezierCurveTo(30, -62, 22, -54, 12, -50);
          c.closePath();
          iceFill(ice(-96, -50));
          // Body with a lifted tail.
          c.beginPath();
          c.moveTo(-18, -48);
          c.bezierCurveTo(-20, -36, 0, -32, 16, -38);
          c.bezierCurveTo(24, -42, 30, -52, 30, -60);
          c.bezierCurveTo(24, -54, 14, -58, 4, -58);
          c.bezierCurveTo(-8, -58, -16, -56, -18, -48);
          c.closePath();
          iceFill(ice(-62, -34), 2);
          // Neck: an S curve up to the head.
          c.beginPath();
          c.moveTo(-14, -52);
          c.bezierCurveTo(-30, -66, -6, -76, -10, -92);
          c.lineCap = 'round';
          c.strokeStyle = iceInk;
          c.lineWidth = 11;
          c.stroke();
          c.strokeStyle = ice(-96, -50);
          c.lineWidth = 8;
          c.stroke();
          c.beginPath();
          c.moveTo(-17, -55);
          c.bezierCurveTo(-28, -66, -9, -74, -13, -90);
          c.strokeStyle = 'rgba(255,255,255,0.8)';
          c.lineWidth = 2;
          c.stroke();
          // Head and beak.
          ellipse(c, -13, -94, 7, 5.5);
          iceFill(ice(-100, -88), 1.8);
          c.beginPath();
          c.moveTo(-19, -95);
          c.lineTo(-28, -91);
          c.lineTo(-18, -91);
          c.closePath();
          iceFill(ice(-96, -90), 1.4);
          ellipse(c, -14, -95, 1.4, 1.4);
          c.fillStyle = 'rgba(30,60,110,0.8)';
          c.fill();
          // Near wing, raised, with carved feathers.
          c.beginPath();
          c.moveTo(-6, -50);
          c.bezierCurveTo(-2, -74, 18, -92, 30, -90);
          c.bezierCurveTo(26, -80, 30, -74, 24, -66);
          c.bezierCurveTo(24, -58, 18, -50, 8, -44);
          c.bezierCurveTo(0, -42, -6, -44, -6, -50);
          c.closePath();
          iceFill(ice(-92, -42), 2);
          for (let k = 0; k < 4; k++) {
            c.beginPath();
            c.moveTo(-2 + k * 3, -50 - k);
            c.quadraticCurveTo(10 + k * 2, -62 - k * 4, 22 + k, -84 + k * 5);
            c.strokeStyle = k % 2 ? 'rgba(80,140,200,0.35)' : 'rgba(255,255,255,0.7)';
            c.lineWidth = 1.2;
            c.stroke();
          }
          // Frost glints.
          glowAt(c, -12, -60, 18, 20, 0xffffff, 0.3, 'lighter');
          glowAt(c, 0, -40, 40, 12, 0x9fe8ff, 0.35, 'lighter');
          starC(c, -16, -97, 4, 0.9);
          starC(c, 22, -78, 3, 0.8);
          c.restore();
        }),
      );
      const gl = glow(v, x, y - 50, 150, 120, 0x9fe8ff, 0.3);
      const tw = new Graphics();
      v.addChild(tw);
      const pts = [[-12, -66], [26, -86], [-4, -92], [10, -48], [-20, -50]];
      const ph = rnd() * 10;
      return [
        ent(v, [box(x, y, 60, 44)], y + 22, (time) => {
          gl.alpha = 0.27 + Math.sin(time * 1.2 + ph) * 0.05;
          tw.clear();
          pts.forEach(([px, py], i) => {
            const k = (time * 0.3 + i * 0.29 + ph) % 1;
            star(tw, x + px, y + py, 5, k < 0.25 ? Math.sin((k / 0.25) * Math.PI) * 0.95 : 0);
          });
        }),
      ];
    }

    case 'champagne': {
      const v = new Container();
      const GW = 16;
      const GH = 13;
      const TH = 26;
      const glasses: [number, number][] = [];
      for (let r = 0; r < 4; r++) {
        const n = 4 - r;
        for (let i = 0; i < n; i++) glasses.push([(i - (n - 1) / 2) * GW, -TH + 2 - r * GH]);
      }
      v.addChild(
        propSprite(x, y, 120, 140, 60, 110, (c) => {
          shadow(c, 3, 8, 44, 14, 0.55);
          // Round table in a long white cloth.
          const tr = 32;
          c.beginPath();
          c.moveTo(-tr, -TH);
          c.lineTo(-tr - 4, 6);
          for (let k = 0; k <= 14; k++) {
            const a = Math.PI - (k / 14) * Math.PI;
            c.lineTo(Math.cos(a) * (tr + 4), 6 + Math.sin(a) * 13 + (k % 2 ? 2 : 0));
          }
          c.lineTo(tr, -TH);
          c.closePath();
          const cg = c.createLinearGradient(-tr, 0, tr, 0);
          cg.addColorStop(0, '#fffaf0');
          cg.addColorStop(0.4, '#ece2d0');
          cg.addColorStop(1, '#9a8c78');
          fillInk(c, cg, 2.2);
          c.save();
          c.clip();
          for (let k = -4; k <= 4; k++) {
            const fx = k * 8;
            c.beginPath();
            c.moveTo(fx * 0.9, -TH + 4);
            c.quadraticCurveTo(fx * 1.05 + 2, -6, fx * 1.12, 22);
            c.strokeStyle = 'rgba(90,70,50,0.2)';
            c.lineWidth = 2.6;
            c.stroke();
            c.beginPath();
            c.moveTo(fx * 0.9 + 2.5, -TH + 4);
            c.quadraticCurveTo(fx * 1.05 + 4.5, -6, fx * 1.12 + 2.5, 22);
            c.strokeStyle = 'rgba(255,255,255,0.4)';
            c.lineWidth = 1.2;
            c.stroke();
          }
          c.restore();
          // Gold swag along the top edge.
          c.beginPath();
          c.ellipse(0, -TH + 2, tr + 1, 13, 0, 0.1, Math.PI - 0.1);
          c.strokeStyle = gold(c, -tr, -TH, tr, -TH + 14);
          c.lineWidth = 2.6;
          c.stroke();
          for (const a of [0.5, 1.2, 1.95, 2.65]) {
            ellipse(c, Math.cos(a) * (tr + 1), -TH + 2 + Math.sin(a) * 13, 2.2, 2.2);
            fillInk(c, '#f0c868', 1);
          }
          // Table top.
          ellipse(c, 0, -TH, tr, 13);
          const tg = c.createLinearGradient(-tr, -TH - 12, tr, -TH + 12);
          tg.addColorStop(0, '#ffffff');
          tg.addColorStop(1, '#ddd2bc');
          fillInk(c, tg, 2);
          glowAt(c, 0, -TH - 2, 36, 13, 0xffe7a8, 0.35, 'lighter');
          // The coupe tower, bottom row first.
          const hw = GW / 2;
          for (const [gx, gy] of glasses) {
            ellipse(c, gx, gy, 4.6, 1.6);
            fillInk(c, 'rgba(235,248,255,0.9)', 1);
            c.beginPath();
            c.moveTo(gx, gy);
            c.lineTo(gx, gy - 6);
            c.strokeStyle = 'rgba(40,24,30,0.7)';
            c.lineWidth = 2.6;
            c.stroke();
            c.strokeStyle = 'rgba(225,244,255,1)';
            c.lineWidth = 1.4;
            c.stroke();
            c.beginPath();
            c.moveTo(gx - hw, gy - GH);
            c.quadraticCurveTo(gx - hw + 1, gy - 6, gx, gy - 6);
            c.quadraticCurveTo(gx + hw - 1, gy - 6, gx + hw, gy - GH);
            c.closePath();
            const lg = c.createLinearGradient(gx - hw, gy - GH, gx + hw, gy - 5);
            lg.addColorStop(0, 'rgba(255,240,170,0.98)');
            lg.addColorStop(0.5, 'rgba(240,196,90,0.95)');
            lg.addColorStop(1, 'rgba(176,122,42,0.95)');
            fillInk(c, lg, 1.3);
            ellipse(c, gx, gy - GH, hw, 2.6);
            c.fillStyle = 'rgba(255,248,214,0.95)';
            c.fill();
            c.strokeStyle = 'rgba(40,24,30,0.75)';
            c.lineWidth = 1.1;
            c.stroke();
            c.fillStyle = 'rgba(255,255,255,0.85)';
            c.fillRect(gx - hw + 2, gy - GH + 1.5, 1.6, 4);
            ellipse(c, gx + 2, gy - GH, 1.2, 0.8);
            c.fillStyle = 'rgba(255,255,255,0.9)';
            c.fill();
          }
          glowAt(c, 0, -TH - GH * 2.5, 40, 34, 0xffe7a8, 0.35, 'lighter');
        }),
      );
      const flow = new Graphics();
      v.addChild(flow);
      const gl = glow(v, x, y - 50, 120, 110, 0xffe7a8, 0.3);
      const top = glasses[glasses.length - 1];
      const upper = glasses.filter(([, gy]) => gy < -TH);
      const kick = kicker(1300);
      const ph = rnd() * 10;
      return [
        ent(v, [box(x, y, 56, 56)], y + 28, (time, dt) => {
          const kk = kick.step(dt);
          flow.clear();
          // Champagne trickling over the rims into the row below.
          upper.forEach(([gx, gy], j) => {
            for (const sd of [-1, 1])
              for (let i = 0; i < 3; i++) {
                const k = (time * 1.4 + i / 3 + j * 0.21 + (sd > 0 ? 0.5 : 0)) % 1;
                flow.circle(x + gx + sd * (GW / 2 - 0.5 + k * 1.2), y + gy - GH + k * GH, 1.2).fill({ color: 0xffd36a, alpha: 0.9 - k * 0.4 });
              }
          });
          // Bubbles fizzing above the glasses.
          for (let i = 0; i < 9; i++) {
            const [gx, gy] = glasses[(i * 3) % glasses.length];
            const k = (time * 0.7 + i * 0.13 + ph) % 1;
            flow.circle(x + gx + Math.sin(time * 3 + i) * 2, y + gy - GH - 1 - k * 14, 0.9 + k * 0.6).fill({ color: 0xffffff, alpha: (1 - k) * 0.75 });
          }
          // Pop: a spray of golden bubbles from the top glass.
          if (kk > 0)
            for (let i = 0; i < 22; i++) {
              const e = (1 - kk + (i / 22) * 0.4) % 1;
              const a = -Math.PI / 2 + (i / 22 - 0.5) * 2.2;
              const sp = 30 + (i % 5) * 9;
              flow.circle(x + top[0] + Math.cos(a) * sp * e, y + top[1] - 12 + Math.sin(a) * sp * e + e * e * 26, 1.8 - e).fill({ color: i % 3 ? 0xfff6d0 : 0xffd36a, alpha: kk * (1 - e * 0.6) });
            }
          gl.alpha = 0.26 + Math.sin(time * 2 + ph) * 0.04 + kk * 0.4;
        }, kick.poke),
      ];
    }

    case 'mirror': {
      const mw = w || 60;
      const T = 20;
      const H = 92;
      const cy = T + H / 2;
      const trim = t.wallTrim;
      const v = new Container();
      v.addChild(
        propSprite(x, 0, mw + 50, H + 70, (mw + 50) / 2, 0, (c) => {
          // Shadow on the wall.
          ellipse(c, 4, cy + 6, mw / 2 + 9, H / 2 + 9);
          c.fillStyle = 'rgba(0,0,0,0.4)';
          c.fill();
          // Frame.
          ellipse(c, 0, cy, mw / 2 + 9, H / 2 + 9);
          fillInk(c, metal(c, trim, -mw / 2, T - 6, mw / 2, T + H + 6), 2.2);
          for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            ellipse(c, Math.cos(a) * (mw / 2 + 5), cy + Math.sin(a) * (H / 2 + 5), 1.7, 1.7);
            c.fillStyle = rgb(light(trim, 0.6), 0.9);
            c.fill();
          }
          ellipse(c, 0, cy, mw / 2 + 1, H / 2 + 1);
          c.strokeStyle = INK;
          c.lineWidth = 1.6;
          c.stroke();
          // Glass with a cool reflection of the salon.
          ellipse(c, 0, cy, mw / 2, H / 2);
          const g = c.createLinearGradient(-mw / 2, T, mw / 2, T + H);
          g.addColorStop(0, '#eef8ff');
          g.addColorStop(0.35, '#9ab8d4');
          g.addColorStop(0.75, '#3a5474');
          g.addColorStop(1, '#1a2840');
          c.fillStyle = g;
          c.fill();
          c.save();
          c.clip();
          glowAt(c, mw * 0.12, T + H * 0.3, mw * 0.3, mw * 0.24, 0xfff1c4, 0.45, 'lighter');
          for (let k = 0; k < 4; k++) {
            ellipse(c, -mw * 0.25 + k * mw * 0.17, T + H * 0.62 + (k % 2) * 3, 1.6, 1.6);
            c.fillStyle = 'rgba(255,241,196,0.75)';
            c.fill();
          }
          c.fillStyle = 'rgba(20,30,50,0.35)';
          c.fillRect(-mw / 2, T + H * 0.72, mw, H);
          c.beginPath();
          c.moveTo(-mw * 0.34, T + H * 0.78);
          c.lineTo(-mw * 0.02, T + H * 0.08);
          c.lineTo(mw * 0.14, T + H * 0.08);
          c.lineTo(-mw * 0.18, T + H * 0.78);
          c.closePath();
          c.fillStyle = 'rgba(255,255,255,0.32)';
          c.fill();
          c.beginPath();
          c.moveTo(-mw * 0.06, T + H * 0.86);
          c.lineTo(mw * 0.22, T + H * 0.2);
          c.lineTo(mw * 0.28, T + H * 0.2);
          c.lineTo(0, T + H * 0.86);
          c.closePath();
          c.fillStyle = 'rgba(255,255,255,0.16)';
          c.fill();
          c.restore();
          ellipse(c, 0, cy, mw / 2, H / 2);
          rim(c, 0.45, 1.6);
          // Crest on top and a little scroll below.
          c.beginPath();
          c.moveTo(-14, T - 4);
          c.quadraticCurveTo(-12, T - 16, 0, T - 20);
          c.quadraticCurveTo(12, T - 16, 14, T - 4);
          c.quadraticCurveTo(0, T - 9, -14, T - 4);
          c.closePath();
          fillInk(c, metal(c, trim, -14, T - 20, 14, T - 4), 1.6);
          c.save();
          c.translate(0, T - 11);
          c.beginPath();
          c.moveTo(0, -6);
          c.lineTo(4, 0);
          c.lineTo(0, 6);
          c.lineTo(-4, 0);
          c.closePath();
          fillInk(c, rgb(t.crystal ?? 0x9fe8ff), 1.1);
          c.restore();
          glowAt(c, 0, T - 11, 10, 10, 0xffffff, 0.5, 'lighter');
          c.beginPath();
          c.moveTo(-10, T + H + 6);
          c.quadraticCurveTo(0, T + H + 18, 10, T + H + 6);
          c.strokeStyle = INK;
          c.lineWidth = 4.5;
          c.stroke();
          c.strokeStyle = metal(c, trim, -10, T + H, 10, T + H + 16);
          c.lineWidth = 3;
          c.stroke();
        }),
      );
      // A glint sweeping across the glass now and then.
      const glint = new Graphics();
      glint.poly([-6, -H / 2 - 10, 6, -H / 2 - 10, -4, H / 2 + 10, -16, H / 2 + 10]).fill({ color: 0xffffff, alpha: 0.5 });
      glint.position.set(x, cy);
      const mask = new Graphics().ellipse(x, cy, mw / 2 - 1, H / 2 - 1).fill(0xffffff);
      glint.mask = mask;
      v.addChild(mask, glint);
      const sp = new Graphics();
      v.addChild(sp);
      const ph = rnd() * 10;
      return [
        {
          view: v,
          layer: 'wall',
          obstacles: [],
          update: (time) => {
            const k = (time * 0.12 + ph) % 1;
            glint.x = x - mw + k * 4 * mw;
            glint.alpha = k < 0.5 ? 1 : 0;
            sp.clear();
            const s2 = (time * 0.4 + ph) % 1;
            star(sp, x - mw * 0.3, cy - H * 0.3, 5, s2 < 0.2 ? Math.sin((s2 / 0.2) * Math.PI) : 0);
          },
        },
      ];
    }

    case 'banner': {
      const bw = w || 50;
      const T = 4;
      const H = 116;
      const col = t.curtain ?? 0x5a1a6a;
      const v = new Container();
      // Rod with finials (fixed).
      v.addChild(
        propSprite(x, 0, bw + 50, 30, (bw + 50) / 2, 0, (c) => {
          rrect(c, -bw / 2 - 9, T + 1, bw + 18, 6, 3);
          fillInk(c, gold(c, 0, T, 0, T + 7), 1.6);
          for (const s of [-1, 1]) {
            ellipse(c, s * (bw / 2 + 12), T + 4, 4.5, 4.5);
            fillInk(c, gold(c, s * (bw / 2 + 8), T, s * (bw / 2 + 16), T + 8), 1.4);
            c.beginPath();
            c.moveTo(s * (bw / 2 + 16), T + 4);
            c.lineTo(s * (bw / 2 + 22), T + 4);
            c.strokeStyle = '#c9963e';
            c.lineWidth = 2;
            c.stroke();
          }
        }),
      );
      // The cloth hangs from the rod and sways.
      const B = H - 6;
      const cloth = propSprite(x, T + 6, bw + 24, B + 30, (bw + 24) / 2, 0, (c) => {
        const L = -bw / 2;
        const R = bw / 2;
        const path = () => {
          c.beginPath();
          c.moveTo(L, 0);
          c.lineTo(R, 0);
          c.lineTo(R + 1, B);
          c.lineTo(0, B - 16);
          c.lineTo(L - 1, B);
          c.closePath();
        };
        // Shadow on the wall behind it.
        c.save();
        c.translate(4, 5);
        path();
        c.fillStyle = 'rgba(0,0,0,0.38)';
        c.fill();
        c.restore();
        path();
        const g = c.createLinearGradient(L, 0, R, 0);
        const folds = 3;
        for (let i = 0; i <= folds * 2; i++) {
          const k = i / (folds * 2);
          g.addColorStop(k, rgb(i % 2 ? light(col, 0.22) : dark(col, 0.3)));
        }
        fillInk(c, g, 2);
        c.save();
        path();
        c.clip();
        const sh = c.createLinearGradient(0, 0, 0, B);
        sh.addColorStop(0, 'rgba(10,4,16,0.35)');
        sh.addColorStop(0.2, 'rgba(10,4,16,0)');
        sh.addColorStop(1, 'rgba(10,4,16,0.35)');
        c.fillStyle = sh;
        c.fillRect(L - 2, 0, bw + 4, B + 2);
        grain(c, L, 0, bw, B, 18, Math.round(x), 0.06);
        c.restore();
        // Gold border.
        c.beginPath();
        c.moveTo(L + 5, 5);
        c.lineTo(R - 5, 5);
        c.lineTo(R - 4, B - 8);
        c.lineTo(0, B - 22);
        c.lineTo(L + 4, B - 8);
        c.closePath();
        c.strokeStyle = gold(c, L, 0, R, B);
        c.lineWidth = 2;
        c.stroke();
        // Moth emblem with a little crown.
        const my = H * 0.4;
        glowAt(c, 0, my, bw * 0.45, bw * 0.45, 0xffcf7a, 0.25, 'lighter');
        c.save();
        c.translate(0, my);
        mothEmblem(c, bw * 0.8);
        c.restore();
        c.beginPath();
        const cs = bw / 50;
        c.moveTo(-7 * cs, my - 16 * cs);
        c.lineTo(-8 * cs, my - 25 * cs);
        c.lineTo(-3.5 * cs, my - 20 * cs);
        c.lineTo(0, my - 27 * cs);
        c.lineTo(3.5 * cs, my - 20 * cs);
        c.lineTo(8 * cs, my - 25 * cs);
        c.lineTo(7 * cs, my - 16 * cs);
        c.closePath();
        fillInk(c, gold(c, -8, my - 27, 8, my - 16), 1.1);
        // Fringe and tassels at the points.
        for (let k = 0; k <= 8; k++) {
          const tt = k / 8;
          for (const s of [-1, 1]) {
            const px = s * (bw / 2) * (1 - tt);
            const py = B - 16 * tt;
            c.beginPath();
            c.moveTo(px, py);
            c.lineTo(px, py + 5);
            c.strokeStyle = '#e0b25a';
            c.lineWidth = 1.4;
            c.stroke();
          }
        }
        for (const px of [L, R]) {
          ellipse(c, px, B + 2, 3, 3);
          fillInk(c, gold(c, px - 3, B - 1, px + 3, B + 5), 1);
          c.beginPath();
          c.moveTo(px - 3, B + 4);
          c.lineTo(px - 4, B + 15);
          c.lineTo(px + 4, B + 15);
          c.lineTo(px + 3, B + 4);
          c.closePath();
          fillInk(c, gold(c, px - 4, B + 4, px + 4, B + 15), 1);
        }
        // Rim light on the left edge.
        c.beginPath();
        c.moveTo(L + 1.5, 2);
        c.lineTo(L + 1.5, B - 4);
        c.strokeStyle = 'rgba(255,240,220,0.35)';
        c.lineWidth = 1.5;
        c.stroke();
      });
      v.addChild(cloth);
      const ph = rnd() * 10;
      return [{ view: v, layer: 'wall', obstacles: [], update: (time) => (cloth.skew.y = Math.sin(time * 0.9 + ph) * 0.015) }];
    }

    case 'rope': {
      const rw = w || 200;
      const PH = 40;
      const v = new Container();
      v.addChild(
        propSprite(x, y, rw + 50, PH + 70, (rw + 50) / 2, PH + 30, (c) => {
          const L = -rw / 2;
          const R = rw / 2;
          const sag = 24;
          // Rope shadow on the floor.
          c.beginPath();
          c.moveTo(L + 8, 6);
          c.quadraticCurveTo(0, 6 + sag * 0.5, R - 8, 6);
          c.strokeStyle = 'rgba(10,4,16,0.25)';
          c.lineWidth = 10;
          c.stroke();
          for (const px of [L, R]) {
            shadow(c, px + 2, 2, 18, 6, 0.55);
            // Domed base, pole and ball.
            c.beginPath();
            c.ellipse(px, 0, 12, 4.5, 0, 0, Math.PI);
            c.lineTo(px - 12, -3);
            c.quadraticCurveTo(px - 10, -10, px - 3, -11);
            c.lineTo(px + 3, -11);
            c.quadraticCurveTo(px + 10, -10, px + 12, -3);
            c.closePath();
            fillInk(c, gold(c, px - 12, -12, px + 12, 4), 1.8);
            rrect(c, px - 2.6, -PH, 5.2, PH - 8, 2.4);
            fillInk(c, gold(c, px - 3, 0, px + 3, 0), 1.4);
            ellipse(c, px, -PH - 3, 6.5, 6.5);
            const bg = c.createRadialGradient(px - 2, -PH - 6, 0.5, px, -PH - 3, 7);
            bg.addColorStop(0, '#fff4c2');
            bg.addColorStop(0.5, '#e6b85a');
            bg.addColorStop(1, '#7a4e18');
            fillInk(c, bg, 1.6);
          }
          // Velvet rope with a twisted sheen.
          const y0 = -PH + 6;
          const rope = () => {
            c.beginPath();
            c.moveTo(L + 4, y0);
            c.quadraticCurveTo(0, y0 + sag * 2, R - 4, y0);
          };
          rope();
          c.strokeStyle = INK;
          c.lineWidth = 10;
          c.stroke();
          rope();
          c.strokeStyle = '#8a0f22';
          c.lineWidth = 7;
          c.stroke();
          c.beginPath();
          c.moveTo(L + 6, y0 - 1.5);
          c.quadraticCurveTo(0, y0 + sag * 2 - 1.5, R - 6, y0 - 1.5);
          c.strokeStyle = '#e0334a';
          c.lineWidth = 2.6;
          c.stroke();
          const n = Math.floor(rw / 7);
          for (let i = 1; i < n; i++) {
            const tt = i / n;
            const px = (1 - tt) * (1 - tt) * (L + 4) + 2 * (1 - tt) * tt * 0 + tt * tt * (R - 4);
            const py = (1 - tt) * (1 - tt) * y0 + 2 * (1 - tt) * tt * (y0 + sag * 2) + tt * tt * y0;
            c.beginPath();
            c.moveTo(px - 1.5, py - 3);
            c.lineTo(px + 1.5, py + 3);
            c.strokeStyle = 'rgba(40,0,10,0.45)';
            c.lineWidth = 1.2;
            c.stroke();
          }
          // Brass snap hooks.
          for (const px of [L + 5, R - 5]) {
            ellipse(c, px, y0, 4, 4);
            fillInk(c, gold(c, px - 4, y0 - 4, px + 4, y0 + 4), 1.2);
          }
        }),
      );
      return [ent(v, [], y + 10)];
    }

    case 'brazier': {
      const v = new Container();
      const BY = -40;
      v.addChild(
        propSprite(x, y, 90, 100, 45, 66, (c) => {
          shadow(c, 2, 4, 30, 10, 0.6);
          glowAt(c, 0, 4, 40, 14, 0xff8a3a, 0.4, 'lighter');
          const leg = (x0: number, y0: number, x1: number, y1: number, bend: number) => {
            c.beginPath();
            c.moveTo(x0, y0);
            c.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1);
            c.strokeStyle = INK;
            c.lineWidth = 6.5;
            c.stroke();
            c.strokeStyle = gold(c, x0 - 6, y0, x1 + 6, y1);
            c.lineWidth = 3.6;
            c.stroke();
            ellipse(c, x1, y1, 4, 3);
            fillInk(c, gold(c, x1 - 4, y1 - 3, x1 + 4, y1 + 3), 1.2);
          };
          leg(0, BY + 12, 0, -8, 0);
          // Bowl: dark iron, gold rim.
          c.beginPath();
          c.moveTo(-21, BY);
          c.bezierCurveTo(-20, BY + 18, 20, BY + 18, 21, BY);
          c.closePath();
          const bg = c.createLinearGradient(-21, 0, 21, 0);
          bg.addColorStop(0, '#5a4a52');
          bg.addColorStop(0.4, '#2a1c24');
          bg.addColorStop(1, '#0e080c');
          fillInk(c, bg, 2.2);
          for (let k = -2; k <= 2; k++) {
            c.beginPath();
            c.moveTo(k * 7, BY + 2);
            c.quadraticCurveTo(k * 6, BY + 9, k * 3.5, BY + 13);
            c.strokeStyle = 'rgba(224,178,90,0.55)';
            c.lineWidth = 1.2;
            c.stroke();
          }
          glowAt(c, 0, BY + 6, 22, 8, 0xff8a3a, 0.35, 'lighter');
          leg(-12, BY + 8, -19, 2, -8);
          leg(12, BY + 8, 19, 2, 8);
          // Ring tying the legs together.
          c.beginPath();
          c.ellipse(0, -14, 15, 4.5, 0, 0.1, Math.PI - 0.1);
          c.strokeStyle = gold(c, -15, -14, 15, -10);
          c.lineWidth = 2;
          c.stroke();
          // Rim and glowing coals.
          ellipse(c, 0, BY, 21, 7);
          fillInk(c, gold(c, -21, BY - 7, 21, BY + 7), 2);
          ellipse(c, 0, BY + 0.5, 17, 5);
          const cg = c.createRadialGradient(0, BY, 1, 0, BY, 18);
          cg.addColorStop(0, '#fff0b0');
          cg.addColorStop(0.35, '#ff9a3a');
          cg.addColorStop(0.75, '#b0300c');
          cg.addColorStop(1, '#3a0a04');
          c.fillStyle = cg;
          c.fill();
          for (let i = 0; i < 9; i++) {
            const a = rnd() * Math.PI * 2;
            const r = Math.sqrt(rnd());
            ellipse(c, Math.cos(a) * r * 13, BY + Math.sin(a) * r * 3.4, 3, 1.8);
            c.fillStyle = rnd() < 0.5 ? 'rgba(40,10,6,0.8)' : 'rgba(255,200,90,0.8)';
            c.fill();
          }
          // Gold moth on the bowl's front.
          c.save();
          c.translate(0, BY + 8);
          mothEmblem(c, 14, '#ff8a3a');
          c.restore();
        }),
      );
      const floorGlow = glow(v, x, y + 2, 200, 90, 0xff8a3a, 0.28);
      const gl = glow(v, x, y + BY - 18, 220, 200, 0xff8a3a, 0.5);
      const fl = new Graphics();
      fl.blendMode = 'normal';
      v.addChild(fl);
      const ph = rnd() * 10;
      const kick = kicker(1600);
      const tongue = (g: Graphics, bx: number, by: number, hw: number, h: number, sway: number, col: number, a: number) => {
        g.moveTo(bx - hw, by)
          .quadraticCurveTo(bx - hw, by - h * 0.45, bx + sway, by - h)
          .quadraticCurveTo(bx + hw, by - h * 0.45, bx + hw, by)
          .quadraticCurveTo(bx, by + hw * 0.7, bx - hw, by)
          .closePath()
          .fill({ color: col, alpha: a });
      };
      return [
        ent(v, [box(x, y, 40, 40)], y + 20, (time, dt) => {
          const kk = kick.step(dt);
          const boost = 1 + kk * 0.9;
          fl.clear();
          const bx = x;
          const by = y + BY + 1;
          const offs = [-10, -5, 0, 5, 10];
          offs.forEach((o, i) => {
            const h = (18 + (2 - Math.abs(i - 2)) * 7 + Math.sin(time * 9 + i * 1.7 + ph) * 4) * boost;
            tongue(fl, bx + o, by, 6, h, Math.sin(time * 5 + i) * 3, 0xff5a1a, 0.9);
          });
          offs.slice(1, 4).forEach((o, i) => {
            const h = (14 + (i === 1 ? 8 : 0) + Math.sin(time * 11 + i * 2.3 + ph) * 3) * boost;
            tongue(fl, bx + o, by, 4.5, h, Math.sin(time * 6 + i) * 2, 0xffa63a, 0.95);
          });
          tongue(fl, bx, by, 3.5, (12 + Math.sin(time * 13 + ph) * 2) * boost, Math.sin(time * 7) * 1.5, 0xfff0b0, 1);
          const n = 8 + Math.round(kk * 14);
          for (let i = 0; i < n; i++) {
            const k = (time * (0.55 + (i % 3) * 0.12) + i / n + ph) % 1;
            const ex = bx + Math.sin(i * 2.1 + time * 1.3) * 10 * k + ((i % 5) - 2) * 3;
            const ey = by - 10 - k * (60 + kk * 40);
            fl.circle(ex, ey, 1.6 * (1 - k) + 0.5).fill({ color: i % 2 ? 0xffcf6a : 0xff7a2a, alpha: 1 - k });
          }
          gl.alpha = 0.45 + Math.sin(time * 11 + ph) * 0.06 + kk * 0.35;
          floorGlow.alpha = 0.26 + Math.sin(time * 9 + ph) * 0.04 + kk * 0.2;
        }, kick.poke),
      ];
    }

    case 'throne': {
      const W2 = 220;
      const v = new Container();
      const runner = t.accent ?? 0x6b1a2e;
      v.addChild(
        propSprite(x, y, 320, 360, 160, 270, (c) => {
          shadow(c, 0, 56, 132, 24, 0.6);
          // Purple aura behind the throne.
          glowAt(c, 0, -150, 140, 120, 0x9a5ad0, 0.35, 'lighter');
          // Three-step dais.
          const tiers: [number, number, number, number][] = [
            [-110, -60, 220, 108],
            [-90, -72, 180, 94],
            [-70, -84, 140, 80],
          ];
          tiers.forEach(([tx, ty, tw, td], i) => {
            rbox(c, tx, ty, tw, td, 12, light(0x3a1650, i * 0.05), 0x26102e, 6);
            c.fillStyle = gold(c, tx, ty + td - 2, tx + tw, ty + td + 2);
            c.fillRect(tx + 3, ty + td - 1.5, tw - 6, 3);
            c.save();
            rrect(c, tx, ty, tw, td, 6);
            c.clip();
            grain(c, tx, ty, tw, td, 30, i * 7 + 3, 0.05);
            c.restore();
            // Gold studs along each riser.
            for (let k = tx + 14; k < tx + tw - 10; k += 18) {
              if (Math.abs(k) < 34) continue;
              ellipse(c, k, ty + td + 6, 2, 2);
              c.fillStyle = '#e0b25a';
              c.fill();
            }
          });
          // Rosettes on the bottom riser.
          for (const s of [-1, 1]) {
            c.save();
            c.translate(s * 76, 54);
            mothEmblem(c, 16, '#c9a0ff');
            c.restore();
          }
          // Runner down the steps.
          rrect(c, -30, -40, 60, 102, 2);
          c.fillStyle = vgrad(c, -40, 62, runner, 0.15, 0.2);
          c.fill();
          for (const [r0, r1] of [[-4, 8], [22, 34], [48, 60]] as const) {
            c.fillStyle = 'rgba(10,2,10,0.35)';
            c.fillRect(-30, r0, 60, r1 - r0);
          }
          for (const ex of [-30, 26]) {
            c.fillStyle = gold(c, ex, 0, ex + 4, 0);
            c.fillRect(ex, -40, 4, 102);
          }
          c.strokeStyle = INK;
          c.lineWidth = 1.6;
          c.strokeRect(-30, -40, 60, 102);
          for (const ry of [14, 40]) {
            c.beginPath();
            c.moveTo(0, ry - 5);
            c.lineTo(8, ry);
            c.lineTo(0, ry + 5);
            c.lineTo(-8, ry);
            c.closePath();
            c.strokeStyle = 'rgba(224,178,90,0.8)';
            c.lineWidth = 1.4;
            c.stroke();
          }
          // Candle stands at the back corners of the middle step.
          for (const s of [-1, 1]) {
            const cx = s * 82;
            shadow(c, cx, -52, 12, 4, 0.5);
            ellipse(c, cx, -52, 8, 3);
            fillInk(c, gold(c, cx - 8, -55, cx + 8, -49), 1.3);
            rrect(c, cx - 2, -124, 4, 72, 2);
            fillInk(c, gold(c, cx - 2, 0, cx + 2, 0), 1.2);
            for (const ky of [-70, -100]) {
              ellipse(c, cx, ky, 4, 2.6);
              fillInk(c, gold(c, cx - 4, ky - 3, cx + 4, ky + 3), 1);
            }
            ellipse(c, cx, -124, 9, 3.4);
            fillInk(c, gold(c, cx - 9, -127, cx + 9, -121), 1.3);
            rrect(c, cx - 3, -138, 6, 14, 2);
            fillInk(c, '#fff6e6', 1.2);
          }
          // Carved wing flourishes flanking the back.
          for (const s of [-1, 1]) {
            c.beginPath();
            c.moveTo(s * 44, -90);
            c.bezierCurveTo(s * 70, -110, s * 104, -150, s * 100, -196);
            c.bezierCurveTo(s * 84, -178, s * 70, -176, s * 58, -184);
            c.bezierCurveTo(s * 66, -160, s * 60, -132, s * 44, -120);
            c.closePath();
            const wg = c.createLinearGradient(s * 44, -90, s * 100, -196);
            wg.addColorStop(0, '#3a1050');
            wg.addColorStop(0.6, '#7a3aa0');
            wg.addColorStop(1, '#c98ae0');
            fillInk(c, wg, 2.2);
            c.beginPath();
            c.moveTo(s * 46, -100);
            c.bezierCurveTo(s * 70, -118, s * 94, -150, s * 98, -190);
            c.strokeStyle = gold(c, 0, -190, 0, -100);
            c.lineWidth = 2.4;
            c.stroke();
            for (let k = 0; k < 3; k++) {
              c.beginPath();
              c.moveTo(s * 50, -112);
              c.quadraticCurveTo(s * (66 + k * 6), -140 - k * 8, s * (64 + k * 9), -170 - k * 6);
              c.strokeStyle = 'rgba(240,200,110,0.55)';
              c.lineWidth = 1.2;
              c.stroke();
            }
            ellipse(c, s * 74, -152, 6, 5);
            fillInk(c, gold(c, s * 68, -158, s * 80, -146), 1.2);
            ellipse(c, s * 74, -152, 2.6, 2.2);
            c.fillStyle = '#ff5fa2';
            c.fill();
          }
          // The throne's tall back: gold frame and tufted velvet.
          const back = (k: number) => {
            c.beginPath();
            c.moveTo(-50 + k, -58);
            c.lineTo(-52 + k, -168);
            c.bezierCurveTo(-56 + k, -196 + k, -30 + k, -210 + k, -16 + k * 0.5, -214 + k);
            c.quadraticCurveTo(0, -246 + k * 1.6, 16 - k * 0.5, -214 + k);
            c.bezierCurveTo(30 - k, -210 + k, 56 - k, -196 + k, 52 - k, -168);
            c.lineTo(50 - k, -58);
            c.closePath();
          };
          back(0);
          fillInk(c, gold(c, -56, -246, 56, -58), 2.6);
          back(9);
          const vg = c.createLinearGradient(0, -232, 0, -60);
          vg.addColorStop(0, '#8a2a6a');
          vg.addColorStop(0.5, '#5a1046');
          vg.addColorStop(1, '#2a0624');
          c.fillStyle = vg;
          c.fill();
          c.strokeStyle = 'rgba(60,20,8,0.8)';
          c.lineWidth = 1.4;
          c.stroke();
          c.save();
          back(9);
          c.clip();
          // Diamond tufting.
          for (let k = -6; k <= 6; k++) {
            c.beginPath();
            c.moveTo(k * 16 - 60, -240);
            c.lineTo(k * 16 + 60, -60);
            c.moveTo(k * 16 + 60, -240);
            c.lineTo(k * 16 - 60, -60);
            c.strokeStyle = 'rgba(20,0,16,0.35)';
            c.lineWidth = 1.4;
            c.stroke();
          }
          for (let ry = -222; ry < -60; ry += 13.3) {
            const odd = Math.round((ry + 222) / 13.3) % 2;
            for (let rx = -48 + (odd ? 8 : 0); rx < 48; rx += 16) {
              ellipse(c, rx, ry, 1.8, 1.8);
              c.fillStyle = '#e0b25a';
              c.fill();
            }
          }
          glowAt(c, -18, -170, 30, 50, 0xffc0f0, 0.18, 'lighter');
          c.restore();
          // Crest on top of the back.
          glowAt(c, 0, -244, 30, 24, 0xffcf7a, 0.45, 'lighter');
          c.save();
          c.translate(0, -246);
          mothEmblem(c, 34);
          c.restore();
          for (const s of [-1, 1]) {
            c.beginPath();
            c.moveTo(s * 50, -168);
            c.lineTo(s * 56, -208);
            c.lineTo(s * 62, -168);
            c.closePath();
            fillInk(c, gold(c, s * 50, -208, s * 62, -168), 1.4);
            ellipse(c, s * 56, -212, 4.5, 4.5);
            fillInk(c, gold(c, s * 52, -216, s * 60, -208), 1.2);
          }
          // Seat cushion.
          rrect(c, -42, -72, 84, 30, 12);
          fillInk(c, vgrad(c, -72, -42, 0x7a1a5a, 0.3, 0.3), 2);
          rrect(c, -42, -72, 84, 30, 12);
          rim(c, 0.35, 1.6);
          // Front apron: gold frame with a gem.
          rrect(c, -46, -46, 92, 24, 6);
          fillInk(c, gold(c, -46, -46, 46, -22), 2.2);
          rrect(c, -38, -41, 76, 14, 4);
          c.fillStyle = vgrad(c, -41, -27, 0x4a1050, 0.15, 0.3);
          c.fill();
          ellipse(c, 0, -34, 6, 5);
          const gg = c.createRadialGradient(-2, -36, 0.5, 0, -34, 6);
          gg.addColorStop(0, '#ffffff');
          gg.addColorStop(0.4, '#ff8ac0');
          gg.addColorStop(1, '#a01a5a');
          fillInk(c, gg, 1.4);
          // Clawed feet.
          for (const s of [-1, 1]) {
            ellipse(c, s * 40, -20, 6, 4);
            fillInk(c, gold(c, s * 40 - 6, -24, s * 40 + 6, -16), 1.4);
          }
          // Armrests with scrolls and gold orbs.
          for (const s of [-1, 1]) {
            const ax = s < 0 ? -64 : 40;
            rrect(c, ax, -96, 24, 76, 9);
            fillInk(c, vgrad(c, -96, -20, 0x5a1046, 0.3, 0.4), 2.2);
            rrect(c, ax + 4, -86, 16, 58, 6);
            c.strokeStyle = gold(c, ax, -86, ax + 24, -28);
            c.lineWidth = 1.8;
            c.stroke();
            ellipse(c, ax + 12, -98, 13, 6);
            fillInk(c, vgrad(c, -104, -92, 0x8a2a6a, 0.35, 0.3), 2);
            ellipse(c, ax + 12, -60, 3, 3);
            c.fillStyle = '#c9a0ff';
            c.fill();
            ellipse(c, s * 52, -108, 7.5, 7.5);
            const og = c.createRadialGradient(s * 52 - 2.5, -111, 0.5, s * 52, -108, 8);
            og.addColorStop(0, '#fff4c2');
            og.addColorStop(0.5, '#e6b85a');
            og.addColorStop(1, '#7a4e18');
            fillInk(c, og, 1.6);
          }
        }),
      );
      const flames = [flame(v, x - 82, y - 138, 1.1, 0xffb36b), flame(v, x + 82, y - 138, 1.1, 0xffb36b)];
      // The Queen: halo, wings and body, hovering over the seat.
      const QY = -196;
      const qShadow = new Graphics().ellipse(0, 0, 36, 8).fill({ color: 0x0a0410, alpha: 0.35 });
      qShadow.position.set(x, y - 58);
      v.addChild(qShadow);
      const queen = new Container();
      queen.position.set(x, y + QY);
      queen.scale.set(0.86);
      const aura = glow(queen, 0, -10, 380, 320, 0xc9a0ff, 0.45);
      const halo = propSprite(0, -42, 100, 100, 50, 50, paintHalo);
      const wingTex = paint(130, 200, (c) => {
        c.translate(6, 96);
        paintWing(c, false);
      });
      const flashTex = paint(130, 200, (c) => {
        c.translate(6, 96);
        paintWing(c, true);
      });
      const mkWing = (tex: typeof wingTex, side: number) => {
        const s = new Sprite(tex);
        s.anchor.set(6 / 130, 96 / 200);
        s.position.set(side * 6, -2);
        s.scale.x = side;
        return s;
      };
      const wR = mkWing(wingTex, 1);
      const wL = mkWing(wingTex, -1);
      const fR = mkWing(flashTex, 1);
      const fL = mkWing(flashTex, -1);
      fR.alpha = fL.alpha = 0;
      const body = propSprite(0, 0, 90, 150, 45, 76, paintQueen);
      const dust = new Graphics();
      queen.addChild(aura, halo, wL, wR, fL, fR, body, dust);
      v.addChild(queen);
      const ph = rnd() * 10;
      let hit = 0;
      // Boss phases (1..3): she grows, flaps faster and her aura turns red. `rise` plays the change.
      let phase = 1;
      let size = 1;
      let rise = 0;
      let laugh = 0;
      let flapT = 0;
      const AURA = [0xc9a0ff, 0xc9a0ff, 0xff6ad0, 0xff4a4a];
      // room.ts calls hit() on the view when the player wins on the boss day.
      const api = v as Container & { hit?: () => void; phase?: (n: number) => void; laugh?: () => void };
      api.hit = () => (hit = 1);
      api.phase = (n: number) => {
        if (n > phase) rise = 1;
        phase = n;
        aura.tint = AURA[Math.max(0, Math.min(3, n))];
      };
      api.laugh = () => (laugh = 1);
      return [
        ent(v, [{ x: x - W2 / 2, y: y - 60, w: W2, h: 120 }], y + 60, (time, dt) => {
            hit = Math.max(0, hit - dt / 500);
            rise = Math.max(0, rise - dt / 1600);
            laugh = Math.max(0, laugh - dt / 1200);
            const goal = 1 + 0.12 * (phase - 1);
            size += (goal - size) * Math.min(1, dt / 250);
            queen.scale.set(0.86 * size * (1 + Math.sin(rise * Math.PI) * 0.12));
            flames.forEach((f) => f(time));
            flapT += (dt / 1000) * 1.6 * (1 + 0.45 * (phase - 1) + rise * 3);
            const flap = 0.72 + 0.28 * Math.abs(Math.cos(flapT));
            wR.scale.x = fR.scale.x = flap;
            wL.scale.x = fL.scale.x = -flap;
            const bob = Math.sin(time * 1.2);
            queen.y = y + QY + bob * 6 - rise * 18 + (laugh > 0 ? Math.abs(Math.sin(time * 22)) * -5 * laugh : 0);
            queen.x = x + (hit > 0 ? Math.sin(time * 60) * 6 * hit : 0);
            fR.alpha = fL.alpha = hit > 0.3 ? 0.9 : hit * 2;
            body.tint = hit > 0.3 ? 0xffd0f0 : 0xffffff;
            aura.alpha = 0.4 + Math.sin(time * 2) * 0.08 + hit * 0.4 + rise * 0.5 + (phase - 1) * 0.08;
            halo.rotation = time * 0.25;
            halo.alpha = 0.85 + Math.sin(time * 2 + ph) * 0.15;
            qShadow.scale.set(1 - bob * 0.08);
            qShadow.alpha = 0.9 - bob * 0.15;
            dust.clear();
            for (let i = 0; i < 12; i++) {
              const k = (time * 0.15 + i / 12 + ph) % 1;
              const a = i * 2.39 + time * 0.3;
              const r = 40 + (i % 4) * 18;
              const px = Math.cos(a) * r;
              const py = 50 - k * 150 + Math.sin(a) * 10;
              const al = Math.sin(k * Math.PI) * 0.9;
              if (i % 3 === 0) star(dust, px, py, 3.5, al, 0xfff1c4);
              else dust.circle(px, py, 1.3).fill({ color: i % 2 ? 0xffcf7a : 0xc9a0ff, alpha: al });
            }
          }),
      ];
    }
  }
  return null;
}

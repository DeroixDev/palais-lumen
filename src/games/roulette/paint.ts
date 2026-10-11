// Painted pieces of the roulette table: wooden bowl, rotor, brass turret, ball, chips,
// result medallion and the felt table. Everything is drawn once with Canvas 2D (no ctx.filter)
// and kept as textures; the rotor is painted without directional light so it can turn,
// and a fixed light overlay on top keeps the light coming from the upper left.

import type { Texture } from 'pixi.js';
import { CHIP_COLORS, drawEmblem } from '../../core/fx';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, paint, rgb, rrect, shadow, type Ctx } from '../../world/painted/brush';

export const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const PAINT = {
  red: 0xb8213a,
  black: 0x1e1a24,
  green: 0x138a62,
  cream: 0xfff3dc,
  wood: 0x7a3e1e,
};
export const pocketColor = (n: number) => (n === 0 ? PAINT.green : REDS.has(n) ? PAINT.red : PAINT.black);

/** Wheel geometry, in wheel units around the wheel's centre. */
export const WHEEL = {
  outer: 274,
  rim: 262,
  lip: 250,
  track: 236, // where the ball runs
  rotor: 214,
  numbers: 182,
  pockets: 142,
  rest: 161, // where the ball rests in a pocket
  size: 600, // texture size of the bowl (with shadow margin)
};

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

const FONT = (px: number) => `700 ${px}px Cinzel, Georgia, serif`;
const BODY = (px: number, w = 700) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;

function ring(c: Ctx, r0: number, r1: number) {
  c.beginPath();
  c.arc(0, 0, r1, 0, Math.PI * 2);
  c.arc(0, 0, r0, 0, Math.PI * 2, true);
}

function circle(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
}

/** A brass ring band with a lit upper-left edge. */
function brassRing(c: Ctx, r: number, width: number) {
  ring(c, r - width / 2, r + width / 2);
  c.fillStyle = gold(c, -r, -r, r, r);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(0, 0, r + width / 2, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(0, 0, r - width / 2, 0, Math.PI * 2);
  c.stroke();
}

// ---- Bowl (static) -------------------------------------------------------------------------------

export function bowlTexture() {
  return cached('bowl', () =>
    paint(WHEEL.size, WHEEL.size, (c) => {
      c.translate(WHEEL.size / 2, WHEEL.size / 2);
      shadow(c, 10, 18, 292, 292, 0.65);
      // Outer wooden bowl, lit from the upper left.
      circle(c, 0, 0, WHEEL.outer);
      const wood = c.createLinearGradient(-WHEEL.outer, -WHEEL.outer, WHEEL.outer, WHEEL.outer);
      wood.addColorStop(0, rgb(light(PAINT.wood, 0.3)));
      wood.addColorStop(0.45, rgb(PAINT.wood));
      wood.addColorStop(1, rgb(dark(PAINT.wood, 0.55)));
      fillInk(c, wood, 4);
      // Wood grain: faint concentric strokes.
      for (let i = 0; i < 26; i++) {
        const r = WHEEL.rim + 2 + (i % 5) * 2.2;
        const a0 = i * 0.9;
        c.strokeStyle = i % 2 ? 'rgba(255,220,180,0.08)' : 'rgba(30,10,4,0.16)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(0, 0, r, a0, a0 + 0.6 + (i % 3) * 0.3);
        c.stroke();
      }
      brassRing(c, WHEEL.rim, 6);
      // Inner lip falls away towards the track: lit from the far (lower right) side.
      ring(c, WHEEL.track - 2, WHEEL.lip + 6);
      const lip = c.createLinearGradient(-WHEEL.lip, -WHEEL.lip, WHEEL.lip, WHEEL.lip);
      lip.addColorStop(0, rgb(dark(PAINT.wood, 0.6)));
      lip.addColorStop(1, rgb(light(PAINT.wood, 0.15)));
      c.fillStyle = lip;
      c.fill();
      // Ball track: dark polished wood.
      ring(c, WHEEL.rotor, WHEEL.track + 10);
      const tr = c.createLinearGradient(-WHEEL.track, -WHEEL.track, WHEEL.track, WHEEL.track);
      tr.addColorStop(0, '#1c0c06');
      tr.addColorStop(0.55, '#3a1d0e');
      tr.addColorStop(1, '#5a2e16');
      c.fillStyle = tr;
      c.fill();
      // Soft sheen along the track.
      c.strokeStyle = 'rgba(255,230,190,0.12)';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(0, 0, WHEEL.track, Math.PI * 0.1, Math.PI * 0.75);
      c.stroke();
      c.strokeStyle = INK;
      c.lineWidth = 2;
      circle(c, 0, 0, WHEEL.track + 10);
      c.stroke();
      // Diamond deflectors on the lower track.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        c.save();
        c.rotate(a);
        c.translate(WHEEL.rotor + 9, 0);
        c.beginPath();
        c.moveTo(-5, 0);
        c.lineTo(0, -8);
        c.lineTo(5, 0);
        c.lineTo(0, 8);
        c.closePath();
        fillInk(c, gold(c, -5, -8, 5, 8), 1.2);
        c.restore();
      }
      // The rotor sits a little lower: dark gap.
      c.strokeStyle = 'rgba(8,3,2,0.9)';
      c.lineWidth = 5;
      circle(c, 0, 0, WHEEL.rotor + 1);
      c.stroke();
    }),
  );
}

// ---- Rotor (turns) -------------------------------------------------------------------------------

export function rotorTexture() {
  const S = (WHEEL.rotor + 4) * 2;
  return cached('rotor', () =>
    paint(S, S, (c) => {
      c.translate(S / 2, S / 2);
      const step = (Math.PI * 2) / 37;
      ORDER.forEach((n, k) => {
        const a0 = k * step - step / 2 - Math.PI / 2;
        const a1 = a0 + step;
        const col = pocketColor(n);
        // Number band.
        c.beginPath();
        c.arc(0, 0, WHEEL.rotor, a0, a1);
        c.arc(0, 0, WHEEL.numbers, a1, a0, true);
        c.closePath();
        const g = c.createRadialGradient(0, 0, WHEEL.numbers, 0, 0, WHEEL.rotor);
        g.addColorStop(0, rgb(dark(col, 0.15)));
        g.addColorStop(0.6, rgb(light(col, 0.12)));
        g.addColorStop(1, rgb(dark(col, 0.25)));
        c.fillStyle = g;
        c.fill();
        // Pocket floor: concave, so darker at the outer wall.
        c.beginPath();
        c.arc(0, 0, WHEEL.numbers - 2, a0, a1);
        c.arc(0, 0, WHEEL.pockets, a1, a0, true);
        c.closePath();
        const p = c.createRadialGradient(0, 0, WHEEL.pockets, 0, 0, WHEEL.numbers);
        p.addColorStop(0, rgb(light(col, 0.08)));
        p.addColorStop(0.7, rgb(dark(col, 0.25)));
        p.addColorStop(1, rgb(dark(col, 0.6)));
        c.fillStyle = p;
        c.fill();
        // Number.
        const am = a0 + step / 2;
        c.save();
        c.rotate(am);
        c.translate((WHEEL.rotor + WHEEL.numbers) / 2, 0);
        c.rotate(Math.PI / 2);
        c.font = FONT(15);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = 'rgba(10,4,8,0.6)';
        c.fillText(String(n), 0.8, 1.6);
        c.fillStyle = rgb(PAINT.cream);
        c.fillText(String(n), 0, 0);
        c.restore();
      });
      // Separators in the number band and brass frets between the pockets.
      ORDER.forEach((_, k) => {
        const a = k * step - step / 2 - Math.PI / 2;
        const cs = Math.cos(a);
        const sn = Math.sin(a);
        c.strokeStyle = 'rgba(255,240,210,0.35)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cs * WHEEL.numbers, sn * WHEEL.numbers);
        c.lineTo(cs * WHEEL.rotor, sn * WHEEL.rotor);
        c.stroke();
        c.strokeStyle = INK;
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(cs * WHEEL.pockets, sn * WHEEL.pockets);
        c.lineTo(cs * (WHEEL.numbers - 1), sn * (WHEEL.numbers - 1));
        c.stroke();
        c.strokeStyle = '#e6b85a';
        c.lineWidth = 2.6;
        c.stroke();
        c.strokeStyle = 'rgba(255,244,200,0.8)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cs * (WHEEL.pockets + 3), sn * (WHEEL.pockets + 3));
        c.lineTo(cs * (WHEEL.numbers - 6), sn * (WHEEL.numbers - 6));
        c.stroke();
      });
      brassRing(c, WHEEL.numbers, 4);
      brassRing(c, WHEEL.rotor - 1, 3);
      // Wooden cone in four veneer quarters.
      for (let q = 0; q < 4; q++) {
        const a0 = (q / 4) * Math.PI * 2 + Math.PI / 4;
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, WHEEL.pockets - 2, a0, a0 + Math.PI / 2);
        c.closePath();
        const g = c.createRadialGradient(0, 0, 10, 0, 0, WHEEL.pockets);
        const base = q % 2 ? 0x8a4a24 : 0x6e3519;
        g.addColorStop(0, rgb(light(base, 0.25)));
        g.addColorStop(0.7, rgb(base));
        g.addColorStop(1, rgb(dark(base, 0.45)));
        c.fillStyle = g;
        c.fill();
      }
      c.save();
      circle(c, 0, 0, WHEEL.pockets - 2);
      c.clip();
      grain(c, -WHEEL.pockets, -WHEEL.pockets, WHEEL.pockets * 2, WHEEL.pockets * 2, 120, 7, 0.05);
      c.restore();
      brassRing(c, WHEEL.pockets, 5);
      // Turret arms with ball ends.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const cs = Math.cos(a);
        const sn = Math.sin(a);
        c.strokeStyle = INK;
        c.lineWidth = 11;
        c.beginPath();
        c.moveTo(cs * 20, sn * 20);
        c.lineTo(cs * 74, sn * 74);
        c.stroke();
        c.strokeStyle = '#d9a94e';
        c.lineWidth = 7;
        c.stroke();
        c.strokeStyle = 'rgba(255,246,210,0.75)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(cs * 22 - sn * 1.5, sn * 22 + cs * 1.5);
        c.lineTo(cs * 70 - sn * 1.5, sn * 70 + cs * 1.5);
        c.stroke();
        circle(c, cs * 78, sn * 78, 10);
        const b = c.createRadialGradient(cs * 78 - 3, sn * 78 - 3, 1, cs * 78, sn * 78, 10);
        b.addColorStop(0, '#fff4c2');
        b.addColorStop(0.5, '#e0b25a');
        b.addColorStop(1, '#8a5a1c');
        fillInk(c, b, 2);
      }
    }),
  );
}

/** Fixed light over the turning rotor: lit upper left, shaded lower right, a soft sheen. */
export function rotorLightTexture() {
  const S = (WHEEL.rotor + 4) * 2;
  return cached('rotor-light', () =>
    paint(S, S, (c) => {
      c.translate(S / 2, S / 2);
      circle(c, 0, 0, WHEEL.rotor);
      const g = c.createLinearGradient(-WHEEL.rotor, -WHEEL.rotor, WHEEL.rotor, WHEEL.rotor);
      g.addColorStop(0, 'rgba(255,236,200,0.2)');
      g.addColorStop(0.45, 'rgba(255,236,200,0)');
      g.addColorStop(0.6, 'rgba(10,4,16,0)');
      g.addColorStop(1, 'rgba(10,4,16,0.4)');
      c.fillStyle = g;
      c.fill();
      // Inner shadow cast by the bowl's rim onto the rotor's upper left edge.
      c.save();
      circle(c, 0, 0, WHEEL.rotor);
      c.clip();
      c.strokeStyle = 'rgba(8,3,2,0.45)';
      c.lineWidth = 14;
      c.beginPath();
      c.arc(4, 6, WHEEL.rotor + 4, Math.PI * 0.95, Math.PI * 1.75);
      c.stroke();
      c.restore();
      glowAt(c, -60, -70, 110, 70, 0xfff4dc, 0.16);
    }),
  );
}

/** The brass cap on top of the turret (round, so it doesn't need to turn). */
export function turretCapTexture() {
  return cached('turret-cap', () =>
    paint(80, 80, (c) => {
      c.translate(40, 40);
      shadow(c, 4, 5, 30, 30, 0.6);
      circle(c, 0, 0, 25);
      const g = c.createRadialGradient(-8, -9, 2, 0, 0, 26);
      g.addColorStop(0, '#fff7d0');
      g.addColorStop(0.35, '#f0c868');
      g.addColorStop(0.8, '#a8701f');
      g.addColorStop(1, '#6a4410');
      fillInk(c, g, 2.4);
      circle(c, 0, 0, 13);
      c.strokeStyle = 'rgba(90,56,10,0.6)';
      c.lineWidth = 2;
      c.stroke();
      circle(c, 0, 0, 6);
      c.fillStyle = gold(c, -6, -6, 6, 6);
      c.fill();
      ellipse(c, -9, -10, 6, 3.5);
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fill();
    }),
  );
}

export function ballTexture() {
  return cached('ball', () =>
    paint(26, 26, (c) => {
      circle(c, 13, 13, 9.5);
      const g = c.createRadialGradient(10, 9.5, 1, 13, 13, 10);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, '#f1ede4');
      g.addColorStop(0.85, '#a9a29a');
      g.addColorStop(1, '#6d665f');
      fillInk(c, g, 1.4);
      ellipse(c, 10, 9, 3, 2);
      c.fillStyle = 'rgba(255,255,255,0.95)';
      c.fill();
    }, 3),
  );
}

export function ballShadowTexture() {
  return cached('ball-shadow', () => paint(40, 40, (c) => shadow(c, 20, 20, 14, 12, 0.75), 2));
}

// ---- Result medallion -----------------------------------------------------------------------------

export function medallionTexture(n: number) {
  const col = pocketColor(n);
  return cached(`medal-${col}`, () =>
    paint(150, 150, (c) => {
      c.translate(75, 75);
      shadow(c, 4, 8, 66, 66, 0.6);
      circle(c, 0, 0, 62);
      fillInk(c, gold(c, -62, -62, 62, 62), 3);
      // Stepped deco edge.
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        c.fillStyle = i % 2 ? 'rgba(110,70,15,0.45)' : 'rgba(255,244,200,0.35)';
        c.beginPath();
        c.arc(Math.cos(a) * 56, Math.sin(a) * 56, 2.2, 0, Math.PI * 2);
        c.fill();
      }
      circle(c, 0, 0, 49);
      const g = c.createRadialGradient(-14, -16, 4, 0, 0, 52);
      g.addColorStop(0, rgb(light(col, 0.3)));
      g.addColorStop(0.6, rgb(col));
      g.addColorStop(1, rgb(dark(col, 0.45)));
      fillInk(c, g, 2.4);
      ellipse(c, -16, -24, 18, 8);
      c.fillStyle = 'rgba(255,255,255,0.14)';
      c.fill();
    }),
  );
}

// ---- Chips ---------------------------------------------------------------------------------------

/** Chip radius and edge height in texture units; anchor (CHIP_AX, CHIP_AY) is the top face's centre. */
export const CHIP_R = 24;
export const CHIP_EDGE = 6;
const CHIP_RY = 0.84;
const CHIP_W = CHIP_R * 2 + 8;
const CHIP_H = CHIP_R * 2 * CHIP_RY + CHIP_EDGE + 10;
export const CHIP_ANCHOR = { x: (CHIP_R + 4) / CHIP_W, y: (CHIP_R * CHIP_RY + 4) / CHIP_H };

/** A painted chip seen from slightly above, with its edge showing; stack them by CHIP_EDGE. */
export function chipTexture(base: number) {
  const col = CHIP_COLORS[base] ?? 0x2f6fd6;
  return cached(`chip-${base}`, () =>
    paint(CHIP_W, CHIP_H, (c) => {
      const cx = CHIP_R + 4;
      const cy = CHIP_R * CHIP_RY + 4;
      const ry = CHIP_R * CHIP_RY;
      // Edge.
      c.beginPath();
      c.ellipse(cx, cy + CHIP_EDGE, CHIP_R, ry, 0, 0, Math.PI);
      c.lineTo(cx - CHIP_R, cy);
      c.ellipse(cx, cy, CHIP_R, ry, 0, Math.PI, 0, true);
      c.closePath();
      const eg = c.createLinearGradient(cx - CHIP_R, 0, cx + CHIP_R, 0);
      eg.addColorStop(0, rgb(dark(col, 0.1)));
      eg.addColorStop(0.35, rgb(light(col, 0.12)));
      eg.addColorStop(1, rgb(dark(col, 0.5)));
      fillInk(c, eg, 1.6);
      // Cream stripes on the edge.
      c.save();
      c.clip();
      c.fillStyle = 'rgba(255,243,220,0.9)';
      for (const k of [-0.78, -0.3, 0.2, 0.68]) {
        const x = cx + k * CHIP_R;
        c.fillRect(x - 2.4, cy, 4.8, CHIP_EDGE + ry);
      }
      c.restore();
      // Top face.
      ellipse(c, cx, cy, CHIP_R, ry);
      const tg = c.createLinearGradient(cx - CHIP_R, cy - ry, cx + CHIP_R, cy + ry);
      tg.addColorStop(0, rgb(light(col, 0.35)));
      tg.addColorStop(0.5, rgb(col));
      tg.addColorStop(1, rgb(dark(col, 0.25)));
      fillInk(c, tg, 1.6);
      // Wing marks on the rim.
      c.save();
      c.translate(cx, cy);
      c.scale(1, CHIP_RY);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        c.fillStyle = 'rgba(255,243,220,0.95)';
        c.beginPath();
        c.arc(0, 0, CHIP_R - 1.5, a - 0.2, a + 0.2);
        c.arc(0, 0, CHIP_R * 0.74, a + 0.14, a - 0.14, true);
        c.closePath();
        c.fill();
      }
      c.beginPath();
      c.arc(0, 0, CHIP_R * 0.6, 0, Math.PI * 2);
      c.fillStyle = rgb(light(col, 0.08));
      c.fill();
      c.strokeStyle = 'rgba(255,243,220,0.85)';
      c.lineWidth = 1.4;
      c.setLineDash([3, 2.5]);
      c.stroke();
      c.setLineDash([]);
      c.restore();
      ellipse(c, cx - 7, cy - 8, 8, 3);
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.fill();
    }, 3),
  );
}

// ---- Table ---------------------------------------------------------------------------------------

export interface CellSpec {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fill?: number;
  /** Text size in px. */
  size: number;
  rotate?: boolean;
  /** Use the display font (numbers) instead of the body font. */
  display?: boolean;
}

/**
 * The felt table with its wooden rail and the painted betting grid.
 * The grid's (0,0) sits at (pad, pad) in the texture; `top` adds felt above the grid.
 */
export function tableTexture(cells: CellSpec[], gw: number, gh: number, pad: number, top: number, res: number, ornaments: { x: number; y: number; s: number }[] = []) {
  const W = gw + pad * 2;
  const H = gh + pad * 2 + top;
  return paint(W + 16, H + 20, (c) => {
    shadow(c, W / 2 + 6, H / 2 + 10, W / 2 + 10, H / 2 + 10, 0.55);
    // Rail.
    const rail = Math.min(22, pad * 0.55);
    rrect(c, 0, 0, W, H, 30);
    fillInk(c, (() => {
      const g = c.createLinearGradient(0, 0, W * 0.3, H);
      g.addColorStop(0, rgb(light(PAINT.wood, 0.28)));
      g.addColorStop(0.5, rgb(PAINT.wood));
      g.addColorStop(1, rgb(dark(PAINT.wood, 0.5)));
      return g;
    })(), 3);
    rrect(c, 0, 0, W, H, 30);
    // Rim light along the rail's top.
    c.save();
    c.clip();
    c.strokeStyle = 'rgba(255,240,210,0.35)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(30, 2.5);
    c.lineTo(W - 30, 2.5);
    c.stroke();
    c.restore();
    // Brass inlay.
    rrect(c, rail * 0.45, rail * 0.45, W - rail * 0.9, H - rail * 0.9, 26);
    c.strokeStyle = gold(c, 0, 0, W, H);
    c.lineWidth = 2;
    c.stroke();
    // Felt.
    rrect(c, rail, rail, W - rail * 2, H - rail * 2, 22);
    const fg = c.createRadialGradient(W * 0.4, H * 0.35, 20, W / 2, H / 2, Math.max(W, H) * 0.75);
    fg.addColorStop(0, '#1f9a78');
    fg.addColorStop(0.55, '#147a5f');
    fg.addColorStop(1, '#0a4a3c');
    c.fillStyle = fg;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.stroke();
    c.save();
    rrect(c, rail, rail, W - rail * 2, H - rail * 2, 22);
    c.clip();
    grain(c, rail, rail, W - rail * 2, H - rail * 2, Math.round((W * H) / 900), 3, 0.045);
    // Inner shadow of the rail.
    c.strokeStyle = 'rgba(4,20,14,0.5)';
    c.lineWidth = 10;
    rrect(c, rail - 2, rail - 2, W - rail * 2 + 4, H - rail * 2 + 4, 24);
    c.stroke();
    c.restore();
    for (const o of ornaments) drawEmblem(c, o.x + pad, o.y + pad + top, o.s, 'rgba(240,200,110,0.28)', 'rgba(240,200,110,0.38)');

    // Grid.
    c.save();
    c.translate(pad, pad + top);
    for (const cell of cells) {
      if (cell.fill === undefined) continue;
      c.beginPath();
      c.rect(cell.x, cell.y, cell.w, cell.h);
      const g = c.createLinearGradient(cell.x, cell.y, cell.x + cell.w * 0.4, cell.y + cell.h);
      g.addColorStop(0, rgb(light(cell.fill, 0.14)));
      g.addColorStop(1, rgb(dark(cell.fill, 0.22)));
      c.fillStyle = g;
      c.fill();
    }
    // Lines: a soft shadow, then cream.
    for (const pass of [0, 1]) {
      c.strokeStyle = pass ? 'rgba(255,243,220,0.88)' : 'rgba(4,16,10,0.45)';
      c.lineWidth = pass ? 2 : 3;
      for (const cell of cells) {
        c.beginPath();
        c.rect(cell.x + (pass ? 0 : 1), cell.y + (pass ? 0 : 1.5), cell.w, cell.h);
        c.stroke();
      }
    }
    for (const cell of cells) {
      c.save();
      c.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
      if (cell.rotate) c.rotate(-Math.PI / 2);
      c.font = cell.display ? FONT(cell.size) : BODY(cell.size);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const yOff = cell.display ? cell.size * 0.06 : 0;
      c.fillStyle = 'rgba(8,4,8,0.55)';
      c.fillText(cell.text, 1, 1.6 + yOff);
      c.fillStyle = rgb(PAINT.cream);
      c.fillText(cell.text, 0, yOff);
      c.restore();
    }
    c.restore();
  }, res);
}

/** The dealer's tray the chips and buttons sit on: dark wood, brass edge, a velvet groove. */
export function trayTexture(w: number, h: number, res: number) {
  return paint(w, h + 10, (c) => {
    shadow(c, w / 2, h - 2, w / 2, 14, 0.5);
    rrect(c, 1, 1, w - 2, h - 2, 18);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5a2c16');
    g.addColorStop(0.5, '#3e1d0e');
    g.addColorStop(1, '#2a1208');
    fillInk(c, g, 2.5);
    rrect(c, 1, 1, w - 2, h - 2, 18);
    c.save();
    c.clip();
    c.fillStyle = gold(c, 0, 0, w, 6);
    c.fillRect(0, 0, w, 4);
    grain(c, 0, 6, w, h, Math.round((w * h) / 500), 11, 0.06);
    c.restore();
    rrect(c, 10, 12, w - 20, h - 24, 12);
    const v = c.createLinearGradient(0, 12, 0, h - 12);
    v.addColorStop(0, '#1c0a14');
    v.addColorStop(1, '#3a1626');
    c.fillStyle = v;
    c.fill();
    c.strokeStyle = 'rgba(224,178,90,0.45)';
    c.lineWidth = 1.2;
    c.stroke();
    grain(c, 10, 12, w - 20, h - 24, Math.round((w * h) / 700), 5, 0.05);
  }, res);
}

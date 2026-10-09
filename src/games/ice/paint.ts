// Painted pieces of the Eisstraße: the penguin (standing and bobbing in the water), the ice
// floes and their broken halves, the river seen from above, the snowy banks with the hut on
// the far side, and the icy river diorama in the room. Painted once and cached (no filters).

import { Container, Sprite, type Texture } from 'pixi.js';
import { FONT_DISPLAY, glowTexture } from '../../core/fx';
import { ellipse, fillInk, glowAt, gold, paint, propSprite, rgb, rrect, seeded, shadow, vgrad, type Ctx } from '../../world/painted/brush';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

// ---- Penguin ---------------------------------------------------------------------------------------

export const PENGUIN = { w: 80, h: 96, ax: 40, ay: 88 };

/** The penguin, 3/4 front view, in a wine-red scarf and a knitted cap with a pompom. Origin: feet. */
function paintPenguin(c: Ctx) {
  // Feet.
  for (const s of [-1, 1]) {
    ellipse(c, s * 10, -2, 9, 4.5);
    fillInk(c, vgrad(c, -6, 2, 0xff9a2a, 0.3, 0.2), 1.6);
  }
  // Flippers.
  for (const s of [-1, 1]) {
    c.save();
    c.translate(s * 22, -34);
    c.rotate(s * 0.35);
    ellipse(c, 0, 0, 7, 17);
    fillInk(c, vgrad(c, -17, 17, 0x2a2c3a, 0.2, 0.3), 1.8);
    c.restore();
  }
  // Body.
  ellipse(c, 0, -34, 24, 32);
  fillInk(c, vgrad(c, -66, -2, 0x2a2c3e, 0.25, 0.3), 2.4);
  // White belly.
  ellipse(c, 0, -28, 16, 24);
  const bg = c.createLinearGradient(-16, -52, 16, -4);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(1, '#cfdcea');
  c.fillStyle = bg;
  c.fill();
  // Head.
  ellipse(c, 0, -66, 18, 16);
  fillInk(c, vgrad(c, -82, -50, 0x2a2c3e, 0.3, 0.2), 2.2);
  // Face patch.
  ellipse(c, 0, -63, 13, 10);
  c.fillStyle = '#f4f8ff';
  c.fill();
  // Eyes and beak.
  for (const s of [-1, 1]) {
    ellipse(c, s * 5.5, -66, 2.6, 3.2);
    c.fillStyle = '#14101a';
    c.fill();
    ellipse(c, s * 5.5 + 0.8, -67.2, 0.9, 0.9);
    c.fillStyle = '#ffffff';
    c.fill();
  }
  c.beginPath();
  c.moveTo(-4.5, -61);
  c.quadraticCurveTo(0, -55, 4.5, -61);
  c.quadraticCurveTo(0, -63, -4.5, -61);
  c.closePath();
  fillInk(c, '#ffa030', 1.2);
  glowAt(c, -9, -60, 3.5, 2.2, 0xff7a9a, 0.6);
  glowAt(c, 9, -60, 3.5, 2.2, 0xff7a9a, 0.6);
  // Scarf.
  c.beginPath();
  c.moveTo(-17, -53);
  c.quadraticCurveTo(0, -46, 17, -53);
  c.lineTo(17, -47);
  c.quadraticCurveTo(0, -40, -17, -47);
  c.closePath();
  fillInk(c, vgrad(c, -53, -40, 0x9a1a3a, 0.25, 0.25), 1.5);
  c.beginPath();
  c.moveTo(8, -46);
  c.lineTo(14, -30);
  c.lineTo(7, -30);
  c.lineTo(4, -45);
  c.closePath();
  fillInk(c, '#8a1634', 1.3);
  // Cap with a pompom.
  c.beginPath();
  c.moveTo(-15, -74);
  c.quadraticCurveTo(0, -94, 15, -74);
  c.closePath();
  fillInk(c, vgrad(c, -92, -74, 0xe0b25a, 0.3, 0.3), 1.6);
  rrect(c, -16, -77, 32, 6, 3);
  fillInk(c, '#9a1a3a', 1.2);
  ellipse(c, 0, -90, 5, 5);
  fillInk(c, '#fff6e6', 1.2);
}

export function penguinTexture() {
  return cached('penguin', () =>
    paint(PENGUIN.w, PENGUIN.h, (c) => {
      c.translate(PENGUIN.ax, PENGUIN.ay);
      paintPenguin(c);
    }, 2.5),
  );
}

/** The penguin bobbing in the water after a splash: just head and flippers, a bit surprised. */
export function swimTexture() {
  return cached('penguin-swim', () =>
    paint(90, 70, (c) => {
      c.translate(45, 50);
      for (const s of [-1, 1]) {
        c.save();
        c.translate(s * 22, -4);
        c.rotate(s * 1.1);
        ellipse(c, 0, 0, 6, 14);
        fillInk(c, '#2a2c3e', 1.6);
        c.restore();
      }
      ellipse(c, 0, -14, 18, 16);
      fillInk(c, vgrad(c, -30, 2, 0x2a2c3e, 0.3, 0.2), 2.2);
      ellipse(c, 0, -11, 13, 10);
      c.fillStyle = '#f4f8ff';
      c.fill();
      // Round surprised eyes.
      for (const s of [-1, 1]) {
        ellipse(c, s * 5.5, -15, 3, 3.6);
        fillInk(c, '#ffffff', 1);
        ellipse(c, s * 5.5, -14.5, 1.6, 1.8);
        c.fillStyle = '#14101a';
        c.fill();
      }
      ellipse(c, 0, -7, 3.6, 2.8);
      fillInk(c, '#ffa030', 1.1);
      c.beginPath();
      c.moveTo(-15, -22);
      c.quadraticCurveTo(0, -42, 15, -22);
      c.closePath();
      fillInk(c, vgrad(c, -40, -22, 0xe0b25a, 0.3, 0.3), 1.4);
      ellipse(c, 0, -38, 4.5, 4.5);
      fillInk(c, '#fff6e6', 1);
      // Water ring around the neck.
      ellipse(c, 0, 0, 26, 7);
      c.strokeStyle = 'rgba(220,240,255,0.85)';
      c.lineWidth = 2.2;
      c.stroke();
    }, 2.5),
  );
}

// ---- Floes -----------------------------------------------------------------------------------------

export const FLOE = { w: 150, h: 118 };

function floePath(c: Ctx, seed: number, sx = 1) {
  const r = seeded(seed);
  const n = 11;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rx = 60 * (0.84 + r() * 0.2) * sx;
    const ry = 44 * (0.84 + r() * 0.2);
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

/** An ice floe from above with a thick bevelled edge; `thin` is the cracked look of the hard levels. */
function paintFloe(c: Ctx, seed: number, thin: number) {
  // Underwater shadow and the side of the ice.
  c.save();
  c.translate(4, 8);
  floePath(c, seed);
  c.fillStyle = 'rgba(4,16,40,0.45)';
  c.fill();
  c.restore();
  c.save();
  c.translate(0, 6 - thin * 2);
  floePath(c, seed);
  fillInk(c, rgb(mixIce(0x6aa8d8, thin)), 2);
  c.restore();
  floePath(c, seed);
  const g = c.createLinearGradient(-60, -44, 60, 44);
  g.addColorStop(0, rgb(mixIce(0xffffff, thin)));
  g.addColorStop(0.55, rgb(mixIce(0xdcefff, thin)));
  g.addColorStop(1, rgb(mixIce(0xa8d0f0, thin)));
  fillInk(c, g, 2.2);
  c.save();
  floePath(c, seed);
  c.clip();
  // Snow drifts and a cold glint.
  const r = seeded(seed * 7 + 3);
  for (let i = 0; i < 5; i++) glowAt(c, -40 + r() * 80, -30 + r() * 50, 18 + r() * 14, 8 + r() * 6, 0xffffff, 0.55);
  glowAt(c, -22, -20, 40, 18, 0xffffff, 0.5);
  // Fine cracks (more on thin ice).
  c.strokeStyle = `rgba(80,130,180,${0.25 + thin * 0.35})`;
  c.lineWidth = 1;
  for (let i = 0; i < 2 + thin * 4; i++) {
    let x = -50 + r() * 100;
    let y = -30 + r() * 60;
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (r() - 0.5) * 30;
      y += (r() - 0.5) * 20;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  c.restore();
  // Rim light.
  floePath(c, seed);
  c.save();
  c.clip();
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.lineWidth = 3;
  c.translate(1.5, 2.5);
  floePath(c, seed);
  c.stroke();
  c.restore();
}

function mixIce(col: number, thin: number) {
  // Thin ice is more see-through: bluer and darker.
  const t = Math.min(1, thin * 0.35);
  const r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255;
  return (Math.round(r + (90 - r) * t) << 16) | (Math.round(g + (160 - g) * t) << 8) | Math.round(b + (220 - b) * t);
}

export function floeTexture(seed: number, thin: number) {
  return cached(`floe-${seed}-${thin}`, () =>
    paint(FLOE.w, FLOE.h, (c) => {
      c.translate(FLOE.w / 2, FLOE.h / 2 - 4);
      paintFloe(c, seed, thin);
    }, 2),
  );
}

/** One half of a broken floe (side −1 left, 1 right), cut along a jagged line. */
export function halfTexture(seed: number, thin: number, side: -1 | 1) {
  return cached(`half-${seed}-${thin}-${side}`, () =>
    paint(FLOE.w, FLOE.h, (c) => {
      c.translate(FLOE.w / 2, FLOE.h / 2 - 4);
      c.save();
      c.beginPath();
      const pts = [[4, -60], [-6, -26], [8, -6], [-8, 16], [6, 34], [-2, 60]];
      c.moveTo(side * 90, -60);
      for (const [x, y] of pts) c.lineTo(x, y);
      c.lineTo(side * 90, 60);
      c.closePath();
      c.clip();
      paintFloe(c, seed, thin);
      c.restore();
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts) c.lineTo(x, y);
      c.strokeStyle = 'rgba(30,70,120,0.8)';
      c.lineWidth = 2;
      c.stroke();
    }, 2),
  );
}

/** Crack lines spreading from the middle, laid over a floe that is about to break. */
export function crackTexture() {
  return cached('crack', () =>
    paint(FLOE.w, FLOE.h, (c) => {
      c.translate(FLOE.w / 2, FLOE.h / 2 - 4);
      const r = seeded(5);
      c.strokeStyle = 'rgba(20,50,90,0.9)';
      c.lineWidth = 2;
      c.beginPath();
      const pts = [[4, -50], [-6, -26], [8, -6], [-8, 16], [6, 34], [-2, 48]];
      c.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts) c.lineTo(x, y);
      c.stroke();
      c.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) {
        let x = (r() - 0.5) * 10;
        let y = (r() - 0.5) * 40;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          x += (r() - 0.5) * 34;
          y += (r() - 0.5) * 22;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      glowAt(c, 0, 0, 30, 30, 0xffffff, 0.35, 'lighter');
    }, 2),
  );
}

/** A small drifting ice chunk. */
export function chunkTexture(i: number) {
  return cached(`chunk-${i}`, () =>
    paint(50, 40, (c) => {
      c.translate(25, 20);
      c.scale(0.32, 0.32);
      paintFloe(c, 100 + i, 0);
    }, 2),
  );
}

// ---- River and banks -------------------------------------------------------------------------------

export const WATER = 256;

/** River water from above: deep night blue with flow streaks and moon glints. Tiles both ways. */
export function waterTexture() {
  return cached('ice-water', () =>
    paint(WATER, WATER, (c) => {
      const g = c.createLinearGradient(0, 0, WATER, WATER);
      g.addColorStop(0, '#0e2a4a');
      g.addColorStop(1, '#0a2040');
      c.fillStyle = g;
      c.fillRect(0, 0, WATER, WATER);
      const r = seeded(12);
      for (let i = 0; i < 40; i++) {
        const x = r() * WATER;
        const y = r() * WATER;
        const len = 20 + r() * 50;
        for (const [ox, oy] of [[0, 0], [-WATER, 0], [0, -WATER], [-WATER, -WATER], [WATER, 0], [0, WATER]]) {
          c.beginPath();
          c.moveTo(x + ox, y + oy);
          c.quadraticCurveTo(x + ox + len / 2, y + oy - 3, x + ox + len, y + oy);
          c.strokeStyle = `rgba(140,200,240,${0.08 + r() * 0.14})`;
          c.lineWidth = 1.5;
          c.stroke();
        }
      }
      for (let i = 0; i < 10; i++) glowAt(c, r() * WATER, r() * WATER, 8, 3, 0xfff1c4, 0.3, 'lighter');
    }, 1.5),
  );
}

/** A snowy bank, `w` wide (across the river) and `h` deep; the icy water edge is at the top. */
export function bankTexture(w: number, h: number) {
  return paint(w, h, (c) => {
    const r = seeded(8);
    c.beginPath();
    c.moveTo(0, h);
    c.lineTo(0, 14);
    for (let x = 0; x <= w; x += 20) c.lineTo(x, 10 + Math.sin(x * 0.05) * 5 + r() * 4);
    c.lineTo(w, h);
    c.closePath();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#dcecff');
    g.addColorStop(0.3, '#c4d8f0');
    g.addColorStop(1, '#8aa4c8');
    fillInk(c, g, 2.4);
    c.save();
    c.clip();
    for (let i = 0; i < (w * h) / 900; i++) glowAt(c, r() * w, 20 + r() * h, 20 + r() * 30, 6 + r() * 6, 0xffffff, 0.35);
    const e = c.createLinearGradient(0, 0, 0, 30);
    e.addColorStop(0, 'rgba(90,140,200,0.5)');
    e.addColorStop(1, 'rgba(90,140,200,0)');
    c.fillStyle = e;
    c.fillRect(0, 0, w, 30);
    c.restore();
  }, 1.25);
}

/** A brass lantern post standing in the snow; origin at its foot (36, 70). */
export function lanternTexture() {
  return cached('ice-lantern', () =>
    paint(72, 80, (c) => {
      c.translate(36, 70);
      glowAt(c, 0, -52, 34, 30, 0xffcf7a, 0.5, 'lighter');
      shadow(c, 4, 2, 12, 5, 0.4);
      c.fillStyle = gold(c, -2, -46, 2, 0);
      c.fillRect(-2, -44, 4, 46);
      rrect(c, -7, -60, 14, 17, 3);
      fillInk(c, '#ffe7a8', 1.4);
      c.beginPath();
      c.moveTo(-9, -60);
      c.lineTo(0, -67);
      c.lineTo(9, -60);
      c.closePath();
      fillInk(c, gold(c, -9, -67, 9, -60), 1.2);
    }, 2),
  );
}

/** The warm snow hut on the far bank with a flag and a bucket of fish; origin at its base centre. */
export function hutTexture() {
  return cached('ice-hut', () =>
    paint(200, 150, (c) => {
      const hx = 96;
      const hy = 92;
      shadow(c, hx, hy + 34, 90, 18, 0.5);
      glowAt(c, hx, hy + 20, 90, 50, 0xffb04a, 0.25, 'lighter');
      c.beginPath();
      c.ellipse(hx, hy + 30, 66, 58, 0, Math.PI, 0);
      c.closePath();
      fillInk(c, vgrad(c, hy - 30, hy + 30, 0xeef6ff, 0.3, 0.3), 2.4);
      c.save();
      c.clip();
      c.strokeStyle = 'rgba(120,150,190,0.55)';
      c.lineWidth = 1.2;
      for (let k = 1; k < 4; k++) {
        c.beginPath();
        c.moveTo(hx - 66, hy + 30 - k * 15);
        c.lineTo(hx + 66, hy + 30 - k * 15);
        c.stroke();
      }
      c.restore();
      rrect(c, hx - 16, hy + 2, 32, 30, 14);
      fillInk(c, '#3a1a10', 2);
      glowAt(c, hx, hy + 18, 30, 22, 0xffb04a, 0.9, 'lighter');
      c.fillStyle = gold(c, hx + 58, hy - 70, hx + 62, hy);
      c.fillRect(hx + 58, hy - 66, 3, 90);
      c.beginPath();
      c.moveTo(hx + 61, hy - 66);
      c.lineTo(hx + 92, hy - 58);
      c.lineTo(hx + 61, hy - 50);
      c.closePath();
      fillInk(c, '#c8243a', 1.4);
      rrect(c, hx - 84, hy + 14, 24, 18, 4);
      fillInk(c, gold(c, hx - 84, hy + 14, hx - 60, hy + 32), 1.4);
      for (let k = 0; k < 3; k++) {
        ellipse(c, hx - 78 + k * 6, hy + 11, 3, 7);
        fillInk(c, '#9ab8d8', 0.8);
      }
    }, 2),
  );
}

/** The brass "EISSTRASSE" sign on the start bank; origin at the foot of its post. */
export function signTexture() {
  return cached('ice-sign', () =>
    paint(120, 70, (c) => {
      c.translate(60, 64);
      shadow(c, 0, 2, 20, 5, 0.4);
      c.fillStyle = gold(c, -2, -30, 2, 0);
      c.fillRect(-2, -32, 4, 34);
      rrect(c, -54, -60, 108, 30, 7);
      fillInk(c, vgrad(c, -60, -30, 0x2a1236, 0.2, 0.3), 2);
      c.fillStyle = '#ffcf7a';
      c.font = `15px ${FONT_DISPLAY}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('EISSTRASSE', 0, -44);
    }, 2),
  );
}

/** A soft white snowflake. */
export function flakeTexture() {
  return cached('flake', () =>
    paint(12, 12, (c) => {
      glowAt(c, 6, 6, 6, 6, 0xffffff, 0.9);
    }, 2),
  );
}

/** Little dizzy star for the splash. */
export function starTexture() {
  return cached('dizzy-star', () =>
    paint(20, 20, (c) => {
      c.translate(10, 10);
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? 3.5 : 8.5;
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      fillInk(c, '#ffe27a', 1.2);
    }, 2),
  );
}

// ---- Station in the room ---------------------------------------------------------------------------

/** The icy river diorama: a table holding a little frozen river with floes, a penguin and a hut. */
function iceTable(): PaintedStation {
  const W = 140;
  const H = 84;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H / 2, 210, 190, 105, 112, (x) => {
    shadow(x, 0, 30, 86, 26, 0.6);
    for (const sx of [-44, 0, 44]) {
      shadow(x, sx, 66, 14, 5, 0.45);
      x.fillStyle = gold(x, sx - 2, 50, sx + 2, 64);
      x.fillRect(sx - 2, 50, 4, 14);
      ellipse(x, sx, 50, 11, 5.5);
      fillInk(x, vgrad(x, 44, 56, 0x2a3a5a, 0.35, 0.3), 1.6);
    }
    // Table: dark wood box with a brass rim.
    rrect(x, -74, -30, 148, 58, 14);
    fillInk(x, vgrad(x, -30, 28, 0x3a2418, 0.2, 0.45), 2.2);
    rrect(x, -74, -40, 148, 52, 14);
    fillInk(x, gold(x, -74, -40, 74, 12), 2.2);
    rrect(x, -68, -35, 136, 42, 10);
    // Snow banks top and bottom, river across.
    x.fillStyle = '#dceaff';
    x.fill();
    x.save();
    rrect(x, -68, -35, 136, 42, 10);
    x.clip();
    const rg = x.createLinearGradient(0, -26, 0, 0);
    rg.addColorStop(0, '#1a4a7a');
    rg.addColorStop(1, '#0c2a50');
    x.fillStyle = rg;
    x.beginPath();
    x.moveTo(-70, -24);
    x.quadraticCurveTo(0, -30, 70, -24);
    x.lineTo(70, -2);
    x.quadraticCurveTo(0, 4, -70, -2);
    x.closePath();
    x.fill();
    // Floes stepping across.
    const r = seeded(3);
    for (let i = 0; i < 9; i++) {
      const fx = -60 + i * 15 + r() * 4;
      const fy = -19 + (i % 3) * 6 + r() * 2;
      ellipse(x, fx, fy, 6 + r() * 2, 3.4);
      fillInk(x, '#f2f8ff', 0.9);
    }
    glowAt(x, 0, -14, 70, 14, 0x9fe8ff, 0.25, 'lighter');
    x.restore();
    // Hut on the far bank.
    ellipse(x, 44, -30, 12, 8);
    fillInk(x, '#f6fbff', 1.2);
    rrect(x, 41, -30, 6, 5, 2);
    x.fillStyle = '#ffb04a';
    x.fill();
    glowAt(x, 44, -28, 12, 8, 0xffb04a, 0.6, 'lighter');
    // The penguin mid-hop on a floe.
    shadow(x, -14, -13, 5, 2, 0.5);
    ellipse(x, -14, -22, 5, 7);
    fillInk(x, '#2a2c3e', 1.2);
    ellipse(x, -14, -20, 3, 5);
    x.fillStyle = '#ffffff';
    x.fill();
    ellipse(x, -14, -29, 4, 3.6);
    fillInk(x, '#2a2c3e', 1);
    x.fillStyle = '#ffa030';
    x.fillRect(-15, -28, 2.4, 1.6);
    x.fillStyle = '#e0b25a';
    x.fillRect(-17, -33, 6, 2);
    // Snow sparkle on the rim.
    for (let i = 0; i < 6; i++) {
      ellipse(x, -60 + i * 24, 4, 2, 1);
      x.fillStyle = '#ffffff';
      x.fill();
    }
    // Brass plaque with a snowflake.
    rrect(x, -18, -2, 36, 9, 3);
    fillInk(x, vgrad(x, -2, 7, 0x2a1236, 0.2, 0.3), 1.2);
    x.strokeStyle = '#bfe4ff';
    x.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      x.beginPath();
      x.moveTo(Math.cos(a) * 3, 2.5 + Math.sin(a) * 3);
      x.lineTo(-Math.cos(a) * 3, 2.5 - Math.sin(a) * 3);
      x.stroke();
    }
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.position.set(W / 2, H / 2 - 14);
  glow.width = 170;
  glow.height = 60;
  glow.tint = 0x9fe8ff;
  glow.alpha = 0.4;
  glow.blendMode = 'add';
  const hut = new Sprite(glowTexture());
  hut.anchor.set(0.5);
  hut.position.set(W / 2 + 44, H / 2 - 28);
  hut.width = hut.height = 40;
  hut.tint = 0xffb04a;
  hut.alpha = 0.6;
  hut.blendMode = 'add';
  lamp.addChild(glow, hut);
  c.addChild(lamp);
  c.labelY = H / 2 - 56;
  return c;
}

registerPaintedStation('ice', iceTable);

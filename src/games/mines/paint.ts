// Painted parts of Diamantminen: the mine face with its timber frame, the stones and what
// hides under them, and the mine-cart cabinet that stands in the casino.

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { INK, ellipse, fillInk, glowAt, gold, paint, propSprite, rim, rrect, seeded, shadow, vgrad, type Ctx } from '../../world/painted/brush';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';
import { SCENE_H, SCENE_W } from '../ladderKit';

export const TILE = 54;
export const GAP = 5;
export const GRID = TILE * 5 + GAP * 4;
export const FIELD_X = (SCENE_W - GRID) / 2;
export const FIELD_Y = 107;
export const DIAMOND = 0x9fe8ff;
export const SOOT = 0xffa04a;

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

function wood(c: Ctx, x: number, y: number, w: number, h: number, seed: number) {
  rrect(c, x, y, w, h, 4);
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#8a5a32');
  g.addColorStop(0.5, '#6a4224');
  g.addColorStop(1, '#3e2414');
  fillInk(c, g, 2.4);
  const r = seeded(seed);
  c.save();
  rrect(c, x, y, w, h, 4);
  c.clip();
  const along = w > h;
  for (let i = 0; i < 14; i++) {
    c.strokeStyle = r() < 0.5 ? 'rgba(30,14,6,0.35)' : 'rgba(255,220,170,0.12)';
    c.lineWidth = 1 + r();
    c.beginPath();
    if (along) {
      const yy = y + r() * h;
      c.moveTo(x, yy);
      c.bezierCurveTo(x + w * 0.3, yy + (r() - 0.5) * 4, x + w * 0.7, yy + (r() - 0.5) * 4, x + w, yy);
    } else {
      const xx = x + r() * w;
      c.moveTo(xx, y);
      c.bezierCurveTo(xx + (r() - 0.5) * 4, y + h * 0.3, xx + (r() - 0.5) * 4, y + h * 0.7, xx, y + h);
    }
    c.stroke();
  }
  c.restore();
  rrect(c, x, y, w, h, 4);
  rim(c, 0.35, 1.5);
}

function bolt(c: Ctx, x: number, y: number, r = 3) {
  ellipse(c, x, y, r, r);
  fillInk(c, '#30343f', 1.2);
  ellipse(c, x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.4);
  c.fillStyle = 'rgba(255,240,220,0.5)';
  c.fill();
}

/** The mine face: rock wall, timber posts and lintel with the name plate, the stone tray. */
export function sceneTexture() {
  return cached('scene', () =>
    paint(SCENE_W, SCENE_H, (c) => {
      // Rock.
      rrect(c, 0, 0, SCENE_W, SCENE_H, 22);
      const bg = c.createLinearGradient(0, 0, 0, SCENE_H);
      bg.addColorStop(0, '#2c3246');
      bg.addColorStop(0.5, '#1a1e2e');
      bg.addColorStop(1, '#0c0e18');
      fillInk(c, bg, 3);
      c.save();
      rrect(c, 0, 0, SCENE_W, SCENE_H, 22);
      c.clip();
      const r = seeded(31);
      for (let i = 0; i < 60; i++) {
        const x = r() * SCENE_W;
        const y = r() * SCENE_H;
        const rx = 14 + r() * 34;
        const ry = rx * (0.5 + r() * 0.4);
        ellipse(c, x, y, rx, ry);
        const g = c.createLinearGradient(x - rx, y - ry, x + rx * 0.4, y + ry);
        g.addColorStop(0, `rgba(100,112,138,${0.16 + r() * 0.12})`);
        g.addColorStop(1, 'rgba(4,6,14,0.25)');
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = 'rgba(4,6,14,0.35)';
        c.lineWidth = 1.2;
        c.stroke();
      }
      // Glinting gem specks in the rock.
      for (let i = 0; i < 40; i++) {
        const x = r() * SCENE_W;
        const y = r() * SCENE_H;
        ellipse(c, x, y, 0.9 + r() * 1.3, 0.9 + r() * 1.3);
        c.fillStyle = r() < 0.7 ? 'rgba(159,232,255,0.7)' : 'rgba(255,207,122,0.7)';
        c.fill();
      }
      // Warm light pools from the two lanterns.
      glowAt(c, 52, 90, 120, 110, 0xffb060, 0.28, 'lighter');
      glowAt(c, SCENE_W - 52, 90, 120, 110, 0xffb060, 0.28, 'lighter');
      glowAt(c, SCENE_W / 2, FIELD_Y + GRID / 2, 200, 180, 0x9fe8ff, 0.06, 'lighter');
      c.restore();
      // Timber posts and lintel.
      wood(c, 6, 30, 26, SCENE_H - 36, 3);
      wood(c, SCENE_W - 32, 30, 26, SCENE_H - 36, 4);
      wood(c, 0, 6, SCENE_W, 40, 5);
      for (const x of [19, SCENE_W - 19]) {
        bolt(c, x, 26);
        bolt(c, x, SCENE_H - 20);
      }
      // Name plate on the lintel.
      rrect(c, 96, 10, SCENE_W - 192, 32, 8);
      fillInk(c, gold(c, 96, 10, SCENE_W - 96, 42), 2.2);
      rim(c, 0.7, 1.6);
      rrect(c, 102, 15, SCENE_W - 204, 22, 5);
      c.strokeStyle = 'rgba(90,50,10,0.5)';
      c.lineWidth = 1.2;
      c.stroke();
      bolt(c, 104, 26, 2.4);
      bolt(c, SCENE_W - 104, 26, 2.4);
      // Status plate: velvet in brass.
      rrect(c, 74, 52, SCENE_W - 148, 46, 12);
      fillInk(c, gold(c, 74, 52, SCENE_W - 74, 98), 2.2);
      rrect(c, 79, 56, SCENE_W - 158, 38, 9);
      c.fillStyle = vgrad(c, 56, 94, 0x141c40, 0.1, 0.4);
      c.fill();
      // Stone tray: iron rim around a deep pit.
      const tx = FIELD_X - 8;
      const ty = FIELD_Y - 8;
      const tw = GRID + 16;
      rrect(c, tx, ty, tw, tw, 14);
      const ig = c.createLinearGradient(tx, ty, tx + tw, ty + tw);
      ig.addColorStop(0, '#5a6274');
      ig.addColorStop(0.5, '#30343f');
      ig.addColorStop(1, '#181a22');
      fillInk(c, ig, 2.6);
      rim(c, 0.3, 1.5);
      rrect(c, tx + 5, ty + 5, tw - 10, tw - 10, 10);
      c.fillStyle = '#06080e';
      c.fill();
      for (const [x, y] of [[tx + 7, ty + 7], [tx + tw - 7, ty + 7], [tx + 7, ty + tw - 7], [tx + tw - 7, ty + tw - 7]]) bolt(c, x, y, 2.6);
    }),
  );
}

/** One stone, three looks. `half` -1/1 cuts it along a jagged crack for the break. */
export function stoneTexture(v: number, half = 0) {
  return cached(`stone-${v}-${half}`, () =>
    paint(TILE + 8, TILE + 8, (c) => {
      c.translate(4, 4);
      const r = seeded(11 + v * 7);
      if (half) {
        c.beginPath();
        const pts = crackLine();
        const edge = half < 0 ? -10 : TILE + 10;
        c.moveTo(edge, -10);
        for (const [x, y] of pts) c.lineTo(x, y);
        c.lineTo(edge, TILE + 10);
        c.closePath();
        c.clip();
      }
      rrect(c, 1, 1, TILE - 2, TILE - 2, 11);
      const base = [0x626a7c, 0x5a6274, 0x687082][v % 3];
      fillInk(c, vgrad(c, 0, TILE, base, 0.3, 0.45), 2.2);
      c.save();
      rrect(c, 1, 1, TILE - 2, TILE - 2, 11);
      c.clip();
      // Facets.
      for (let i = 0; i < 5; i++) {
        const x = r() * TILE;
        const y = r() * TILE;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + 8 + r() * 14, y + (r() - 0.5) * 10);
        c.lineTo(x + (r() - 0.3) * 12, y + 8 + r() * 14);
        c.closePath();
        c.fillStyle = r() < 0.5 ? 'rgba(255,240,230,0.1)' : 'rgba(4,6,14,0.16)';
        c.fill();
      }
      for (let i = 0; i < 10; i++) {
        ellipse(c, r() * TILE, r() * TILE, 0.8 + r(), 0.8 + r());
        c.fillStyle = r() < 0.3 ? 'rgba(159,232,255,0.55)' : 'rgba(8,10,20,0.35)';
        c.fill();
      }
      // Shade toward the bottom right, soft top light.
      const sg = c.createLinearGradient(0, 0, TILE, TILE);
      sg.addColorStop(0, 'rgba(255,236,210,0.22)');
      sg.addColorStop(0.45, 'rgba(255,236,210,0)');
      sg.addColorStop(1, 'rgba(0,0,0,0.3)');
      c.fillStyle = sg;
      c.fillRect(0, 0, TILE, TILE);
      c.restore();
      rrect(c, 1, 1, TILE - 2, TILE - 2, 11);
      rim(c, 0.5, 1.5);
    }),
  );
}

/** Same jagged line for the crack overlay and the two halves. */
function crackLine(): [number, number][] {
  return [
    [TILE * 0.55, -2],
    [TILE * 0.46, TILE * 0.2],
    [TILE * 0.58, TILE * 0.38],
    [TILE * 0.44, TILE * 0.56],
    [TILE * 0.56, TILE * 0.74],
    [TILE * 0.48, TILE + 2],
  ];
}

/** Light shining through cracks, drawn over the stone just before it breaks. */
export function crackTexture() {
  return cached('crack', () =>
    paint(TILE + 8, TILE + 8, (c) => {
      c.translate(4, 4);
      const main = crackLine();
      const branches: [number, number][][] = [
        [[TILE * 0.58, TILE * 0.38], [TILE * 0.78, TILE * 0.3], [TILE * 0.9, TILE * 0.36]],
        [[TILE * 0.44, TILE * 0.56], [TILE * 0.24, TILE * 0.62], [TILE * 0.12, TILE * 0.56]],
        [[TILE * 0.46, TILE * 0.2], [TILE * 0.3, TILE * 0.12]],
        [[TILE * 0.56, TILE * 0.74], [TILE * 0.74, TILE * 0.86]],
      ];
      for (const [w, col] of [[4.5, 'rgba(14,6,10,0.85)'], [1.8, 'rgba(255,248,220,0.95)']] as const) {
        c.strokeStyle = col;
        c.lineWidth = w;
        for (const line of [main, ...branches]) {
          c.beginPath();
          line.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
          c.stroke();
        }
      }
      glowAt(c, TILE / 2, TILE / 2, TILE * 0.5, TILE * 0.5, 0xfff1c4, 0.35, 'lighter');
    }),
  );
}

/** The opened pocket in the rock. */
export function pocketTexture() {
  return cached('pocket', () =>
    paint(TILE + 8, TILE + 8, (c) => {
      c.translate(4, 4);
      rrect(c, 2, 2, TILE - 4, TILE - 4, 11);
      const g = c.createRadialGradient(TILE / 2, TILE * 0.6, 2, TILE / 2, TILE / 2, TILE * 0.6);
      g.addColorStop(0, '#1c2030');
      g.addColorStop(1, '#05070c');
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 6;
      rrect(c, 2, 5, TILE - 4, TILE - 4, 11);
      c.save();
      rrect(c, 2, 2, TILE - 4, TILE - 4, 11);
      c.clip();
      c.stroke();
      c.restore();
      // Rubble crumbs on the floor of the pocket.
      const r = seeded(77);
      for (let i = 0; i < 9; i++) {
        ellipse(c, 8 + r() * (TILE - 16), TILE * 0.7 + r() * TILE * 0.2, 1.5 + r() * 2.5, 1 + r() * 1.6);
        c.fillStyle = 'rgba(110,96,110,0.6)';
        c.fill();
      }
    }),
  );
}

/** A cut diamond, icy blue with white facets. */
export function diamondTexture() {
  return cached('diamond', () =>
    paint(56, 56, (c) => {
      c.translate(28, 30);
      glowAt(c, 0, 0, 26, 24, DIAMOND, 0.35, 'lighter');
      const top = -12;
      const mid = -3;
      const bot = 18;
      // Outline.
      c.beginPath();
      c.moveTo(-9, top);
      c.lineTo(9, top);
      c.lineTo(18, mid);
      c.lineTo(0, bot);
      c.lineTo(-18, mid);
      c.closePath();
      const g = c.createLinearGradient(-18, top, 18, bot);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, '#bff2ff');
      g.addColorStop(1, '#3a9ac8');
      fillInk(c, g, 2);
      // Facets.
      const facet = (pts: number[][], a: string) => {
        c.beginPath();
        pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        c.fillStyle = a;
        c.fill();
      };
      facet([[-9, top], [-4, mid], [-18, mid]], 'rgba(255,255,255,0.55)');
      facet([[9, top], [4, mid], [18, mid]], 'rgba(40,120,170,0.35)');
      facet([[-4, mid], [4, mid], [0, bot]], 'rgba(255,255,255,0.35)');
      facet([[4, mid], [18, mid], [0, bot]], 'rgba(20,80,130,0.35)');
      c.strokeStyle = 'rgba(20,60,90,0.45)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-18, mid);
      c.lineTo(18, mid);
      c.moveTo(-4, mid);
      c.lineTo(-9, top);
      c.moveTo(4, mid);
      c.lineTo(9, top);
      c.moveTo(-4, mid);
      c.lineTo(0, bot);
      c.moveTo(4, mid);
      c.lineTo(0, bot);
      c.stroke();
      ellipse(c, -6, -8, 3, 1.6);
      c.fillStyle = 'rgba(255,255,255,0.95)';
      c.fill();
    }, 3),
  );
}

/** The trap: a sooty iron lantern with cracked glass and a sputtering flame. */
export function lanternTexture() {
  return cached('lantern', () =>
    paint(56, 56, (c) => {
      c.translate(28, 30);
      // Handle ring.
      c.strokeStyle = INK;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, -19, 5, Math.PI, 0);
      c.stroke();
      // Cap.
      c.beginPath();
      c.moveTo(-11, -12);
      c.lineTo(0, -19);
      c.lineTo(11, -12);
      c.closePath();
      fillInk(c, '#3a3036', 1.8);
      // Glass body.
      rrect(c, -10, -12, 20, 24, 3);
      const gl = c.createLinearGradient(0, -12, 0, 12);
      gl.addColorStop(0, 'rgba(90,70,60,0.9)');
      gl.addColorStop(1, 'rgba(40,24,20,0.95)');
      fillInk(c, gl, 1.8);
      glowAt(c, 0, 2, 9, 9, SOOT, 0.8, 'lighter');
      // Little flame.
      c.beginPath();
      c.moveTo(0, -6);
      c.quadraticCurveTo(5, 2, 0, 6);
      c.quadraticCurveTo(-5, 2, 0, -6);
      c.fillStyle = '#ffd27a';
      c.fill();
      // Cracks in the glass.
      c.strokeStyle = 'rgba(255,240,220,0.6)';
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(-8, -8);
      c.lineTo(-3, -2);
      c.lineTo(-6, 4);
      c.moveTo(6, -10);
      c.lineTo(3, -4);
      c.stroke();
      // Frame bars and base.
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-10, -12);
      c.lineTo(-10, 12);
      c.moveTo(10, -12);
      c.lineTo(10, 12);
      c.stroke();
      rrect(c, -13, 12, 26, 6, 2);
      fillInk(c, '#3a3036', 1.8);
      // Soot smudge.
      glowAt(c, 4, -14, 10, 6, 0x120810, 0.6);
    }, 3),
  );
}

/** Soft lantern smoke puff (violet-grey); tint and scale it. */
export function smokeTexture() {
  return cached('smoke', () =>
    paint(64, 64, (c) => {
      const r = seeded(5);
      for (let i = 0; i < 6; i++) {
        const x = 32 + (r() - 0.5) * 22;
        const y = 32 + (r() - 0.5) * 18;
        glowAt(c, x, y, 14 + r() * 10, 12 + r() * 8, 0xe8e0e8, 0.6);
      }
      glowAt(c, 30, 28, 10, 8, 0xffffff, 0.4);
    }, 2),
  );
}

/** Hanging lantern (pivot at the top of the chain). */
export function hangingLanternTexture() {
  return cached('hang', () =>
    paint(40, 80, (c) => {
      c.translate(20, 0);
      c.strokeStyle = '#2a2026';
      c.lineWidth = 2;
      for (let y = 2; y < 34; y += 6) {
        ellipse(c, 0, y, 2, 3);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(-12, 44);
      c.lineTo(0, 34);
      c.lineTo(12, 44);
      c.closePath();
      fillInk(c, gold(c, -12, 34, 12, 44), 1.8);
      rrect(c, -10, 44, 20, 24, 3);
      const gl = c.createLinearGradient(0, 44, 0, 68);
      gl.addColorStop(0, '#fff6d0');
      gl.addColorStop(1, '#ffb050');
      fillInk(c, gl, 1.8);
      c.strokeStyle = INK;
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(0, 44);
      c.lineTo(0, 68);
      c.stroke();
      rrect(c, -13, 68, 26, 6, 2);
      fillInk(c, gold(c, -13, 68, 13, 74), 1.6);
    }, 3),
  );
}

// ---- The cabinet in the casino ---------------------------------------------------------------

function station(): PaintedStation {
  const W = 76;
  const H = 64;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H, 140, 210, 70, 170, (x) => {
    shadow(x, 0, -4, 48, 14, 0.6);
    // Timber mine entrance: two posts and a lintel, rock face inside.
    rrect(x, -32, -138, 64, 112, 8);
    const rock = x.createLinearGradient(0, -138, 0, -26);
    rock.addColorStop(0, '#2c3246');
    rock.addColorStop(1, '#0c0e18');
    fillInk(x, rock, 2);
    // Grid of stones, a few opened with diamonds, one sooty lantern.
    const r = seeded(9);
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 5; j++) {
        const gx = -22 + i * 9.4;
        const gy = -122 + j * 9.4;
        rrect(x, gx - 3.8, gy - 3.8, 7.6, 7.6, 2);
        const open = r() < 0.32;
        x.fillStyle = open ? '#05070c' : '#626a7c';
        x.fill();
        if (open) {
          const trap = i === 3 && j === 1;
          ellipse(x, gx, gy, 2.2, 2.2);
          x.fillStyle = trap ? '#ffa04a' : '#bff2ff';
          x.fill();
          glowAt(x, gx, gy, 5, 5, trap ? 0xffa04a : 0x9fe8ff, 0.7, 'lighter');
        } else {
          x.fillStyle = 'rgba(255,240,230,0.18)';
          x.fillRect(gx - 3, gy - 3, 6, 1.5);
        }
      }
    // Posts and lintel.
    for (const px of [-38, 28]) {
      rrect(x, px, -142, 10, 118, 3);
      fillInk(x, vgrad(x, -142, -24, 0x7a4c2a, 0.25, 0.4), 1.8);
    }
    rrect(x, -42, -152, 84, 16, 4);
    fillInk(x, vgrad(x, -152, -136, 0x8a5a32, 0.3, 0.35), 1.8);
    rrect(x, -22, -150, 44, 12, 3);
    fillInk(x, gold(x, -22, -150, 22, -138), 1.4);
    for (const s of [-1, 1]) {
      ellipse(x, s * 6, -144, 3.2, 2.6);
      x.fillStyle = '#9fe8ff';
      x.fill();
    }
    // Lantern hanging from the lintel.
    x.strokeStyle = '#2a2026';
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(36, -136);
    x.lineTo(36, -124);
    x.stroke();
    rrect(x, 32, -124, 8, 10, 2);
    fillInk(x, '#ffd27a', 1.2);
    glowAt(x, 36, -119, 14, 14, 0xffb060, 0.7, 'lighter');
    // Rails along the front.
    for (const ry of [-8, -2]) {
      x.strokeStyle = '#5a5058';
      x.lineWidth = 2.4;
      x.beginPath();
      x.moveTo(-46, ry);
      x.lineTo(46, ry);
      x.stroke();
    }
    for (let k = -42; k <= 42; k += 12) {
      x.fillStyle = '#4a2e1a';
      x.fillRect(k - 2, -11, 4, 12);
    }
    // Mine cart full of gems.
    x.beginPath();
    x.moveTo(-30, -40);
    x.lineTo(30, -40);
    x.lineTo(24, -12);
    x.lineTo(-24, -12);
    x.closePath();
    fillInk(x, vgrad(x, -40, -12, 0x5a4c58, 0.3, 0.45), 2);
    x.fillStyle = 'rgba(255,240,230,0.25)';
    x.fillRect(-28, -39, 56, 2);
    for (const bx of [-22, -8, 8, 22]) {
      ellipse(x, bx, -26, 1.4, 1.4);
      x.fillStyle = '#c8b8c0';
      x.fill();
    }
    // Wheels.
    for (const wx of [-15, 15]) {
      ellipse(x, wx, -10, 5.5, 5.5);
      fillInk(x, '#2a2026', 1.6);
      ellipse(x, wx, -10, 2, 2);
      x.fillStyle = gold(x, wx - 2, -12, wx + 2, -8);
      x.fill();
    }
    // Gem heap.
    const gems: [number, number, string][] = [[-18, -42, '#9fe8ff'], [-8, -46, '#ffffff'], [2, -44, '#7fd8ff'], [12, -46, '#bff2ff'], [20, -42, '#9fe8ff'], [-2, -50, '#e0fbff'], [8, -40, '#ff8fc8']];
    for (const [gx, gy, col] of gems) {
      x.beginPath();
      x.moveTo(gx - 5, gy);
      x.lineTo(gx, gy - 5);
      x.lineTo(gx + 5, gy);
      x.lineTo(gx, gy + 4);
      x.closePath();
      fillInk(x, col, 1.1);
    }
    glowAt(x, 0, -46, 30, 12, 0x9fe8ff, 0.45, 'lighter');
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const glow = (gx: number, gy: number, w: number, h: number, tint: number, a: number) => {
    const s = new Sprite(glowTexture());
    s.anchor.set(0.5);
    s.position.set(gx, gy);
    s.width = w;
    s.height = h;
    s.tint = tint;
    s.alpha = a;
    s.blendMode = 'add';
    lamp.addChild(s);
  };
  glow(W / 2, H - 104, 100, 110, 0x9fe8ff, 0.32);
  glow(W / 2, H - 46, 80, 40, 0x9fe8ff, 0.45);
  glow(W / 2 + 36, H - 119, 40, 40, 0xffb060, 0.6);
  c.addChild(lamp);
  c.labelY = H - 162;
  return c;
}

registerPaintedStation('mines', station);


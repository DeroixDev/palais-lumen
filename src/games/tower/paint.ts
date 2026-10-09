// Painted parts of Drachenturm: the tower's stone floors, arched doors, the treasure and the
// sleepy moth-dragon behind them, and the tower-shaped cabinet in the casino.

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, paint, propSprite, rgb, rim, rrect, seeded, shadow, vgrad, type Ctx } from '../../world/painted/brush';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';
import { SCENE_H, SCENE_W } from '../ladderKit';

/** The window onto the tower, in scene pixels. */
export const VIEW = { x: 16, y: 104, w: SCENE_W - 32, h: SCENE_H - 116 };
export const FLOOR_H = 136;
export const DOOR_H = 84;
export const FIRE = 0xffa04a;
export const DRAGON = 0x6a5ac8;

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Door geometry for a floor with `n` doors: width and centre x of each. */
export function doorLayout(n: number) {
  const w = n === 4 ? 64 : 78;
  const gap = n === 4 ? 14 : 24;
  const total = n * w + (n - 1) * gap;
  const x0 = (VIEW.w - total) / 2 + w / 2;
  return { w, xs: Array.from({ length: n }, (_, i) => x0 + i * (w + gap)) };
}

function stones(c: Ctx, x: number, y: number, w: number, h: number, seed: number, base = 0x5a4e62) {
  const r = seeded(seed);
  const rowH = 20;
  for (let row = 0; row * rowH < h; row++) {
    const off = row % 2 ? -18 : 0;
    for (let bx = x + off; bx < x + w; bx += 36) {
      const bw = 34;
      const by = y + row * rowH;
      rrect(c, bx + 1, by + 1, bw, rowH - 2, 4);
      const col = r() < 0.5 ? light(base, r() * 0.12) : dark(base, r() * 0.25);
      c.fillStyle = vgrad(c, by, by + rowH, col, 0.18, 0.3);
      c.fill();
      c.strokeStyle = 'rgba(16,8,18,0.55)';
      c.lineWidth = 1.4;
      c.stroke();
      c.fillStyle = 'rgba(255,240,230,0.08)';
      c.fillRect(bx + 3, by + 2, bw - 6, 2);
    }
  }
}

/** Scene backdrop: night sky, brass frame round the tower window, title banner and status plate. */
export function sceneTexture() {
  return cached('scene', () =>
    paint(SCENE_W, SCENE_H, (c) => {
      rrect(c, 0, 0, SCENE_W, SCENE_H, 22);
      const sky = c.createLinearGradient(0, 0, 0, SCENE_H);
      sky.addColorStop(0, '#141a3e');
      sky.addColorStop(0.6, '#24163a');
      sky.addColorStop(1, '#2a1028');
      fillInk(c, sky, 3);
      c.save();
      rrect(c, 0, 0, SCENE_W, SCENE_H, 22);
      c.clip();
      const r = seeded(4);
      for (let i = 0; i < 60; i++) {
        ellipse(c, r() * SCENE_W, r() * SCENE_H, 0.7 + r() * 1.2, 0.7 + r() * 1.2);
        c.fillStyle = `rgba(255,246,230,${0.25 + r() * 0.5})`;
        c.fill();
      }
      glowAt(c, SCENE_W - 40, 40, 70, 70, 0xfff1c4, 0.25, 'lighter');
      c.restore();
      // Brass frame round the window.
      rrect(c, VIEW.x - 8, VIEW.y - 8, VIEW.w + 16, VIEW.h + 16, 16);
      fillInk(c, gold(c, VIEW.x, VIEW.y, VIEW.x + VIEW.w, VIEW.y + VIEW.h), 2.6);
      rim(c, 0.6, 1.6);
      rrect(c, VIEW.x - 1, VIEW.y - 1, VIEW.w + 2, VIEW.h + 2, 11);
      c.fillStyle = '#0c0812';
      c.fill();
      // Title banner: a pennant ribbon with the name plate.
      c.beginPath();
      c.moveTo(70, 8);
      c.lineTo(SCENE_W - 70, 8);
      c.lineTo(SCENE_W - 52, 26);
      c.lineTo(SCENE_W - 70, 44);
      c.lineTo(70, 44);
      c.lineTo(52, 26);
      c.closePath();
      fillInk(c, vgrad(c, 8, 44, 0x7a1d34, 0.25, 0.4), 2.2);
      rrect(c, 96, 12, SCENE_W - 192, 28, 7);
      fillInk(c, gold(c, 96, 12, SCENE_W - 96, 40), 2);
      rim(c, 0.7, 1.4);
      // Status plate.
      rrect(c, 70, 50, SCENE_W - 140, 46, 12);
      fillInk(c, gold(c, 70, 50, SCENE_W - 70, 96), 2.2);
      rrect(c, 75, 54, SCENE_W - 150, 38, 9);
      c.fillStyle = vgrad(c, 54, 92, 0x1e1440, 0.1, 0.4);
      c.fill();
    }),
  );
}

/** One floor of the tower: stone band with a cornice, `n` arched doorways (dark inside). */
export function floorTexture(n: number, seed: number) {
  return cached(`floor-${n}-${seed % 3}`, () =>
    paint(VIEW.w, FLOOR_H, (c) => {
      stones(c, 0, 0, VIEW.w, FLOOR_H, 20 + (seed % 3));
      // Side shading: the tower is round.
      const sg = c.createLinearGradient(0, 0, VIEW.w, 0);
      sg.addColorStop(0, 'rgba(10,4,16,0.55)');
      sg.addColorStop(0.18, 'rgba(10,4,16,0)');
      sg.addColorStop(0.75, 'rgba(10,4,16,0)');
      sg.addColorStop(1, 'rgba(10,4,16,0.6)');
      c.fillStyle = sg;
      c.fillRect(0, 0, VIEW.w, FLOOR_H);
      // Cornice at the bottom.
      rrect(c, -4, FLOOR_H - 12, VIEW.w + 8, 12, 3);
      fillInk(c, vgrad(c, FLOOR_H - 12, FLOOR_H, 0x8a7a8a, 0.3, 0.45), 1.8);
      // Doorways.
      const { w, xs } = doorLayout(n);
      for (const x of xs) archway(c, x, FLOOR_H - 12, w);
      // Little wall sconces between the doors.
      for (let i = 0; i < xs.length - 1; i++) {
        const sx = (xs[i] + xs[i + 1]) / 2;
        glowAt(c, sx, 44, 16, 22, 0xffb060, 0.5, 'lighter');
        rrect(c, sx - 3, 40, 6, 10, 2);
        fillInk(c, '#ffd27a', 1);
      }
    }),
  );
}

/** Arched opening in the wall, standing on (x, floorY). */
function archway(c: Ctx, x: number, floorY: number, w: number) {
  const top = floorY - DOOR_H;
  const path = (pad: number) => {
    c.beginPath();
    c.moveTo(x - w / 2 - pad, floorY);
    c.lineTo(x - w / 2 - pad, top + w / 2);
    c.arc(x, top + w / 2, w / 2 + pad, Math.PI, 0);
    c.lineTo(x + w / 2 + pad, floorY);
    c.closePath();
  };
  path(6);
  fillInk(c, vgrad(c, top - 6, floorY, 0x9a8a96, 0.3, 0.4), 1.8);
  path(0);
  const g = c.createLinearGradient(0, top, 0, floorY);
  g.addColorStop(0, '#0a0610');
  g.addColorStop(1, '#2a1626');
  fillInk(c, g, 1.6);
}

/** The door leaf (hinge on the left). */
export function doorTexture(w: number) {
  return cached(`door-${w}`, () =>
    paint(w + 4, DOOR_H + 4, (c) => {
      c.translate(2, 2);
      c.beginPath();
      c.moveTo(0, DOOR_H);
      c.lineTo(0, w / 2);
      c.arc(w / 2, w / 2, w / 2, Math.PI, 0);
      c.lineTo(w, DOOR_H);
      c.closePath();
      const g = c.createLinearGradient(0, 0, w, DOOR_H);
      g.addColorStop(0, '#9a6236');
      g.addColorStop(0.5, '#7a4a26');
      g.addColorStop(1, '#4a2a16');
      fillInk(c, g, 2);
      c.save();
      c.clip();
      // Planks.
      const planks = Math.round(w / 16);
      for (let i = 1; i < planks; i++) {
        const px = (i * w) / planks;
        c.strokeStyle = 'rgba(30,14,6,0.55)';
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(px, 0);
        c.lineTo(px, DOOR_H);
        c.stroke();
        c.strokeStyle = 'rgba(255,220,170,0.12)';
        c.beginPath();
        c.moveTo(px + 1.5, 0);
        c.lineTo(px + 1.5, DOOR_H);
        c.stroke();
      }
      // Iron bands with studs.
      for (const by of [w / 2 + 6, DOOR_H - 20]) {
        c.fillStyle = '#2e2630';
        c.fillRect(0, by, w, 6);
        for (let sx = 5; sx < w; sx += 10) {
          ellipse(c, sx, by + 3, 1.6, 1.6);
          c.fillStyle = '#c8b8a8';
          c.fill();
        }
      }
      c.restore();
      c.beginPath();
      c.moveTo(0, DOOR_H);
      c.lineTo(0, w / 2);
      c.arc(w / 2, w / 2, w / 2, Math.PI, 0);
      c.lineTo(w, DOOR_H);
      c.closePath();
      rim(c, 0.4, 1.4);
      // Brass ring handle on the right.
      c.strokeStyle = gold(c, w - 16, DOOR_H / 2, w - 6, DOOR_H / 2 + 12);
      c.lineWidth = 2.4;
      c.beginPath();
      c.arc(w - 11, DOOR_H * 0.58, 4.5, 0, Math.PI * 2);
      c.stroke();
      ellipse(c, w - 11, DOOR_H * 0.58 - 5, 2.2, 2.2);
      fillInk(c, gold(c, w - 13, 40, w - 9, 46), 1);
    }),
  );
}

/** Behind a quiet door: a little moon lantern on a heap of coins. */
export function treasureTexture() {
  return cached('treasure', () =>
    paint(64, 64, (c) => {
      c.translate(32, 40);
      glowAt(c, 0, -6, 30, 26, 0xffcf7a, 0.5, 'lighter');
      for (const [x, y] of [[-14, 14], [-4, 16], [8, 14], [16, 15], [-9, 9], [4, 9], [11, 8], [-2, 3]]) {
        ellipse(c, x, y, 8, 3.6);
        fillInk(c, gold(c, x - 8, y - 4, x + 8, y + 4), 1.3);
      }
      // Moonstone.
      ellipse(c, 0, -10, 9, 10);
      const g = c.createRadialGradient(-3, -14, 1, 0, -10, 11);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.6, '#cfe8ff');
      g.addColorStop(1, '#7a9ad8');
      fillInk(c, g, 1.6);
      ellipse(c, -3, -14, 2.5, 2);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fill();
    }, 3),
  );
}

/** The moth-dragon: round, sleepy, fuzzy moth wings. `awake` opens its eyes and mouth. */
export function dragonTexture(awake: boolean) {
  return cached(`dragon-${awake}`, () =>
    paint(80, 76, (c) => {
      c.translate(40, 48);
      shadow(c, 0, 20, 30, 7, 0.5);
      // Wings (moth-like, with eye spots).
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(s * 6, -10);
        c.bezierCurveTo(s * 20, awake ? -44 : -30, s * 40, awake ? -40 : -26, s * 36, -8);
        c.bezierCurveTo(s * 34, 4, s * 18, 6, s * 6, 2);
        c.closePath();
        const wg = c.createLinearGradient(0, -36, s * 36, 4);
        wg.addColorStop(0, '#e8d8ff');
        wg.addColorStop(1, '#8a6ac8');
        fillInk(c, wg, 1.8);
        ellipse(c, s * 24, -18, 5, 4);
        c.fillStyle = '#4a3a8a';
        c.fill();
        ellipse(c, s * 24, -18, 2, 1.6);
        c.fillStyle = '#ffcf7a';
        c.fill();
      }
      // Tail curled round.
      c.beginPath();
      c.moveTo(14, 14);
      c.quadraticCurveTo(34, 18, 30, 4);
      c.quadraticCurveTo(28, -2, 24, 2);
      c.strokeStyle = INK;
      c.lineWidth = 7;
      c.stroke();
      c.strokeStyle = rgb(DRAGON);
      c.lineWidth = 4.5;
      c.stroke();
      // Body.
      ellipse(c, 0, 8, 22, 15);
      fillInk(c, vgrad(c, -7, 23, DRAGON, 0.3, 0.4), 2);
      ellipse(c, 0, 12, 12, 8);
      c.fillStyle = 'rgba(255,230,200,0.45)';
      c.fill();
      // Head.
      ellipse(c, -6, -6, 15, 13);
      fillInk(c, vgrad(c, -19, 7, light(DRAGON, 0.1), 0.35, 0.3), 2);
      // Horns and feathery antennae.
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(-6 + s * 6, -17);
        c.quadraticCurveTo(-6 + s * 12, -30, -6 + s * 16, -28);
        c.strokeStyle = INK;
        c.lineWidth = 2;
        c.stroke();
        ellipse(c, -6 + s * 16, -28, 2.6, 2.6);
        c.fillStyle = '#ffcf7a';
        c.fill();
      }
      // Snout.
      ellipse(c, -16, -1, 7, 5.5);
      fillInk(c, rgb(light(DRAGON, 0.25)), 1.6);
      ellipse(c, -19, -2, 1, 1);
      c.fillStyle = INK;
      c.fill();
      // Cheek blush.
      ellipse(c, -2, 1, 3.5, 2);
      c.fillStyle = 'rgba(255,130,170,0.6)';
      c.fill();
      if (awake) {
        for (const ex of [-11, 0]) {
          ellipse(c, ex, -9, 4.4, 5);
          fillInk(c, '#ffffff', 1.4);
          ellipse(c, ex - 0.6, -8.5, 2.4, 3.2);
          c.fillStyle = '#1a0c20';
          c.fill();
          ellipse(c, ex - 1.4, -10, 1, 1);
          c.fillStyle = '#ffffff';
          c.fill();
        }
        // Open mouth with a tiny flame.
        ellipse(c, -20, 3, 3.5, 2.6);
        fillInk(c, '#5a1020', 1.2);
        glowAt(c, -28, 2, 10, 7, FIRE, 0.9, 'lighter');
        c.beginPath();
        c.moveTo(-23, 3);
        c.quadraticCurveTo(-30, -4, -36, 1);
        c.quadraticCurveTo(-30, 8, -23, 3);
        c.fillStyle = '#ffd27a';
        c.fill();
      } else {
        // Sleepy eyes.
        c.strokeStyle = INK;
        c.lineWidth = 1.8;
        for (const ex of [-11, 0]) {
          c.beginPath();
          c.arc(ex, -9, 3.4, 0.15 * Math.PI, 0.85 * Math.PI);
          c.stroke();
        }
        // Z z
        c.fillStyle = 'rgba(232,216,255,0.9)';
        c.font = 'bold 11px sans-serif';
        c.fillText('z', 8, -22);
        c.font = 'bold 8px sans-serif';
        c.fillText('z', 15, -30);
      }
    }, 3),
  );
}

/** Soft smoke puff; tint and scale it. */
export function smokeTexture() {
  return cached('smoke', () =>
    paint(64, 64, (c) => {
      const r = seeded(8);
      for (let i = 0; i < 6; i++) glowAt(c, 32 + (r() - 0.5) * 22, 32 + (r() - 0.5) * 18, 14 + r() * 10, 12 + r() * 8, 0xece4ec, 0.6);
    }, 2),
  );
}

/** Crenellated top of the tower with the moon above the battlements. */
export function topTexture() {
  return cached('top', () =>
    paint(VIEW.w, 150, (c) => {
      glowAt(c, VIEW.w / 2, 50, 70, 60, 0xfff1c4, 0.35, 'lighter');
      ellipse(c, VIEW.w / 2, 50, 26, 26);
      const mg = c.createRadialGradient(VIEW.w / 2 - 8, 42, 3, VIEW.w / 2, 50, 26);
      mg.addColorStop(0, '#fffbe8');
      mg.addColorStop(1, '#d8b86a');
      fillInk(c, mg, 2);
      // Battlements.
      const y = 100;
      stones(c, 0, y, VIEW.w, 50, 33);
      for (let x = 4; x < VIEW.w; x += 44) {
        rrect(c, x, y - 22, 28, 26, 3);
        fillInk(c, vgrad(c, y - 22, y + 4, 0x6a5e72, 0.3, 0.3), 1.6);
      }
      rrect(c, -4, y - 2, VIEW.w + 8, 8, 2);
      fillInk(c, '#7a6a7a', 1.4);
      // Pennant.
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(VIEW.w - 60, y - 22);
      c.lineTo(VIEW.w - 60, y - 70);
      c.stroke();
      c.beginPath();
      c.moveTo(VIEW.w - 60, y - 70);
      c.lineTo(VIEW.w - 30, y - 62);
      c.lineTo(VIEW.w - 60, y - 54);
      c.closePath();
      fillInk(c, '#d8243a', 1.4);
    }),
  );
}

/** The foot of the tower: steps and moss. */
export function baseTexture() {
  return cached('base', () =>
    paint(VIEW.w, 120, (c) => {
      stones(c, 0, 0, VIEW.w, 70, 41, 0x4a4252);
      for (let i = 0; i < 3; i++) {
        rrect(c, 40 - i * 14, 70 + i * 14, VIEW.w - 80 + i * 28, 14, 3);
        fillInk(c, vgrad(c, 70 + i * 14, 84 + i * 14, 0x7a6a7a, 0.3, 0.4), 1.6);
      }
      const r = seeded(3);
      for (let i = 0; i < 20; i++) {
        ellipse(c, r() * VIEW.w, 64 + r() * 8, 4 + r() * 6, 2 + r() * 2);
        c.fillStyle = 'rgba(80,140,70,0.55)';
        c.fill();
      }
    }),
  );
}

// ---- The cabinet in the casino ---------------------------------------------------------------

function station(): PaintedStation {
  const W = 76;
  const H = 64;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H, 140, 210, 70, 196, (x) => {
    shadow(x, 0, -4, 44, 14, 0.6);
    // Console deck in front.
    rrect(x, -34, -34, 68, 24, 6);
    fillInk(x, vgrad(x, -34, -10, 0x4a2a3a, 0.3, 0.4), 2);
    rrect(x, -34, -38, 68, 8, 3);
    fillInk(x, gold(x, -34, -38, 34, -30), 1.6);
    for (const [bx, col] of [[-16, '#7fd88a'], [0, '#ffcf7a'], [16, '#ff8a6a']] as const) {
      ellipse(x, bx, -22, 5, 3);
      fillInk(x, col, 1.2);
    }
    // Round stone tower body.
    const tw = 50;
    rrect(x, -tw / 2, -140, tw, 106, 6);
    x.save();
    x.clip();
    for (let row = 0; row < 11; row++) {
      for (let k = -1; k < 4; k++) {
        const bx = -tw / 2 + k * 16 + (row % 2 ? 8 : 0);
        const by = -140 + row * 10;
        rrect(x, bx, by, 15, 9, 2);
        x.fillStyle = row % 3 === k % 3 ? '#6e6278' : '#5e5468';
        x.fill();
      }
    }
    const sg = x.createLinearGradient(-tw / 2, 0, tw / 2, 0);
    sg.addColorStop(0, 'rgba(255,240,230,0.18)');
    sg.addColorStop(0.35, 'rgba(255,240,230,0)');
    sg.addColorStop(0.7, 'rgba(10,4,16,0.1)');
    sg.addColorStop(1, 'rgba(10,4,16,0.55)');
    x.fillStyle = sg;
    x.fillRect(-tw / 2, -140, tw, 106);
    x.restore();
    rrect(x, -tw / 2, -140, tw, 106, 6);
    x.strokeStyle = INK;
    x.lineWidth = 2;
    x.stroke();
    // Rows of little doors, a few glowing open.
    const lit = [[0, 1], [1, 0], [2, 2]];
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 3; k++) {
        const dx = -14 + k * 14;
        const dy = -56 - row * 27;
        x.beginPath();
        x.moveTo(dx - 4.5, dy);
        x.lineTo(dx - 4.5, dy - 9);
        x.arc(dx, dy - 9, 4.5, Math.PI, 0);
        x.lineTo(dx + 4.5, dy);
        x.closePath();
        const on = lit.some(([r, kk]) => r === row && kk === k);
        fillInk(x, on ? '#ffd27a' : '#7a4a26', 1.2);
        if (on) glowAt(x, dx, dy - 7, 9, 9, 0xffcf7a, 0.7, 'lighter');
      }
      x.fillStyle = 'rgba(140,128,150,0.9)';
      x.fillRect(-tw / 2, -51 - row * 27, tw, 3);
    }
    // Battlements and cone roof.
    for (let k = 0; k < 4; k++) {
      rrect(x, -tw / 2 - 2 + k * 14, -150, 10, 12, 2);
      fillInk(x, '#6e6278', 1.4);
    }
    x.beginPath();
    x.moveTo(-tw / 2 - 4, -148);
    x.lineTo(0, -182);
    x.lineTo(tw / 2 + 4, -148);
    x.closePath();
    fillInk(x, vgrad(x, -182, -148, 0x3a3a6a, 0.3, 0.4), 2);
    // A tiny moth-dragon curled on the roof, breathing a warm glow.
    ellipse(x, 6, -173, 8, 5);
    fillInk(x, '#6a5ac8', 1.4);
    ellipse(x, 0, -176, 5, 4.5);
    fillInk(x, '#7a6ad8', 1.2);
    for (const s of [-1, 1]) {
      ellipse(x, 8 + s * 7, -180, 6, 3.5);
      fillInk(x, '#d8c8ff', 1);
    }
    glowAt(x, -8, -175, 9, 7, FIRE, 0.9, 'lighter');
    // Brass name band.
    rrect(x, -tw / 2 - 3, -46, tw + 6, 9, 3);
    fillInk(x, gold(x, -tw / 2, -46, tw / 2, -37), 1.4);
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
  glow(W / 2, H - 92, 90, 120, 0xffcf7a, 0.28);
  glow(W / 2 - 8, H - 175, 40, 34, FIRE, 0.7);
  c.addChild(lamp);
  c.labelY = H - 196;
  return c;
}

registerPaintedStation('tower', station);

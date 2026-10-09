// Painted pieces of the Teich-Derby: the six racing ducks (side view), the pond tiles that
// scroll with the camera, start and finish, the podium and the pond table in the room.
// All painted once with Canvas 2D and cached (no filters).

import { Container, Sprite, type Texture } from 'pixi.js';
import { FONT_BODY, FONT_DISPLAY, glowTexture } from '../../core/fx';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, paint, propSprite, rgb, rrect, seeded, shadow, vgrad, type Ctx } from '../../world/painted/brush';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';

export interface Duck {
  name: string;
  body: number;
  head: number;
  beak: number;
  /** Colour of the number bib, lane chip and button. */
  team: number;
  look: 'bow' | 'mallard' | 'crown' | 'cap' | 'flower' | 'scarf';
}

export const DUCKS: Duck[] = [
  { name: 'Erna', body: 0xf6eedc, head: 0xf6eedc, beak: 0xffa53a, team: 0xd8467a, look: 'bow' },
  { name: 'Kuno', body: 0x9a7a58, head: 0x1f8a52, beak: 0xe8c23a, team: 0x2f8a5a, look: 'mallard' },
  { name: 'Lotte', body: 0xffd33a, head: 0xffd33a, beak: 0xff7a2a, team: 0xd89a1a, look: 'crown' },
  { name: 'Bruno', body: 0x7a5440, head: 0x7a5440, beak: 0xf0a040, team: 0x8a4a2a, look: 'cap' },
  { name: 'Mira', body: 0xe6a6d2, head: 0xe6a6d2, beak: 0xffa060, team: 0xa04a9a, look: 'flower' },
  { name: 'Fritz', body: 0x6a8ad0, head: 0x6a8ad0, beak: 0xffb040, team: 0x2f5ab0, look: 'scarf' },
];

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

// ---- Duck ------------------------------------------------------------------------------------------

/** Duck size in design pixels; the texture's anchor is the beak tip at the waterline. */
export const DUCK = { w: 96, h: 80, ax: 84, ay: 62 };

/** Paints a duck facing right; (0, 0) is the waterline below its chest. */
function paintDuck(c: Ctx, d: Duck, num: number) {
  // Body with an upturned tail.
  c.beginPath();
  c.moveTo(-30, -10);
  c.quadraticCurveTo(-40, -30, -30, -30);
  c.quadraticCurveTo(-10, -30, 8, -24);
  c.quadraticCurveTo(28, -22, 28, -9);
  c.quadraticCurveTo(24, 2, 2, 2);
  c.quadraticCurveTo(-24, 2, -30, -10);
  c.closePath();
  fillInk(c, vgrad(c, -32, 2, d.body, 0.3, 0.35), 2.4);
  // Belly shade and water line.
  c.save();
  c.clip();
  glowAt(c, -4, 4, 40, 10, dark(d.body, 0.6), 0.5);
  glowAt(c, -8, -26, 30, 10, 0xffffff, 0.25);
  c.restore();
  // Wing.
  c.save();
  c.translate(-6, -15);
  c.rotate(-0.12);
  c.beginPath();
  c.moveTo(-16, -2);
  c.quadraticCurveTo(-2, -12, 14, -4);
  c.quadraticCurveTo(4, 8, -16, 4);
  c.closePath();
  fillInk(c, vgrad(c, -10, 8, dark(d.body, 0.18), 0.15, 0.3), 1.6);
  c.strokeStyle = rgb(dark(d.body, 0.4), 0.7);
  c.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.moveTo(-12 + i * 6, 2);
    c.quadraticCurveTo(-6 + i * 6, -2, 0 + i * 6, 3);
    c.stroke();
  }
  c.restore();
  // Number bib on the side.
  ellipse(c, -18, -12, 7.5, 7.5);
  fillInk(c, rgb(d.team), 1.4);
  c.fillStyle = '#fff6e6';
  c.font = `700 11px ${FONT_BODY}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(num), -18, -11.5);
  // Neck and head.
  c.beginPath();
  c.moveTo(6, -22);
  c.quadraticCurveTo(10, -34, 14, -38);
  c.lineTo(24, -32);
  c.quadraticCurveTo(22, -24, 22, -18);
  c.closePath();
  c.fillStyle = rgb(d.body);
  c.fill();
  if (d.look === 'mallard') {
    // White collar ring.
    c.beginPath();
    c.moveTo(10, -31);
    c.quadraticCurveTo(17, -27, 23, -30);
    c.strokeStyle = '#f6f0e0';
    c.lineWidth = 3;
    c.stroke();
  }
  ellipse(c, 18, -42, 12, 11);
  fillInk(c, vgrad(c, -53, -31, d.head, 0.35, 0.3), 2.2);
  // Beak.
  c.beginPath();
  c.moveTo(27, -45);
  c.quadraticCurveTo(38, -46, 40, -41);
  c.quadraticCurveTo(38, -37, 27, -38);
  c.closePath();
  fillInk(c, vgrad(c, -46, -37, d.beak, 0.35, 0.25), 1.6);
  c.beginPath();
  c.moveTo(29, -41.3);
  c.lineTo(38, -41.3);
  c.strokeStyle = rgb(dark(d.beak, 0.45), 0.8);
  c.lineWidth = 0.9;
  c.stroke();
  // Eye with a shine, rosy cheek.
  ellipse(c, 21, -45, 3.2, 3.6);
  c.fillStyle = '#1a0c10';
  c.fill();
  ellipse(c, 22, -46.2, 1.2, 1.2);
  c.fillStyle = '#ffffff';
  c.fill();
  glowAt(c, 20, -38, 5, 3, 0xff7a9a, 0.45);
  // Accessories.
  switch (d.look) {
    case 'bow': {
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(12, -52);
        c.quadraticCurveTo(12 + s * 9, -60, 12 + s * 8, -48);
        c.closePath();
        fillInk(c, '#ff6aa0', 1.4);
      }
      ellipse(c, 12, -52, 2.6, 2.6);
      fillInk(c, '#ff8ab6', 1.2);
      break;
    }
    case 'crown': {
      c.beginPath();
      c.moveTo(9, -51);
      c.lineTo(10, -60);
      c.lineTo(14, -55);
      c.lineTo(18, -62);
      c.lineTo(22, -55);
      c.lineTo(26, -60);
      c.lineTo(26, -51);
      c.closePath();
      fillInk(c, gold(c, 9, -62, 26, -51), 1.4);
      ellipse(c, 18, -55, 1.6, 1.6);
      c.fillStyle = '#ff4a6a';
      c.fill();
      break;
    }
    case 'cap': {
      c.beginPath();
      c.moveTo(6, -48);
      c.quadraticCurveTo(18, -62, 30, -48);
      c.closePath();
      fillInk(c, vgrad(c, -60, -48, 0x26305a, 0.3, 0.3), 1.6);
      rrect(c, 20, -50, 16, 4, 2);
      fillInk(c, '#1a2040', 1.2);
      ellipse(c, 18, -54, 2.4, 2);
      c.fillStyle = gold(c, 16, -56, 20, -52);
      c.fill();
      break;
    }
    case 'flower': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ellipse(c, 10 + Math.cos(a) * 3.6, -53 + Math.sin(a) * 3.6, 2.8, 2.8);
        fillInk(c, '#fff0f6', 0.8);
      }
      ellipse(c, 10, -53, 2.2, 2.2);
      c.fillStyle = '#ffcf3a';
      c.fill();
      break;
    }
    case 'scarf': {
      c.beginPath();
      c.moveTo(8, -31);
      c.quadraticCurveTo(16, -26, 24, -30);
      c.lineTo(24, -26);
      c.quadraticCurveTo(16, -22, 8, -27);
      c.closePath();
      fillInk(c, '#e8433a', 1.3);
      c.beginPath();
      c.moveTo(9, -29);
      c.lineTo(-2, -24);
      c.lineTo(0, -20);
      c.lineTo(10, -26);
      c.closePath();
      fillInk(c, '#c8302a', 1.2);
      break;
    }
    case 'mallard':
      break;
  }
}

export function duckTexture(i: number) {
  return cached(`duck-${i}`, () =>
    paint(DUCK.w, DUCK.h, (c) => {
      c.translate(DUCK.ax - 40, DUCK.ay);
      paintDuck(c, DUCKS[i], i + 1);
    }, 2.5),
  );
}

/** Foam wake behind a swimming duck, anchored at its right edge. */
export function wakeTexture() {
  return cached('wake', () =>
    paint(90, 24, (c) => {
      c.strokeStyle = 'rgba(230,246,255,0.75)';
      c.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(88 - i * 20, 12);
        c.quadraticCurveTo(80 - i * 20, 4 - i, 70 - i * 21, 6 - i);
        c.moveTo(88 - i * 20, 12);
        c.quadraticCurveTo(80 - i * 20, 20 + i, 70 - i * 21, 18 + i);
        c.globalAlpha = 1 - i * 0.22;
        c.stroke();
      }
      c.globalAlpha = 1;
      glowAt(c, 80, 12, 14, 6, 0xffffff, 0.5);
    }, 2),
  );
}

// ---- Pond ------------------------------------------------------------------------------------------

/** Night sky over the far bank, with the moon. Size-dependent. */
export function skyTexture(w: number, h: number) {
  return paint(w, h, (c) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a0c2a');
    g.addColorStop(0.7, '#1e1a4a');
    g.addColorStop(1, '#3a2050');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const r = seeded(31);
    for (let i = 0; i < (w * h) / 900; i++) {
      c.fillStyle = `rgba(255,246,230,${0.25 + r() * 0.5})`;
      c.beginPath();
      c.arc(r() * w, r() * h * 0.7, 0.5 + r() * 0.8, 0, Math.PI * 2);
      c.fill();
    }
    const mx = w * 0.82;
    const my = h * 0.34;
    const mr = Math.min(26, h * 0.26);
    glowAt(c, mx, my, mr * 5, mr * 3, 0xfff1c4, 0.22);
    ellipse(c, mx, my, mr, mr);
    const mg = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 2, mx, my, mr);
    mg.addColorStop(0, '#fffbe8');
    mg.addColorStop(1, '#d8b870');
    fillInk(c, mg, 2);
    for (const [dx, dy, rr] of [[-0.3, 0.1, 0.18], [0.25, -0.2, 0.12], [0.1, 0.35, 0.1]]) {
      ellipse(c, mx + dx * mr, my + dy * mr, rr * mr, rr * mr);
      c.fillStyle = 'rgba(160,120,60,0.35)';
      c.fill();
    }
  }, 1.5);
}

export const BANK_TILE = 640;

/** The far bank as a seamless strip: reeds, willows, lantern posts with a garland, little moth fans. */
export function bankTexture(h: number) {
  const w = BANK_TILE;
  return paint(w, h, (c) => {
    const r = seeded(9);
    const base = h - 2;
    // Willow silhouettes (drawn again shifted by w so the strip wraps).
    for (const off of [-w, 0, w]) {
      for (const x of [90, 330, 540]) {
        const tx = x + off;
        c.beginPath();
        c.moveTo(tx - 8, base);
        c.lineTo(tx - 4, base - h * 0.55);
        c.lineTo(tx + 4, base - h * 0.55);
        c.lineTo(tx + 8, base);
        c.fillStyle = '#140c22';
        c.fill();
        ellipse(c, tx, base - h * 0.62, 60, h * 0.32);
        c.fillStyle = '#1a1430';
        c.fill();
        c.strokeStyle = 'rgba(80,110,90,0.35)';
        c.lineWidth = 1.2;
        for (let k = 0; k < 12; k++) {
          const sx = tx - 52 + k * 9.5;
          c.beginPath();
          c.moveTo(sx, base - h * 0.75);
          c.quadraticCurveTo(sx + 3, base - h * 0.4, sx - 2, base - h * 0.12);
          c.stroke();
        }
      }
    }
    // Grass bank.
    c.beginPath();
    c.moveTo(0, base);
    for (let x = 0; x <= w; x += 16) c.lineTo(x, base - h * 0.16 - Math.sin((x / w) * Math.PI * 4) * 3);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.closePath();
    c.fillStyle = '#1c2a24';
    c.fill();
    // Lantern posts every 160 px with a garland between them.
    const posts = [40, 200, 360, 520];
    c.strokeStyle = 'rgba(255,220,160,0.5)';
    c.lineWidth = 1.2;
    for (let i = 0; i < posts.length; i++) {
      const a = posts[i];
      const b = i + 1 < posts.length ? posts[i + 1] : posts[0] + w;
      c.beginPath();
      c.moveTo(a, base - h * 0.62);
      c.quadraticCurveTo((a + b) / 2, base - h * 0.4, b, base - h * 0.62);
      c.stroke();
      for (let k = 1; k < 6; k++) {
        const t = k / 6;
        const x = a + (b - a) * t;
        const y = base - h * 0.62 + 4 * t * (1 - t) * h * 0.22 * 0.9;
        const cols = [0xffcf7a, 0xff5fa2, 0x9fe8ff];
        const col = cols[(i + k) % 3];
        glowAt(c, x % w, y, 7, 7, col, 0.6, 'lighter');
        ellipse(c, x % w, y, 1.8, 2.2);
        c.fillStyle = rgb(light(col, 0.4));
        c.fill();
      }
    }
    for (const x of posts) {
      c.fillStyle = gold(c, x - 2, base - h * 0.66, x + 2, base);
      c.fillRect(x - 1.8, base - h * 0.64, 3.6, h * 0.5);
      rrect(c, x - 5, base - h * 0.74, 10, 12, 3);
      fillInk(c, '#ffe7a8', 1.2);
      glowAt(c, x, base - h * 0.68, 26, 22, 0xffcf7a, 0.5, 'lighter');
    }
    // Moth spectators on the grass, waving wings.
    for (let i = 0; i < 9; i++) {
      const x = 20 + r() * (w - 40);
      const y = base - h * 0.08 - r() * 4;
      const col = ['#e8c87a', '#c8a0e8', '#f0e0c0', '#ffb07a'][i % 4];
      for (const s of [-1, 1]) {
        ellipse(c, x + s * 4, y - 6, 4, 5);
        c.fillStyle = col;
        c.fill();
      }
      ellipse(c, x, y - 5, 1.6, 4);
      c.fillStyle = '#2a1a10';
      c.fill();
    }
    // Reeds and cattails in front.
    for (let i = 0; i < 46; i++) {
      const x = r() * w;
      const hh = h * (0.12 + r() * 0.22);
      c.strokeStyle = r() < 0.5 ? '#2a4a34' : '#36583c';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(x, h);
      c.quadraticCurveTo(x + 3, h - hh * 0.6, x + (r() - 0.5) * 8, h - hh);
      c.stroke();
      if (r() < 0.3) {
        rrect(c, x - 2, h - hh - 2, 4, 9, 2);
        c.fillStyle = '#5a3a20';
        c.fill();
      }
    }
  }, 2);
}

export const WATER_TILE = 256;

/** One lane of water: dark teal with painted ripples and moon sparkles; tiles seamlessly. */
export function waterTexture(h: number, k: number) {
  const w = WATER_TILE;
  return paint(w, h, (c) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, k ? '#163a52' : '#123248');
    g.addColorStop(1, k ? '#0e2638' : '#0c2234');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const r = seeded(40 + k);
    for (let i = 0; i < 18; i++) {
      const x = r() * w;
      const y = 4 + r() * (h - 8);
      const len = 14 + r() * 26;
      for (const off of [-w, 0, w]) {
        c.beginPath();
        c.moveTo(x + off, y);
        c.quadraticCurveTo(x + off + len / 2, y - 3, x + off + len, y);
        c.strokeStyle = `rgba(150,210,235,${0.12 + r() * 0.16})`;
        c.lineWidth = 1.4;
        c.stroke();
      }
    }
    for (let i = 0; i < 6; i++) {
      const x = r() * w;
      const y = 4 + r() * (h - 8);
      glowAt(c, x, y, 6, 2, 0xfff1c4, 0.35, 'lighter');
    }
  }, 1.5);
}

/** Lane rope: a chain of red and cream floats. Tiles every 32 px. */
export function ropeTexture() {
  return cached('rope', () =>
    paint(32, 14, (c) => {
      c.strokeStyle = 'rgba(30,20,20,0.8)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(0, 7);
      c.lineTo(32, 7);
      c.stroke();
      for (const [x, col] of [[8, 0xd8364a], [24, 0xf2e6c9]] as const) {
        ellipse(c, x, 7, 6, 4.5);
        fillInk(c, vgrad(c, 2, 12, col, 0.35, 0.3), 1);
      }
    }, 2),
  );
}

/** Reeds and lily pads along the near bank (foreground strip, tiles). */
export function nearTexture(h: number) {
  const w = 512;
  return paint(w, h, (c) => {
    const r = seeded(77);
    c.fillStyle = '#0c1a14';
    c.fillRect(0, h * 0.55, w, h);
    for (let i = 0; i < 40; i++) {
      const x = r() * w;
      const hh = h * (0.5 + r() * 0.6);
      c.strokeStyle = r() < 0.5 ? '#1e3a28' : '#2a4a30';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, h);
      c.quadraticCurveTo(x - 4, h - hh * 0.5, x + (r() - 0.5) * 10, h - hh);
      c.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const x = r() * w;
      ellipse(c, x, h * 0.4, 12, 4);
      fillInk(c, '#2a5a34', 1);
    }
  }, 1.5);
}

/** The finish: a checkered pole with a "ZIEL" banner and a little photo camera, `h` tall. */
export function finishTexture(h: number, bank: number) {
  return paint(120, h, (c) => {
    // Pole on the far bank.
    c.fillStyle = gold(c, 56, 0, 64, h);
    c.fillRect(57, bank * 0.08, 6, bank * 0.95);
    // Banner.
    rrect(c, 8, bank * 0.08, 104, Math.min(34, bank * 0.4), 6);
    fillInk(c, vgrad(c, 0, bank * 0.5, 0x8a1a3a, 0.2, 0.3), 2);
    c.fillStyle = '#fff3dc';
    c.font = `${Math.round(Math.min(22, bank * 0.28))}px ${FONT_DISPLAY}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('ZIEL', 60, bank * 0.08 + Math.min(34, bank * 0.4) / 2 + 1);
    // Checkered stripe down the water.
    const sq = 7;
    for (let y = bank, k = 0; y < h; y += sq, k++) {
      c.fillStyle = k % 2 ? '#14080f' : '#fff6e6';
      c.fillRect(56, y, sq, sq);
      c.fillStyle = k % 2 ? '#fff6e6' : '#14080f';
      c.fillRect(56 + sq, y, sq, sq);
    }
    glowAt(c, 63, h / 2, 16, h / 2, 0xffffff, 0.12, 'lighter');
    // Photo camera on a tripod by the banner.
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(96, bank * 0.98);
    c.lineTo(92, bank * 0.7);
    c.lineTo(100, bank * 0.98);
    c.moveTo(92, bank * 0.7);
    c.lineTo(86, bank * 0.98);
    c.stroke();
    rrect(c, 82, bank * 0.6, 20, 12, 3);
    fillInk(c, '#2a1a24', 1.4);
    ellipse(c, 80, bank * 0.66, 4, 4);
    fillInk(c, gold(c, 76, bank * 0.6, 84, bank * 0.7), 1);
  }, 2);
}

/** Start gate: a striped rope with pennants across the lanes. */
export function startTexture(h: number, bank: number) {
  return paint(40, h, (c) => {
    c.fillStyle = gold(c, 16, 0, 24, h);
    c.fillRect(18, bank * 0.3, 4, h - bank * 0.3);
    for (let y = bank * 0.36, k = 0; y < h - 6; y += 14, k++) {
      c.beginPath();
      c.moveTo(22, y);
      c.lineTo(34, y + 5);
      c.lineTo(22, y + 10);
      c.closePath();
      fillInk(c, k % 2 ? '#ffcf7a' : '#d8364a', 1);
    }
  }, 2);
}

// ---- Podium ----------------------------------------------------------------------------------------

export const PODIUM = { w: 300, h: 110 };

/** Three steps (2, 1, 3) in silver, gold and bronze with velvet fronts. */
export function podiumTexture() {
  return cached('podium', () =>
    paint(PODIUM.w + 20, PODIUM.h + 20, (c) => {
      c.translate(10, 10);
      shadow(c, PODIUM.w / 2, PODIUM.h, PODIUM.w * 0.55, 14, 0.6);
      const steps: [number, number, number, string][] = [
        [0, 40, 0xc8ccd8, '2'],
        [100, 0, 0xf0c868, '1'],
        [200, 60, 0xd08a4a, '3'],
      ];
      for (const [x, y, col, n] of steps) {
        rrect(c, x + 4, y, 92, PODIUM.h - y, 8);
        fillInk(c, vgrad(c, y, PODIUM.h, 0x5a1638, 0.18, 0.4), 2.2);
        rrect(c, x, y, 100, 14, 6);
        fillInk(c, vgrad(c, y, y + 14, col, 0.4, 0.3), 2);
        c.fillStyle = rgb(light(col, 0.2));
        c.font = `${y === 0 ? 40 : 30}px ${FONT_DISPLAY}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(n, x + 50, y + 14 + (PODIUM.h - y - 14) / 2);
      }
      grain(c, 0, 0, PODIUM.w, PODIUM.h, 200, 4, 0.05);
    }, 2),
  );
}

// ---- Station in the room -----------------------------------------------------------------------

/** The pond table: an oval wooden table with a little lit pond, lane ropes, tiny ducks and a tote board. */
function pondTable(): PaintedStation {
  const W = 150;
  const H = 84;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H / 2, 220, 200, 110, 120, (x) => {
    shadow(x, 0, 30, 92, 28, 0.6);
    // Stools.
    for (const sx of [-48, 0, 48]) {
      shadow(x, sx, 66, 14, 5, 0.45);
      x.fillStyle = gold(x, sx - 2, 50, sx + 2, 64);
      x.fillRect(sx - 2, 50, 4, 14);
      ellipse(x, sx, 50, 11, 5.5);
      fillInk(x, vgrad(x, 44, 56, 0x2a4a3a, 0.35, 0.3), 1.6);
    }
    // Tote board behind the table.
    x.fillStyle = gold(x, -4, -80, 4, -30);
    x.fillRect(-40, -62, 4, 30);
    x.fillRect(36, -62, 4, 30);
    rrect(x, -50, -92, 100, 36, 6);
    fillInk(x, vgrad(x, -92, -56, 0x2a1236, 0.2, 0.4), 2);
    rrect(x, -46, -88, 92, 28, 4);
    x.fillStyle = '#0c0a18';
    x.fill();
    DUCKS.forEach((d, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const bx = -42 + col * 30;
      const by = -84 + row * 13;
      ellipse(x, bx + 4, by + 5, 3.4, 3.4);
      x.fillStyle = rgb(d.body);
      x.fill();
      x.fillStyle = '#ffcf7a';
      x.fillRect(bx + 10, by + 3, 14, 3);
    });
    glowAt(x, 0, -74, 60, 22, 0xffcf7a, 0.25, 'lighter');
    // Table: oval wooden rim with a skirt.
    ellipse(x, 0, 6, 80, 34);
    fillInk(x, vgrad(x, -26, 40, 0x4a2a14, 0.2, 0.45), 2.2);
    x.fillRect(-80, -6, 160, 12);
    ellipse(x, 0, -6, 80, 34);
    fillInk(x, vgrad(x, -40, 28, 0x7a4a24, 0.35, 0.2), 2.2);
    ellipse(x, 0, -6, 72, 28);
    x.fillStyle = gold(x, -72, -34, 72, 22);
    x.fill();
    // The pond.
    ellipse(x, 0, -6, 68, 25);
    const wg = x.createRadialGradient(-10, -14, 4, 0, -6, 70);
    wg.addColorStop(0, '#2a6a8a');
    wg.addColorStop(1, '#0c2a40');
    x.fillStyle = wg;
    x.fill();
    x.save();
    ellipse(x, 0, -6, 68, 25);
    x.clip();
    // Lane ropes with floats.
    for (let k = 1; k < 6; k++) {
      const y = -28 + k * 7.6;
      for (let fx = -66; fx < 66; fx += 5) {
        ellipse(x, fx, y, 1.5, 1);
        x.fillStyle = (fx / 5) % 2 ? '#d8364a' : '#f2e6c9';
        x.fill();
      }
    }
    // Finish stripe.
    for (let y = -30, k = 0; y < 18; y += 3, k++) {
      x.fillStyle = k % 2 ? '#14080f' : '#fff6e6';
      x.fillRect(44, y, 3, 3);
    }
    glowAt(x, -20, -18, 40, 12, 0xfff1c4, 0.18, 'lighter');
    x.restore();
    // Tiny ducks mid-race.
    const pos = [22, 8, 34, 0, 16, -8];
    DUCKS.forEach((d, i) => {
      const dx = pos[i] - 14;
      const dy = -24 + i * 7.6 + 2;
      x.strokeStyle = 'rgba(220,240,255,0.6)';
      x.lineWidth = 0.8;
      x.beginPath();
      x.moveTo(dx - 6, dy + 1);
      x.lineTo(dx - 14, dy);
      x.stroke();
      ellipse(x, dx, dy, 4.6, 2.6);
      fillInk(x, rgb(d.body), 0.9);
      ellipse(x, dx + 3.4, dy - 2.6, 2.2, 2.2);
      fillInk(x, rgb(d.head), 0.8);
      x.fillStyle = rgb(d.beak);
      x.fillRect(dx + 5, dy - 3, 2.4, 1.3);
    });
    // Rim highlight.
    x.beginPath();
    x.ellipse(0, -6, 78, 32, 0, Math.PI * 1.1, Math.PI * 1.9);
    x.strokeStyle = 'rgba(255,240,200,0.35)';
    x.lineWidth = 2;
    x.stroke();
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.position.set(W / 2, H / 2 - 74);
  glow.width = 150;
  glow.height = 70;
  glow.tint = 0xffcf7a;
  glow.alpha = 0.45;
  glow.blendMode = 'add';
  const pond = new Sprite(glowTexture());
  pond.anchor.set(0.5);
  pond.position.set(W / 2, H / 2 - 6);
  pond.width = 160;
  pond.height = 60;
  pond.tint = 0x7fd8ff;
  pond.alpha = 0.3;
  pond.blendMode = 'add';
  lamp.addChild(glow, pond);
  c.addChild(lamp);
  c.labelY = H / 2 - 104;
  return c;
}

registerPaintedStation('derby', pondTable);

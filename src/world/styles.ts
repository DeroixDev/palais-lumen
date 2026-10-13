// Floor and wall painting for each floor style. Everything here is drawn once and baked
// into a texture, so it can be as detailed as it likes.

import { Graphics } from 'pixi.js';
import type { RoomTheme } from '../core/registry';

export const WALL_H = 150;
export const SIDE = 24;

/** Small deterministic random so a room always looks the same. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const mix = (a: number, b: number, k: number) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
};
export const shade = (c: number, k: number) => (k < 0 ? mix(c, 0x000000, -k) : mix(c, 0xffffff, k));

export function paintFloor(g: Graphics, t: RoomTheme, W: number, H: number) {
  const rnd = seeded(W * 7 + H);
  g.rect(0, 0, W, H).fill(t.carpet);
  const top = WALL_H - 10;
  switch (t.style) {
    case 'foyer': {
      // Black and cream marble laid on the diagonal, gold seams, a compass star in the middle
      // and a red runner from the entrance.
      const s = 70;
      for (let y = top - s; y < H + s; y += s / 2)
        for (let x = -s; x < W + s; x += s) {
          const row = Math.round((y - top) / (s / 2));
          const cx = x + (row % 2 ? s / 2 : 0);
          const dark = row % 2 === 1;
          g.poly([cx, y - s / 2, cx + s / 2, y, cx, y + s / 2, cx - s / 2, y]).fill(dark ? t.carpetPattern : t.carpet);
          const vx = cx + (rnd() - 0.5) * s * 0.6;
          g.moveTo(vx - 10, y - 12).bezierCurveTo(vx + 6, y - 2, vx - 8, y + 6, vx + 12, y + 14).stroke({ color: dark ? 0x5a5a66 : 0xbfb29a, width: 1, alpha: 0.4 });
          g.poly([cx, y - s / 2, cx + s / 2, y, cx, y + s / 2, cx - s / 2, y]).stroke({ color: t.carpetAccent, width: 1, alpha: 0.35 });
        }
      const cx = W / 2;
      const cy = top + (H - top) * 0.47;
      // Runner from the door to the star.
      g.rect(cx - 70, cy, 140, H - cy).fill(0x6b1a2e);
      g.rect(cx - 62, cy, 124, H - cy).stroke({ color: t.carpetAccent, width: 2, alpha: 0.8 });
      for (let y = cy + 30; y < H; y += 46) g.poly([cx, y - 12, cx + 12, y, cx, y + 12, cx - 12, y]).fill({ color: t.carpetAccent, alpha: 0.4 });
      // Compass star.
      g.circle(cx, cy, 190).fill({ color: 0x0e0b10, alpha: 0.85 }).stroke({ color: t.carpetAccent, width: 5 });
      g.circle(cx, cy, 176).stroke({ color: t.carpetAccent, width: 1.5, alpha: 0.7 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 ? 110 : 168;
        const a1 = a - Math.PI / 16;
        const a2 = a + Math.PI / 16;
        g.poly([cx, cy, cx + Math.cos(a1) * 34, cy + Math.sin(a1) * 34, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(a2) * 34, cy + Math.sin(a2) * 34]).fill(i % 2 ? 0x2f6b6b : i % 4 ? 0xe8dcc0 : t.carpetAccent);
        g.poly([cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(a2) * 34, cy + Math.sin(a2) * 34]).fill({ color: 0x000000, alpha: 0.18 });
      }
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        g.circle(cx + Math.cos(a) * 183, cy + Math.sin(a) * 183, 2.2).fill(t.carpetAccent);
      }
      break;
    }
    case 'velvet': {
      // Classic casino carpet: diamond lattice, medallions and little fleurs.
      const s = 64;
      for (let y = top; y < H + s; y += s) {
        for (let x = -s; x < W + s; x += s) {
          const cx = x + (Math.floor(y / s) % 2) * (s / 2);
          g.poly([cx, y - s / 2, cx + s / 2, y, cx, y + s / 2, cx - s / 2, y]).stroke({ color: t.carpetPattern, width: 3 });
          g.circle(cx, y, 6).fill({ color: t.carpetAccent, alpha: 0.4 });
          g.circle(cx, y, 2.5).fill({ color: t.carpet, alpha: 0.9 });
          for (const [dx, dy] of [[0, -14], [14, 0], [0, 14], [-14, 0]]) g.circle(cx + dx, y + dy, 1.8).fill({ color: t.carpetAccent, alpha: 0.3 });
        }
      }
      // Worn walking paths are a touch lighter.
      g.rect(0, top, W, H).fill({ color: 0x000000, alpha: 0.06 });
      break;
    }
    case 'garden': {
      // Moonlit lawn in soft stripes, with a stone path cross.
      for (let x = 0; x < W; x += 48) g.rect(x, top, 24, H).fill({ color: 0x000000, alpha: 0.07 });
      for (let i = 0; i < 1400; i++) {
        const x = rnd() * W;
        const y = top + rnd() * (H - top);
        g.rect(x, y, 1.5, 4 + rnd() * 3).fill({ color: rnd() < 0.5 ? t.carpetPattern : shade(t.carpet, 0.12), alpha: 0.6 });
      }
      const flag = (cx: number, cy: number, r: number) => {
        g.ellipse(cx + 2, cy + 3, r, r * 0.8).fill({ color: 0x000000, alpha: 0.25 });
        g.ellipse(cx, cy, r, r * 0.8).fill(shade(0x8a8aa0, -0.1 + rnd() * 0.2));
        g.ellipse(cx - r * 0.25, cy - r * 0.25, r * 0.5, r * 0.3).fill({ color: 0xffffff, alpha: 0.08 });
      };
      for (let y = top + 30; y < H - 20; y += 34) flag(W / 2 + (rnd() - 0.5) * 18, y, 18 + rnd() * 6);
      for (let x = 40; x < W - 20; x += 36) flag(x, H * 0.62 + (rnd() - 0.5) * 16, 17 + rnd() * 5);
      // Tiny flowers in the grass.
      for (let i = 0; i < 160; i++) {
        const x = rnd() * W;
        const y = top + 20 + rnd() * (H - top - 20);
        const col = [0xffe7a8, 0xc9a0ff, 0xff9ac0, 0xffffff][Math.floor(rnd() * 4)];
        for (let p = 0; p < 4; p++) g.circle(x + Math.cos(p * 1.57) * 2.2, y + Math.sin(p * 1.57) * 2.2, 1.6).fill({ color: col, alpha: 0.8 });
      }
      break;
    }
    case 'clockwork': {
      // Riveted metal plates with brass seams.
      const s = 96;
      for (let y = top; y < H; y += s)
        for (let x = 0; x < W; x += s) {
          const k = rnd() * 0.08;
          g.rect(x + 2, y + 2, s - 4, s - 4).fill(shade(t.carpet, k - 0.04));
          g.rect(x + 2, y + 2, s - 4, 6).fill({ color: 0xffffff, alpha: 0.05 });
          for (const [dx, dy] of [[10, 10], [s - 10, 10], [10, s - 10], [s - 10, s - 10]]) {
            g.circle(x + dx, y + dy, 3.5).fill(t.carpetAccent);
            g.circle(x + dx - 1, y + dy - 1, 1.2).fill({ color: 0xffffff, alpha: 0.5 });
          }
          if (rnd() < 0.18) g.rect(x + 20, y + s / 2 - 2, s - 40, 4).fill({ color: 0x000000, alpha: 0.18 });
        }
      for (let x = 0; x <= W; x += s) g.rect(x - 2, top, 4, H).fill({ color: t.carpetPattern, alpha: 0.9 });
      for (let y = top; y <= H; y += s) g.rect(0, y - 2, W, 4).fill({ color: t.carpetPattern, alpha: 0.9 });
      // Oil stains and scuffs.
      for (let i = 0; i < 18; i++) g.ellipse(rnd() * W, top + rnd() * (H - top), 10 + rnd() * 24, 6 + rnd() * 12).fill({ color: 0x000000, alpha: 0.08 });
      break;
    }
    case 'crystal': {
      // Polished marble checker with fine veins and a frosty sheen.
      const s = 80;
      for (let y = top; y < H; y += s)
        for (let x = 0; x < W; x += s) {
          const dark = (Math.floor(x / s) + Math.floor(y / s)) % 2 === 1;
          g.rect(x, y, s, s).fill(dark ? t.carpetPattern : t.carpet);
          for (let v = 0; v < 2; v++) {
            const x0 = x + rnd() * s;
            g.moveTo(x0, y).bezierCurveTo(x0 + (rnd() - 0.5) * 60, y + s * 0.3, x0 + (rnd() - 0.5) * 60, y + s * 0.7, x0 + (rnd() - 0.5) * 40, y + s).stroke({ color: dark ? 0xbfe6ff : 0x9ab8d0, width: 1, alpha: 0.35 });
          }
        }
      for (let y = top; y < H; y += s) g.rect(0, y, W, 1.5).fill({ color: 0xffffff, alpha: 0.35 });
      for (let x = 0; x < W; x += s) g.rect(x, top, 1.5, H).fill({ color: 0xffffff, alpha: 0.35 });
      for (let i = 0; i < 40; i++) g.circle(rnd() * W, top + rnd() * (H - top), 1 + rnd() * 1.5).fill({ color: 0xffffff, alpha: 0.6 });
      break;
    }
    case 'throne': {
      // Black marble with gold art-deco rays fanning out from the throne at the top.
      const cx = W / 2;
      const cy = WALL_H + 60;
      for (let i = 0; i < 36; i++) {
        const a0 = (i / 36) * Math.PI;
        const a1 = ((i + 0.5) / 36) * Math.PI;
        const R = Math.hypot(W, H) * 1.2;
        if (i % 2) g.poly([cx, cy, cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R]).fill({ color: t.carpetPattern, alpha: 0.55 });
      }
      for (let r = 140; r < H * 1.4; r += 110) g.circle(cx, cy, r).stroke({ color: t.carpetAccent, width: 2, alpha: 0.35 });
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI;
        g.circle(cx + Math.cos(a) * 250, cy + Math.sin(a) * 250, 4).fill({ color: t.carpetAccent, alpha: 0.7 });
      }
      break;
    }
  }
  // A soft darker edge where floor meets the walls.
  for (let i = 0; i < 6; i++) {
    const a = 0.05 - i * 0.008;
    g.rect(0, top, W, 12 + i * 8).fill({ color: 0x000000, alpha: a });
    g.rect(0, H - 12 - i * 8, W, 12 + i * 8).fill({ color: 0x000000, alpha: a });
    g.rect(0, top, 12 + i * 8, H).fill({ color: 0x000000, alpha: a });
    g.rect(W - 12 - i * 8, top, 12 + i * 8, H).fill({ color: 0x000000, alpha: a });
  }
}

export function paintWalls(g: Graphics, t: RoomTheme, W: number, H: number) {
  const rnd = seeded(W + 3);
  // Back wall seen at a slight angle, so it has height.
  g.rect(0, 0, W, WALL_H).fill(t.wall);
  switch (t.style) {
    case 'foyer':
      // Teal lacquer with gold art-deco fans between fluted pilasters.
      for (let x = 0; x < W; x += 140) {
        const fx = x + 70;
        for (let k = 0; k <= 8; k++) {
          const a = Math.PI + (k / 8) * Math.PI;
          g.moveTo(fx, WALL_H - 34).lineTo(fx + Math.cos(a) * 58, WALL_H - 34 + Math.sin(a) * 58).stroke({ color: t.wallTrim, width: 1.6, alpha: 0.4 });
        }
        g.moveTo(fx - 58, WALL_H - 34).arc(fx, WALL_H - 34, 58, Math.PI, 0).stroke({ color: t.wallTrim, width: 2, alpha: 0.45 });
        g.moveTo(fx - 30, WALL_H - 34).arc(fx, WALL_H - 34, 30, Math.PI, 0).stroke({ color: t.wallTrim, width: 1.5, alpha: 0.45 });
        g.rect(x - 7, 6, 14, WALL_H - 30).fill({ color: shade(t.wall, 0.12) });
        for (let k = -4; k <= 4; k += 4) g.rect(x + k - 0.6, 10, 1.2, WALL_H - 38).fill({ color: 0x000000, alpha: 0.25 });
        g.rect(x - 9, 6, 18, 5).fill({ color: t.wallTrim, alpha: 0.7 });
      }
      g.rect(0, 4, W, 3).fill({ color: t.wallTrim, alpha: 0.6 });
      break;
    case 'velvet':
      // Damask wallpaper above gold-trimmed wainscoting.
      for (let x = 20; x < W; x += 56)
        for (let y = 16; y < WALL_H - 50; y += 40) {
          const ox = (Math.floor(y / 40) % 2) * 28;
          g.ellipse(x + ox, y, 7, 12).fill({ color: t.wallTrim, alpha: 0.09 });
          g.circle(x + ox, y - 14, 3).fill({ color: t.wallTrim, alpha: 0.09 });
        }
      g.rect(0, WALL_H - 48, W, 26).fill(shade(t.wall, -0.25));
      for (let x = 10; x < W; x += 70) g.rect(x, WALL_H - 44, 60, 18).stroke({ color: t.wallTrim, width: 1.5, alpha: 0.5 });
      break;
    case 'garden':
      // Night-sky mural with stars and a trellis.
      for (let i = 0; i < 120; i++) g.circle(rnd() * W, rnd() * (WALL_H - 40), rnd() * 1.4 + 0.4).fill({ color: 0xfff6e6, alpha: 0.4 + rnd() * 0.5 });
      for (let x = 0; x < W; x += 40) {
        g.moveTo(x, WALL_H - 24).lineTo(x + 40, 10).stroke({ color: t.wallTrim, width: 1.5, alpha: 0.2 });
        g.moveTo(x + 40, WALL_H - 24).lineTo(x, 10).stroke({ color: t.wallTrim, width: 1.5, alpha: 0.2 });
      }
      for (let x = 0; x < W; x += 14) g.ellipse(x, WALL_H - 26 - rnd() * 10, 9, 6).fill({ color: rnd() < 0.5 ? 0x2f6b3a : 0x3d8a4a, alpha: 0.9 });
      break;
    case 'clockwork':
      // Brick with copper pipe runs.
      for (let y = 0; y < WALL_H - 24; y += 14)
        for (let x = (y / 14) % 2 ? -18 : 0; x < W; x += 36) g.rect(x + 1, y + 1, 34, 12).fill(shade(t.wall, (rnd() - 0.5) * 0.15));
      for (const py of [28, 96]) {
        g.rect(0, py, W, 9).fill(0xb8733a);
        g.rect(0, py + 1, W, 3).fill({ color: 0xffffff, alpha: 0.2 });
        for (let x = 60; x < W; x += 160) g.rect(x, py - 3, 10, 15).fill(0x8a5022);
      }
      break;
    case 'crystal':
      // Pale panels with silver mouldings and frost.
      for (let x = 0; x < W; x += 90) {
        g.roundRect(x + 8, 14, 74, WALL_H - 52, 6).stroke({ color: t.wallTrim, width: 2, alpha: 0.5 });
        g.roundRect(x + 14, 20, 62, WALL_H - 64, 4).fill({ color: 0xffffff, alpha: 0.05 });
      }
      for (let i = 0; i < 60; i++) {
        const x = rnd() * W;
        const y = rnd() * (WALL_H - 40);
        g.moveTo(x - 4, y).lineTo(x + 4, y).moveTo(x, y - 4).lineTo(x, y + 4).stroke({ color: 0xffffff, width: 1, alpha: 0.35 });
      }
      break;
    case 'throne':
      // Deep velvet with gold fan motifs.
      for (let x = 40; x < W; x += 120) {
        for (let k = 0; k < 7; k++) {
          const a = Math.PI + (k / 6) * Math.PI;
          g.moveTo(x, WALL_H - 30).lineTo(x + Math.cos(a) * 50, WALL_H - 30 + Math.sin(a) * 50).stroke({ color: t.wallTrim, width: 2, alpha: 0.25 });
        }
        g.circle(x, WALL_H - 30, 52).stroke({ color: t.wallTrim, width: 2, alpha: 0.25 });
      }
      break;
  }
  for (let x = 40; x < W; x += 80) g.rect(x, 10, 2, WALL_H - 30).fill({ color: 0x000000, alpha: 0.12 });
  g.rect(0, WALL_H - 22, W, 22).fill({ color: 0x000000, alpha: 0.35 });
  g.rect(0, WALL_H - 24, W, 4).fill(t.wallTrim);
  g.rect(0, WALL_H, W, 10).fill({ color: 0x000000, alpha: 0.35 });
  // Side and front walls with a trim line.
  g.rect(0, 0, SIDE, H).fill(t.wall);
  g.rect(W - SIDE, 0, SIDE, H).fill(t.wall);
  g.rect(0, H - SIDE, W, SIDE).fill(t.wall);
  g.rect(SIDE, 0, 3, H).fill({ color: t.wallTrim, alpha: 0.5 });
  g.rect(W - SIDE - 3, 0, 3, H).fill({ color: t.wallTrim, alpha: 0.5 });
  g.rect(0, H - SIDE, W, 3).fill({ color: t.wallTrim, alpha: 0.5 });
}

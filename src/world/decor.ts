// Furniture and ornaments for the casino floors, seen from above, drawn in code.
// Each piece returns where it goes (floor, z-sorted entities, lights on top, or the back wall),
// what blocks walking, and an optional animation.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { DecorPlacement, RoomTheme } from '../core/registry';
import { COLORS, FONT_BODY, glowTexture, emblemTexture } from '../core/fx';
import { WALL_H, seeded, shade } from './styles';
import { Player } from './player';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BuiltDecor {
  view: Container;
  layer: 'floor' | 'entities' | 'lights' | 'wall';
  obstacles: Rect[];
  /** Sorting depth for entities (usually the bottom edge). */
  z?: number;
  update?: (time: number, dtMs: number) => void;
  /** Little reaction when the player uses it (piano keys, a splash, a puff of steam). */
  poke?: () => void;
  /** Side the player uses it from, when it matters (the painted piano is played from the front). */
  useFrom?: 'below' | 'above';
}

/** A kick that fades out over `ms`; poke() starts it again. */
function kicker(ms = 900) {
  let k = 0;
  return {
    poke: () => void (k = 1),
    step: (dt: number) => (k = Math.max(0, k - dt / ms)),
  };
}

const OUTLINE = 0x14080f;

function glow(c: Container, x: number, y: number, size: number, tint: number, alpha: number) {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.position.set(x, y);
  s.width = s.height = size;
  s.tint = tint;
  s.alpha = alpha;
  s.blendMode = 'add';
  c.addChild(s);
  return s;
}

/** Soft oval shadow under something that stands on the floor. */
function shadow(g: Graphics, x: number, y: number, w: number, h: number, alpha = 0.35) {
  g.ellipse(x + 4, y + 6, w, h).fill({ color: 0x000000, alpha });
}

function flame(c: Container, x: number, y: number, size = 1) {
  const f = new Graphics();
  f.ellipse(0, -4 * size, 3.2 * size, 6 * size).fill(0xffb347);
  f.ellipse(0, -3 * size, 1.6 * size, 3.4 * size).fill(0xfff6d0);
  f.position.set(x, y);
  c.addChild(f);
  const gl = glow(c, x, y - 4 * size, 46 * size, 0xffb347, 0.55);
  const ph = Math.random() * 10;
  return (t: number) => {
    const k = 1 + Math.sin(t * 17 + ph) * 0.08 + Math.sin(t * 7.3 + ph) * 0.06;
    f.scale.set(1, k);
    gl.alpha = 0.45 + (k - 1) * 1.5;
  };
}

function chair(g: Graphics, x: number, y: number, a: number, col: number) {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  g.circle(x + 3, y + 4, 11).fill({ color: 0x000000, alpha: 0.3 });
  g.circle(x, y, 10).fill(col).stroke({ color: OUTLINE, width: 1.5, alpha: 0.6 });
  g.circle(x - dx * 5, y - dy * 5, 6).fill(shade(col, 0.15));
  // Backrest on the far side from the table.
  g.moveTo(x + Math.cos(a + 1.2) * 10, y + Math.sin(a + 1.2) * 10)
    .arc(x, y, 10, a + 1.2, a + Math.PI * 2 - 1.2)
    .stroke({ color: shade(col, -0.3), width: 4 });
}

export function buildDecor(d: DecorPlacement, t: RoomTheme): BuiltDecor | null {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  const { x, y } = d;
  const w = d.w ?? 0;
  const h = d.h ?? 0;
  const rnd = seeded(Math.round(x * 31 + y * 17));
  const ent = (obs: Rect[], z = y, update?: BuiltDecor['update']): BuiltDecor => ({ view: c, layer: 'entities', obstacles: obs, z, update });
  const box = (bw: number, bh: number): Rect => ({ x: x - bw / 2, y: y - bh / 2, w: bw, h: bh });

  switch (d.kind) {
    // ---- Floor ------------------------------------------------------------
    case 'rug': {
      const rw = w || 300;
      const rh = h || 180;
      g.roundRect(x - rw / 2, y - rh / 2, rw, rh, 10).fill(t.accent ?? shade(t.carpet, -0.3));
      g.roundRect(x - rw / 2 + 8, y - rh / 2 + 8, rw - 16, rh - 16, 6).stroke({ color: t.carpetAccent, width: 3, alpha: 0.8 });
      g.roundRect(x - rw / 2 + 16, y - rh / 2 + 16, rw - 32, rh - 32, 4).stroke({ color: t.carpetAccent, width: 1, alpha: 0.5 });
      g.ellipse(x, y, rw * 0.22, rh * 0.25).stroke({ color: t.carpetAccent, width: 2, alpha: 0.6 });
      g.ellipse(x, y, rw * 0.1, rh * 0.12).fill({ color: t.carpetAccent, alpha: 0.35 });
      for (let i = 0; i < 4; i++) {
        const cx = x + (i % 2 ? 1 : -1) * (rw / 2 - 30);
        const cy = y + (i < 2 ? -1 : 1) * (rh / 2 - 30);
        g.circle(cx, cy, 6).fill({ color: t.carpetAccent, alpha: 0.5 });
      }
      // Fringe on the short ends.
      for (let k = 0; k < rh - 10; k += 6) {
        g.rect(x - rw / 2 - 6, y - rh / 2 + 5 + k, 6, 2).fill({ color: t.carpetAccent, alpha: 0.6 });
        g.rect(x + rw / 2, y - rh / 2 + 5 + k, 6, 2).fill({ color: t.carpetAccent, alpha: 0.6 });
      }
      return { view: c, layer: 'floor', obstacles: [] };
    }
    case 'gearInlay': {
      const r = w || 70;
      const gear = new Graphics();
      const teeth = Math.round(r / 6);
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        gear.rect(-5, -r - 8, 10, 12).fill(t.carpetAccent);
        gear.rotation = 0;
        void a;
      }
      const pts: number[] = [];
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const rr = i % 2 ? r : r + 9;
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      gear.clear().poly(pts).fill({ color: t.carpetAccent, alpha: 0.35 }).stroke({ color: t.carpetAccent, width: 2, alpha: 0.7 });
      gear.circle(0, 0, r * 0.55).fill({ color: t.carpet, alpha: 0.6 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        gear.moveTo(0, 0).lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55).stroke({ color: t.carpetAccent, width: 4, alpha: 0.6 });
      }
      gear.circle(0, 0, 10).fill(t.carpetAccent);
      gear.position.set(x, y);
      c.addChild(gear);
      const dir = d.r ? -1 : 1;
      return { view: c, layer: 'floor', obstacles: [], update: (time) => (gear.rotation = (time * 0.15 * dir * 60) / r) };
    }
    case 'mosaic': {
      const r = w || 110;
      g.circle(x, y, r).fill(shade(t.carpet, -0.25)).stroke({ color: t.carpetAccent, width: 4 });
      g.circle(x, y, r - 12).stroke({ color: t.carpetAccent, width: 1.5, alpha: 0.6 });
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        g.circle(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6), 2.5).fill(t.carpetAccent);
      }
      const m = new Sprite(emblemTexture());
      m.anchor.set(0.5);
      m.position.set(x, y);
      m.width = m.height = r * 1.2;
      m.tint = t.carpetAccent;
      m.alpha = 0.55;
      c.addChild(m);
      return { view: c, layer: 'floor', obstacles: [] };
    }

    // ---- Plants -------------------------------------------------------------
    case 'plant': {
      shadow(g, x, y, 22, 14);
      g.circle(x, y, 18).fill(0x6b3a1e).stroke({ color: COLORS.brass, width: 2 });
      g.circle(x, y, 14).fill(0x3a2010);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rnd();
        g.ellipse(x + Math.cos(a) * 14, y + Math.sin(a) * 14 - 6, 15, 7).fill(i % 2 ? 0x2f7d32 : 0x3f9a45);
        g.moveTo(x, y - 6).lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20 - 6).stroke({ color: 0x245e27, width: 1 });
      }
      g.circle(x, y - 6, 10).fill(0x4caf50);
      g.circle(x - 3, y - 9, 4).fill({ color: 0xffffff, alpha: 0.15 });
      return ent([box(36, 36)], y + 18);
    }
    case 'palm': {
      shadow(g, x, y, 30, 18);
      g.circle(x, y, 20).fill(0x7a4a24).stroke({ color: COLORS.brass, width: 2.5 });
      const fronds = new Graphics();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const L = 46 + rnd() * 14;
        const ex = Math.cos(a) * L;
        const ey = Math.sin(a) * L;
        fronds.moveTo(0, 0).quadraticCurveTo(ex * 0.5 - ey * 0.15, ey * 0.5 + ex * 0.15, ex, ey).stroke({ color: 0x2d6b2f, width: 3 });
        for (let k = 0.25; k < 1; k += 0.12) {
          const px = ex * k;
          const py = ey * k;
          fronds.moveTo(px, py).lineTo(px - ey * 0.18 * (1 - k), py + ex * 0.18 * (1 - k)).stroke({ color: 0x3f9a45, width: 4 });
          fronds.moveTo(px, py).lineTo(px + ey * 0.18 * (1 - k), py - ex * 0.18 * (1 - k)).stroke({ color: 0x4caf50, width: 4 });
        }
      }
      fronds.circle(0, 0, 7).fill(0x6b4a24);
      fronds.position.set(x, y - 18);
      c.addChild(fronds);
      const ph = rnd() * 10;
      return ent([box(40, 40)], y + 20, (time) => (fronds.rotation = Math.sin(time * 0.7 + ph) * 0.04));
    }
    case 'tree': {
      const r = w || 56;
      shadow(g, x, y + 6, r * 0.9, r * 0.55, 0.4);
      g.circle(x, y + 10, 16).fill(0x4a3a2a).stroke({ color: 0x8a8aa0, width: 4 });
      const crown = new Graphics();
      for (let i = 0; i < 14; i++) {
        const a = rnd() * Math.PI * 2;
        const rr = rnd() * r * 0.55;
        crown.circle(Math.cos(a) * rr, Math.sin(a) * rr, r * 0.42).fill(i % 3 ? 0x24502c : 0x2f6b3a);
      }
      for (let i = 0; i < 10; i++) {
        const a = rnd() * Math.PI * 2;
        const rr = rnd() * r * 0.6;
        crown.circle(Math.cos(a) * rr - 4, Math.sin(a) * rr - 4, r * 0.18).fill({ color: 0x5fb36a, alpha: 0.5 });
      }
      crown.position.set(x, y - 20);
      c.addChild(crown);
      // Fairy lights in the branches.
      const lights: Sprite[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        lights.push(glow(c, x + Math.cos(a) * r * 0.55, y - 20 + Math.sin(a) * r * 0.5, 22, 0xffe7a8, 0.6));
      }
      const ph = rnd() * 10;
      return ent([box(34, 34)], y + 24, (time) => {
        crown.rotation = Math.sin(time * 0.5 + ph) * 0.02;
        lights.forEach((l, i) => (l.alpha = 0.35 + 0.35 * Math.max(0, Math.sin(time * 2 + i * 1.7 + ph))));
      });
    }
    case 'hedge': {
      const hw = w || 160;
      const hh = h || 40;
      g.roundRect(x - hw / 2 + 4, y - hh / 2 + 8, hw, hh, 12).fill({ color: 0x000000, alpha: 0.35 });
      g.roundRect(x - hw / 2, y - hh / 2, hw, hh, 12).fill(0x24502c);
      for (let i = 0; i < (hw * hh) / 60; i++) g.circle(x - hw / 2 + 6 + rnd() * (hw - 12), y - hh / 2 + 6 + rnd() * (hh - 12), 5 + rnd() * 4).fill(rnd() < 0.5 ? 0x2f6b3a : 0x3d8a4a);
      g.roundRect(x - hw / 2 + 4, y - hh / 2 + 3, hw - 8, 6, 3).fill({ color: 0xffffff, alpha: 0.07 });
      return ent([box(hw, hh)], y + hh / 2);
    }
    case 'flowerbed': {
      const fw = w || 120;
      const fh = h || 36;
      g.roundRect(x - fw / 2, y - fh / 2, fw, fh, 8).fill(0x3a2a1e).stroke({ color: 0x8a8aa0, width: 4 });
      for (let i = 0; i < fw / 6; i++) {
        const fx = x - fw / 2 + 8 + rnd() * (fw - 16);
        const fy = y - fh / 2 + 8 + rnd() * (fh - 16);
        g.circle(fx, fy, 5).fill(0x2f6b3a);
        g.circle(fx, fy, 2.5).fill([0xffe7a8, 0xc9a0ff, 0xff9ac0, 0xffffff, 0x9fd8ff][Math.floor(rnd() * 5)]);
      }
      return ent([box(fw, fh)], y + fh / 2);
    }

    // ---- Architecture -------------------------------------------------------
    case 'pillar': {
      shadow(g, x, y, 32, 22);
      g.circle(x, y, 30).fill(shade(t.wall, -0.2)).stroke({ color: t.wallTrim, width: 3 });
      g.circle(x, y, 26).fill(t.wall);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.circle(x + Math.cos(a) * 21, y + Math.sin(a) * 21, 3).fill({ color: t.wallTrim, alpha: 0.35 });
      }
      g.circle(x, y, 14).fill({ color: t.wallTrim, alpha: 0.2 });
      g.circle(x - 8, y - 8, 7).fill({ color: 0xffffff, alpha: 0.08 });
      return ent([box(52, 52)], y + 28);
    }
    case 'glassPillar': {
      shadow(g, x, y, 28, 18);
      g.circle(x, y, 26).fill({ color: 0xdff6ff, alpha: 0.35 }).stroke({ color: 0xffffff, width: 2.5 });
      g.circle(x, y, 18).stroke({ color: 0x9fe8ff, width: 1.5, alpha: 0.6 });
      g.poly([x - 10, y - 18, x - 2, y - 22, x - 14, y + 4]).fill({ color: 0xffffff, alpha: 0.5 });
      const gl = glow(c, x, y, 120, 0x9fe8ff, 0.35);
      const ph = rnd() * 10;
      return ent([box(48, 48)], y + 26, (time) => (gl.alpha = 0.25 + 0.15 * Math.sin(time * 1.5 + ph)));
    }

    // ---- Seating and tables -------------------------------------------------
    case 'sofa': {
      const sw = w || 160;
      const sh = h || 54;
      const col = t.sofa ?? 0x5a1a3a;
      const rot = d.r ?? 0; // 0: back to the top, 1: back to the right, 2: back to the bottom, 3: back to the left
      const s = new Graphics();
      const ww = rot % 2 ? sh : sw;
      const hh = rot % 2 ? sw : sh;
      s.roundRect(-sw / 2 + 4, -sh / 2 + 8, sw, sh, 16).fill({ color: 0x000000, alpha: 0.4 });
      s.roundRect(-sw / 2, -sh / 2, sw, sh, 16).fill(col).stroke({ color: OUTLINE, width: 2, alpha: 0.5 });
      s.roundRect(-sw / 2, -sh / 2, sw, 18, 9).fill(shade(col, 0.15));
      s.roundRect(-sw / 2, -sh / 2, 18, sh, 9).fill(shade(col, 0.15));
      s.roundRect(sw / 2 - 18, -sh / 2, 18, sh, 9).fill(shade(col, 0.15));
      const seats = Math.max(2, Math.round(sw / 60));
      for (let i = 0; i < seats; i++) {
        const sx = -sw / 2 + 20 + ((sw - 40) / seats) * (i + 0.5);
        s.roundRect(sx - (sw - 40) / seats / 2 + 2, -sh / 2 + 20, (sw - 40) / seats - 4, sh - 26, 8).fill(shade(col, 0.06));
        s.circle(sx, -sh / 2 + 10, 1.8).fill({ color: COLORS.brass, alpha: 0.8 });
      }
      // A cushion in the accent colour.
      s.roundRect(-sw / 2 + 22, -sh / 2 + 16, 22, 18, 6).fill(t.carpetAccent);
      s.rotation = (rot * Math.PI) / 2;
      s.position.set(x, y);
      c.addChild(s);
      return ent([box(ww, hh)], y + hh / 2);
    }
    case 'armchair': {
      const col = t.sofa ?? 0x5a1a3a;
      const s = new Graphics();
      s.roundRect(-24, -20, 52, 50, 14).fill({ color: 0x000000, alpha: 0.4 });
      s.roundRect(-26, -26, 52, 50, 14).fill(col).stroke({ color: OUTLINE, width: 2, alpha: 0.5 });
      s.roundRect(-26, -26, 52, 16, 8).fill(shade(col, 0.15));
      s.roundRect(-26, -26, 12, 50, 6).fill(shade(col, 0.15));
      s.roundRect(14, -26, 12, 50, 6).fill(shade(col, 0.15));
      s.roundRect(-13, -9, 26, 28, 6).fill(shade(col, 0.07));
      s.rotation = ((d.r ?? 0) * Math.PI) / 2;
      s.position.set(x, y);
      c.addChild(s);
      return ent([box(50, 50)], y + 25);
    }
    case 'bench': {
      const bw = w || 110;
      g.roundRect(x - bw / 2 + 4, y - 14, bw, 30, 6).fill({ color: 0x000000, alpha: 0.35 });
      g.roundRect(x - bw / 2, y - 18, bw, 30, 6).fill(0x5a3a22);
      for (let i = 0; i < 5; i++) g.rect(x - bw / 2 + 3, y - 15 + i * 5.5, bw - 6, 3.5).fill(i % 2 ? 0x7a4e2c : 0x8a5a34);
      g.rect(x - bw / 2 - 2, y - 20, 8, 34).fill(0x2a2a30);
      g.rect(x + bw / 2 - 6, y - 20, 8, 34).fill(0x2a2a30);
      return ent([box(bw, 30)], y + 14);
    }
    case 'table': {
      const col = t.sofa ?? 0x5a1a3a;
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (d.r ?? 0);
        chair(g, x + Math.cos(a) * 34, y + Math.sin(a) * 34, a, col);
      }
      g.circle(x + 4, y + 6, 24).fill({ color: 0x000000, alpha: 0.35 });
      g.circle(x, y, 23).fill(0x1b1013).stroke({ color: COLORS.brass, width: 2.5 });
      g.circle(x, y, 18).stroke({ color: COLORS.brass, width: 1, alpha: 0.4 });
      // Glasses and a candle.
      g.circle(x - 9, y + 6, 4).fill({ color: 0xffffff, alpha: 0.3 }).stroke({ color: 0xffffff, width: 1, alpha: 0.7 });
      g.circle(x - 9, y + 6, 2.2).fill({ color: t.carpetAccent, alpha: 0.7 });
      g.circle(x + 9, y + 7, 4).fill({ color: 0xffffff, alpha: 0.3 }).stroke({ color: 0xffffff, width: 1, alpha: 0.7 });
      g.circle(x, y - 4, 4).fill(0xfff6e6);
      const f = flame(c, x, y - 5, 0.8);
      return ent([box(46, 46)], y + 22, (time) => f(time));
    }
    case 'piano': {
      // Grand piano from above: curved body, open lid, keys, stool.
      const p = new Graphics();
      p.moveTo(0, 0).lineTo(120, 0).lineTo(120, 26).bezierCurveTo(118, 90, 80, 150, 40, 160).bezierCurveTo(14, 164, 0, 150, 0, 120).closePath().fill({ color: 0x000000, alpha: 0.45 });
      p.position.set(6, 10);
      const body = new Graphics();
      body.moveTo(0, 0).lineTo(120, 0).lineTo(120, 26).bezierCurveTo(118, 90, 80, 150, 40, 160).bezierCurveTo(14, 164, 0, 150, 0, 120).closePath().fill(0x0e0a10).stroke({ color: 0x3a3040, width: 2 });
      body.moveTo(10, 14).lineTo(110, 14).lineTo(108, 40).bezierCurveTo(104, 90, 76, 136, 42, 146).bezierCurveTo(22, 150, 12, 140, 12, 116).closePath().fill(0x1b1420);
      for (let i = 0; i < 9; i++) body.moveTo(18 + i * 10, 18).lineTo(16 + i * 8, 130 - i * 9).stroke({ color: COLORS.brass, width: 1, alpha: 0.5 });
      body.moveTo(10, 14).lineTo(110, 14).stroke({ color: COLORS.brass, width: 2, alpha: 0.6 });
      // Keys at the top edge.
      body.rect(0, -14, 120, 14).fill(0xfff6e6).stroke({ color: OUTLINE, width: 1 });
      for (let k = 0; k < 24; k++) body.rect(k * 5, -14, 1, 14).fill({ color: 0x000000, alpha: 0.3 });
      for (let k = 0; k < 24; k++) if (k % 7 !== 2 && k % 7 !== 6) body.rect(k * 5 + 3, -14, 3, 8).fill(0x14080f);
      body.roundRect(30, -40, 60, 18, 6).fill(t.sofa ?? 0x5a1a3a).stroke({ color: OUTLINE, width: 1.5, alpha: 0.6 });
      const pressed = new Graphics();
      c.addChild(p, body, pressed);
      c.position.set(x - 60, y - 70);
      const bx = x - 60;
      const by = y - 70;
      const kick = kicker(350);
      let key = 0;
      return {
        view: c,
        layer: 'entities',
        obstacles: [{ x: bx, y: by - 40, w: 120, h: 200 }],
        z: by + 160,
        update: (_t, dt) => {
          const k = kick.step(dt);
          pressed.clear();
          if (k > 0) pressed.rect(key * 5, -14, 5, 14).fill({ color: COLORS.lamp, alpha: k * 0.9 });
        },
        poke: () => {
          key = Math.floor(Math.random() * 24);
          kick.poke();
        },
      };
    }
    case 'bar': {
      const bw = w || 300;
      const bh = h || 70;
      const L = x - bw / 2;
      const T = y - bh / 2;
      g.roundRect(L + 4, T + 8, bw, bh, 14).fill({ color: 0x000000, alpha: 0.4 });
      g.roundRect(L, T, bw, bh, 14).fill(0x4a2414).stroke({ color: COLORS.brass, width: 3 });
      for (let i = 0; i < bw; i += 18) g.rect(L + i, T + 34, 9, bh - 40).fill({ color: 0x000000, alpha: 0.08 });
      g.roundRect(L + 8, T + 8, bw - 16, 22, 8).fill(0x6b3a1e);
      g.roundRect(L + 8, T + 8, bw - 16, 5, 3).fill({ color: 0xffffff, alpha: 0.12 });
      const bottles = [COLORS.cyan, COLORS.neon, COLORS.lamp, 0x7bd47b, 0xc9a0ff, 0xffa94a];
      for (let i = 0; i < Math.floor(bw / 22); i++) {
        g.circle(L + 16 + i * 22, T + 19, 5.5).fill(bottles[i % bottles.length]);
        g.circle(L + 15 + i * 22, T + 17.5, 1.8).fill({ color: 0xffffff, alpha: 0.6 });
      }
      const stools: [number, number][] = [];
      for (let i = 0; i < Math.floor(bw / 60); i++) {
        const sx = L + 30 + i * 60;
        g.circle(sx + 2, T + bh + 21, 12).fill({ color: 0x000000, alpha: 0.3 });
        g.circle(sx, T + bh + 18, 11).fill(t.sofa ?? 0x3a2230).stroke({ color: COLORS.brassDark, width: 2.5 });
        g.circle(sx - 3, T + bh + 15, 3).fill({ color: 0xffffff, alpha: 0.15 });
        stools.push([sx, T + bh + 18]);
        // A glass on the counter in front of each stool.
        g.circle(sx, T + 50, 3.5).fill({ color: 0xffffff, alpha: 0.3 }).stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
      }
      const label = new Text({ text: t.barLabel ?? 'BAR · Limo & Mocktails', style: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700', fill: 0xfff1c4 } });
      label.anchor.set(0.5);
      label.position.set(x, T + 46);
      label.alpha = 0.85;
      c.addChild(label);
      return ent([{ x: L, y: T, w: bw, h: bh }], T + bh);
    }

    // ---- Along the walls ----------------------------------------------------
    case 'cabinet': {
      const cw = w || 110;
      const ch = h || 40;
      const L = x - cw / 2;
      const T = y - ch / 2;
      g.roundRect(L + 3, T + 6, cw, ch, 6).fill({ color: 0x000000, alpha: 0.4 });
      g.roundRect(L, T, cw, ch, 6).fill(0x4a2a18).stroke({ color: COLORS.brassDark, width: 2 });
      g.rect(L + 4, T + 4, cw - 8, 4).fill({ color: 0xffffff, alpha: 0.1 });
      // Things on top: a vase with flowers, a lamp, a small moth figurine.
      g.circle(L + 20, T + ch / 2, 8).fill(0x2f6fd6).stroke({ color: 0xfff6e6, width: 1.5 });
      for (let i = 0; i < 5; i++) g.circle(L + 20 + Math.cos(i * 1.26) * 7, T + ch / 2 + Math.sin(i * 1.26) * 7, 3).fill([0xff9ac0, 0xffe7a8, 0xfff6e6][i % 3]);
      g.circle(L + cw - 22, T + ch / 2, 9).fill(0xfff1c4).stroke({ color: COLORS.brass, width: 2 });
      glow(c, L + cw - 22, T + ch / 2, 90, COLORS.lamp, 0.4);
      g.rect(L + cw / 2 - 12, T + ch / 2 - 6, 24, 12).fill(0x1b1013).stroke({ color: COLORS.brass, width: 1 });
      return ent([{ x: L, y: T, w: cw, h: ch }], T + ch);
    }
    case 'bookshelf': {
      const vertical = (d.r ?? 0) % 2 === 1;
      const len = w || 140;
      const dep = 30;
      const bw = vertical ? dep : len;
      const bh = vertical ? len : dep;
      const L = x - bw / 2;
      const T = y - bh / 2;
      g.rect(L + 3, T + 5, bw, bh).fill({ color: 0x000000, alpha: 0.4 });
      g.rect(L, T, bw, bh).fill(0x3a2010).stroke({ color: 0x1b0e08, width: 2 });
      const cols = [0x8a2a2a, 0x2a4a8a, 0x2f6b3a, 0xc9902e, 0x5a2a6a, 0xd9c6a0, 0x1b1b22];
      let p = 3;
      while (p < len - 4) {
        const bt = 4 + Math.floor(rnd() * 5);
        const col = cols[Math.floor(rnd() * cols.length)];
        if (vertical) g.rect(L + 4, T + p, dep - 8, bt).fill(col);
        else g.rect(L + p, T + 4, bt, dep - 8).fill(col);
        if (rnd() < 0.3) {
          if (vertical) g.rect(L + 6, T + p + 1, dep - 12, 1).fill({ color: COLORS.brass, alpha: 0.7 });
          else g.rect(L + p + 1, T + 6, 1, dep - 12).fill({ color: COLORS.brass, alpha: 0.7 });
        }
        p += bt + 1;
      }
      return ent([{ x: L, y: T, w: bw, h: bh }], T + bh);
    }
    case 'pipes': {
      const vertical = (d.r ?? 0) % 2 === 1;
      const len = w || 200;
      const bw = vertical ? 30 : len;
      const bh = vertical ? len : 30;
      const L = x - bw / 2;
      const T = y - bh / 2;
      for (let k = 0; k < 3; k++) {
        const off = 5 + k * 9;
        const col = [0xb8733a, 0x8a8a90, 0xb8733a][k];
        if (vertical) {
          g.rect(L + off, T, 7, bh).fill(col);
          g.rect(L + off + 1, T, 2, bh).fill({ color: 0xffffff, alpha: 0.25 });
        } else {
          g.rect(L, T + off, bw, 7).fill(col);
          g.rect(L, T + off + 1, bw, 2).fill({ color: 0xffffff, alpha: 0.25 });
        }
      }
      // Valves and gauges.
      for (let p = 30; p < len - 10; p += 70) {
        const vx = vertical ? L + 15 : L + p;
        const vy = vertical ? T + p : T + 15;
        g.circle(vx, vy, 9).fill(0xc8243a).stroke({ color: OUTLINE, width: 1.5 });
        g.moveTo(vx - 7, vy).lineTo(vx + 7, vy).moveTo(vx, vy - 7).lineTo(vx, vy + 7).stroke({ color: 0xffd0d0, width: 2 });
      }
      const puffs: Graphics[] = [];
      const ph = rnd() * 10;
      for (let i = 0; i < 3; i++) {
        const p = new Graphics().circle(0, 0, 8).fill({ color: 0xffffff, alpha: 0.25 });
        c.addChild(p);
        puffs.push(p);
      }
      const sx = vertical ? L + 15 : L + len - 20;
      const sy = vertical ? T + len - 20 : T + 15;
      return ent([{ x: L, y: T, w: bw, h: bh }], T + bh, (time) => {
        puffs.forEach((p, i) => {
          const k = (time * 0.4 + i / 3 + ph) % 1;
          p.position.set(sx + Math.sin(k * 6 + i) * 6, sy - k * 50);
          p.scale.set(0.5 + k * 1.5);
          p.alpha = (1 - k) * 0.8;
        });
      });
    }
    case 'floorLamp': {
      shadow(g, x, y, 14, 9);
      g.circle(x, y, 12).fill(0x2a2a30).stroke({ color: COLORS.brass, width: 2 });
      g.circle(x, y, 18).fill({ color: 0xfff1c4, alpha: 0.85 }).stroke({ color: COLORS.brassDark, width: 2 });
      g.circle(x, y, 6).fill(0xffffff);
      const gl = glow(c, x, y, 200, t.light, 0.45);
      const ph = rnd() * 10;
      return ent([box(24, 24)], y + 12, (time) => (gl.alpha = 0.42 + Math.sin(time * 3 + ph) * 0.03));
    }
    case 'statue': {
      shadow(g, x, y, 30, 18);
      g.rect(x - 26, y - 26, 52, 52).fill(shade(0x8a8aa0, -0.3)).stroke({ color: t.wallTrim, width: 2 });
      g.rect(x - 20, y - 20, 40, 40).fill(0x8a8aa0);
      const m = new Sprite(emblemTexture());
      m.anchor.set(0.5);
      m.position.set(x, y - 4);
      m.width = m.height = 52;
      m.tint = t.style === 'throne' || t.style === 'velvet' ? 0xe0b25a : 0xcfd6e0;
      c.addChild(m);
      return ent([box(52, 52)], y + 26);
    }
    case 'fountain': {
      const r = w || 90;
      shadow(g, x, y, r + 6, r * 0.75, 0.4);
      g.circle(x, y, r).fill(0x8a8aa0).stroke({ color: 0x5a5a70, width: 3 });
      g.circle(x, y, r - 10).fill(0x1d4a6a);
      const water = new Graphics();
      c.addChild(water);
      g.circle(x, y, r * 0.38).fill(0x8a8aa0).stroke({ color: 0x5a5a70, width: 2 });
      g.circle(x, y, r * 0.3).fill(0x2a6a8a);
      g.circle(x, y, 9).fill(0xcfd6e0);
      const m = new Sprite(emblemTexture());
      m.anchor.set(0.5);
      m.position.set(x, y - 6);
      m.width = m.height = 34;
      m.tint = 0xcfd6e0;
      c.addChild(m);
      glow(c, x, y, r * 2.4, 0x5fe3ff, 0.18);
      const kick = kicker(1100);
      let sx = x;
      let sy = y;
      const fb = ent([box(r * 1.8, r * 1.8)], y + r, (time, dt) => {
        water.clear();
        const kk = kick.step(dt);
        if (kk > 0) {
          const e = 1 - kk;
          water.circle(sx, sy, 6 + e * r * 0.5).stroke({ color: 0xffffff, width: 2.5, alpha: kk * 0.8 });
          water.circle(sx, sy, 3 + e * r * 0.3).stroke({ color: 0xbfe6ff, width: 1.5, alpha: kk * 0.6 });
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const d = e * 26;
            water.circle(sx + Math.cos(a) * d, sy + Math.sin(a) * d - Math.sin(e * Math.PI) * 14, 2).fill({ color: 0xe8fcff, alpha: kk });
          }
        }
        for (let i = 0; i < 3; i++) {
          const k = (time * 0.35 + i / 3) % 1;
          water.circle(x, y, r * 0.38 + k * (r * 0.55)).stroke({ color: 0xbfe6ff, width: 2, alpha: (1 - k) * 0.5 });
        }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + time * 0.3;
          water.circle(x + Math.cos(a) * r * 0.34, y + Math.sin(a) * r * 0.34, 2).fill({ color: 0xffffff, alpha: 0.6 });
        }
      });
      fb.poke = () => {
        const a = Math.random() * Math.PI * 2;
        const d = r * (0.5 + Math.random() * 0.3);
        sx = x + Math.cos(a) * d;
        sy = y + Math.sin(a) * d;
        kick.poke();
      };
      return fb;
    }
    case 'moonPool': {
      const r = w || 100;
      g.ellipse(x, y, r + 10, r * 0.7 + 8).fill(0x5a5a70);
      g.ellipse(x, y, r, r * 0.7).fill(0x0b1a33);
      const moon = glow(c, x - r * 0.2, y - r * 0.1, r * 0.9, 0xfff1c4, 0.5);
      const disc = new Graphics().circle(0, 0, r * 0.16).fill({ color: 0xfff1c4, alpha: 0.85 });
      disc.position.set(x - r * 0.2, y - r * 0.1);
      c.addChild(disc);
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2;
        const rr = r * (0.4 + rnd() * 0.45);
        const lx = x + Math.cos(a) * rr;
        const ly = y + Math.sin(a) * rr * 0.7;
        g.circle(lx, ly, 9).fill(0x2f6b3a);
        g.moveTo(lx, ly).lineTo(lx + 9, ly - 2).stroke({ color: 0x0b1a33, width: 2 });
        if (i % 2) g.circle(lx + 2, ly - 2, 3).fill(0xff9ac0);
      }
      const ripple = new Graphics();
      c.addChild(ripple);
      const kick = kicker(1600);
      const mp = ent([{ x: x - r, y: y - r * 0.7, w: r * 2, h: r * 1.4 }], y + r * 0.7, (time, dt) => {
        const kk = kick.step(dt);
        disc.scale.x = 1 + Math.sin(time * 1.3) * 0.08;
        moon.alpha = 0.4 + Math.sin(time * 0.8) * 0.1 + kk * 0.5;
        moon.width = moon.height = r * 0.9 * (1 + kk * 0.6);
        ripple.clear();
        const k = (time * 0.25) % 1;
        ripple.ellipse(x + r * 0.3, y + r * 0.2, 10 + k * 50, (10 + k * 50) * 0.7).stroke({ color: 0xbfe6ff, width: 1.5, alpha: (1 - k) * 0.4 });
        if (kk > 0) for (let i = 0; i < 3; i++) {
          const e = Math.min(1, (1 - kk) * 1.6 - i * 0.2);
          if (e > 0) ripple.ellipse(x - r * 0.2, y - r * 0.1, 8 + e * r * 0.9, (8 + e * r * 0.9) * 0.7).stroke({ color: 0xfff1c4, width: 2, alpha: (1 - e) * 0.7 });
        }
      });
      mp.poke = kick.poke;
      return mp;
    }
    case 'lanternPost': {
      shadow(g, x, y, 14, 9);
      g.circle(x, y, 8).fill(0x1b1b22);
      g.roundRect(x - 12, y - 30, 24, 24, 6).fill(0x2a2a30).stroke({ color: COLORS.brass, width: 2 });
      g.roundRect(x - 8, y - 26, 16, 16, 4).fill(0xffe7a8);
      const gl = glow(c, x, y - 18, 200, COLORS.lamp, 0.45);
      const moths: Sprite[] = [];
      for (let i = 0; i < 3; i++) {
        const m = new Sprite(emblemTexture());
        m.anchor.set(0.5);
        m.width = m.height = 12;
        m.tint = 0xfff1c4;
        c.addChild(m);
        moths.push(m);
      }
      const ph = rnd() * 10;
      const base = 12 / 64;
      const kick = kicker(2200);
      const lp = ent([box(20, 20)], y + 8, (time, dt) => {
        const kk = kick.step(dt);
        const spread = 1 + Math.sin(kk * Math.PI) * 3.5;
        gl.alpha = 0.4 + Math.sin(time * 4 + ph) * 0.05 + kk * 0.2;
        moths.forEach((m, i) => {
          const a = time * (1.2 + i * 0.4) * (1 + kk * 2) + i * 2 + ph;
          m.position.set(x + Math.cos(a) * (18 + i * 6) * spread, y - 22 + Math.sin(a * 1.3) * 12 * spread);
          m.scale.x = base * (0.35 + 0.65 * Math.abs(Math.cos(time * 22 + i)));
          m.scale.y = base;
        });
      });
      lp.poke = kick.poke;
      return lp;
    }
    case 'boiler': {
      const r = w || 40;
      shadow(g, x, y, r + 4, r * 0.7);
      g.circle(x, y, r).fill(0xb8733a).stroke({ color: 0x6e3e14, width: 3 });
      g.circle(x, y, r - 8).fill(0xc98a4a);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        g.circle(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4), 2).fill(0x6e3e14);
      }
      g.circle(x - r * 0.3, y - r * 0.3, r * 0.25).fill({ color: 0xffffff, alpha: 0.15 });
      // Pressure gauge with a nervous needle.
      g.circle(x + r * 0.35, y + r * 0.2, 11).fill(0xfff6e6).stroke({ color: OUTLINE, width: 2 });
      const needle = new Graphics().rect(-1, -9, 2, 9).fill(0xc8243a);
      needle.position.set(x + r * 0.35, y + r * 0.2);
      c.addChild(needle);
      const ph = rnd() * 10;
      const steam = new Graphics();
      c.addChild(steam);
      const kick = kicker(1800);
      const bo = ent([box(r * 2, r * 2)], y + r, (time, dt) => {
        const kk = kick.step(dt);
        needle.rotation = 0.6 + Math.sin(time * 2 + ph) * 0.4 + Math.sin(time * 13) * 0.05 + kk * 1.6;
        steam.clear();
        if (kk > 0)
          for (let i = 0; i < 7; i++) {
            const e = Math.min(1, (1 - kk) * 1.4 + i * 0.05);
            const sx = x - r * 0.4 + Math.sin(i * 2.1) * 10 + e * (i - 3) * 8;
            const sy = y - r * 0.6 - e * (60 + i * 12);
            steam.circle(sx, sy, 6 + e * 18).fill({ color: 0xffffff, alpha: (1 - e) * 0.35 });
          }
      });
      bo.poke = kick.poke;
      return bo;
    }
    case 'workbench': {
      const bw = w || 130;
      g.rect(x - bw / 2 + 3, y - 20, bw, 46).fill({ color: 0x000000, alpha: 0.35 });
      g.rect(x - bw / 2, y - 24, bw, 46).fill(0x5a3a22).stroke({ color: 0x2a1a10, width: 2 });
      g.rect(x - bw / 2, y - 24, bw, 6).fill(0x7a4e2c);
      // Tools and a half-built moth automaton.
      g.rect(x - bw / 2 + 10, y - 12, 26, 5).fill(0x8a8a90);
      g.rect(x - bw / 2 + 32, y - 14, 8, 9).fill(0x6b3a1e);
      g.circle(x + 10, y, 11).stroke({ color: COLORS.brass, width: 3 });
      g.circle(x + 10, y, 4).fill(COLORS.brass);
      g.circle(x + bw / 2 - 22, y - 6, 7).fill(0xb8733a);
      g.circle(x + bw / 2 - 22, y + 8, 4).fill(0x8a8a90);
      return ent([box(bw, 46)], y + 22);
    }
    case 'clockTower': {
      shadow(g, x, y, 26, 16);
      g.roundRect(x - 24, y - 24, 48, 48, 6).fill(0x3a2010).stroke({ color: COLORS.brass, width: 2 });
      g.circle(x, y, 17).fill(0xfff6e6).stroke({ color: COLORS.brass, width: 2.5 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.circle(x + Math.cos(a) * 13, y + Math.sin(a) * 13, 1.2).fill(OUTLINE);
      }
      const hands = new Graphics();
      const hh = new Graphics().rect(-1.5, -9, 3, 9).fill(OUTLINE);
      const mh = new Graphics().rect(-1, -13, 2, 13).fill(0xc8243a);
      hands.addChild(hh, mh);
      hands.position.set(x, y);
      c.addChild(hands);
      const kick = kicker(1400);
      let extra = 0;
      const ct = ent([box(48, 48)], y + 24, (time, dt) => {
        const kk = kick.step(dt);
        extra += kk * dt * 0.012;
        mh.rotation = time * 0.6 + extra;
        hh.rotation = time * 0.05 + extra / 12;
        hands.scale.set(1 + Math.sin(kk * Math.PI * 6) * 0.06 * kk);
      });
      ct.poke = kick.poke;
      return ct;
    }
    case 'crystal': {
      const s = w || 1;
      shadow(g, x, y, 24 * s, 14 * s);
      const cr = new Graphics();
      const shards = [[-12, 4, 10, 34], [0, 0, 13, 48], [13, 6, 9, 30], [-4, 10, 8, 22], [8, 12, 7, 18]];
      for (const [sx, sy, sw, sh] of shards) {
        cr.poly([sx * s - sw * s / 2, sy * s, sx * s, (sy - sh) * s, sx * s + sw * s / 2, sy * s, sx * s, (sy + 6) * s]).fill({ color: t.crystal ?? 0x9fe8ff, alpha: 0.85 }).stroke({ color: 0xffffff, width: 1, alpha: 0.8 });
        cr.poly([sx * s - sw * s / 4, sy * s - 2, sx * s, (sy - sh + 6) * s, sx * s, sy * s]).fill({ color: 0xffffff, alpha: 0.4 });
      }
      cr.position.set(x, y);
      c.addChild(cr);
      const gl = glow(c, x, y - 14 * s, 120 * s, t.crystal ?? 0x9fe8ff, 0.4);
      const ph = rnd() * 10;
      const kick = kicker(1200);
      const cy = ent([box(36 * s, 30 * s)], y + 10 * s, (time, dt) => {
        const kk = kick.step(dt);
        gl.alpha = 0.3 + 0.18 * Math.sin(time * 1.8 + ph) + kk * 0.6;
        cr.scale.set(1 + Math.sin(kk * Math.PI * 5) * 0.05 * kk);
      });
      cy.poke = kick.poke;
      return cy;
    }
    case 'iceSwan': {
      shadow(g, x, y, 30, 18);
      g.roundRect(x - 30, y - 22, 60, 44, 8).fill(0xcfd6e0).stroke({ color: 0xffffff, width: 2 });
      const s = new Graphics();
      s.ellipse(0, 4, 20, 13).fill({ color: 0xe8fcff, alpha: 0.9 }).stroke({ color: 0xffffff, width: 1.5 });
      s.moveTo(10, 0).bezierCurveTo(22, -8, 10, -26, 2, -20).stroke({ color: 0xe8fcff, width: 6, cap: 'round' });
      s.poly([0, -22, -8, -20, 0, -18]).fill(0xbfe6ff);
      s.ellipse(-8, 2, 10, 6).fill({ color: 0xffffff, alpha: 0.5 });
      s.position.set(x, y);
      c.addChild(s);
      glow(c, x, y, 110, 0x9fe8ff, 0.3);
      return ent([box(60, 44)], y + 22);
    }
    case 'champagne': {
      shadow(g, x, y, 30, 20);
      g.circle(x, y, 28).fill(0xfff6e6).stroke({ color: 0xd9c6a0, width: 2 });
      for (const [r, n] of [[18, 8], [9, 4], [0, 1]] as const)
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          g.circle(x + Math.cos(a) * r, y + Math.sin(a) * r, 5).fill({ color: 0xffe7a8, alpha: 0.8 }).stroke({ color: 0xffffff, width: 1 });
        }
      const bubbles = new Graphics();
      c.addChild(bubbles);
      const kick = kicker(1300);
      const ch = ent([box(56, 56)], y + 28, (time, dt) => {
        const kk = kick.step(dt);
        bubbles.clear();
        for (let i = 0; i < 6; i++) {
          const a = i * 1.1 + time * 0.8;
          bubbles.circle(x + Math.cos(a) * 14, y + Math.sin(a * 1.3) * 14, 1).fill({ color: 0xffffff, alpha: 0.8 });
        }
        if (kk > 0)
          for (let i = 0; i < 16; i++) {
            const e = (1 - kk + i / 16) % 1;
            const a = i * 2.4;
            bubbles.circle(x + Math.cos(a) * (6 + e * 24), y - e * 40 + Math.sin(a) * 6, 1.6).fill({ color: 0xfff6d0, alpha: kk * (1 - e) });
          }
      });
      ch.poke = kick.poke;
      return ch;
    }
    case 'brazier': {
      shadow(g, x, y, 22, 14);
      g.circle(x, y, 20).fill(0x2a1a10).stroke({ color: COLORS.brass, width: 3 });
      g.circle(x, y, 14).fill(0x4a1a0a);
      const fl = new Graphics();
      c.addChild(fl);
      const gl = glow(c, x, y, 240, 0xff8a3a, 0.5);
      const ph = rnd() * 10;
      return ent([box(40, 40)], y + 20, (time) => {
        fl.clear();
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + time * 2 + ph;
          const r = 6 + Math.sin(time * 9 + i) * 3;
          fl.circle(x + Math.cos(a) * 5, y + Math.sin(a) * 5 - 2, r).fill({ color: i % 2 ? 0xff8a3a : 0xffcf4a, alpha: 0.85 });
        }
        fl.circle(x, y - 2, 5).fill(0xfff6d0);
        gl.alpha = 0.45 + Math.sin(time * 11 + ph) * 0.06;
      });
    }
    case 'throne': {
      // Dais with steps, the throne and the Selene hovering above it.
      const W2 = 220;
      for (let s = 0; s < 3; s++) {
        const ww = W2 - s * 40;
        const hh = 120 - s * 26;
        g.roundRect(x - ww / 2, y - hh / 2 + s * 4, ww, hh, 10).fill(shade(0x2a1630, s * 0.08)).stroke({ color: COLORS.brass, width: 2.5 });
      }
      g.roundRect(x - 36, y - 40, 72, 64, 12).fill(0x6b1a2e).stroke({ color: COLORS.brass, width: 3 });
      g.roundRect(x - 26, y - 22, 52, 40, 8).fill(0x8a2440);
      g.circle(x - 30, y - 38, 7).fill(COLORS.brass);
      g.circle(x + 30, y - 38, 7).fill(COLORS.brass);
      const queen = new Container();
      const halo = glow(queen, 0, 0, 360, 0xc9a0ff, 0.45);
      const wingsL = new Sprite(emblemTexture());
      wingsL.anchor.set(0.5);
      wingsL.width = wingsL.height = 170;
      wingsL.tint = 0xe0b25a;
      const crown = new Graphics();
      crown.poly([-14, -46, -10, -60, -4, -50, 0, -64, 4, -50, 10, -60, 14, -46]).fill(COLORS.lamp).stroke({ color: OUTLINE, width: 1.5 });
      for (const cx of [-8, 0, 8]) crown.circle(cx, -48, 2).fill(0xff5fa2);
      queen.addChild(wingsL, crown);
      queen.position.set(x, y - 90);
      c.addChild(queen);
      const base = 170 / 64;
      let hit = 0;
      const built: BuiltDecor = ent([{ x: x - W2 / 2, y: y - 60, w: W2, h: 120 }], y + 60, (time, dt) => {
        hit = Math.max(0, hit - dt / 500);
        wingsL.scale.x = base * (0.75 + 0.25 * Math.abs(Math.cos(time * 1.6)));
        wingsL.scale.y = base;
        queen.y = y - 90 + Math.sin(time * 1.2) * 6;
        queen.x = x + (hit > 0 ? Math.sin(time * 60) * 6 * hit : 0);
        wingsL.tint = hit > 0.3 ? 0xffffff : 0xe0b25a;
        halo.alpha = 0.4 + Math.sin(time * 2) * 0.08 + hit * 0.4;
      });
      (c as Container & { hit?: () => void }).hit = () => (hit = 1);
      return built;
    }
    case 'rope': {
      const rw = w || 200;
      g.moveTo(x - rw / 2, y).quadraticCurveTo(x, y + 22, x + rw / 2, y).stroke({ color: 0xb3132b, width: 6 });
      g.moveTo(x - rw / 2, y + 1).quadraticCurveTo(x, y + 21, x + rw / 2, y + 1).stroke({ color: 0xff5f6a, width: 1.5, alpha: 0.6 });
      for (const px of [x - rw / 2, x + rw / 2]) {
        g.circle(px + 2, y + 4, 10).fill({ color: 0x000000, alpha: 0.35 });
        g.circle(px, y, 9).fill(COLORS.brass).stroke({ color: COLORS.brassDark, width: 2 });
        g.circle(px - 3, y - 3, 3).fill({ color: 0xffffff, alpha: 0.5 });
      }
      return ent([], y + 10);
    }

    // ---- Ceiling --------------------------------------------------------------
    case 'chandelier': {
      const r = w || 46;
      const ch = new Container();
      const cg = new Graphics();
      const crystalCol = t.style === 'crystal' ? 0xdff6ff : 0xfff1c4;
      cg.circle(0, 0, r).stroke({ color: COLORS.brass, width: 3, alpha: 0.9 });
      cg.circle(0, 0, r * 0.55).stroke({ color: COLORS.brass, width: 2, alpha: 0.8 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cg.moveTo(0, 0).lineTo(Math.cos(a) * r, Math.sin(a) * r).stroke({ color: COLORS.brass, width: 1.5, alpha: 0.7 });
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        cg.circle(Math.cos(a) * r, Math.sin(a) * r, 3.5).fill({ color: crystalCol, alpha: 0.95 });
        cg.circle(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, 2.5).fill({ color: crystalCol, alpha: 0.85 });
      }
      cg.circle(0, 0, 7).fill(COLORS.lamp);
      ch.addChild(cg);
      const gl = glow(ch, 0, 0, r * 7, t.light, 0.28);
      const sparkle: Graphics[] = [];
      for (let i = 0; i < 4; i++) {
        const s = new Graphics().moveTo(-4, 0).lineTo(4, 0).moveTo(0, -4).lineTo(0, 4).stroke({ color: 0xffffff, width: 1.5 });
        ch.addChild(s);
        sparkle.push(s);
      }
      ch.position.set(x, y);
      c.addChild(ch);
      const ph = rnd() * 10;
      return {
        view: c,
        layer: 'lights',
        obstacles: [],
        update: (time) => {
          ch.rotation = Math.sin(time * 0.4 + ph) * 0.04;
          gl.alpha = 0.26 + Math.sin(time * 1.1 + ph) * 0.03;
          sparkle.forEach((s, i) => {
            const k = (time * 0.7 + i / 4 + ph) % 1;
            const a = i * 1.7 + ph;
            s.position.set(Math.cos(a) * r, Math.sin(a) * r);
            s.alpha = Math.max(0, Math.sin(k * Math.PI)) * 0.9;
            s.scale.set(0.6 + k);
          });
        },
      };
    }

    // ---- Back wall --------------------------------------------------------------
    case 'painting': {
      const pw = w || 90;
      const ph2 = h || 64;
      const T = 26;
      g.rect(x - pw / 2 + 3, T + 4, pw, ph2).fill({ color: 0x000000, alpha: 0.4 });
      g.rect(x - pw / 2, T, pw, ph2).fill(COLORS.brass);
      g.rect(x - pw / 2 + 6, T + 6, pw - 12, ph2 - 12).fill(0x14101c);
      const scene = Math.floor(rnd() * 3);
      const L = x - pw / 2 + 6;
      const IT = T + 6;
      const iw = pw - 12;
      const ih = ph2 - 12;
      if (scene === 0) {
        // Moonlit sea.
        g.rect(L, IT, iw, ih).fill(0x1d2a4a);
        g.rect(L, IT + ih * 0.6, iw, ih * 0.4).fill(0x0e1a33);
        g.circle(L + iw * 0.7, IT + ih * 0.3, ih * 0.15).fill(0xfff1c4);
        g.rect(L + iw * 0.66, IT + ih * 0.62, iw * 0.08, ih * 0.3).fill({ color: 0xfff1c4, alpha: 0.4 });
      } else if (scene === 1) {
        // Portrait of a moth noble.
        g.rect(L, IT, iw, ih).fill(0x3a1a2a);
        g.circle(x, IT + ih * 0.45, ih * 0.28).fill(0xe0b25a);
        g.ellipse(x, IT + ih * 0.95, iw * 0.3, ih * 0.3).fill(0x6b1a2e);
        g.circle(x - ih * 0.1, IT + ih * 0.42, 2).fill(OUTLINE);
        g.circle(x + ih * 0.1, IT + ih * 0.42, 2).fill(OUTLINE);
      } else {
        // Still life with flowers.
        g.rect(L, IT, iw, ih).fill(0x2a3a2a);
        g.rect(L + iw * 0.4, IT + ih * 0.55, iw * 0.2, ih * 0.4).fill(0x6b3a1e);
        for (let i = 0; i < 6; i++) g.circle(L + iw * (0.3 + rnd() * 0.4), IT + ih * (0.2 + rnd() * 0.35), 5).fill([0xff9ac0, 0xffe7a8, 0xc9a0ff][i % 3]);
      }
      g.rect(x - pw / 2, T, pw, ph2).stroke({ color: COLORS.brassDark, width: 2 });
      g.rect(x - pw / 2 + 2, T + 2, pw - 4, 2).fill({ color: 0xffffff, alpha: 0.3 });
      glow(c, x, T - 4, pw * 1.2, t.light, 0.18);
      return { view: c, layer: 'wall', obstacles: [] };
    }
    case 'sconce': {
      const T = 52;
      g.roundRect(x - 7, T, 14, 26, 4).fill(COLORS.brass);
      g.moveTo(x, T + 20).quadraticCurveTo(x - 16, T + 14, x - 14, T).stroke({ color: COLORS.brass, width: 3 });
      g.moveTo(x, T + 20).quadraticCurveTo(x + 16, T + 14, x + 14, T).stroke({ color: COLORS.brass, width: 3 });
      g.rect(x - 17, T - 8, 6, 9).fill(0xfff6e6);
      g.rect(x + 11, T - 8, 6, 9).fill(0xfff6e6);
      const f1 = flame(c, x - 14, T - 8, 0.9);
      const f2 = flame(c, x + 14, T - 8, 0.9);
      glow(c, x, T, 160, t.light, 0.3);
      return { view: c, layer: 'wall', obstacles: [], update: (time) => (f1(time), f2(time + 3)) };
    }
    case 'curtain': {
      const cw = w || 120;
      const T = 6;
      const H = WALL_H - 30;
      const col = t.curtain ?? 0x8a1a2e;
      for (const side of [-1, 1]) {
        const L = side < 0 ? x - cw / 2 : x + cw / 2 - cw * 0.3;
        for (let i = 0; i < 5; i++) g.rect(L + i * (cw * 0.06), T, cw * 0.06, H).fill(i % 2 ? col : shade(col, -0.2));
        g.ellipse(L + cw * 0.15, T + H * 0.6, cw * 0.17, 6).fill(COLORS.brass);
      }
      g.rect(x - cw / 2 - 6, T, cw + 12, 6).fill(COLORS.brass);
      for (let i = 0; i < cw; i += 10) g.poly([x - cw / 2 + i, T + 6, x - cw / 2 + i + 10, T + 6, x - cw / 2 + i + 5, T + 14]).fill(col);
      return { view: c, layer: 'wall', obstacles: [] };
    }
    case 'window': {
      const ww = w || 80;
      const T = 18;
      const H = WALL_H - 50;
      g.roundRect(x - ww / 2 - 5, T - 5, ww + 10, H + 10, ww / 2).fill(t.wallTrim);
      g.roundRect(x - ww / 2, T, ww, H, ww / 2 - 4).fill(0x0a0f2e);
      for (let i = 0; i < 12; i++) g.circle(x - ww / 2 + 6 + rnd() * (ww - 12), T + 10 + rnd() * (H - 20), rnd() * 1.2 + 0.4).fill(0xfff6e6);
      if (rnd() < 0.5) g.circle(x + ww * 0.15, T + H * 0.3, ww * 0.14).fill(0xfff1c4);
      g.rect(x - 1.5, T, 3, H).fill(t.wallTrim);
      g.rect(x - ww / 2, T + H * 0.55, ww, 3).fill(t.wallTrim);
      g.poly([x - ww / 2 + 6, T + H - 6, x - ww / 2 + 22, T + 30, x - ww / 2 + 30, T + 30, x - ww / 2 + 14, T + H - 6]).fill({ color: 0xffffff, alpha: 0.06 });
      return { view: c, layer: 'wall', obstacles: [] };
    }
    case 'mirror': {
      const mw = w || 60;
      const T = 20;
      const H = WALL_H - 58;
      g.ellipse(x, T + H / 2, mw / 2 + 6, H / 2 + 6).fill(t.wallTrim);
      g.ellipse(x, T + H / 2, mw / 2, H / 2).fill(0x9ab8d0);
      g.ellipse(x, T + H / 2, mw / 2 - 4, H / 2 - 4).fill(0xbfd8ea);
      g.poly([x - mw * 0.3, T + H * 0.7, x - mw * 0.05, T + H * 0.15, x + mw * 0.08, T + H * 0.15, x - mw * 0.18, T + H * 0.7]).fill({ color: 0xffffff, alpha: 0.45 });
      const shine = glow(c, x, T + H / 2, mw * 1.6, 0xffffff, 0.12);
      const ph = rnd() * 10;
      return { view: c, layer: 'wall', obstacles: [], update: (time) => (shine.alpha = 0.08 + 0.08 * Math.max(0, Math.sin(time * 0.7 + ph))) };
    }
    case 'wallClock': {
      const r = w || 40;
      const cy = WALL_H / 2 - 12;
      g.circle(x, cy, r + 6).fill(0x6e3e14).stroke({ color: COLORS.brass, width: 3 });
      g.circle(x, cy, r).fill(0xfff6e6);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.rect(x + Math.cos(a) * (r - 7) - 1.5, cy + Math.sin(a) * (r - 7) - 1.5, 3, 3).fill(OUTLINE);
      }
      // Visible gearwork through a window in the face.
      g.circle(x, cy + r * 0.45, r * 0.25).fill(0x3a2010);
      const gear = new Graphics();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        gear.rect(Math.cos(a) * r * 0.18 - 2, Math.sin(a) * r * 0.18 - 2, 4, 4).fill(COLORS.brass);
      }
      gear.circle(0, 0, r * 0.14).fill(COLORS.brass);
      gear.position.set(x, cy + r * 0.45);
      const hh = new Graphics().rect(-2, -r * 0.5, 4, r * 0.5).fill(OUTLINE);
      const mh = new Graphics().rect(-1.2, -r * 0.8, 2.4, r * 0.8).fill(0xc8243a);
      hh.position.set(x, cy);
      mh.position.set(x, cy);
      c.addChild(gear, hh, mh);
      return {
        view: c,
        layer: 'wall',
        obstacles: [],
        update: (time) => {
          mh.rotation = time * 0.5;
          hh.rotation = time * 0.04;
          gear.rotation = time * 1.5;
        },
      };
    }
    case 'ivy': {
      const iw = w || 120;
      for (let i = 0; i < iw / 4; i++) {
        const lx = x - iw / 2 + rnd() * iw;
        const ly = rnd() * (WALL_H - 30) * Math.pow(rnd(), 0.6);
        g.ellipse(lx, ly, 6, 4).fill(rnd() < 0.5 ? 0x2f6b3a : 0x3d8a4a);
      }
      for (let i = 0; i < 6; i++) g.circle(x - iw / 2 + rnd() * iw, rnd() * 60, 2.5).fill(0xffe7a8);
      return { view: c, layer: 'wall', obstacles: [] };
    }
    case 'banner': {
      const bw = w || 50;
      const T = 4;
      const H = WALL_H - 34;
      const col = t.curtain ?? 0x5a1a6a;
      g.rect(x - bw / 2 - 6, T, bw + 12, 6).fill(COLORS.brass);
      g.poly([x - bw / 2, T + 6, x + bw / 2, T + 6, x + bw / 2, T + H, x, T + H - 16, x - bw / 2, T + H]).fill(col);
      g.poly([x - bw / 2 + 5, T + 10, x + bw / 2 - 5, T + 10, x + bw / 2 - 5, T + H - 8, x, T + H - 22, x - bw / 2 + 5, T + H - 8]).stroke({ color: COLORS.brass, width: 2 });
      const m = new Sprite(emblemTexture());
      m.anchor.set(0.5);
      m.position.set(x, T + H * 0.42);
      m.width = m.height = bw * 0.8;
      m.tint = COLORS.lamp;
      c.addChild(m);
      return { view: c, layer: 'wall', obstacles: [] };
    }
    case 'relief': {
      const rw = w || 220;
      const cy = WALL_H / 2 - 10;
      g.ellipse(x, cy, rw / 2, 52).fill(shade(t.wall, -0.2)).stroke({ color: COLORS.brass, width: 3 });
      for (let i = 0; i < 18; i++) {
        const a = Math.PI + (i / 17) * Math.PI;
        g.moveTo(x, cy + 10).lineTo(x + Math.cos(a) * rw * 0.48, cy + 10 + Math.sin(a) * 48).stroke({ color: COLORS.brass, width: 1.5, alpha: 0.4 });
      }
      const m = new Sprite(emblemTexture());
      m.anchor.set(0.5);
      m.position.set(x, cy);
      m.width = m.height = 110;
      m.tint = COLORS.lamp;
      c.addChild(m);
      const gl = glow(c, x, cy, rw * 1.4, 0xc9a0ff, 0.25);
      return { view: c, layer: 'wall', obstacles: [], update: (time) => (gl.alpha = 0.2 + Math.sin(time * 1.4) * 0.08) };
    }
    case 'gauge': {
      const cy = 64;
      g.circle(x, cy, 18).fill(0xfff6e6).stroke({ color: 0xb8733a, width: 4 });
      g.moveTo(x + Math.cos(Math.PI * 0.8) * 12, cy + Math.sin(Math.PI * 0.8) * 12).arc(x, cy, 12, Math.PI * 0.8, Math.PI * 1.6).stroke({ color: 0x2f6b3a, width: 3 });
      g.moveTo(x + Math.cos(Math.PI * 1.6) * 12, cy + Math.sin(Math.PI * 1.6) * 12).arc(x, cy, 12, Math.PI * 1.6, Math.PI * 2.2).stroke({ color: 0xc8243a, width: 3 });
      const n = new Graphics().rect(-1, -13, 2, 13).fill(OUTLINE);
      n.position.set(x, cy);
      c.addChild(n);
      const ph = rnd() * 10;
      return { view: c, layer: 'wall', obstacles: [], update: (time) => (n.rotation = Math.sin(time * 1.3 + ph) * 0.8 + Math.sin(time * 9 + ph) * 0.05) };
    }
    // ---- Foyer -------------------------------------------------------------------
    case 'shopCounter': {
      // Glass display counter of the souvenir shop, shelves of goods behind it, and the shopkeeper.
      const cw = w || 300;
      const ch = h || 64;
      const L = x - cw / 2;
      const T = y - ch / 2;
      // Shelves against the wall behind the counter.
      const back = WALL_H + 4;
      g.rect(L - 10, back - 4, cw + 20, 26).fill(0x3a2010).stroke({ color: COLORS.brass, width: 2 });
      const goods = [0xc9962e, 0x9fe8ff, 0xff9ac0, 0xfff1c4, 0x5a2a7a, 0x1f5a44, 0xffcf7a];
      for (let i = 0; i < Math.floor(cw / 26); i++) {
        const gx = L + 6 + i * 26;
        const col = goods[i % goods.length];
        if (i % 3 === 0) g.ellipse(gx + 8, back + 9, 9, 6).fill(col).stroke({ color: OUTLINE, width: 1, alpha: 0.5 });
        else if (i % 3 === 1) g.poly([gx + 8, back + 1, gx + 15, back + 9, gx + 8, back + 17, gx + 1, back + 9]).fill(col);
        else g.roundRect(gx + 2, back + 3, 12, 12, 3).fill(col);
      }
      const keeper = new Player(0x5fe3ff, { jacket: 0x1f5a44, hairStyle: 'sidePart', hair: 0xcfd6e0, accessory: 'bowTie', skin: 0xd9a27a });
      keeper.view.position.set(x - cw * 0.18, T - 26);
      keeper.faceTowards(Math.PI / 2);
      c.addChild(keeper.view);
      const top = new Graphics();
      top.roundRect(L + 4, T + 8, cw, ch, 10).fill({ color: 0x000000, alpha: 0.4 });
      top.roundRect(L, T, cw, ch, 10).fill(0x4a2414).stroke({ color: COLORS.brass, width: 3 });
      // Glass top with the goods under it.
      top.roundRect(L + 10, T + 8, cw - 20, ch - 22, 6).fill(0x1d3a44).stroke({ color: 0xbfe6ff, width: 1.5, alpha: 0.6 });
      for (let i = 0; i < Math.floor((cw - 40) / 34); i++) {
        const gx = L + 28 + i * 34;
        const gy = T + 8 + (ch - 22) / 2;
        const col = goods[(i + 3) % goods.length];
        if (i % 2) top.circle(gx, gy, 7).fill(col).stroke({ color: 0xffffff, width: 1, alpha: 0.5 });
        else top.poly([gx, gy - 9, gx + 7, gy, gx, gy + 9, gx - 7, gy]).fill(col).stroke({ color: 0xffffff, width: 1, alpha: 0.5 });
      }
      top.poly([L + 16, T + 10, L + 46, T + 10, L + 30, T + ch - 16, L + 12, T + ch - 16]).fill({ color: 0xffffff, alpha: 0.1 });
      // Brass till on the right.
      top.roundRect(L + cw - 54, T - 14, 40, 30, 6).fill(COLORS.brass).stroke({ color: COLORS.brassDark, width: 2 });
      top.rect(L + cw - 48, T - 9, 28, 10).fill(0x2a1a10);
      top.rect(L + cw - 6, T + 10, 3, 3).fill(COLORS.brassDark);
      c.addChild(top);
      const label = new Text({ text: 'ANDENKEN · MONDSTEINE', style: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 1 } });
      label.anchor.set(0.5);
      label.position.set(x, T + ch - 7);
      c.addChild(label);
      const tillGlow = glow(c, L + cw - 34, T - 4, 70, COLORS.lamp, 0);
      const kick = kicker(1200);
      return {
        view: c,
        layer: 'entities',
        obstacles: [{ x: L - 10, y: WALL_H, w: cw + 20, h: T + ch - WALL_H }],
        z: T + ch,
        update: (time, dt) => {
          const kk = kick.step(dt);
          // Idle: looks around now and then; when poked, turns to the player and hops a little.
          if (kk > 0) keeper.faceTowards(Math.PI / 2);
          else keeper.faceTowards(Math.PI / 2 + Math.sin(time * 0.4) * 0.7 * (Math.sin(time * 0.13) > 0.3 ? 1 : 0));
          keeper.update(dt, null);
          keeper.view.scale.set(1 + Math.sin(kk * Math.PI * 2) * 0.06);
          tillGlow.alpha = kk * 0.7;
        },
        poke: kick.poke,
      };
    }
    case 'reception': {
      // Curved concierge desk with a bell and the guest book; the concierge stands behind it.
      const r = w || 80;
      const host = new Player(0xff5fa2, { outfit: 'dress', jacket: 0x1d2a4a, hairStyle: 'bun', hair: 0x1b1b22, skin: 0xc68a5e });
      host.view.position.set(x, y - 34);
      host.faceTowards(Math.PI / 2);
      c.addChild(host.view);
      const desk = new Graphics();
      desk.moveTo(x - r + 4, y + 8).arc(x + 4, y + 8, r, Math.PI, 0, true).lineTo(x + r - 22, y + 8).arc(x + 4, y + 8, r - 26, 0, Math.PI).closePath().fill({ color: 0x000000, alpha: 0.4 });
      desk.moveTo(x - r, y).arc(x, y, r, Math.PI, 0, true).lineTo(x + r - 26, y).arc(x, y, r - 26, 0, Math.PI).closePath().fill(0x3a2010).stroke({ color: COLORS.brass, width: 3 });
      desk.moveTo(x - r + 6, y).arc(x, y, r - 6, Math.PI, 0, true).stroke({ color: COLORS.brassDark, width: 1.5 });
      // Guest book, a pen and the brass bell.
      desk.roundRect(x - 52, y + 30, 34, 24, 3).fill(0xfff6e6).stroke({ color: 0x6b1a2e, width: 2 });
      desk.rect(x - 35.5, y + 30, 1, 24).fill({ color: 0x000000, alpha: 0.4 });
      for (let k = 0; k < 4; k++) desk.rect(x - 49, y + 35 + k * 5, 11, 1).fill({ color: 0x3a3040, alpha: 0.5 });
      desk.moveTo(x - 14, y + 34).lineTo(x - 4, y + 48).stroke({ color: COLORS.brass, width: 2 });
      desk.circle(x + 38, y + 40, 10).fill(COLORS.brass).stroke({ color: COLORS.brassDark, width: 2 });
      desk.circle(x + 35, y + 37, 3).fill({ color: 0xffffff, alpha: 0.5 });
      desk.circle(x + 38, y + 40, 2.5).fill(COLORS.brassDark);
      c.addChild(desk);
      const label = new Text({ text: 'EMPFANG', style: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 2 } });
      label.anchor.set(0.5);
      label.position.set(x, y + r + 12);
      c.addChild(label);
      const kick = kicker(900);
      return {
        view: c,
        layer: 'entities',
        obstacles: [{ x: x - r, y: y - 60, w: r * 2, h: r + 60 }],
        z: y + r,
        update: (time, dt) => {
          const kk = kick.step(dt);
          host.faceTowards(Math.PI / 2 + (kk > 0 ? 0 : Math.sin(time * 0.3) * 0.5));
          host.update(dt, null);
          host.view.scale.set(1 + Math.sin(kk * Math.PI * 2) * 0.05);
        },
        poke: kick.poke,
      };
    }
    case 'wardrobe': {
      // Changing booth: velvet curtain on a brass rail, a standing mirror and a hat stand.
      const bw = w || 150;
      const bh = h || 110;
      const L = x - bw / 2;
      const T = y - bh / 2;
      shadow(g, x, y, bw / 2 + 6, bh / 2, 0.3);
      g.roundRect(L, T, bw, bh, 8).fill(0x1b1013);
      g.roundRect(L + 6, T + 6, bw - 12, bh - 12, 6).fill(shade(t.carpet, -0.4));
      // A stool inside.
      g.circle(x, T + bh * 0.45, 13).fill(t.sofa ?? 0x5a1a3a).stroke({ color: COLORS.brassDark, width: 2 });
      g.roundRect(L - 3, T - 3, bw + 6, bh + 6, 10).stroke({ color: COLORS.brass, width: 4 });
      const curtain = new Graphics();
      const col = t.curtain ?? 0x8a1a2e;
      const drawCurtain = (open: number) => {
        curtain.clear();
        // Folds along the front, bunched to the left when open.
        const span = (bw - 8) * (1 - open * 0.75);
        const n = 9;
        for (let i = 0; i < n; i++) {
          const fx = L + 4 + (span / n) * i;
          curtain.roundRect(fx, T + bh - 22, span / n + 2, 24, 4).fill(i % 2 ? col : shade(col, -0.25));
          curtain.rect(fx + 2, T + bh - 20, 2, 20).fill({ color: 0xffffff, alpha: 0.12 });
        }
        curtain.rect(L, T + bh - 24, bw, 3).fill(COLORS.brass);
        for (let i = 0; i <= 8; i++) curtain.circle(L + 4 + (span / 8) * i, T + bh - 23, 2.4).fill(COLORS.brassDark);
      };
      drawCurtain(0.35);
      c.addChild(curtain);
      // Standing mirror to the right.
      const mx = L + bw + 34;
      g.ellipse(mx + 3, y + 22, 22, 9).fill({ color: 0x000000, alpha: 0.3 });
      g.roundRect(mx - 20, y - 30, 40, 54, 18).fill(COLORS.brassDark);
      g.roundRect(mx - 16, y - 26, 32, 46, 15).fill(0x9ab8d0);
      g.poly([mx - 10, y - 18, mx - 2, y - 22, mx - 12, y + 10]).fill({ color: 0xffffff, alpha: 0.35 });
      const shine = glow(c, mx, y - 4, 70, 0xdff6ff, 0.15);
      // Hat stand to the left with a top hat and a scarf.
      const hx = L - 30;
      g.circle(hx + 2, y + 4, 14).fill({ color: 0x000000, alpha: 0.3 });
      g.circle(hx, y, 12).fill(0x3a2010).stroke({ color: COLORS.brass, width: 2 });
      g.circle(hx, y, 8).fill(0x1b1b22);
      g.circle(hx, y, 5).fill(0x2a2a30);
      g.moveTo(hx + 6, y + 4).bezierCurveTo(hx + 18, y + 12, hx + 10, y + 26, hx + 16, y + 34).stroke({ color: 0xc0504a, width: 5, cap: 'round' });
      const label = new Text({ text: 'UMKLEIDE', style: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '700', fill: 0xfff1c4, letterSpacing: 2 } });
      label.anchor.set(0.5);
      label.position.set(x, T - 12);
      c.addChild(label);
      const kick = kicker(1000);
      return {
        view: c,
        layer: 'entities',
        obstacles: [{ x: L - 44, y: T, w: bw + 100, h: bh }],
        z: T + bh,
        update: (time, dt) => {
          const kk = kick.step(dt);
          drawCurtain(0.35 + Math.sin(kk * Math.PI) * 0.6 + Math.sin(time * 0.9) * 0.02);
          shine.alpha = 0.12 + Math.sin(time * 1.4) * 0.05 + kk * 0.3;
        },
        poke: kick.poke,
      };
    }
    case 'clothesRack': {
      // A brass rail of suits and dresses that sway a little.
      const rw = w || 120;
      shadow(g, x, y, rw / 2 + 6, 14, 0.3);
      g.circle(x - rw / 2, y, 5).fill(COLORS.brassDark);
      g.circle(x + rw / 2, y, 5).fill(COLORS.brassDark);
      const cols = [0x2a1630, 0x1f5a44, 0xc0504a, 0x2f4aa0, 0xe8e0d0, 0x5a2a7a, 0xc9962e, 0x1b1b22];
      const hangers: Graphics[] = [];
      for (let i = 0; i < Math.floor(rw / 14); i++) {
        const hg = new Graphics();
        const col = cols[(i + Math.floor(rnd() * 3)) % cols.length];
        hg.roundRect(-5, -14, 10, 28, 3).fill(col).stroke({ color: OUTLINE, width: 1, alpha: 0.5 });
        hg.rect(-1, -14, 2, 10).fill({ color: 0xfff6e6, alpha: 0.6 });
        hg.position.set(x - rw / 2 + 10 + i * 14, y);
        c.addChild(hg);
        hangers.push(hg);
      }
      const rail = new Graphics().rect(x - rw / 2, y - 1.5, rw, 3).fill(COLORS.brass);
      c.addChild(rail);
      const ph = rnd() * 10;
      return ent([{ x: x - rw / 2 - 6, y: y - 16, w: rw + 12, h: 32 }], y + 16, (time) => hangers.forEach((hg, i) => (hg.rotation = Math.sin(time * 1.2 + i * 0.7 + ph) * 0.06)));
    }
    case 'jukebox': {
      // Arched jukebox with bubbling colour tubes and a spinning record under a glass dome.
      const jw = 76;
      const jh = 64;
      shadow(g, x, y, jw / 2 + 4, 18);
      g.moveTo(x - jw / 2, y + jh / 2).lineTo(x - jw / 2, y - jh / 2 + 30).arc(x, y - jh / 2 + 30, jw / 2, Math.PI, 0).lineTo(x + jw / 2, y + jh / 2).closePath().fill(0x4a2414).stroke({ color: COLORS.brass, width: 3 });
      const tubes = new Graphics();
      c.addChild(tubes);
      const face = new Graphics();
      face.moveTo(x - jw / 2 + 10, y + jh / 2 - 6).lineTo(x - jw / 2 + 10, y - jh / 2 + 30).arc(x, y - jh / 2 + 30, jw / 2 - 10, Math.PI, 0).lineTo(x + jw / 2 - 10, y + jh / 2 - 6).closePath().fill(0x1b1013);
      face.circle(x, y - 2, 20).fill({ color: 0x9ab8d0, alpha: 0.25 }).stroke({ color: 0xbfe6ff, width: 1.5, alpha: 0.7 });
      face.rect(x - 22, y + 20, 44, 8).fill(COLORS.brass);
      for (let i = 0; i < 5; i++) face.circle(x - 16 + i * 8, y + 24, 2).fill(0xfff1c4);
      c.addChild(face);
      const rec = new Graphics();
      rec.circle(0, 0, 15).fill(0x14080f);
      for (const rr of [12, 9, 6]) rec.circle(0, 0, rr).stroke({ color: 0x3a3040, width: 0.8 });
      rec.circle(0, 0, 4).fill(COLORS.red);
      rec.rect(-1, -14, 2, 5).fill({ color: 0xffffff, alpha: 0.4 });
      rec.position.set(x, y - 2);
      c.addChild(rec);
      const gl = glow(c, x, y - 10, 170, 0xff5fa2, 0.25);
      const hues = [0xff5fa2, 0xffcf7a, 0x5fe3ff, 0x7bd47b, 0xc9a0ff];
      const kick = kicker(1500);
      let spin = 0;
      return {
        view: c,
        layer: 'entities',
        obstacles: [box(jw + 4, jh)],
        z: y + jh / 2,
        update: (time, dt) => {
          const kk = kick.step(dt);
          spin += dt * (0.004 + kk * 0.03);
          rec.rotation = spin;
          tubes.clear();
          const k = Math.floor(time * 2 + kk * 10) % hues.length;
          tubes.moveTo(x - jw / 2 + 5, y + jh / 2 - 4).lineTo(x - jw / 2 + 5, y - jh / 2 + 30).arc(x, y - jh / 2 + 30, jw / 2 - 5, Math.PI, 0).lineTo(x + jw / 2 - 5, y + jh / 2 - 4).stroke({ color: hues[k], width: 4, alpha: 0.9 });
          gl.tint = hues[k];
          gl.alpha = 0.22 + Math.sin(time * 3) * 0.04 + kk * 0.35;
          face.scale.set(1);
        },
        poke: kick.poke,
      };
    }
    case 'entrance': {
      // Revolving brass door in the front wall, with a doormat; y is the inner face of the wall.
      const r = 50;
      const wy = y;
      g.rect(x - r - 26, wy - 4, (r + 26) * 2, 40).fill(0x0b0609);
      g.roundRect(x - 90, wy - 64, 180, 52, 8).fill(0x2a1608).stroke({ color: COLORS.brass, width: 2 });
      for (let k = 0; k < 160; k += 8) g.rect(x - 84 + k, wy - 58, 4, 40).fill({ color: COLORS.brass, alpha: 0.2 });
      const mat = new Text({ text: 'WILLKOMMEN', style: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700', fill: COLORS.brass, letterSpacing: 3 } });
      mat.anchor.set(0.5);
      mat.position.set(x, wy - 38);
      c.addChild(mat);
      g.circle(x, wy + 14, r + 4).stroke({ color: COLORS.brass, width: 4 });
      g.circle(x, wy + 14, r).fill({ color: 0x9ab8d0, alpha: 0.12 });
      const wings = new Graphics();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        wings.moveTo(0, 0).lineTo(Math.cos(a) * r, Math.sin(a) * r).stroke({ color: 0xbfe6ff, width: 5, alpha: 0.55 });
        wings.moveTo(0, 0).lineTo(Math.cos(a) * r, Math.sin(a) * r).stroke({ color: COLORS.brass, width: 1.5 });
      }
      wings.circle(0, 0, 7).fill(COLORS.brass);
      wings.position.set(x, wy + 14);
      c.addChild(wings);
      g.rect(x - r - 30, wy - 2, 12, 34).fill(COLORS.brass);
      g.rect(x + r + 18, wy - 2, 12, 34).fill(COLORS.brass);
      glow(c, x, wy - 10, 260, COLORS.lamp, 0.18);
      const kick = kicker(2500);
      return {
        view: c,
        layer: 'entities',
        obstacles: [],
        z: wy + 60,
        update: (time, dt) => (wings.rotation += dt * (0.0003 + kick.step(dt) * 0.004)),
        poke: kick.poke,
      };
    }
    case 'plaque': {
      // Brass house rules on the back wall.
      const pw = w || 180;
      const T = 30;
      g.rect(x - pw / 2 + 3, T + 4, pw, 62).fill({ color: 0x000000, alpha: 0.4 });
      g.roundRect(x - pw / 2, T, pw, 62, 6).fill(COLORS.brass).stroke({ color: COLORS.brassDark, width: 2 });
      g.roundRect(x - pw / 2 + 5, T + 5, pw - 10, 52, 4).stroke({ color: COLORS.brassDark, width: 1 });
      for (const sx of [x - pw / 2 + 9, x + pw / 2 - 9]) g.circle(sx, T + 31, 2.5).fill(COLORS.brassDark);
      const t1 = new Text({ text: 'HAUSORDNUNG', style: { fontFamily: FONT_BODY, fontSize: 13, fontWeight: '700', fill: 0x3a2008, letterSpacing: 2 } });
      t1.anchor.set(0.5);
      t1.position.set(x, T + 15);
      const t2 = new Text({ text: 'Offene Quoten.\nJeder Abend darf enden.', style: { fontFamily: FONT_BODY, fontSize: 12, fontWeight: '600', fill: 0x3a2008, align: 'center', lineHeight: 14 } });
      t2.anchor.set(0.5);
      t2.position.set(x, T + 40);
      c.addChild(t1, t2);
      return { view: c, layer: 'wall', obstacles: [] };
    }
    case 'achievementWall':
      return null; // built by the room itself (it shows the player's achievements)
    case 'trophyShelf':
      return null; // built by the room itself (it shows the player's trophies)
  }
  return null;
}

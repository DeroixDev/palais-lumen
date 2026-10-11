// Painted parts of Straßenwürfel: the street scene (brick wall, cobbles, chalk boxes), the
// bone dice, the point puck and the station on the casino floor.

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, paint, propSprite, rgb, rrect, seeded, shadow, vgrad, type Ctx } from '../../world/painted/brush';

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

// ---- Scene layout ---------------------------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StreetLayout {
  sw: number;
  sh: number;
  /** Bottom of the wall = the curb the dice bounce off. */
  wallH: number;
  /** Point boxes for 4, 5, 6, 8, 9, 10. */
  boxes: Box[];
  field: Box;
  line: Box;
  slate: Box;
  lantern: { x: number; y: number };
  /** Size of a die. */
  die: number;
  /** Where the dice may come to rest. */
  rest: Box;
  lineChip: { x: number; y: number };
  fieldChip: { x: number; y: number };
  puckHome: { x: number; y: number };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function streetLayout(sw: number, sh: number, tall: boolean): StreetLayout {
  const wallH = Math.round(clamp(sh * 0.2, tall ? 92 : 76, 124));
  const m = 12;
  const bh = Math.round(clamp(sh * 0.12, 46, 74));
  const by = wallH + 10;
  const gap = 8;
  const bw = (sw - m * 2 - gap * 5) / 6;
  const boxes = Array.from({ length: 6 }, (_, i) => ({ x: m + i * (bw + gap), y: by, w: bw, h: bh }));
  const lh = Math.round(clamp(sh * 0.12, 50, 72));
  const line = { x: m, y: sh - lh - 10, w: sw - m * 2, h: lh };
  const fh = Math.round(clamp(sh * 0.15, 58, 94));
  const fw = tall ? sw - m * 2 : Math.min(sw * 0.62, 640);
  const field = { x: m, y: line.y - fh - 10, w: fw, h: fh };
  const die = Math.round(clamp(Math.min(sw * 0.13, sh * 0.13), 42, 74));
  const slateW = Math.round(tall ? sw - Math.min(120, sw * 0.3) : clamp(sw * 0.4, 150, 320));
  const slate = { x: 14, y: 8, w: slateW, h: wallH - 26 };
  const rest = { x: die * 0.9, y: by + bh + die * 0.75, w: sw - die * 1.8, h: Math.max(die, field.y + fh * 0.6 - (by + bh + die * 0.75)) };
  return {
    sw,
    sh,
    wallH,
    boxes,
    field,
    line,
    slate,
    lantern: { x: sw - Math.min(70, sw * 0.14), y: Math.round(wallH * 0.42) },
    die,
    rest,
    lineChip: { x: line.x + line.w * (tall ? 0.62 : 0.5), y: line.y + lh / 2 },
    fieldChip: { x: field.x + field.w - Math.min(54, field.w * 0.14), y: field.y + fh / 2 },
    puckHome: { x: line.x + line.w - 34, y: line.y + lh / 2 },
  };
}

// ---- Chalk ----------------------------------------------------------------------------------------

const CHALK = 'rgba(244,238,222,0.82)';

/** A chalk stroke along the current path: a soft wide pass and a crisp narrow one. */
function chalkStroke(c: Ctx, w = 3) {
  c.strokeStyle = 'rgba(244,238,222,0.22)';
  c.lineWidth = w * 2.2;
  c.stroke();
  c.strokeStyle = CHALK;
  c.lineWidth = w;
  c.stroke();
}

function chalkText(c: Ctx, text: string, x: number, y: number, size: number, maxW: number, align: CanvasTextAlign = 'center') {
  c.save();
  c.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  c.textAlign = align;
  c.textBaseline = 'middle';
  const w = c.measureText(text).width;
  if (w > maxW) {
    c.translate(x, y);
    c.scale(maxW / w, 1);
    c.translate(-x, -y);
  }
  c.fillStyle = 'rgba(244,238,222,0.25)';
  c.fillText(text, x + 1, y + 1);
  c.fillStyle = CHALK;
  c.fillText(text, x, y);
  c.restore();
}

/** Rubs little holes into chalk so it looks dusty. */
function chalkDust(c: Ctx, b: Box, seed: number) {
  const r = seeded(seed);
  c.save();
  c.globalCompositeOperation = 'destination-out';
  const n = Math.round((b.w * b.h) / 90);
  for (let i = 0; i < n; i++) {
    c.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.4})`;
    c.fillRect(b.x + r() * b.w, b.y + r() * b.h, 1 + r() * 1.5, 1 + r());
  }
  c.restore();
}

// ---- Scene ----------------------------------------------------------------------------------------

/** Cobbles, wall and chalk, baked once per scene size. */
export function streetTexture(L: StreetLayout, res = 2) {
  const { sw, sh, wallH } = L;
  return paint(sw, sh, (c) => {
    // Cobbles: rows get smaller towards the wall (a little perspective).
    c.fillStyle = '#1d1622';
    c.fillRect(0, 0, sw, sh);
    const r = seeded(31);
    let y = sh + 4;
    let row = 0;
    while (y > wallH - 6) {
      const k = (y - wallH) / (sh - wallH);
      const rh = 14 + 16 * Math.max(0, k);
      const rw = rh * (1.5 + r() * 0.3);
      let x = row % 2 ? -rw / 2 : 0;
      while (x < sw + rw) {
        const w = rw * (0.8 + r() * 0.4);
        const base = [0x4a4058, 0x433a50, 0x504660, 0x3c3448][Math.floor(r() * 4)];
        rrect(c, x + 1.5, y - rh + 1.5, w - 3, rh - 3, rh * 0.38);
        const g = c.createLinearGradient(0, y - rh, 0, y);
        g.addColorStop(0, rgb(light(base, 0.22)));
        g.addColorStop(0.5, rgb(base));
        g.addColorStop(1, rgb(dark(base, 0.45)));
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = 'rgba(10,6,14,0.7)';
        c.lineWidth = 1.4;
        c.stroke();
        x += w;
      }
      y -= rh;
      row++;
    }
    // Lantern light pool on the stones, cold moonlight from the left.
    glowAt(c, L.lantern.x, wallH + 30, sw * 0.7, sh * 0.75, 0xffc070, 0.32, 'lighter');
    glowAt(c, sw * 0.1, sh * 0.6, sw * 0.5, sh * 0.5, 0x6070c0, 0.12, 'lighter');
    // Brick wall.
    c.fillStyle = '#3a1c1c';
    c.fillRect(0, 0, sw, wallH);
    const br = seeded(7);
    const bh = 15;
    for (let yy = 0, i = 0; yy < wallH - 10; yy += bh, i++) {
      const bw = 40;
      for (let x = i % 2 ? -bw / 2 : 0; x < sw; x += bw) {
        const col = [0x7a3426, 0x6a2c22, 0x84402c, 0x5e2a24][Math.floor(br() * 4)];
        rrect(c, x + 1.5, yy + 1.5, bw - 3, bh - 3, 2.5);
        c.fillStyle = rgb(col);
        c.fill();
        c.fillStyle = 'rgba(255,220,180,0.08)';
        c.fillRect(x + 2, yy + 2, bw - 4, 2);
      }
    }
    // Night falls from the top; the lantern warms the wall.
    const ng = c.createLinearGradient(0, 0, 0, wallH);
    ng.addColorStop(0, 'rgba(10,6,24,0.75)');
    ng.addColorStop(1, 'rgba(10,6,24,0.15)');
    c.fillStyle = ng;
    c.fillRect(0, 0, sw, wallH);
    glowAt(c, L.lantern.x, L.lantern.y, 190, 110, 0xffb860, 0.45, 'lighter');
    // Chalk sun scribbled on the bricks.
    const mx = L.slate.x + L.slate.w + (L.lantern.x - (L.slate.x + L.slate.w)) * 0.45;
    if (L.lantern.x - (L.slate.x + L.slate.w) > 140) {
      c.save();
      c.translate(mx, wallH * 0.48);
      c.beginPath();
      c.arc(0, 10, 9, Math.PI, Math.PI * 2);
      chalkStroke(c, 1.8);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + ((i + 0.5) / 7) * Math.PI;
        c.beginPath();
        c.moveTo(Math.cos(a) * 13, 10 + Math.sin(a) * 13);
        c.lineTo(Math.cos(a) * (i % 2 ? 21 : 25), 10 + Math.sin(a) * (i % 2 ? 21 : 25));
        chalkStroke(c, 1.6);
      }
      c.beginPath();
      c.moveTo(-26, 10);
      c.lineTo(26, 10);
      chalkStroke(c, 1.6);
      c.restore();
    }
    // Curb: a long stone ledge the dice knock against.
    rrect(c, -8, wallH - 14, sw + 16, 18, 5);
    fillInk(c, vgrad(c, wallH - 14, wallH + 4, 0x6a6276, 0.35, 0.4), 2);
    c.fillStyle = 'rgba(255,244,220,0.25)';
    c.fillRect(0, wallH - 12, sw, 2);
    shadow(c, sw / 2, wallH + 6, sw * 0.6, 8, 0.5);
    grain(c, 0, 0, sw, wallH, Math.round(sw / 4), 5, 0.06);

    // Gas lantern on its bracket.
    const lx = L.lantern.x;
    const ly = L.lantern.y;
    c.strokeStyle = INK;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(lx + 34, ly - 22);
    c.lineTo(lx, ly - 22);
    c.lineTo(lx, ly - 14);
    c.stroke();
    c.strokeStyle = gold(c, lx, ly - 30, lx + 34, ly - 14);
    c.lineWidth = 2.6;
    c.stroke();
    c.beginPath();
    c.moveTo(lx - 12, ly - 14);
    c.lineTo(lx + 12, ly - 14);
    c.lineTo(lx + 9, ly + 16);
    c.lineTo(lx - 9, ly + 16);
    c.closePath();
    fillInk(c, 'rgba(255,226,150,0.9)', 2);
    glowAt(c, lx, ly, 14, 18, 0xffffff, 0.8, 'lighter');
    rrect(c, lx - 15, ly - 20, 30, 7, 3);
    fillInk(c, gold(c, lx - 15, ly - 20, lx + 15, ly - 13), 1.6);
    rrect(c, lx - 11, ly + 15, 22, 6, 2);
    fillInk(c, gold(c, lx - 11, ly + 15, lx + 11, ly + 21), 1.6);

    // Slate for the readout, hung on a nail.
    const s = L.slate;
    c.strokeStyle = 'rgba(30,20,10,0.9)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(s.x + s.w * 0.3, s.y + 2);
    c.lineTo(s.x + s.w / 2, s.y - 6);
    c.lineTo(s.x + s.w * 0.7, s.y + 2);
    c.stroke();
    shadow(c, s.x + s.w / 2 + 4, s.y + s.h + 4, s.w * 0.55, 8, 0.5);
    rrect(c, s.x, s.y, s.w, s.h, 6);
    fillInk(c, vgrad(c, s.y, s.y + s.h, 0x7a4a24, 0.3, 0.4), 2.2);
    rrect(c, s.x + 6, s.y + 6, s.w - 12, s.h - 12, 3);
    const sg = c.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h);
    sg.addColorStop(0, '#2e3434');
    sg.addColorStop(1, '#1a1e20');
    c.fillStyle = sg;
    c.fill();
    c.save();
    c.clip();
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.ellipse(s.x + s.w * (0.2 + i * 0.13), s.y + s.h * (0.3 + (i % 3) * 0.2), 22, 6, 0.2, 0, Math.PI * 2);
      c.fillStyle = 'rgba(240,236,220,0.035)';
      c.fill();
    }
    c.restore();
    c.fillStyle = gold(c, s.x + s.w / 2 - 3, s.y - 9, s.x + s.w / 2 + 3, s.y - 3);
    ellipse(c, s.x + s.w / 2, s.y - 6, 3, 3);
    c.fill();

    // Chalk: point boxes.
    const names = ['4', '5', 'SECHS', '8', 'NEUN', '10'];
    L.boxes.forEach((b, i) => {
      rrect(c, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 8);
      chalkStroke(c, 2.4);
      const size = Math.min(b.h * 0.56, names[i].length > 2 ? b.w * 0.36 : b.h * 0.6);
      chalkText(c, names[i], b.x + b.w / 2, b.y + b.h / 2 + 1, size, b.w - 10);
    });
    // Field.
    const f = L.field;
    rrect(c, f.x + 2, f.y + 2, f.w - 4, f.h - 4, 14);
    chalkStroke(c, 2.4);
    const fs = Math.min(f.h * 0.34, 30);
    chalkText(c, 'FELD', f.x + 16, f.y + f.h * 0.3, fs, f.w * 0.3, 'left');
    const nums = ['2', '3', '4', '9', '10', '11', '12'];
    const nx0 = f.x + 16;
    const nx1 = f.x + f.w - Math.min(108, f.w * 0.28);
    const ny = f.y + f.h * 0.7;
    const step = (nx1 - nx0) / nums.length;
    const ns = Math.min(f.h * 0.34, step * 0.62, 28);
    nums.forEach((n, i) => {
      const x = nx0 + step * (i + 0.5);
      chalkText(c, n, x, ny, ns, step - 4);
      if (n === '2' || n === '12') {
        ellipse(c, x, ny, Math.max(ns * 0.75, step * 0.42), ns * 0.62);
        chalkStroke(c, 1.6);
      }
    });
    chalkText(c, '2 und 12 zahlen doppelt', f.x + 16 + Math.min(f.w * 0.3, fs * 3) + 14, f.y + f.h * 0.3, Math.min(fs * 0.62, 18), nx1 - (f.x + 16 + Math.min(f.w * 0.3, fs * 3) + 14), 'left');
    // Line.
    const l = L.line;
    c.beginPath();
    c.moveTo(l.x + 4, l.y + 4);
    c.lineTo(l.x + l.w - 4, l.y + 4);
    chalkStroke(c, 3);
    c.beginPath();
    c.moveTo(l.x + 4, l.y + l.h - 4);
    c.lineTo(l.x + l.w - 4, l.y + l.h - 4);
    chalkStroke(c, 3);
    const ls = Math.min(l.h * 0.5, 32);
    chalkText(c, 'LINIE', l.x + 16, l.y + l.h / 2, ls, l.w * 0.22, 'left');
    const lx0 = l.x + 16 + ls * 2.9 + 12;
    const lroom = L.lineChip.x - 46 - lx0;
    if (lroom > 170) chalkText(c, '7 · 11 gewinnt · Punkt zahlt 9:10', lx0, l.y + l.h / 2, Math.min(ls * 0.62, 19), lroom, 'left');
    for (const [i, b] of [...L.boxes, L.field, L.line].entries()) chalkDust(c, b, 3 + i);
  }, res);
}

// ---- Dice and puck ------------------------------------------------------------------------------------

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export const DIE_TEX = 72;

/** A bone die seen from above, soft bevel, plum pips (the 1 in house red). */
export function dieTexture(v: number) {
  return cached(`die-${v}`, () =>
    paint(DIE_TEX, DIE_TEX, (c) => {
      const s = 58;
      const o = (DIE_TEX - s) / 2;
      rrect(c, o, o, s, s, 13);
      const g = c.createRadialGradient(o + s * 0.35, o + s * 0.3, 2, o + s / 2, o + s / 2, s * 0.75);
      g.addColorStop(0, '#fffdf4');
      g.addColorStop(0.6, '#f3e6c8');
      g.addColorStop(1, '#c8b08a');
      fillInk(c, g, 2.6);
      // Bevel: light edge top-left, shade bottom-right.
      c.save();
      rrect(c, o, o, s, s, 13);
      c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.lineWidth = 4;
      rrect(c, o + 2, o + 2, s, s, 13);
      c.stroke();
      c.strokeStyle = 'rgba(90,60,30,0.35)';
      c.lineWidth = 6;
      rrect(c, o - 3, o - 3, s, s, 13);
      c.stroke();
      c.restore();
      const step = s * 0.27;
      for (const [px, py] of PIPS[v]) {
        const x = DIE_TEX / 2 + px * step;
        const y = DIE_TEX / 2 + py * step;
        const r = v === 1 ? 8 : 5.6;
        ellipse(c, x, y, r, r);
        const pg = c.createRadialGradient(x - r * 0.3, y - r * 0.4, 0.5, x, y, r);
        if (v === 1) {
          pg.addColorStop(0, '#ff7a8a');
          pg.addColorStop(1, '#8a1022');
        } else {
          pg.addColorStop(0, '#6a3a6a');
          pg.addColorStop(1, '#1e0a1e');
        }
        c.fillStyle = pg;
        c.fill();
        ellipse(c, x + r * 0.25, y + r * 0.35, r * 0.7, r * 0.45);
        c.fillStyle = 'rgba(255,255,255,0.18)';
        c.fill();
      }
    }, 2),
  );
}

export const PUCK = 60;

/** The point puck: "AN" (white) or "AUS" (black) in a brass ring. */
export function puckTexture(on: boolean) {
  return cached(`puck-${on}`, () =>
    paint(PUCK + 8, PUCK + 12, (c) => {
      const cx = PUCK / 2 + 4;
      const cy = PUCK / 2 + 4;
      const r = PUCK / 2;
      glowAt(c, cx, cy + 5, r, r * 0.8, 0x05020a, 0.6);
      // Edge (thickness).
      ellipse(c, cx, cy + 4, r, r);
      c.fillStyle = on ? '#9a9080' : '#08060a';
      c.fill();
      ellipse(c, cx, cy, r, r);
      fillInk(c, gold(c, cx - r, cy - r, cx + r, cy + r), 2);
      ellipse(c, cx, cy, r - 6, r - 6);
      const g = c.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, r);
      g.addColorStop(0, on ? '#ffffff' : '#3a3440');
      g.addColorStop(1, on ? '#d8d0c0' : '#0e0a12');
      c.fillStyle = g;
      c.fill();
      c.font = `700 ${on ? 19 : 16}px Cinzel, Georgia, serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = on ? '#1a0c14' : '#fff3dc';
      c.fillText(on ? 'AN' : 'AUS', cx, cy + 1);
    }, 2),
  );
}

// ---- Station on the floor ----------------------------------------------------------------------------

/** A street corner in the casino: a stretch of brick wall with a gas lantern, cobbles, chalk and dice. */
function crapsStation(): PaintedStation {
  const W = 128;
  const H = 76;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H / 2, 200, 190, 100, 112, (x) => {
    shadow(x, 0, 30, 84, 26, 0.6);
    // Cobble patch.
    ellipse(x, 0, 8, 66, 34);
    x.fillStyle = '#2a2232';
    x.fill();
    x.save();
    ellipse(x, 0, 8, 66, 34);
    x.clip();
    const r = seeded(5);
    for (let yy = -30; yy < 46; yy += 9) {
      for (let xx = -70 + ((yy / 9) % 2) * 6; xx < 70; xx += 13) {
        rrect(x, xx + 1, yy + 1, 11, 7, 3);
        x.fillStyle = rgb([0x5a5068, 0x4c445a, 0x645a74][Math.floor(r() * 3)]);
        x.fill();
      }
    }
    glowAt(x, 34, -10, 70, 40, 0xffc070, 0.35, 'lighter');
    x.restore();
    ellipse(x, 0, 8, 66, 34);
    x.strokeStyle = INK;
    x.lineWidth = 2;
    x.stroke();
    // Chalk boxes and the line.
    x.strokeStyle = 'rgba(244,238,222,0.75)';
    x.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      rrect(x, -45 + i * 15, -16, 13, 10, 2);
      x.stroke();
    }
    x.beginPath();
    x.moveTo(-50, 30);
    x.quadraticCurveTo(0, 38, 50, 30);
    x.stroke();
    // Brick wall behind.
    rrect(x, -60, -64, 120, 46, 4);
    fillInk(x, vgrad(x, -64, -18, 0x7a3426, 0.15, 0.5), 2.2);
    x.save();
    rrect(x, -60, -64, 120, 46, 4);
    x.clip();
    x.strokeStyle = 'rgba(30,10,10,0.6)';
    x.lineWidth = 1.2;
    for (let yy = -64, i = 0; yy < -18; yy += 8, i++) {
      x.beginPath();
      x.moveTo(-60, yy);
      x.lineTo(60, yy);
      x.stroke();
      for (let xx = -60 + (i % 2) * 8; xx < 60; xx += 16) {
        x.beginPath();
        x.moveTo(xx, yy);
        x.lineTo(xx, yy + 8);
        x.stroke();
      }
    }
    glowAt(x, 40, -50, 50, 30, 0xffb860, 0.4, 'lighter');
    x.restore();
    // Curb.
    rrect(x, -64, -22, 128, 9, 3);
    fillInk(x, vgrad(x, -22, -13, 0x7a7286, 0.35, 0.4), 1.8);
    // Chalk sun on the wall.
    x.strokeStyle = 'rgba(244,238,222,0.7)';
    x.lineWidth = 1.2;
    x.beginPath();
    x.arc(-24, -40, 4, Math.PI, Math.PI * 2);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + ((i + 0.5) / 5) * Math.PI;
      x.moveTo(-24 + Math.cos(a) * 6, -40 + Math.sin(a) * 6);
      x.lineTo(-24 + Math.cos(a) * 10, -40 + Math.sin(a) * 10);
    }
    x.stroke();
    // Gas lantern on a bracket, rising over the wall.
    x.strokeStyle = INK;
    x.lineWidth = 3.5;
    x.beginPath();
    x.moveTo(50, -56);
    x.lineTo(50, -78);
    x.lineTo(38, -78);
    x.lineTo(38, -72);
    x.stroke();
    x.beginPath();
    x.moveTo(31, -72);
    x.lineTo(45, -72);
    x.lineTo(43, -54);
    x.lineTo(33, -54);
    x.closePath();
    fillInk(x, '#ffe6a0', 1.6);
    glowAt(x, 38, -63, 9, 11, 0xffffff, 0.9, 'lighter');
    rrect(x, 30, -76, 16, 5, 2);
    fillInk(x, gold(x, 30, -76, 46, -71), 1.2);
    // Two dice on the cobbles (5 and 2).
    for (const [dx, dy, v, rot] of [[-12, 8, 5, 0.3], [6, 14, 2, -0.2]] as const) {
      x.save();
      x.translate(dx, dy);
      x.rotate(rot);
      shadow(x, 2, 4, 8, 4, 0.5);
      rrect(x, -6, -6, 12, 12, 3);
      fillInk(x, '#f6ead0', 1.4);
      for (const [px, py] of PIPS[v]) {
        ellipse(x, px * 3, py * 3, 1.2, 1.2);
        x.fillStyle = '#2a102a';
        x.fill();
      }
      x.restore();
    }
    // An upturned crate to sit on.
    rrect(x, -62, 36, 26, 18, 2);
    fillInk(x, vgrad(x, 36, 54, 0x8a5a2a, 0.2, 0.4), 1.6);
    x.strokeStyle = 'rgba(40,20,8,0.7)';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(-62, 42);
    x.lineTo(-36, 42);
    x.moveTo(-62, 48);
    x.lineTo(-36, 48);
    x.stroke();
    // A coin stack on the line.
    for (let k = 0; k < 3; k++) {
      ellipse(x, 24, 30 - k * 2.2, 5, 2.6);
      x.fillStyle = '#e8b84a';
      x.fill();
      x.strokeStyle = 'rgba(80,50,10,0.8)';
      x.lineWidth = 0.7;
      x.stroke();
    }
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const g = new Sprite(glowTexture());
  g.anchor.set(0.5);
  g.position.set(W / 2 + 38, H / 2 - 63);
  g.width = 110;
  g.height = 90;
  g.tint = 0xffc070;
  g.alpha = 0.7;
  g.blendMode = 'add';
  lamp.addChild(g);
  c.addChild(lamp);
  c.labelY = H / 2 - 82;
  return c;
}

registerPaintedStation('craps', crapsStation);

export function drawCrapsStation() {
  return crapsStation();
}

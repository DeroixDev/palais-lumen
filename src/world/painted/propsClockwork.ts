// Painted pieces for floor 3, "Uhrwerk": brass, copper, steam and turning gears, in the slanted
// 3/4 view of the foyer. Each piece is painted once; gears, needles, hands and steam animate on top.
// Footprints, z, pokes and update behaviour match the flat versions in ../decor.ts.

import { Container, Graphics, Sprite } from 'pixi.js';
import type { DecorPlacement, RoomTheme } from '../../core/registry';
import { FONT_BODY, drawEmblem, glowTexture } from '../../core/fx';
import type { BuiltDecor } from '../decor';
import { P_WALL_H } from './foyerShell';
import { box, ent, glow, kicker } from './foyerProps';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, mix, propSprite, rgb, rim, rrect, seeded, shadow, vgrad, type Ctx } from './brush';

const COPPER = 0xc47a40;
const IRON = 0x3a3440;
const WOOD = 0x5a3220;
const RED = 0xc8243a;

// ---- Helpers ------------------------------------------------------------------------------------

/** Polished metal of any colour, lit from the upper left (like gold() but tinted). */
function metal(c: Ctx, x0: number, y0: number, x1: number, y1: number, col: number) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgb(light(col, 0.6)));
  g.addColorStop(0.25, rgb(light(col, 0.15)));
  g.addColorStop(0.55, rgb(dark(col, 0.3)));
  g.addColorStop(0.8, rgb(col));
  g.addColorStop(1, rgb(dark(col, 0.55)));
  return g;
}

/** A gear outline with trapezoid teeth: root radius r, tip radius ro. */
function gearPath(c: Ctx, r: number, ro: number, teeth: number) {
  const p = (Math.PI * 2) / teeth;
  c.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = i * p;
    const a0 = a - p * 0.27;
    const a1 = a - p * 0.15;
    const a2 = a + p * 0.15;
    const a3 = a + p * 0.27;
    if (i === 0) c.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    else c.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    c.lineTo(Math.cos(a1) * ro, Math.sin(a1) * ro);
    c.lineTo(Math.cos(a2) * ro, Math.sin(a2) * ro);
    c.lineTo(Math.cos(a3) * r, Math.sin(a3) * r);
    c.arc(0, 0, r, a3, a + p - p * 0.27);
  }
  c.closePath();
}

interface GearOpts {
  /** Tooth length (default 16% of r). */
  tooth?: number;
  spokes?: number;
  /** Colour seen through the spoke windows. */
  hole?: string;
  lw?: number;
  /** Light baked from the upper left; off for gears that turn (the light would turn with them). */
  lit?: boolean;
  /** Thin spokes with see-through windows (floor inlays). */
  open?: boolean;
}

/** A painted gear centred on (0, 0). */
function paintGear(c: Ctx, r: number, teeth: number, col: number, o: GearOpts = {}) {
  const ro = r + (o.tooth ?? Math.max(2.5, r * 0.16));
  const lw = o.lw ?? Math.max(1.2, Math.min(2.2, r * 0.08));
  const off = o.lit === false ? 0 : r * 0.35;
  gearPath(c, r, ro, teeth);
  const g = c.createRadialGradient(-off, -off, r * 0.05, 0, 0, ro);
  g.addColorStop(0, rgb(light(col, 0.5)));
  g.addColorStop(0.55, rgb(col));
  g.addColorStop(0.85, rgb(dark(col, 0.2)));
  g.addColorStop(1, rgb(dark(col, 0.4)));
  fillInk(c, g, lw);
  // Rim groove.
  c.beginPath();
  c.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  c.strokeStyle = rgb(dark(col, 0.45), 0.8);
  c.lineWidth = Math.max(1, r * 0.05);
  c.stroke();
  c.beginPath();
  c.arc(0, 0, r * 0.82 + Math.max(1, r * 0.05), 0, Math.PI * 2);
  c.strokeStyle = rgb(light(col, 0.5), 0.35);
  c.lineWidth = Math.max(0.6, r * 0.025);
  c.stroke();
  // Spoke windows.
  const n = o.spokes ?? 5;
  if (n > 0) {
    const rOut = o.open ? r * 0.74 : r * 0.7;
    const rIn = o.open ? r * 0.25 : r * 0.32;
    const sw = o.open ? 0.13 : 0.2 + 0.6 / n;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2 + sw;
      const a1 = ((k + 1) / n) * Math.PI * 2 - sw;
      c.beginPath();
      c.arc(0, 0, rOut, a0, a1);
      c.arc(0, 0, rIn, a1 - 0.08, a0 + 0.08, true);
      c.closePath();
      c.save();
      if (o.open) c.globalCompositeOperation = 'destination-out';
      c.fillStyle = o.hole ?? '#1a0e08';
      c.fill();
      c.restore();
      c.strokeStyle = INK;
      c.lineWidth = lw * 0.7;
      c.stroke();
    }
  }
  // Hub with a bolt.
  ellipse(c, 0, 0, r * 0.26, r * 0.26);
  const hg = c.createRadialGradient(-off * 0.3, -off * 0.3, 0, 0, 0, r * 0.26);
  hg.addColorStop(0, rgb(light(col, 0.6)));
  hg.addColorStop(1, rgb(dark(col, 0.25)));
  fillInk(c, hg, lw * 0.8);
  ellipse(c, 0, 0, r * 0.09, r * 0.09);
  c.fillStyle = rgb(dark(col, 0.6));
  c.fill();
}

/** A gear as its own sprite, centred, so it can turn. */
function gearSprite(r: number, teeth: number, col: number, o: GearOpts = {}) {
  const ro = r + (o.tooth ?? Math.max(2.5, r * 0.16)) + 3;
  return propSprite(0, 0, ro * 2, ro * 2, ro, ro, (c) => paintGear(c, r, teeth, col, { lit: false, ...o }), r < 14 ? 3 : 2);
}

/** A soft white puff of steam. */
function puff(v: Container) {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.tint = 0xf6eee6;
  s.alpha = 0;
  v.addChild(s);
  return s;
}

/** Rivets along the front half of an ellipse (a band around a cylinder). */
function rivetBand(c: Ctx, y: number, rx: number, ry: number, n: number, col: number) {
  c.beginPath();
  c.ellipse(0, y, rx, ry, 0, 0.04, Math.PI - 0.04);
  c.strokeStyle = rgb(dark(col, 0.45));
  c.lineWidth = 3.2;
  c.stroke();
  c.beginPath();
  c.ellipse(0, y - 1.4, rx - 0.5, ry, 0, 0.1, Math.PI - 0.1);
  c.strokeStyle = rgb(light(col, 0.45), 0.55);
  c.lineWidth = 1;
  c.stroke();
  for (let i = 0; i < n; i++) {
    const a = 0.2 + (i / (n - 1)) * (Math.PI - 0.4);
    const px = Math.cos(a) * rx;
    const py = y + Math.sin(a) * ry;
    const s = 0.6 + 0.4 * Math.sin(a);
    ellipse(c, px, py, 1.7 * s + 0.4, 1.7);
    c.fillStyle = rgb(light(col, 0.35));
    c.fill();
    ellipse(c, px + 0.5, py + 0.6, 0.9 * s, 0.8);
    c.fillStyle = rgb(dark(col, 0.5));
    c.fill();
  }
}

/** A round dial: bezel, face, ticks, and coloured green/red zones; centred on (cx, cy). */
function dial(c: Ctx, cx: number, cy: number, r: number, bezel: number, zones = true) {
  c.fillStyle = 'rgba(0,0,0,0.35)';
  ellipse(c, cx + 2, cy + 3, r + 4, r + 4);
  c.fill();
  ellipse(c, cx, cy, r + 3.5, r + 3.5);
  fillInk(c, metal(c, cx - r, cy - r, cx + r, cy + r, bezel), 1.6);
  ellipse(c, cx, cy, r, r);
  const fg = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 1, cx, cy, r);
  fg.addColorStop(0, '#fffdf4');
  fg.addColorStop(0.7, '#f4e6c8');
  fg.addColorStop(1, '#c9b48a');
  c.fillStyle = fg;
  c.fill();
  c.strokeStyle = rgb(dark(bezel, 0.5));
  c.lineWidth = 1;
  c.stroke();
  if (zones) {
    for (const [a0, a1, col] of [[Math.PI * 0.8, Math.PI * 1.6, '#2f7a3a'], [Math.PI * 1.6, Math.PI * 2.2, '#c8243a']] as const) {
      c.beginPath();
      c.arc(cx, cy, r * 0.72, a0, a1);
      c.strokeStyle = col;
      c.lineWidth = Math.max(1.6, r * 0.16);
      c.lineCap = 'butt';
      c.stroke();
      c.lineCap = 'round';
    }
  }
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.8 + (i / 10) * Math.PI * 1.4;
    const r0 = i % 5 === 0 ? r * 0.62 : r * 0.78;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    c.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
    c.strokeStyle = 'rgba(30,16,12,0.85)';
    c.lineWidth = i % 5 === 0 ? 1.4 : 0.8;
    c.stroke();
  }
}

/** Glass shine over a round face; painted as its own sprite so it sits above the hands. */
function glassShine(cx: number, cy: number, r: number) {
  return propSprite(cx, cy, r * 2 + 4, r * 2 + 4, r + 2, r + 2, (c) => {
    c.save();
    ellipse(c, 0, 0, r, r);
    c.clip();
    c.beginPath();
    c.arc(0, 0, r * 0.82, Math.PI * 1.05, Math.PI * 1.55);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = Math.max(1.4, r * 0.1);
    c.stroke();
    glowAt(c, -r * 0.35, -r * 0.4, r * 0.55, r * 0.4, 0xffffff, 0.22, 'lighter');
    c.restore();
  });
}

// ---- The pieces ---------------------------------------------------------------------------------

export function buildPaintedClockwork(d: DecorPlacement, t: RoomTheme): BuiltDecor[] | null {
  const { x, y } = d;
  const w = d.w ?? 0;
  const rnd = seeded(Math.round(x * 29 + y * 11));
  switch (d.kind) {
    case 'gearInlay': {
      const r = w || 70;
      const teeth = Math.round(r / 6);
      const S = 0.86; // The floor is seen slightly from the front.
      const col = t.carpetAccent;
      const v = new Container();
      const pad = r + 26;
      // The sunken ring the gear turns in.
      v.addChild(
        propSprite(x, y, pad * 2, pad * 2 * S, pad, pad * S, (c) => {
          c.scale(1, S);
          c.beginPath();
          c.arc(0, 0, r + 17, 0, Math.PI * 2);
          c.arc(0, 0, r - 2, 0, Math.PI * 2, true);
          c.fillStyle = rgb(dark(t.carpet, 0.5), 0.85);
          c.fill();
          ellipse(c, 0, 0, r + 17, r + 17);
          c.strokeStyle = metal(c, -r, -r, r, r, col);
          c.lineWidth = 4;
          c.stroke();
          c.beginPath();
          c.arc(0, 0, r + 19.5, Math.PI * 1.05, Math.PI * 1.6);
          c.strokeStyle = rgb(light(col, 0.5), 0.5);
          c.lineWidth = 1.2;
          c.stroke();
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            ellipse(c, Math.cos(a) * (r + 17), Math.sin(a) * (r + 17), 1.6, 1.6);
            c.fillStyle = rgb(light(col, 0.4));
            c.fill();
          }
          // Shadow cast into the recess.
          glowAt(c, 6, 8, r + 10, r + 10, 0x0a0410, 0.25);
        }),
      );
      const holder = new Container();
      holder.position.set(x, y);
      holder.scale.set(1, S);
      const gear = gearSprite(r, teeth, mix(col, t.carpet, 0.2), { tooth: 9, spokes: 6, open: true, lw: 2 });
      gear.alpha = 0.82;
      holder.addChild(gear);
      v.addChild(holder);
      // Light that stays put while the gear turns.
      const sheen = propSprite(x, y, pad * 2, pad * 2 * S, pad, pad * S, (c) => {
        c.scale(1, S);
        glowAt(c, -r * 0.35, -r * 0.4, r * 0.75, r * 0.55, 0xfff0d0, 0.2, 'lighter');
        glowAt(c, r * 0.3, r * 0.35, r * 0.8, r * 0.6, 0x0a0410, 0.18);
      });
      sheen.blendMode = 'add';
      v.addChild(sheen);
      const dir = d.r ? -1 : 1;
      return [{ view: v, layer: 'floor', obstacles: [], update: (time) => (gear.rotation = (time * 0.15 * dir * 60) / r) }];
    }

    case 'boiler': {
      const r = w || 40;
      const ry = r * 0.42;
      const by = r * 0.35; // Centre of the base, a little in front of the footprint centre.
      const pb = Math.max(22, r * 0.55); // Firebox plinth height.
      const H = r * 1.9; // Tank height.
      const y0 = by - pb;
      const y1 = y0 - H;
      const gx = r * 0.32;
      const gy = y0 - H * 0.55;
      const gr = Math.max(8, r * 0.24);
      const chx = r * 0.36;
      const chTop = y1 - r * 0.5 - r * 0.55;
      const v = new Container();
      v.addChild(
        propSprite(x, y, r * 2 + 70, r * 4.4 + 60, r + 35, r * 3.6 + 20, (c) => {
          shadow(c, 4, by + 4, r + 18, ry + 10, 0.6);
          // Pipe out of the side and down to the floor.
          c.beginPath();
          c.moveTo(r - 2, y0 - H * 0.72);
          c.lineTo(r + 10, y0 - H * 0.72);
          c.quadraticCurveTo(r + 20, y0 - H * 0.72, r + 20, y0 - H * 0.6);
          c.lineTo(r + 20, by + ry * 0.4);
          c.strokeStyle = INK;
          c.lineWidth = 9;
          c.stroke();
          c.strokeStyle = metal(c, r + 16, 0, r + 24, 0, COPPER);
          c.lineWidth = 6;
          c.stroke();
          rrect(c, r + 14, by + ry * 0.4 - 4, 12, 6, 2);
          fillInk(c, metal(c, r + 14, 0, r + 26, 0, IRON), 1.2);
          // Iron firebox plinth with feet.
          for (const fx of [-r * 0.8, r * 0.8]) {
            rrect(c, fx - 5, by + ry * 0.55 - 6, 10, 9, 3);
            fillInk(c, '#1e1a22', 1.4);
          }
          c.beginPath();
          c.ellipse(0, by, r * 1.04, ry * 1.04, 0, 0, Math.PI);
          c.lineTo(-r * 1.04, y0);
          c.ellipse(0, y0, r * 1.04, ry * 1.04, 0, Math.PI, 0, true);
          c.closePath();
          fillInk(c, metal(c, -r, 0, r, 0, IRON), 2.2);
          // Firebox door with glowing slots.
          const dw = r * 0.62;
          const dt = y0 + ry * 0.95 + 3;
          const dh = pb - 7;
          rrect(c, -dw / 2, dt, dw, dh, 4);
          fillInk(c, metal(c, -dw / 2, dt, dw / 2, dt + dh, 0x4a4450), 1.6);
          const slots = dh > 20 ? 3 : 2;
          for (let k = 0; k < slots; k++) {
            rrect(c, -dw / 2 + 4, dt + 3 + k * ((dh - 6) / slots), dw - 8, Math.max(1.5, (dh - 6) / slots - 2), 1.5);
            const fg = c.createLinearGradient(0, dt, 0, dt + dh);
            fg.addColorStop(0, '#fff0a0');
            fg.addColorStop(0.5, '#ff9a3a');
            fg.addColorStop(1, '#c8401a');
            c.fillStyle = fg;
            c.fill();
          }
          glowAt(c, 0, dt + dh / 2, dw, dh, 0xff8a3a, 0.6, 'lighter');
          // Copper tank.
          c.beginPath();
          c.ellipse(0, y0, r, ry, 0, 0, Math.PI);
          c.lineTo(-r, y1);
          c.ellipse(0, y1, r, ry, 0, Math.PI, 0, true);
          c.closePath();
          const tg = c.createLinearGradient(-r, 0, r, 0);
          tg.addColorStop(0, rgb(light(COPPER, 0.15)));
          tg.addColorStop(0.22, rgb(light(COPPER, 0.55)));
          tg.addColorStop(0.45, rgb(COPPER));
          tg.addColorStop(0.8, rgb(dark(COPPER, 0.4)));
          tg.addColorStop(1, rgb(dark(COPPER, 0.6)));
          fillInk(c, tg, 2.4);
          // Fire glow on the bottom of the tank.
          c.save();
          c.beginPath();
          c.ellipse(0, y0, r, ry, 0, 0, Math.PI);
          c.lineTo(-r, y1);
          c.ellipse(0, y1, r, ry, 0, Math.PI, 0, true);
          c.closePath();
          c.clip();
          glowAt(c, 0, y0 + ry, r * 0.9, r * 0.5, 0xff7a2a, 0.35, 'lighter');
          grain(c, -r, y1 - ry, r * 2, H + ry * 2, Math.round(r * 1.2), Math.round(x + y), 0.06);
          c.restore();
          for (const k of [0.12, 0.5, 0.88]) rivetBand(c, y0 - H * k, r, ry, Math.max(7, Math.round(r / 5)), COPPER);
          // Dome.
          c.beginPath();
          c.moveTo(-r, y1);
          c.ellipse(0, y1, r, r * 0.62, 0, Math.PI, Math.PI * 2);
          c.ellipse(0, y1, r, ry, 0, 0, Math.PI);
          c.closePath();
          const dg = c.createRadialGradient(-r * 0.35, y1 - r * 0.4, 2, 0, y1, r * 1.1);
          dg.addColorStop(0, rgb(light(COPPER, 0.7)));
          dg.addColorStop(0.4, rgb(COPPER));
          dg.addColorStop(1, rgb(dark(COPPER, 0.5)));
          fillInk(c, dg, 2.4);
          c.beginPath();
          c.moveTo(-r, y1);
          c.ellipse(0, y1, r, r * 0.62, 0, Math.PI, Math.PI * 2);
          rim(c, 0.45, 2);
          rivetBand(c, y1, r, ry, Math.max(7, Math.round(r / 5)), COPPER);
          // Safety valve (left) and chimney (right).
          const vx = -r * 0.38;
          const vy = y1 - r * 0.4;
          rrect(c, vx - 3, vy - 12, 6, 14, 2);
          fillInk(c, gold(c, vx - 3, 0, vx + 3, 0), 1.3);
          ellipse(c, vx, vy - 13, 6, 2.6);
          fillInk(c, gold(c, vx - 6, vy - 16, vx + 6, vy - 10), 1.3);
          ellipse(c, vx, vy - 17, 2, 2);
          fillInk(c, '#c8243a', 1);
          const cw = Math.max(7, r * 0.22);
          const cb = y1 - r * 0.42;
          c.beginPath();
          c.moveTo(chx - cw / 2, cb);
          c.lineTo(chx - cw / 2, chTop + 4);
          c.lineTo(chx + cw / 2, chTop + 4);
          c.lineTo(chx + cw / 2, cb);
          c.ellipse(chx, cb, cw / 2, cw * 0.22, 0, 0, Math.PI);
          c.closePath();
          fillInk(c, metal(c, chx - cw / 2, 0, chx + cw / 2, 0, IRON), 1.8);
          ellipse(c, chx, chTop + 3, cw * 0.75, cw * 0.28);
          fillInk(c, metal(c, chx - cw, 0, chx + cw, 0, IRON), 1.6);
          ellipse(c, chx, chTop + 2.4, cw * 0.48, cw * 0.16);
          c.fillStyle = '#0e0a10';
          c.fill();
          rrect(c, chx - cw / 2 - 1, cb - (cb - chTop) * 0.45, cw + 2, 3, 1);
          c.fillStyle = gold(c, chx - cw / 2, 0, chx + cw / 2, 0);
          c.fill();
          // Pressure gauge on the front, on a little stem.
          c.fillStyle = gold(c, gx - 2, 0, gx + 2, 0);
          c.fillRect(gx - 2, gy + gr, 4, 6);
          dial(c, gx, gy, gr, 0xe0b25a);
          // Brass plate.
          c.font = `700 ${Math.max(8, Math.round(r * 0.18))}px ${FONT_BODY}`;
          const pw = c.measureText('DAMPF').width + 8;
          const px = Math.max(-r + pw / 2 + 3, gx - gr - 4 - pw / 2);
          const py = y0 - H * 0.36;
          rrect(c, px - pw / 2, py - 6, pw, 12, 3);
          fillInk(c, gold(c, px - pw / 2, py - 6, px + pw / 2, py + 6), 1.2);
          c.font = `700 ${Math.max(8, Math.round(r * 0.18))}px ${FONT_BODY}`;
          c.textAlign = 'center';
          c.fillStyle = '#3a1a08';
          c.fillText('DAMPF', px, py + 3);
        }),
      );
      const needle = new Graphics();
      needle.poly([-1.6, 0, 0, -gr * 0.88, 1.6, 0]).fill(RED);
      needle.rect(-0.7, 0, 1.4, gr * 0.25).fill(0x2a1a14);
      needle.circle(0, 0, Math.max(2, gr * 0.16)).fill(0x3a2a1a);
      needle.position.set(x + gx, y + gy);
      v.addChild(needle, glassShine(x + gx, y + gy, gr));
      const fire = glow(v, x, y + y0 + ry + pb * 0.5, r * 2.4, r * 1.3, 0xff8a3a, 0.35);
      const puffs = Array.from({ length: 8 }, () => puff(v));
      const wisps = Array.from({ length: 3 }, () => puff(v));
      const ph = rnd() * 10;
      const kick = kicker(1800);
      return [
        ent(v, [box(x, y, r * 2, r * 2)], y + r, (time, dt) => {
          const kk = kick.step(dt);
          needle.rotation = 0.6 + Math.sin(time * 2 + ph) * 0.4 + Math.sin(time * 13) * 0.05 + kk * 1.6;
          fire.alpha = 0.3 + Math.sin(time * 9 + ph) * 0.05 + Math.sin(time * 23) * 0.03 + kk * 0.25;
          // A lazy wisp from the chimney, and a big puff when poked.
          wisps.forEach((p, i) => {
            const k = (time * 0.25 + i / 3 + ph) % 1;
            p.position.set(x + chx + Math.sin(k * 5 + i) * 4 + k * 8, y + chTop - k * 40);
            p.width = p.height = 12 + k * 26;
            p.alpha = Math.sin(k * Math.PI) * 0.22;
          });
          puffs.forEach((p, i) => {
            if (kk <= 0) return void (p.alpha = 0);
            const e = Math.min(1, (1 - kk) * 1.4 + i * 0.05);
            p.position.set(x + chx + Math.sin(i * 2.1) * 8 + e * (i - 3) * 9, y + chTop - e * (50 + i * 12));
            p.width = p.height = 20 + e * 50;
            p.alpha = (1 - e) * 0.85;
          });
        }, kick.poke),
      ];
    }

    case 'workbench': {
      const bw = w || 130;
      const D = 34; // Depth of the top face.
      const F = 12; // Front edge of the top.
      const top = -22 - F - D; // Bench sits with its front feet at y + 22.
      const tf = top + D; // Where the top face meets the front.
      const v = new Container();
      const standX = 8;
      const standY = top + 14;
      const gearR = 11;
      v.addChild(
        propSprite(x, y + 22, bw + 80, 150, bw / 2 + 40, 120, (c) => {
          shadow(c, 3, -6, bw * 0.6, 14, 0.55);
          // Legs: back pair, a shelf with a crate, then the front pair.
          for (const lx of [-bw / 2 + 10, bw / 2 - 10]) {
            rrect(c, lx - 4, tf - 2, 8, 22, 2);
            fillInk(c, rgb(dark(WOOD, 0.45)), 1.4);
          }
          rrect(c, -bw / 2 + 6, -12, bw - 12, 6, 2);
          fillInk(c, vgrad(c, -12, -6, WOOD, 0.15, 0.3), 1.4);
          rrect(c, -bw / 2 + 18, -30, 26, 18, 2);
          fillInk(c, vgrad(c, -30, -12, 0x8a6a3a, 0.2, 0.3), 1.4);
          c.strokeStyle = 'rgba(40,20,10,0.5)';
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(-bw / 2 + 18, -21);
          c.lineTo(-bw / 2 + 44, -21);
          c.stroke();
          ellipse(c, bw / 2 - 34, -16, 9, 4);
          fillInk(c, metal(c, bw / 2 - 43, -20, bw / 2 - 25, -12, COPPER), 1.2);
          rrect(c, bw / 2 - 43, -16, 18, 6, 2);
          fillInk(c, metal(c, bw / 2 - 43, 0, bw / 2 - 25, 0, COPPER), 1.2);
          for (const lx of [-bw / 2 + 5, bw / 2 - 5]) {
            rrect(c, lx - 5, tf + F - 4, 10, -(tf + F - 4) + 1, 2);
            fillInk(c, vgrad(c, tf, 0, WOOD, 0.15, 0.4), 1.6);
            rrect(c, lx - 6, -4, 12, 5, 2);
            fillInk(c, metal(c, lx - 6, 0, lx + 6, 0, IRON), 1.2);
          }
          // The top: thick planks.
          rrect(c, -bw / 2, tf - 4, bw, F + 4, 3);
          fillInk(c, vgrad(c, tf, tf + F, WOOD, 0.1, 0.35), 2);
          for (const dx of [-bw / 4, bw / 4]) {
            rrect(c, dx - 12, tf + 2, 24, 7, 2);
            c.fillStyle = rgb(dark(WOOD, 0.3));
            c.fill();
            ellipse(c, dx, tf + 5.5, 2, 1.6);
            c.fillStyle = gold(c, dx - 2, tf + 4, dx + 2, tf + 7);
            c.fill();
          }
          rrect(c, -bw / 2, top, bw, D, 4);
          const tg = c.createLinearGradient(-bw / 2, top, -bw / 2 + bw * 0.4, tf);
          tg.addColorStop(0, rgb(light(0x8a5a32, 0.25)));
          tg.addColorStop(1, rgb(0x7a4a28));
          fillInk(c, tg, 2);
          c.save();
          rrect(c, -bw / 2, top, bw, D, 4);
          c.clip();
          for (let k = 1; k < 4; k++) {
            c.beginPath();
            c.moveTo(-bw / 2, top + (D / 4) * k);
            c.lineTo(bw / 2, top + (D / 4) * k + 0.5);
            c.strokeStyle = 'rgba(50,24,10,0.45)';
            c.lineWidth = 1;
            c.stroke();
          }
          grain(c, -bw / 2, top, bw, D, Math.round(bw / 3), Math.round(x), 0.07);
          // Scorch mark and oil stain.
          ellipse(c, -bw * 0.12, top + D * 0.65, 8, 3);
          c.fillStyle = 'rgba(30,14,6,0.3)';
          c.fill();
          c.restore();
          rrect(c, -bw / 2, top, bw, D, 4);
          rim(c, 0.35, 1.5);
          // Vice on the left corner.
          const vx = -bw / 2 + 4;
          rrect(c, vx - 8, tf - 10, 16, 16, 2);
          fillInk(c, metal(c, vx - 8, 0, vx + 8, 0, 0x4a5a6a), 1.4);
          rrect(c, vx - 8, tf + 6, 16, 6, 1.5);
          fillInk(c, metal(c, vx - 8, 0, vx + 8, 0, 0x4a5a6a), 1.2);
          c.beginPath();
          c.moveTo(vx - 12, tf + 15);
          c.lineTo(vx + 10, tf + 15);
          c.strokeStyle = INK;
          c.lineWidth = 3.4;
          c.stroke();
          c.strokeStyle = '#c8c8d0';
          c.lineWidth = 1.6;
          c.stroke();
          // Wrench, hammer and screwdriver.
          c.save();
          c.translate(-bw / 2 + 30, top + 22);
          c.rotate(-0.3);
          rrect(c, -12, -2, 24, 4, 2);
          fillInk(c, metal(c, 0, -2, 0, 2, 0x9aa0aa), 1.2);
          c.beginPath();
          c.arc(14, 0, 5, 0.5, Math.PI * 2 - 0.5);
          c.lineTo(17, 0);
          c.closePath();
          fillInk(c, metal(c, 9, -5, 19, 5, 0x9aa0aa), 1.2);
          c.restore();
          c.save();
          c.translate(-bw / 2 + 34, top + 9);
          c.rotate(0.15);
          rrect(c, -10, -1.8, 22, 3.6, 1.5);
          fillInk(c, vgrad(c, -2, 2, 0xb07a3a, 0.3, 0.3), 1.1);
          rrect(c, 10, -4.5, 6, 9, 1.5);
          fillInk(c, metal(c, 10, -4, 16, 4, IRON), 1.1);
          c.restore();
          c.save();
          c.translate(bw / 2 - 22, top + 26);
          c.rotate(0.5);
          rrect(c, -9, -2, 9, 4, 2);
          fillInk(c, '#c8243a', 1);
          c.fillStyle = '#c8c8d0';
          c.fillRect(0, -0.8, 9, 1.6);
          c.restore();
          // Scattered gears and screws.
          for (const [sx, sy, sr] of [[-bw * 0.18, top + 25, 5], [-bw * 0.06, top + 28, 3.5], [bw / 2 - 14, top + 10, 4]] as const) {
            c.save();
            c.translate(sx, sy);
            c.scale(1, 0.55);
            paintGear(c, sr, 8, 0xe0b25a, { spokes: 0, lw: 1 });
            c.restore();
          }
          for (let k = 0; k < 5; k++) {
            ellipse(c, -bw * 0.02 + k * 3.4, top + 22 + (k % 2) * 3, 1.2, 0.8);
            c.fillStyle = '#d8d8e0';
            c.fill();
          }
          // The half-built moth automaton on a little stand.
          const mx = bw * 0.27;
          const my = top + 10;
          ellipse(c, mx, my + 10, 11, 3.5);
          fillInk(c, metal(c, mx - 11, my + 7, mx + 11, my + 13, IRON), 1.2);
          c.fillStyle = gold(c, mx - 1, 0, mx + 1, 0);
          c.fillRect(mx - 1, my - 2, 2, 12);
          const wg = c.createLinearGradient(mx - 16, my - 18, mx + 16, my + 2);
          wg.addColorStop(0, '#fff1c4');
          wg.addColorStop(0.5, '#d9a24a');
          wg.addColorStop(1, '#8a5a1a');
          c.save();
          // Left wing finished, right wing still an open frame.
          c.beginPath();
          c.rect(mx - 20, my - 30, 20, 40);
          c.clip();
          drawEmblem(c, mx, my - 10, 30, wg, '#3a2008', '#5fe3ff');
          c.restore();
          c.save();
          c.translate(mx, my - 10);
          c.strokeStyle = gold(c, 0, -10, 14, 6);
          c.lineWidth = 1.2;
          c.beginPath();
          c.ellipse(0.27 * 30, -0.1 * 30, 0.3 * 30, 0.19 * 30, -0.45, 0, Math.PI * 2);
          c.moveTo(0.18 * 30 + 0.18 * 30, 0.17 * 30);
          c.ellipse(0.18 * 30, 0.17 * 30, 0.18 * 30, 0.13 * 30, 0.6, 0, Math.PI * 2);
          c.stroke();
          c.beginPath();
          c.moveTo(0, -2);
          c.lineTo(14, -6);
          c.moveTo(0, 1);
          c.lineTo(12, 2);
          c.stroke();
          c.restore();
          // Magnifier lamp on a jointed arm.
          const ax = bw / 2 - 6;
          ellipse(c, ax, top + 6, 6, 2.4);
          fillInk(c, metal(c, ax - 6, 0, ax + 6, 0, IRON), 1.2);
          c.beginPath();
          c.moveTo(ax, top + 5);
          c.lineTo(ax + 2, top - 26);
          c.lineTo(mx + 10, top - 36);
          c.strokeStyle = INK;
          c.lineWidth = 4;
          c.stroke();
          c.strokeStyle = gold(c, ax - 2, top - 36, ax + 2, top);
          c.lineWidth = 2;
          c.stroke();
          ellipse(c, ax + 2, top - 26, 2.4, 2.4);
          fillInk(c, '#3a2a1a', 1);
          ellipse(c, mx + 6, top - 36, 10, 6);
          fillInk(c, gold(c, mx - 4, top - 42, mx + 16, top - 30), 1.6);
          ellipse(c, mx + 6, top - 36, 7, 4);
          const lg = c.createRadialGradient(mx + 4, top - 38, 1, mx + 6, top - 36, 8);
          lg.addColorStop(0, 'rgba(255,255,255,0.9)');
          lg.addColorStop(1, 'rgba(180,230,255,0.4)');
          c.fillStyle = lg;
          c.fill();
          glowAt(c, mx, my, 26, 14, 0xffe2a8, 0.35, 'lighter');
          // Test stand for the turning gear.
          c.fillStyle = gold(c, standX - 1.5, 0, standX + 1.5, 0);
          c.fillRect(standX - 1.5, standY - 2, 3, 12);
          ellipse(c, standX, standY + 10, 7, 2.6);
          fillInk(c, metal(c, standX - 7, 0, standX + 7, 0, IRON), 1.2);
        }),
      );
      const gear = gearSprite(gearR, 10, 0xe0b25a, { spokes: 4 });
      gear.position.set(x + standX, y + 22 + standY - 4);
      const pin = new Graphics().circle(0, 0, 2).fill(0x3a2008);
      pin.position.copyFrom(gear.position);
      v.addChild(gear, pin);
      const lamp = glow(v, x + bw * 0.27 + 6, y + 22 + top - 30, 70, 50, 0xffe2a8, 0.3);
      const ph = rnd() * 10;
      return [
        ent(v, [box(x, y, bw, 46)], y + 22, (time) => {
          gear.rotation = time * 1.2;
          lamp.alpha = 0.28 + Math.sin(time * 1.5 + ph) * 0.03;
        }),
      ];
    }

    case 'clockTower': {
      const base = y + 24;
      const fy = -128; // Clock face centre, relative to the base.
      const fr = 19;
      const v = new Container();
      v.addChild(
        propSprite(x, base, 120, 230, 60, 200, (c) => {
          shadow(c, 3, -6, 40, 13, 0.6);
          // Plinth.
          rrect(c, -27, -26, 54, 26, 4);
          fillInk(c, vgrad(c, -26, 0, 0x4a2614, 0.1, 0.4), 2.2);
          rrect(c, -27, -40, 54, 18, 4);
          const pg = c.createLinearGradient(-27, -40, 0, -22);
          pg.addColorStop(0, rgb(light(0x6a3a1e, 0.25)));
          pg.addColorStop(1, rgb(0x6a3a1e));
          fillInk(c, pg, 2.2);
          c.fillStyle = gold(c, -27, -6, 27, -2);
          c.fillRect(-26, -7, 52, 3);
          for (const fx of [-22, 22]) {
            ellipse(c, fx, -1, 5, 2.4);
            fillInk(c, gold(c, fx - 5, -3, fx + 5, 1), 1.2);
          }
          // Trunk with the pendulum window.
          rrect(c, -20, -104, 40, 74, 4);
          fillInk(c, vgrad(c, -104, -30, 0x4a2614, 0.15, 0.35), 2.2);
          c.save();
          rrect(c, -20, -104, 40, 74, 4);
          c.clip();
          grain(c, -20, -104, 40, 74, 24, Math.round(x), 0.06);
          c.restore();
          rrect(c, -13, -98, 26, 58, 12);
          const wg = c.createLinearGradient(0, -98, 0, -40);
          wg.addColorStop(0, '#1a0e08');
          wg.addColorStop(1, '#3a2010');
          c.fillStyle = wg;
          c.fill();
          c.strokeStyle = gold(c, -13, -98, 13, -40);
          c.lineWidth = 2.4;
          c.stroke();
          glowAt(c, 0, -60, 12, 20, 0xffc27a, 0.25, 'lighter');
          for (const sx of [-20, 20]) {
            c.fillStyle = gold(c, sx - 2, 0, sx + 2, 0);
            c.fillRect(sx - 1.5, -100, 3, 66);
          }
          // Head: a deeper box with a gear-toothed brass bezel round the dial.
          rrect(c, -29, -150, 58, 50, 5);
          fillInk(c, vgrad(c, -150, -100, 0x5a2e18, 0.15, 0.4), 2.4);
          rrect(c, -29, -162, 58, 14, 5);
          const hg = c.createLinearGradient(-29, -162, 0, -148);
          hg.addColorStop(0, rgb(light(0x6a3a1e, 0.3)));
          hg.addColorStop(1, rgb(0x6a3a1e));
          fillInk(c, hg, 2.2);
          c.fillStyle = gold(c, -29, -104, 29, -100);
          c.fillRect(-29, -104, 58, 4);
          for (const [cx, cy] of [[-24, -145], [24, -145], [-24, -106], [24, -106]] as const) {
            ellipse(c, cx, cy, 2, 2);
            c.fillStyle = gold(c, cx - 2, cy - 2, cx + 2, cy + 2);
            c.fill();
          }
          c.save();
          c.translate(0, fy);
          paintGear(c, fr + 4, 18, 0xe0b25a, { spokes: 0, tooth: 3.5, lw: 1.8 });
          c.restore();
          ellipse(c, 0, fy, fr, fr);
          const fg = c.createRadialGradient(-6, fy - 7, 1, 0, fy, fr);
          fg.addColorStop(0, '#fffdf4');
          fg.addColorStop(0.75, '#f4e6c8');
          fg.addColorStop(1, '#c9b48a');
          c.fillStyle = fg;
          c.fill();
          c.strokeStyle = INK;
          c.lineWidth = 1.6;
          c.stroke();
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const big = i % 3 === 0;
            ellipse(c, Math.cos(a) * (fr - 4), fy + Math.sin(a) * (fr - 4), big ? 1.8 : 1, big ? 1.8 : 1);
            c.fillStyle = '#2a1a14';
            c.fill();
          }
          // Roof: a copper dome, a little lantern and a spire.
          c.beginPath();
          c.moveTo(-31, -158);
          c.quadraticCurveTo(-30, -182, 0, -186);
          c.quadraticCurveTo(30, -182, 31, -158);
          c.closePath();
          const rg = c.createRadialGradient(-10, -180, 2, 0, -166, 36);
          rg.addColorStop(0, rgb(light(0x3a8a6a, 0.45)));
          rg.addColorStop(0.5, rgb(0x2e6a52));
          rg.addColorStop(1, rgb(dark(0x2e6a52, 0.45)));
          fillInk(c, rg, 2.2);
          for (const sx of [-16, 0, 16]) {
            c.beginPath();
            c.moveTo(sx * 0.4, -185);
            c.quadraticCurveTo(sx * 1.2, -176, sx * 1.6, -159);
            c.strokeStyle = 'rgba(10,30,20,0.35)';
            c.lineWidth = 1.2;
            c.stroke();
          }
          c.beginPath();
          c.moveTo(-31, -158);
          c.quadraticCurveTo(-30, -182, 0, -186);
          rim(c, 0.45, 1.6);
          c.fillStyle = gold(c, -32, -160, 32, -156);
          c.fillRect(-32, -160, 64, 4);
          c.beginPath();
          c.moveTo(0, -186);
          c.lineTo(0, -198);
          c.strokeStyle = INK;
          c.lineWidth = 3.4;
          c.stroke();
          c.strokeStyle = gold(c, -1, -198, 1, -186);
          c.lineWidth = 1.8;
          c.stroke();
          ellipse(c, 0, -199, 3, 3);
          fillInk(c, gold(c, -3, -202, 3, -196), 1.2);
        }),
      );
      // Pendulum behind its glass, the turning side gear, the hands and the glass shine.
      const pend = new Container();
      const rod = new Graphics().rect(-0.8, 0, 1.6, 40).fill(0xc9963e);
      const bob = new Graphics().circle(0, 42, 5.2).fill(0xe0b25a).stroke({ color: 0x3a2008, width: 1.2 });
      bob.circle(-1.6, 40.4, 1.6).fill({ color: 0xfff4c2, alpha: 0.9 });
      pend.addChild(rod, bob);
      pend.position.set(x, base - 96);
      const pglass = propSprite(x, base - 69, 30, 62, 15, 31, (c) => {
        rrect(c, -13, -29, 26, 58, 12);
        c.save();
        c.clip();
        c.beginPath();
        c.moveTo(-10, -29);
        c.lineTo(-3, -29);
        c.lineTo(-13, 10);
        c.lineTo(-13, -14);
        c.closePath();
        c.fillStyle = 'rgba(255,255,255,0.16)';
        c.fill();
        c.restore();
      });
      const side = gearSprite(10, 10, 0xe0b25a, { spokes: 4 });
      side.position.set(x + 29, base - 112);
      const side2 = gearSprite(6, 7, COPPER, { spokes: 0 });
      side2.position.set(x + 29, base - 95);
      const hands = new Container();
      const hh = new Graphics().poly([-2, 0, 0, -11, 2, 0]).fill(0x1b1013).circle(0, -7, 1.8).fill(0x1b1013);
      const mh = new Graphics().poly([-1.3, 1, 0, -15, 1.3, 1]).fill(RED);
      const cap = new Graphics().circle(0, 0, 2).fill(0xe0b25a).stroke({ color: 0x3a2008, width: 0.8 });
      hands.addChild(hh, mh, cap);
      hands.position.set(x, base + fy);
      v.addChild(pend, pglass, side, side2, hands, glassShine(x, base + fy, fr));
      const kick = kicker(1400);
      let extra = 0;
      return [
        ent(v, [box(x, y, 48, 48)], y + 24, (time, dt) => {
          const kk = kick.step(dt);
          extra += kk * dt * 0.012;
          mh.rotation = time * 0.6 + extra;
          hh.rotation = time * 0.05 + extra / 12;
          hands.scale.set(1 + Math.sin(kk * Math.PI * 6) * 0.06 * kk);
          pend.rotation = Math.sin(time * 3.2) * (0.14 + kk * 0.06);
          side.rotation = time * 0.8 + extra * 2;
          side2.rotation = -(time * 0.8 + extra * 2) * (10 / 7);
        }, kick.poke),
      ];
    }

    case 'pipes': {
      const vertical = (d.r ?? 0) % 2 === 1;
      const len = w || 200;
      const bw = vertical ? 30 : len;
      const bh = vertical ? len : 30;
      const L = x - bw / 2;
      const T = y - bh / 2;
      const cols = [COPPER, 0x8a8a96, COPPER];
      const pr = 5; // Pipe radius.
      const lift = 9; // Pipes rest on brackets this high above the floor.
      const v = new Container();
      if (vertical) {
        v.addChild(
          propSprite(x, T, bw + 40, bh + 60, bw / 2 + 20, 40, (c) => {
            shadow(c, 3, bh / 2 + 4, bw * 0.7, bh * 0.52, 0.45);
            // Brackets across the bundle.
            for (let p = 24; p < len - 10; p += 80) {
              rrect(c, -bw / 2 - 2, p - lift + 2, bw + 4, 5, 2);
              fillInk(c, metal(c, 0, p - lift, 0, p - lift + 7, IRON), 1.2);
              for (const fx of [-bw / 2 - 1, bw / 2 + 1]) {
                rrect(c, fx - 2, p - lift + 4, 4, lift, 1);
                fillInk(c, '#24202a', 1);
              }
            }
            // Three pipes running away from us, outer ones first.
            for (const k of [0, 2, 1]) {
              const px = -bw / 2 + 5 + k * 9 + 3.5;
              const col = cols[k];
              rrect(c, px - pr, -lift - 2, pr * 2, len, pr);
              const g = c.createLinearGradient(px - pr, 0, px + pr, 0);
              g.addColorStop(0, rgb(dark(col, 0.2)));
              g.addColorStop(0.3, rgb(light(col, 0.5)));
              g.addColorStop(0.6, rgb(col));
              g.addColorStop(1, rgb(dark(col, 0.55)));
              fillInk(c, g, 1.6);
              // Flanged joints.
              for (let p = 50; p < len - 20; p += 80) {
                rrect(c, px - pr - 1.5, p - lift, pr * 2 + 3, 6, 2);
                fillInk(c, metal(c, px - pr, 0, px + pr, 0, col), 1.2);
              }
              // Near end: open flange facing us.
              ellipse(c, px, len - lift - 4, pr + 1.5, pr * 0.8 + 1);
              fillInk(c, metal(c, px - pr, 0, px + pr, 0, col), 1.4);
              ellipse(c, px, len - lift - 4, pr - 1.5, (pr - 1.5) * 0.8);
              c.fillStyle = rgb(dark(col, 0.6));
              c.fill();
            }
            // Valves: red hand wheels on stems.
            for (let p = 30; p < len - 10; p += 70) {
              const vy = p - lift - 8;
              c.fillStyle = gold(c, -1.5, 0, 1.5, 0);
              c.fillRect(-1.5, vy, 3, 8);
              ellipse(c, 0, vy, 9, 5);
              c.strokeStyle = INK;
              c.lineWidth = 4.5;
              c.stroke();
              c.strokeStyle = '#c8243a';
              c.lineWidth = 2.6;
              c.stroke();
              c.beginPath();
              c.moveTo(-8, vy);
              c.lineTo(8, vy);
              c.moveTo(0, vy - 4.5);
              c.lineTo(0, vy + 4.5);
              c.strokeStyle = '#ff9a9a';
              c.lineWidth = 1.4;
              c.stroke();
              ellipse(c, 0, vy, 2, 1.4);
              fillInk(c, gold(c, -2, vy - 1, 2, vy + 1), 0.8);
            }
            // Steam vent near the end.
            const sy = len - 20 - lift;
            rrect(c, -3, sy - 14, 6, 14, 2);
            fillInk(c, metal(c, -3, 0, 3, 0, IRON), 1.2);
            ellipse(c, 0, sy - 14, 4.5, 2);
            fillInk(c, '#1a1418', 1.2);
          }),
        );
      } else {
        v.addChild(
          propSprite(x, T, bw + 50, bh + 70, bw / 2 + 25, 50, (c) => {
            shadow(c, 0, bh - 4, bw * 0.55, 14, 0.5);
            const ys = [5, 14, 23].map((o) => o + 3.5 - lift);
            // Iron saddles.
            for (let p = 20; p < len - 10; p += 90) {
              const sx = -len / 2 + p;
              c.beginPath();
              c.moveTo(sx - 6, ys[0] - 2);
              c.lineTo(sx + 6, ys[0] - 2);
              c.lineTo(sx + 8, bh - 3);
              c.lineTo(sx - 8, bh - 3);
              c.closePath();
              fillInk(c, metal(c, sx - 8, 0, sx + 8, 0, IRON), 1.4);
            }
            for (const k of [0, 1, 2]) {
              const py = ys[k];
              const col = cols[k];
              rrect(c, -len / 2, py - pr, len, pr * 2, pr);
              const g = c.createLinearGradient(0, py - pr, 0, py + pr);
              g.addColorStop(0, rgb(dark(col, 0.1)));
              g.addColorStop(0.25, rgb(light(col, 0.55)));
              g.addColorStop(0.55, rgb(col));
              g.addColorStop(1, rgb(dark(col, 0.55)));
              fillInk(c, g, 1.6);
              for (let p = 46; p < len - 20; p += 90) {
                const fx = -len / 2 + p + k * 4;
                rrect(c, fx - 3, py - pr - 1.5, 6, pr * 2 + 3, 2);
                fillInk(c, metal(c, fx - 3, py - pr, fx + 3, py + pr, col), 1.2);
              }
              for (const ex of [-len / 2, len / 2]) {
                rrect(c, ex - 3, py - pr - 1.5, 6, pr * 2 + 3, 2);
                fillInk(c, metal(c, ex - 3, py - pr, ex + 3, py + pr, col), 1.3);
              }
            }
            for (let p = 30; p < len - 10; p += 70) {
              const vx = -len / 2 + p;
              const vy = ys[0] - pr - 8;
              c.fillStyle = gold(c, vx - 1.5, 0, vx + 1.5, 0);
              c.fillRect(vx - 1.5, vy, 3, 9);
              ellipse(c, vx, vy, 9, 4.5);
              c.strokeStyle = INK;
              c.lineWidth = 4.5;
              c.stroke();
              c.strokeStyle = '#c8243a';
              c.lineWidth = 2.6;
              c.stroke();
              c.beginPath();
              c.moveTo(vx - 8, vy);
              c.lineTo(vx + 8, vy);
              c.moveTo(vx, vy - 4);
              c.lineTo(vx, vy + 4);
              c.strokeStyle = '#ff9a9a';
              c.lineWidth = 1.4;
              c.stroke();
              ellipse(c, vx, vy, 2, 1.4);
              fillInk(c, gold(c, vx - 2, vy - 1, vx + 2, vy + 1), 0.8);
            }
            // A small gauge in the middle and the vent at the end.
            const gx = len % 140 < 70 ? 0 : 20;
            c.fillStyle = gold(c, gx - 1.5, 0, gx + 1.5, 0);
            c.fillRect(gx - 1.5, ys[0] - pr - 10, 3, 10);
            dial(c, gx, ys[0] - pr - 18, 8, COPPER);
            const sx = len / 2 - 20;
            rrect(c, sx - 3, ys[0] - pr - 14, 6, 14, 2);
            fillInk(c, metal(c, sx - 3, 0, sx + 3, 0, IRON), 1.2);
            ellipse(c, sx, ys[0] - pr - 14, 4.5, 2);
            fillInk(c, '#1a1418', 1.2);
          }),
        );
      }
      const puffs = Array.from({ length: 3 }, () => puff(v));
      const ph = rnd() * 10;
      const sx = vertical ? x : L + len - 20;
      const sy = vertical ? T + len - 20 - lift - 14 : T + 5 + 3.5 - lift - pr - 14;
      return [
        ent(v, [{ x: L, y: T, w: bw, h: bh }], T + bh, (time) => {
          puffs.forEach((p, i) => {
            const k = (time * 0.4 + i / 3 + ph) % 1;
            p.position.set(sx + Math.sin(k * 6 + i) * 6, sy - k * 50);
            p.width = p.height = 14 + k * 40;
            p.alpha = Math.min(1, k * 6) * (1 - k) * 0.55;
          });
        }),
      ];
    }

    case 'wallClock': {
      const r = w || 40;
      const cy = P_WALL_H / 2 - 12;
      const wy = cy + r * 0.42; // Gear window.
      const wr = r * 0.26;
      const v = new Container();
      v.addChild(
        propSprite(x, 0, r * 2 + 50, P_WALL_H, r + 25, 0, (c) => {
          // Shadow on the wall, a toothed brass backplate, a mahogany ring, the face.
          c.save();
          c.translate(4, cy + 6);
          gearPath(c, r + 9, r + 15, Math.round(r / 2.2));
          c.fillStyle = 'rgba(0,0,0,0.38)';
          c.fill();
          c.restore();
          c.save();
          c.translate(0, cy);
          paintGear(c, r + 9, Math.round(r / 2.2), 0xc9963e, { spokes: 0, tooth: 6, lw: 2 });
          c.restore();
          ellipse(c, 0, cy, r + 6, r + 6);
          const mg = c.createLinearGradient(-r, cy - r, r, cy + r);
          mg.addColorStop(0, rgb(light(0x6e3e14, 0.25)));
          mg.addColorStop(0.5, '#6e3e14');
          mg.addColorStop(1, rgb(dark(0x6e3e14, 0.5)));
          fillInk(c, mg, 2);
          ellipse(c, 0, cy, r + 2, r + 2);
          c.strokeStyle = gold(c, -r, cy - r, r, cy + r);
          c.lineWidth = 3;
          c.stroke();
          ellipse(c, 0, cy, r, r);
          const fg = c.createRadialGradient(-r * 0.3, cy - r * 0.35, 1, 0, cy, r);
          fg.addColorStop(0, '#fffdf4');
          fg.addColorStop(0.75, '#f4e6c8');
          fg.addColorStop(1, '#c9b48a');
          c.fillStyle = fg;
          c.fill();
          c.strokeStyle = INK;
          c.lineWidth = 1.4;
          c.stroke();
          // Minute ring and hour marks.
          c.beginPath();
          c.arc(0, cy, r - 4, 0, Math.PI * 2);
          c.strokeStyle = 'rgba(60,30,20,0.35)';
          c.lineWidth = 0.8;
          c.stroke();
          for (let i = 0; i < 60; i++) {
            const a = (i / 60) * Math.PI * 2;
            if (i % 5 === 0) continue;
            c.beginPath();
            c.moveTo(Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
            c.lineTo(Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
            c.strokeStyle = 'rgba(40,20,14,0.5)';
            c.lineWidth = 0.7;
            c.stroke();
          }
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const big = i % 3 === 0;
            c.save();
            c.translate(Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
            c.rotate(a);
            c.fillStyle = big ? '#c8243a' : '#2a1a14';
            c.beginPath();
            c.moveTo(-(big ? 4 : 2.6), 0);
            c.lineTo(0, -(big ? 2.4 : 1.4));
            c.lineTo(big ? 4 : 2.6, 0);
            c.lineTo(0, big ? 2.4 : 1.4);
            c.closePath();
            c.fill();
            c.restore();
          }
          // Window onto the gearwork.
          ellipse(c, 0, wy, wr + 2, wr + 2);
          fillInk(c, gold(c, -wr, wy - wr, wr, wy + wr), 1.4);
          ellipse(c, 0, wy, wr, wr);
          const ig = c.createRadialGradient(0, wy, 1, 0, wy, wr);
          ig.addColorStop(0, '#5a3418');
          ig.addColorStop(1, '#1a0c06');
          c.fillStyle = ig;
          c.fill();
          // Pendulum cover below: a small brass finial.
          c.beginPath();
          c.moveTo(-6, cy + r + 13);
          c.lineTo(6, cy + r + 13);
          c.lineTo(0, cy + r + 22);
          c.closePath();
          fillInk(c, gold(c, -6, cy + r + 13, 6, cy + r + 22), 1.2);
        }),
      );
      // Gearwork behind the window: two gears turning against each other, masked to the window.
      const works = new Container();
      const g1 = gearSprite(wr * 0.62, 9, 0xe0b25a, { spokes: 3 });
      g1.position.set(x - wr * 0.25, cy + r * 0.42 - wr * 0.1);
      const g2 = gearSprite(wr * 0.42, 7, COPPER, { spokes: 0 });
      g2.position.set(x + wr * 0.62, cy + r * 0.42 + wr * 0.35);
      works.addChild(g2, g1);
      const mask = new Graphics().circle(x, wy, wr).fill(0xffffff);
      works.mask = mask;
      const hh = new Graphics().poly([-2.4, 2, -1.6, -r * 0.3, 0, -r * 0.5, 1.6, -r * 0.3, 2.4, 2]).fill(0x1b1013);
      hh.circle(0, -r * 0.34, r * 0.07).fill(0x1b1013);
      const mh = new Graphics().poly([-1.4, 3, 0, -r * 0.8, 1.4, 3]).fill(RED);
      const cap = new Graphics().circle(0, 0, Math.max(2.4, r * 0.08)).fill(0xe0b25a).stroke({ color: 0x3a2008, width: 1 });
      for (const n of [hh, mh, cap]) n.position.set(x, cy);
      v.addChild(works, mask, hh, mh, cap, glassShine(x, cy, r));
      return [
        {
          view: v,
          layer: 'wall',
          obstacles: [],
          update: (time) => {
            mh.rotation = time * 0.5;
            hh.rotation = time * 0.04;
            g1.rotation = time * 1.5;
            g2.rotation = -time * 1.5 * (9 / 7);
          },
        },
      ];
    }

    case 'gauge': {
      const cy = 64;
      const gr = 15;
      const v = new Container();
      v.addChild(
        propSprite(x, 0, 70, P_WALL_H, 35, 0, (c) => {
          // A copper pipe down the wall that the gauge sits on.
          c.fillStyle = 'rgba(0,0,0,0.3)';
          c.fillRect(-1, 18, 12, P_WALL_H - 52);
          c.beginPath();
          c.rect(-5, 16, 10, P_WALL_H - 50);
          const pg = c.createLinearGradient(-5, 0, 5, 0);
          pg.addColorStop(0, rgb(dark(COPPER, 0.2)));
          pg.addColorStop(0.3, rgb(light(COPPER, 0.5)));
          pg.addColorStop(0.6, rgb(COPPER));
          pg.addColorStop(1, rgb(dark(COPPER, 0.55)));
          fillInk(c, pg, 1.6);
          for (const by of [28, cy + 30, P_WALL_H - 44]) {
            rrect(c, -7, by, 14, 5, 2);
            fillInk(c, metal(c, -7, 0, 7, 0, COPPER), 1.2);
          }
          // Bezel with bolts.
          c.save();
          c.translate(2, cy + 3);
          ellipse(c, 0, 0, gr + 7, gr + 7);
          c.fillStyle = 'rgba(0,0,0,0.35)';
          c.fill();
          c.restore();
          ellipse(c, 0, cy, gr + 6, gr + 6);
          fillInk(c, metal(c, -gr, cy - gr, gr, cy + gr, 0xb8733a), 2);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + 0.5;
            ellipse(c, Math.cos(a) * (gr + 3), cy + Math.sin(a) * (gr + 3), 1.5, 1.5);
            c.fillStyle = gold(c, -1, -1, 1, 1);
            c.fill();
          }
          dial(c, 0, cy, gr, 0xe0b25a);
          c.font = `700 6px ${FONT_BODY}`;
          c.textAlign = 'center';
          c.fillStyle = 'rgba(40,20,14,0.75)';
          c.fillText('BAR', 0, cy + gr * 0.55);
        }),
      );
      const n = new Graphics();
      n.poly([-1.5, 0, 0, -gr * 0.88, 1.5, 0]).fill(0x1b1013);
      n.rect(-0.7, 0, 1.4, gr * 0.25).fill(0x1b1013);
      n.circle(0, 0, 2.2).fill(RED);
      n.position.set(x, cy);
      v.addChild(n, glassShine(x, cy, gr));
      const ph = rnd() * 10;
      return [{ view: v, layer: 'wall', obstacles: [], update: (time) => (n.rotation = Math.sin(time * 1.3 + ph) * 0.8 + Math.sin(time * 9 + ph) * 0.05) }];
    }
  }
  return null;
}

// Painted lamps from the history of light, for the floors of the Palais Lumen: the candelabrum
// in the Kerzensaal (with the house's last three real moths dancing round its candle), the gas
// lanterns, gas main and gas-mantle shelf of the Laternenwerk, the five era lamps over the
// machines of the corridor to the Kuppel, and the Kuppel itself (vault, moon lamp, floor rosette).
// Same rules as the other painted props: (x, y) stands on the floor, wall pieces hang at x with
// y = 0 at the top of the back wall; everything is painted once, only small overlays animate.

import { Container, Sprite } from 'pixi.js';
import type { DecorPlacement, RoomTheme } from '../../core/registry';
import { mothTexture, reducedMotion } from '../../core/fx';
import { FLOOR_NAMES } from '../../core/brand';
import type { BuiltDecor } from '../decor';
import { P_WALL_H } from './foyerShell';
import { box, ent, flame, glow, kicker } from './foyerProps';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, paint, propSprite, rgb, rim, rrect, seeded, shadow, vgrad, type Ctx } from './brush';

const IRON = 0x1e2a2a;
const NIGHT = 0x14204a;
const MOON = 0xdfe8ff;
const GAS = 0xfff0c8;

/** Cast iron, painted dark green-black, lit from the left. */
function iron(c: Ctx, x0: number, x1: number) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, rgb(light(IRON, 0.35)));
  g.addColorStop(0.35, rgb(IRON));
  g.addColorStop(1, rgb(dark(IRON, 0.6)));
  return g;
}

/** Brass pipe, horizontal (gradient across y) or vertical (across x). */
function pipeGrad(c: Ctx, a: number, b: number, vertical: boolean, col = 0xb07a2a) {
  const g = vertical ? c.createLinearGradient(a, 0, b, 0) : c.createLinearGradient(0, a, 0, b);
  g.addColorStop(0, rgb(light(col, 0.55)));
  g.addColorStop(0.4, rgb(col));
  g.addColorStop(1, rgb(dark(col, 0.55)));
  return g;
}

/** A glowing gas mantle (Glühstrumpf): a little white-hot sock of ash on a clay rod. */
function mantle(c: Ctx, x: number, y: number, s: number, lit = true) {
  if (lit) glowAt(c, x, y, 14 * s, 14 * s, GAS, 0.7, 'lighter');
  c.beginPath();
  c.moveTo(x - 3.2 * s, y + 4 * s);
  c.quadraticCurveTo(x - 5 * s, y - 2 * s, x - 2.4 * s, y - 6 * s);
  c.quadraticCurveTo(x, y - 7.5 * s, x + 2.4 * s, y - 6 * s);
  c.quadraticCurveTo(x + 5 * s, y - 2 * s, x + 3.2 * s, y + 4 * s);
  c.closePath();
  const g = c.createLinearGradient(x, y - 7 * s, x, y + 4 * s);
  g.addColorStop(0, lit ? '#ffffff' : '#f4efe4');
  g.addColorStop(1, lit ? '#ffe9a8' : '#d8cfbe');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = lit ? 'rgba(160,120,60,0.6)' : 'rgba(90,80,70,0.6)';
  c.lineWidth = 0.7;
  c.stroke();
  // The mesh.
  c.strokeStyle = lit ? 'rgba(200,150,70,0.35)' : 'rgba(120,110,100,0.4)';
  for (let k = -1; k <= 1; k++) {
    c.beginPath();
    c.moveTo(x + k * 1.6 * s, y - 6 * s);
    c.lineTo(x + k * 2.2 * s, y + 4 * s);
    c.stroke();
  }
}

/** A hexagonal gas lantern head (iron frame, glass panes, a lit mantle), its base at (0, by). */
function lanternHead(c: Ctx, by: number, s: number) {
  const top = by - 44 * s;
  // Glass body (three visible panes, narrower at the bottom).
  const pane = (x0: number, x1: number, bx0: number, bx1: number, a: number) => {
    c.beginPath();
    c.moveTo(x0, top + 8 * s);
    c.lineTo(x1, top + 8 * s);
    c.lineTo(bx1, by - 4 * s);
    c.lineTo(bx0, by - 4 * s);
    c.closePath();
    const g = c.createLinearGradient(0, top, 0, by);
    g.addColorStop(0, `rgba(255,246,214,${a})`);
    g.addColorStop(0.6, `rgba(255,226,150,${a * 0.85})`);
    g.addColorStop(1, `rgba(220,160,80,${a * 0.6})`);
    c.fillStyle = g;
    c.fill();
  };
  pane(-15 * s, -7 * s, -10 * s, -5 * s, 0.75);
  pane(-7 * s, 7 * s, -5 * s, 5 * s, 0.95);
  pane(7 * s, 15 * s, 5 * s, 10 * s, 0.6);
  glowAt(c, 0, by - 22 * s, 16 * s, 20 * s, 0xffffff, 0.55, 'lighter');
  mantle(c, 0, by - 20 * s, s * 1.1);
  // Frame bars.
  c.strokeStyle = INK;
  c.lineWidth = 2.6 * s;
  for (const [tx, bx] of [[-15, -10], [-7, -5], [7, 5], [15, 10]]) {
    c.beginPath();
    c.moveTo(tx * s, top + 8 * s);
    c.lineTo(bx * s, by - 4 * s);
    c.stroke();
  }
  c.strokeStyle = rgb(light(IRON, 0.3));
  c.lineWidth = 1.2 * s;
  for (const [tx, bx] of [[-15, -10], [-7, -5], [7, 5], [15, 10]]) {
    c.beginPath();
    c.moveTo(tx * s, top + 8 * s);
    c.lineTo(bx * s, by - 4 * s);
    c.stroke();
  }
  // Bottom cup and top roof.
  rrect(c, -11 * s, by - 5 * s, 22 * s, 6 * s, 2 * s);
  fillInk(c, iron(c, -11 * s, 11 * s), 1.4);
  c.beginPath();
  c.moveTo(-19 * s, top + 9 * s);
  c.lineTo(19 * s, top + 9 * s);
  c.lineTo(8 * s, top - 4 * s);
  c.lineTo(-8 * s, top - 4 * s);
  c.closePath();
  fillInk(c, iron(c, -19 * s, 19 * s), 1.6);
  rrect(c, -20 * s, top + 7 * s, 40 * s, 4 * s, 2 * s);
  fillInk(c, gold(c, -20 * s, 0, 20 * s, 0), 1.2);
  // Chimney cap with a little crown of vents.
  rrect(c, -5 * s, top - 11 * s, 10 * s, 8 * s, 2 * s);
  fillInk(c, iron(c, -5 * s, 5 * s), 1.2);
  ellipse(c, 0, top - 13 * s, 3 * s, 3 * s);
  fillInk(c, gold(c, -3 * s, top - 16 * s, 3 * s, top - 10 * s), 1);
}

/** A small art-deco sunburst (half fan of rays on a base line), centred on its base at (0, 0). */
export function decoFan(c: Ctx, r: number, fill: string | CanvasGradient, rays = 9, lw = 1.2) {
  for (let i = 0; i < rays; i++) {
    const a = Math.PI + ((i + 0.5) / rays) * Math.PI;
    const len = r * (i % 2 ? 0.78 : 1);
    c.beginPath();
    c.moveTo(Math.cos(a - 0.1) * r * 0.28, Math.sin(a - 0.1) * r * 0.28);
    c.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    c.lineTo(Math.cos(a + 0.1) * r * 0.28, Math.sin(a + 0.1) * r * 0.28);
    c.closePath();
    fillInk(c, fill, lw);
  }
  c.beginPath();
  c.arc(0, 0, r * 0.3, Math.PI, 0);
  c.closePath();
  fillInk(c, fill, lw);
}

/** A soft cone of light falling from (0, 0) down `h` px, `w0` wide at the top and `w1` at the bottom. */
function coneSprite(x: number, y: number, h: number, w0: number, w1: number, col: number, alpha: number) {
  const s = new Sprite(
    paint(w1 + 20, h, (c) => {
      const cx = (w1 + 20) / 2;
      c.beginPath();
      c.moveTo(cx - w0 / 2, 0);
      c.lineTo(cx + w0 / 2, 0);
      c.lineTo(cx + w1 / 2, h);
      c.lineTo(cx - w1 / 2, h);
      c.closePath();
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgb(col, 0.55));
      g.addColorStop(0.6, rgb(col, 0.18));
      g.addColorStop(1, rgb(col, 0));
      c.fillStyle = g;
      c.fill();
      // Soften the sides.
      c.globalCompositeOperation = 'destination-out';
      for (const sd of [-1, 1]) {
        const eg = c.createLinearGradient(cx + (sd * w1) / 2, 0, cx + (sd * w1) / 6, 0);
        eg.addColorStop(0, 'rgba(0,0,0,0.9)');
        eg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = eg;
        c.fillRect(sd < 0 ? 0 : cx, 0, cx, h);
      }
    }, 1),
  );
  s.anchor.set(0.5, 0);
  s.position.set(x, y);
  s.tint = 0xffffff;
  s.alpha = alpha;
  s.blendMode = 'add';
  s.eventMode = 'none';
  return s;
}

/** The light each era lamp gives. */
const ERA_LIGHT = [0xffc070, 0xcfe0ff, GAS, 0xff6ab8, MOON];

export function buildPaintedLight(d: DecorPlacement, t: RoomTheme): BuiltDecor[] | null {
  const { x, y } = d;
  const w = d.w ?? 0;
  const rnd = seeded(Math.round(x * 37 + y * 13 + 7));
  switch (d.kind) {
    // ---- Kerzensaal: a tall brass candelabrum, and three real moths round its candle -----------
    case 'candelabrum': {
      const v = new Container();
      const H = 132;
      v.addChild(
        propSprite(x, y, 120, 190, 60, 170, (c) => {
          shadow(c, 0, 0, 30, 9, 0.6);
          // Stepped marble foot and a brass base.
          rrect(c, -22, -10, 44, 14, 5);
          fillInk(c, vgrad(c, -10, 4, 0x3a1a2a, 0.2, 0.4), 1.8);
          ellipse(c, 0, -12, 16, 5);
          fillInk(c, gold(c, -16, -17, 16, -7), 1.6);
          // Stem with knops.
          rrect(c, -2.6, -H + 18, 5.2, H - 28, 2.6);
          fillInk(c, gold(c, -3, 0, 3, 0), 1.2);
          for (const ky of [-34, -70, -H + 30]) {
            ellipse(c, 0, ky, 6, 4);
            fillInk(c, gold(c, -6, ky - 4, 6, ky + 4), 1.2);
          }
          // Two scrolled arms.
          for (const s of [-1, 1]) {
            c.beginPath();
            c.moveTo(0, -H + 46);
            c.bezierCurveTo(s * 10, -H + 52, s * 30, -H + 48, s * 30, -H + 26);
            c.strokeStyle = INK;
            c.lineWidth = 5.5;
            c.stroke();
            c.strokeStyle = gold(c, -30, -H + 20, 30, -H + 52);
            c.lineWidth = 3.2;
            c.stroke();
          }
          // Drip cups and candles: the middle one stands taller.
          for (const [cx, cy, ch] of [[-30, -H + 26, 18], [30, -H + 26, 18], [0, -H + 16, 24]] as const) {
            c.beginPath();
            c.ellipse(cx, cy + 2, 8, 3, 0, 0, Math.PI);
            c.lineTo(cx - 8, cy);
            c.ellipse(cx, cy, 8, 3, 0, Math.PI, 0, true);
            c.closePath();
            fillInk(c, gold(c, cx - 8, 0, cx + 8, 0), 1.2);
            rrect(c, cx - 3.4, cy - ch, 6.8, ch, 2);
            fillInk(c, vgrad(c, cy - ch, cy, 0xfff6e6, 0.15, 0.25), 1.2);
            // A drip of wax.
            c.beginPath();
            c.moveTo(cx + 1, cy - ch + 1);
            c.quadraticCurveTo(cx + 3.6, cy - ch + 6, cx + 2, cy - ch + 9);
            c.strokeStyle = 'rgba(255,250,236,0.95)';
            c.lineWidth = 1.6;
            c.stroke();
          }
          glowAt(c, 0, -H - 14, 60, 46, 0xffcf7a, 0.22, 'lighter');
        }),
      );
      const flames = [flame(v, x - 30, y - H + 8, 0.8), flame(v, x + 30, y - H + 8, 0.8), flame(v, x, y - H - 8, 0.95)];
      const gl = glow(v, x, y - H - 6, 190, 170, 0xffc070, 0.3);
      // The homage: two or three real little moths dancing round the middle flame.
      const moths = [0, 1, 2].map((i) => {
        const m = new Sprite(mothTexture());
        m.anchor.set(0.5);
        m.width = m.height = i === 2 ? 8 : 10;
        m.tint = [0xe8dcc0, 0xd8c8a8, 0xf0e6d0][i];
        m.alpha = 0.92;
        v.addChild(m);
        return m;
      });
      const ph = rnd() * 10;
      const cx = x;
      const cy = y - H - 14;
      return [
        ent(v, [box(x, y - 2, 40, 22)], y + 6, (time) => {
          flames.forEach((f, i) => f(time + i * 1.7));
          gl.alpha = 0.28 + Math.sin(time * 2.3 + ph) * 0.03;
          const calm = reducedMotion() ? 0.35 : 1;
          moths.forEach((m, i) => {
            const a = time * (1.6 + i * 0.55) * calm + i * 2.1 + ph;
            const r = 16 + i * 7 + Math.sin(time * 1.3 + i) * 4;
            const mx = cx + Math.cos(a) * r;
            const my = cy + Math.sin(a * 1.4) * r * 0.55 - Math.sin(time * 2 + i) * 3;
            m.rotation = Math.atan2(my - m.y, mx - m.x) + Math.PI / 2;
            m.position.set(mx, my);
            m.scale.x = (m.scale.y || 0.15) * (0.3 + 0.7 * Math.abs(Math.cos(time * 24 * calm + i)));
          });
        }),
      ];
    }

    // ---- Laternenwerk: a cast-iron gas lantern on a post (r 0) or on a wall bracket (r 1) -------
    case 'gasLantern': {
      const v = new Container();
      if ((d.r ?? 0) % 2 === 1) {
        // Wall bracket: the gas pipe comes down from the main under the ceiling.
        const LY = 82;
        v.addChild(
          propSprite(x, 0, 90, P_WALL_H, 45, 0, (c) => {
            c.fillStyle = 'rgba(0,0,0,0.3)';
            c.fillRect(-1, 14, 8, LY - 30);
            rrect(c, -3.5, 10, 7, LY - 36, 3);
            fillInk(c, pipeGrad(c, -3.5, 3.5, true), 1.2);
            // Wall rose and bracket arm.
            ellipse(c, 0, LY - 22, 8, 8);
            fillInk(c, gold(c, -8, LY - 30, 8, LY - 14), 1.4);
            c.beginPath();
            c.moveTo(0, LY - 22);
            c.bezierCurveTo(8, LY - 30, 16, LY - 36, 18, LY - 50);
            c.strokeStyle = INK;
            c.lineWidth = 5;
            c.stroke();
            c.strokeStyle = iron(c, 0, 18);
            c.lineWidth = 3;
            c.stroke();
            // A little gas tap with a brass key.
            rrect(c, -7, LY - 42, 14, 5, 2);
            fillInk(c, gold(c, -7, 0, 7, 0), 1);
            c.save();
            c.translate(0, LY);
            c.scale(0.72, 0.72);
            lanternHead(c, 0, 1);
            c.restore();
          }),
        );
        const gl = glow(v, x, LY - 16, 150, 130, GAS, 0.4);
        const ph = rnd() * 10;
        return [{ view: v, layer: 'wall', obstacles: [], update: (time) => (gl.alpha = 0.36 + Math.sin(time * 9 + ph) * 0.015 + Math.sin(time * 1.4 + ph) * 0.03) }];
      }
      const H = 150;
      v.addChild(
        propSprite(x, y, 80, 210, 40, 190, (c) => {
          shadow(c, 0, 0, 22, 7, 0.55);
          // Fluted base with the gas inlet coming out of the floor.
          c.beginPath();
          c.moveTo(-14, 0);
          c.lineTo(-10, -26);
          c.lineTo(10, -26);
          c.lineTo(14, 0);
          c.closePath();
          fillInk(c, iron(c, -14, 14), 1.8);
          for (const fx of [-6, 0, 6]) {
            c.beginPath();
            c.moveTo(fx, -4);
            c.lineTo(fx * 0.8, -22);
            c.strokeStyle = 'rgba(255,255,255,0.12)';
            c.lineWidth = 1.4;
            c.stroke();
          }
          rrect(c, -16, -4, 32, 6, 2);
          fillInk(c, iron(c, -16, 16), 1.4);
          rrect(c, -12, -30, 24, 6, 2);
          fillInk(c, gold(c, -12, 0, 12, 0), 1.2);
          // Slim post, a ladder bar and a brass collar.
          rrect(c, -3.6, -H + 8, 7.2, H - 34, 3);
          fillInk(c, iron(c, -4, 4), 1.4);
          for (const sd of [-1, 1]) {
            c.beginPath();
            c.moveTo(0, -H + 22);
            c.lineTo(sd * 13, -H + 26);
            c.strokeStyle = INK;
            c.lineWidth = 3.6;
            c.stroke();
            c.strokeStyle = rgb(light(IRON, 0.25));
            c.lineWidth = 1.8;
            c.stroke();
          }
          rrect(c, -6, -H + 40, 12, 6, 2);
          fillInk(c, gold(c, -6, 0, 6, 0), 1.1);
          lanternHead(c, -H + 6, 1);
        }),
      );
      const pool = new Container();
      pool.addChild(
        propSprite(x, y, 220, 110, 110, 55, (c) => {
          glowAt(c, 0, 4, 100, 40, 0xffe2a0, 0.24, 'lighter');
        }),
      );
      const gl = glow(v, x, y - H - 14, 210, 200, GAS, 0.42);
      const ph = rnd() * 10;
      return [
        ent(v, [box(x, y - 2, 26, 18)], y + 6, (time) => {
          // Gas burns steadier than a candle: a faint hiss, a slow breath.
          const k = Math.sin(time * 9 + ph) * 0.015 + Math.sin(time * 1.4 + ph) * 0.03;
          gl.alpha = 0.4 + k;
          pool.alpha = 0.9 + k * 2;
        }),
        { view: pool, layer: 'floor', obstacles: [] },
      ];
    }

    // ---- Laternenwerk: the gas main under the ceiling, with a meter and taps ---------------------
    case 'gasPipe': {
      const len = w || 600;
      const PY = 14;
      const v = new Container();
      v.addChild(
        propSprite(x, 0, len + 20, P_WALL_H, len / 2 + 10, 0, (c) => {
          const L = -len / 2;
          c.fillStyle = 'rgba(0,0,0,0.3)';
          c.fillRect(L, PY + 4, len, 8);
          rrect(c, L, PY - 4, len, 9, 4);
          fillInk(c, pipeGrad(c, PY - 4, PY + 5, false), 1.3);
          // Couplings and wall clamps.
          for (let px = L + 40; px < len / 2 - 20; px += 90) {
            rrect(c, px - 5, PY - 6, 10, 13, 2);
            fillInk(c, gold(c, px - 5, 0, px + 5, 0), 1.1);
          }
          // The gas meter on its riser (h: its distance from the left end), a red tap wheel next to it.
          if (d.h === undefined) return;
          const mx = L + d.h;
          rrect(c, mx - 3, PY, 6, 26, 2);
          fillInk(c, pipeGrad(c, mx - 3, mx + 3, true), 1);
          rrect(c, mx - 22, PY + 22, 44, 34, 5);
          fillInk(c, vgrad(c, PY + 22, PY + 56, 0x5a4a3a, 0.2, 0.4), 1.6);
          rrect(c, mx - 18, PY + 26, 36, 14, 3);
          c.fillStyle = '#f4ead2';
          c.fill();
          c.strokeStyle = INK;
          c.lineWidth = 1;
          c.stroke();
          for (let k = 0; k < 4; k++) {
            ellipse(c, mx - 12 + k * 8, PY + 33, 3.2, 3.2);
            c.strokeStyle = '#3a2a1a';
            c.lineWidth = 0.8;
            c.stroke();
            c.beginPath();
            c.moveTo(mx - 12 + k * 8, PY + 33);
            c.lineTo(mx - 12 + k * 8 + Math.cos(k * 1.9) * 2.6, PY + 33 + Math.sin(k * 1.9) * 2.6);
            c.stroke();
          }
          c.fillStyle = '#f2d08a';
          c.font = '700 7px Cinzel, Georgia, serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('GASUHR', mx, PY + 48);
          ellipse(c, mx + 30, PY + 6, 7, 7);
          c.strokeStyle = INK;
          c.lineWidth = 3.4;
          c.stroke();
          c.strokeStyle = '#c0302a';
          c.lineWidth = 2;
          c.stroke();
          c.beginPath();
          c.moveTo(mx + 23, PY + 6);
          c.lineTo(mx + 37, PY + 6);
          c.moveTo(mx + 30, PY - 1);
          c.lineTo(mx + 30, PY + 13);
          c.strokeStyle = '#c0302a';
          c.lineWidth = 1.4;
          c.stroke();
        }),
      );
      return [{ view: v, layer: 'wall', obstacles: [] }];
    }

    // ---- Räderkammer: a shelf of gas mantles, one glowing on the test burner ---------------------
    case 'mantleShelf': {
      const sw = w || 86;
      const SH = d.h ?? 112;
      const wood = 0x5a321a;
      const v = new Container();
      v.addChild(
        propSprite(x, y, sw + 40, SH + 80, sw / 2 + 20, SH + 40, (c) => {
          shadow(c, 0, 4, sw * 0.62, 12, 0.55);
          const L = -sw / 2;
          // Carcass: sides, back and three shelves.
          rrect(c, L, -SH, sw, SH, 4);
          fillInk(c, vgrad(c, -SH, 0, dark(wood, 0.35), 0.1, 0.3), 2);
          c.save();
          rrect(c, L + 5, -SH + 6, sw - 10, SH - 12, 2);
          c.clip();
          c.fillStyle = rgb(dark(wood, 0.6));
          c.fillRect(L, -SH, sw, SH);
          grain(c, L, -SH, sw, SH, 30, Math.round(x), 0.05);
          c.restore();
          const rows = SH > 100 ? [-SH + 40, -SH + 74, -10] : [-SH + 40, -8];
          rows.forEach((ry, ri) => {
            rrect(c, L + 3, ry, sw - 6, 5, 2);
            fillInk(c, vgrad(c, ry, ry + 5, light(wood, 0.15), 0.3, 0.3), 1.2);
            if (ri === 0) {
              // Top shelf: mantles hanging on little stands, ready to be fitted.
              for (let k = 0; k < 4; k++) {
                const mx = L + 14 + k * ((sw - 28) / 3);
                c.beginPath();
                c.moveTo(mx, ry);
                c.lineTo(mx, ry - 24);
                c.strokeStyle = '#8a6a40';
                c.lineWidth = 1.4;
                c.stroke();
                mantle(c, mx, ry - 14, 1.3, false);
              }
            } else if (ri === 1 || rows.length === 2) {
              // Middle shelf: boxes of mantles, "AUER" in gold on blue.
              for (let k = 0; k < 3; k++) {
                const bx = L + 8 + k * ((sw - 16) / 3);
                const bw2 = (sw - 16) / 3 - 4;
                rrect(c, bx, ry - 18, bw2, 18, 2);
                fillInk(c, vgrad(c, ry - 18, ry, k === 1 ? 0x7a2a2a : NIGHT, 0.2, 0.3), 1.1);
                c.fillStyle = '#f2d08a';
                c.font = '700 6px Cinzel, Georgia, serif';
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText('AUER', bx + bw2 / 2, ry - 9);
              }
            } else {
              // Bottom: a crate of spare mantles and an oil can.
              rrect(c, L + 8, ry - 22, sw * 0.46, 22, 2);
              fillInk(c, vgrad(c, ry - 22, ry, 0x8a6a40, 0.2, 0.3), 1.2);
              for (let k = 0; k < 4; k++) mantle(c, L + 14 + k * 9, ry - 20, 0.8, false);
              c.beginPath();
              c.moveTo(sw / 2 - 26, ry);
              c.lineTo(sw / 2 - 24, ry - 16);
              c.lineTo(sw / 2 - 12, ry - 16);
              c.lineTo(sw / 2 - 10, ry);
              c.closePath();
              fillInk(c, vgrad(c, ry - 16, ry, 0x4a6a5a, 0.3, 0.3), 1.2);
              c.beginPath();
              c.moveTo(sw / 2 - 14, ry - 14);
              c.lineTo(sw / 2 - 2, ry - 26);
              c.strokeStyle = INK;
              c.lineWidth = 2;
              c.stroke();
            }
          });
          // Top: a test burner with a lit mantle under a glass chimney.
          rrect(c, L - 4, -SH - 6, sw + 8, 8, 3);
          fillInk(c, vgrad(c, -SH - 6, -SH + 2, light(wood, 0.1), 0.3, 0.3), 1.6);
          const tx = sw * 0.3;
          rrect(c, tx - 6, -SH - 14, 12, 8, 2);
          fillInk(c, gold(c, tx - 6, 0, tx + 6, 0), 1.2);
          rrect(c, tx - 1.6, -SH - 26, 3.2, 12, 1.5);
          fillInk(c, gold(c, tx - 2, 0, tx + 2, 0), 1);
          mantle(c, tx, -SH - 32, 1.2, true);
          c.beginPath();
          c.moveTo(tx - 7, -SH - 24);
          c.lineTo(tx - 6, -SH - 46);
          c.lineTo(tx + 6, -SH - 46);
          c.lineTo(tx + 7, -SH - 24);
          c.closePath();
          c.fillStyle = 'rgba(230,246,255,0.18)';
          c.fill();
          c.strokeStyle = 'rgba(230,246,255,0.6)';
          c.lineWidth = 1;
          c.stroke();
          // The label plate in Cinzel.
          const px = -sw * 0.12;
          rrect(c, px - 33, -SH - 22, 66, 14, 3);
          fillInk(c, gold(c, px - 33, -SH - 22, px + 33, -SH - 8), 1.4);
          rrect(c, px - 30, -SH - 20, 60, 10, 2);
          c.fillStyle = rgb(NIGHT);
          c.fill();
          c.fillStyle = '#f2d08a';
          c.font = '700 6.4px Cinzel, Georgia, serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('GLÜHSTRÜMPFE', px, -SH - 14.6);
          rrect(c, L, -SH, sw, SH, 4);
          rim(c, 0.25, 1.2);
        }),
      );
      const gl = glow(v, x + sw * 0.3, y - SH - 32, 110, 100, GAS, 0.5);
      const ph = rnd() * 10;
      const kick = kicker(1400);
      return [
        ent(v, [box(x, y - 10, sw, 26)], y + 4, (time, dt) => {
          const kk = kick.step(dt);
          gl.alpha = 0.45 + Math.sin(time * 1.6 + ph) * 0.04 + kk * 0.4;
        }, kick.poke),
      ];
    }

    // ---- Corridor to the Kuppel: a lamp from one era of light over each machine -----------------
    case 'eraLamp': {
      const era = Math.max(0, Math.min(4, d.r ?? 0));
      const col = ERA_LIGHT[era];
      const v = new Container();
      const LY = 34; // Centre of the lamp on the wall.
      v.addChild(
        propSprite(x, 0, 140, P_WALL_H, 70, 0, (c) => {
          glowAt(c, 0, LY, 60, 40, col, 0.28, 'lighter');
          if (era === 0) {
            // Candle: a three-arm wall candelabrum.
            c.beginPath();
            c.moveTo(0, LY - 18);
            c.quadraticCurveTo(9, LY - 6, 0, LY + 18);
            c.quadraticCurveTo(-9, LY - 6, 0, LY - 18);
            fillInk(c, gold(c, -9, LY - 18, 9, LY + 18), 1.6);
            for (const s of [-1, 0, 1]) {
              if (s) {
                c.beginPath();
                c.moveTo(0, LY + 8);
                c.bezierCurveTo(s * 10, LY + 14, s * 22, LY + 8, s * 20, LY - 2);
                c.strokeStyle = INK;
                c.lineWidth = 4.6;
                c.stroke();
                c.strokeStyle = gold(c, -22, LY, 22, LY + 14);
                c.lineWidth = 2.6;
                c.stroke();
              }
              const cx = s * 20;
              const cy = s ? LY - 2 : LY - 14;
              ellipse(c, cx, cy, 6, 2.2);
              fillInk(c, gold(c, cx - 6, 0, cx + 6, 0), 1);
              rrect(c, cx - 2.6, cy - 12, 5.2, 12, 1.5);
              fillInk(c, vgrad(c, cy - 12, cy, 0xfff6e6, 0.2, 0.2), 1);
            }
          } else if (era === 1) {
            // Moon garden: a round paper lantern with a crescent, hanging on a cord.
            c.beginPath();
            c.moveTo(0, 0);
            c.lineTo(0, LY - 22);
            c.strokeStyle = '#2a2018';
            c.lineWidth = 1.4;
            c.stroke();
            rrect(c, -7, LY - 26, 14, 5, 2);
            fillInk(c, '#3a2a1a', 1);
            ellipse(c, 0, LY, 20, 22);
            const pg = c.createRadialGradient(-5, LY - 6, 2, 0, LY, 22);
            pg.addColorStop(0, '#ffffff');
            pg.addColorStop(0.6, '#e8eeff');
            pg.addColorStop(1, '#a8b8e0');
            fillInk(c, pg, 1.4);
            for (const k of [-0.6, -0.2, 0.2, 0.6]) {
              c.beginPath();
              c.ellipse(0, LY, 20 * Math.abs(k), 22, 0, -Math.PI / 2, Math.PI / 2, k < 0);
              c.strokeStyle = 'rgba(80,90,130,0.3)';
              c.lineWidth = 0.8;
              c.stroke();
            }
            c.beginPath();
            c.arc(-1, LY, 7, 0, Math.PI * 2);
            c.arc(2, LY - 2.4, 6, 0, Math.PI * 2, true);
            c.fillStyle = 'rgba(200,170,90,0.75)';
            c.fill('evenodd');
            rrect(c, -7, LY + 20, 14, 4, 2);
            fillInk(c, '#3a2a1a', 1);
            c.beginPath();
            c.moveTo(0, LY + 24);
            c.lineTo(0, LY + 34);
            c.strokeStyle = '#c0302a';
            c.lineWidth = 2;
            c.stroke();
          } else if (era === 2) {
            // Gas: a lantern on a bracket, its pipe coming down from the ceiling.
            rrect(c, -3, 0, 6, LY - 26, 2);
            fillInk(c, pipeGrad(c, -3, 3, true), 1);
            c.save();
            c.translate(0, LY + 18);
            c.scale(0.62, 0.62);
            lanternHead(c, 0, 1);
            c.restore();
          } else if (era === 3) {
            // Neon: a tube bent into a little sunburst, pink and cyan.
            c.save();
            c.translate(0, LY + 12);
            c.shadowBlur = 10;
            for (let i = 0; i < 7; i++) {
              const a = Math.PI + ((i + 0.5) / 7) * Math.PI;
              c.beginPath();
              c.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
              c.lineTo(Math.cos(a) * (i % 2 ? 20 : 27), Math.sin(a) * (i % 2 ? 20 : 27));
              const nc = i % 2 ? 0x5fe3ff : 0xff6ab8;
              c.shadowColor = rgb(nc);
              c.strokeStyle = rgb(nc);
              c.lineWidth = 3.2;
              c.stroke();
              c.strokeStyle = rgb(light(nc, 0.85));
              c.lineWidth = 1.1;
              c.stroke();
            }
            c.beginPath();
            c.arc(0, 0, 30, Math.PI, 0);
            c.shadowColor = '#ff6ab8';
            c.strokeStyle = '#ff6ab8';
            c.lineWidth = 3;
            c.stroke();
            c.strokeStyle = '#ffd6ec';
            c.lineWidth = 1;
            c.stroke();
            c.restore();
            for (const s of [-1, 1]) {
              rrect(c, s * 30 - 3, LY + 10, 6, 6, 1.5);
              fillInk(c, '#2a2a34', 1);
            }
          } else {
            // The moon lamp: a little Fresnel lens in a brass ring, on a chain.
            for (let k = 0; k < 4; k++) {
              ellipse(c, 0, 3 + k * 5, 1.8, 2.6);
              c.strokeStyle = gold(c, -2, 0, 2, 0);
              c.lineWidth = 1.4;
              c.stroke();
            }
            ellipse(c, 0, LY + 2, 19, 19);
            fillInk(c, gold(c, -19, LY - 17, 19, LY + 21), 1.8);
            ellipse(c, 0, LY + 2, 15, 15);
            const lg = c.createRadialGradient(-4, LY - 2, 1, 0, LY + 2, 15);
            lg.addColorStop(0, '#ffffff');
            lg.addColorStop(0.5, '#dfe8ff');
            lg.addColorStop(1, '#8aa0d8');
            c.fillStyle = lg;
            c.fill();
            for (const rr of [4, 8, 12]) {
              ellipse(c, 0, LY + 2, rr, rr);
              c.strokeStyle = 'rgba(120,140,200,0.45)';
              c.lineWidth = 0.9;
              c.stroke();
            }
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              c.beginPath();
              c.moveTo(Math.cos(a) * 20, LY + 2 + Math.sin(a) * 20);
              c.lineTo(Math.cos(a) * 25, LY + 2 + Math.sin(a) * 25);
              c.strokeStyle = gold(c, -25, LY - 23, 25, LY + 27);
              c.lineWidth = 2;
              c.stroke();
            }
          }
        }),
      );
      if (era === 0) {
        const f = [flame(v, x - 20, LY - 14, 0.6), flame(v, x, LY - 26, 0.7), flame(v, x + 20, LY - 14, 0.6)];
        const gl = glow(v, x, LY - 10, 130, 100, col, 0.3);
        return [
          { view: v, layer: 'wall', obstacles: [], update: (time) => (f.forEach((ff, i) => ff(time + i)), (gl.alpha = 0.28 + Math.sin(time * 2.1) * 0.03)) },
          { view: coneSprite(x, LY, 210, 50, 200, col, 0.16), layer: 'lights', obstacles: [] },
        ];
      }
      const gl = glow(v, x, LY + 4, 130, 110, col, era === 3 ? 0.3 : 0.38);
      const ph = rnd() * 10;
      return [
        {
          view: v,
          layer: 'wall',
          obstacles: [],
          update: (time) => {
            const flick = era === 3 && Math.sin(time * 23 + ph) > 0.985 ? 0.5 : 1;
            v.children[0].alpha = era === 3 ? flick : 1;
            gl.alpha = (era === 3 ? 0.28 : 0.36) * flick + Math.sin(time * 1.5 + ph) * 0.03;
          },
        },
        { view: coneSprite(x, LY + 14, 200, 40, 200, col, 0.15), layer: 'lights', obstacles: [] },
      ];
    }

    // ---- The Kuppel: the vault over the hall, glass panes and brass ribs meeting at the moon lamp --
    case 'domeVault': {
      const dw = w || 420;
      const half = dw / 2;
      const AY = -50; // The apex, above the top of the wall (out of sight).
      const v = new Container();
      const r = seeded(Math.round(x));
      v.addChild(
        propSprite(x, 0, dw + 40, P_WALL_H, half + 20, 0, (c) => {
          const base = P_WALL_H - 26;
          // The vault's outline: a wide arch from the floor line up past the ceiling.
          const vault = () => {
            c.beginPath();
            c.moveTo(-half, base);
            c.bezierCurveTo(-half, base - 110, -half * 0.55, AY + 8, 0, AY);
            c.bezierCurveTo(half * 0.55, AY + 8, half, base - 110, half, base);
            c.closePath();
          };
          vault();
          const sky = c.createRadialGradient(0, AY, 10, 0, AY + 60, half * 1.1);
          sky.addColorStop(0, '#3a4c8a');
          sky.addColorStop(0.35, '#1a2658');
          sky.addColorStop(1, '#080e26');
          c.fillStyle = sky;
          c.fill();
          c.save();
          vault();
          c.clip();
          // Stars through the glass.
          for (let i = 0; i < 90; i++) {
            const sx = (r() - 0.5) * dw;
            const sy = r() * base;
            const s = r() < 0.1 ? 1.5 : 0.8;
            ellipse(c, sx, sy, s, s);
            c.fillStyle = `rgba(230,238,255,${0.35 + r() * 0.6})`;
            c.fill();
          }
          // Moonlight pouring from the lamp at the top.
          glowAt(c, 0, 0, half * 0.75, 120, MOON, 0.35, 'lighter');
          // Rings of the vault (they bow down towards us).
          for (const k of [0.3, 0.55, 0.8]) {
            c.beginPath();
            c.ellipse(0, AY, half * k * 1.05, (base - AY) * k, 0, 0.02, Math.PI - 0.02);
            c.strokeStyle = INK;
            c.lineWidth = 4.4;
            c.stroke();
            c.strokeStyle = gold(c, -half, AY, half, base);
            c.lineWidth = 2.4;
            c.stroke();
          }
          // Ribs from the apex down to the floor line.
          for (let i = 0; i <= 12; i++) {
            const k = i / 12;
            const bx = -half + k * dw;
            c.beginPath();
            c.moveTo(0, AY);
            c.quadraticCurveTo(bx * 0.75, AY + (base - AY) * 0.35, bx, base);
            c.strokeStyle = INK;
            c.lineWidth = 4;
            c.stroke();
            c.strokeStyle = gold(c, -half, AY, half, base);
            c.lineWidth = 2;
            c.stroke();
          }
          c.restore();
          // The rim of the vault.
          vault();
          c.strokeStyle = INK;
          c.lineWidth = 7;
          c.stroke();
          c.strokeStyle = gold(c, -half, AY, half, base);
          c.lineWidth = 4;
          c.stroke();
          // A sunburst frieze along the foot of the vault.
          for (let fx = -half + 30; fx <= half - 30; fx += 60) {
            c.save();
            c.translate(fx, base);
            decoFan(c, 12, gold(c, -12, -12, 12, 0), 7, 0.9);
            c.restore();
          }
          // The moon lamp at the crown: a Fresnel lens in a brass ring, hanging on three chains.
          const ly = 34;
          for (const sx of [-14, 0, 14]) {
            c.beginPath();
            c.moveTo(sx * 1.8, 0);
            c.lineTo(sx, ly - 14);
            c.strokeStyle = gold(c, -20, 0, 20, ly);
            c.lineWidth = 1.6;
            c.stroke();
          }
          ellipse(c, 0, ly, 26, 18);
          fillInk(c, gold(c, -26, ly - 18, 26, ly + 18), 2);
          ellipse(c, 0, ly, 21, 14);
          const lg = c.createRadialGradient(-6, ly - 4, 1, 0, ly, 22);
          lg.addColorStop(0, '#ffffff');
          lg.addColorStop(0.45, '#e6eeff');
          lg.addColorStop(1, '#8aa0d8');
          c.fillStyle = lg;
          c.fill();
          for (const k of [0.3, 0.55, 0.8]) {
            ellipse(c, 0, ly, 21 * k, 14 * k);
            c.strokeStyle = 'rgba(110,130,190,0.5)';
            c.lineWidth = 1;
            c.stroke();
          }
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            c.beginPath();
            c.moveTo(Math.cos(a) * 28, ly + Math.sin(a) * 20);
            c.lineTo(Math.cos(a) * (i % 2 ? 33 : 38), ly + Math.sin(a) * (i % 2 ? 23 : 27));
            c.strokeStyle = gold(c, -38, ly - 27, 38, ly + 27);
            c.lineWidth = 2;
            c.stroke();
          }
          glowAt(c, -8, ly - 6, 6, 4, 0xffffff, 0.8, 'lighter');
        }),
      );
      const lamp = glow(v, x, 34, 220, 170, MOON, 0.55);
      // The moon lamp's light falling down onto the throne and the rosette.
      const shaft = coneSprite(x, 40, 520, 60, 380, MOON, 0.14);
      const ph = rnd() * 10;
      return [
        { view: v, layer: 'wall', obstacles: [], update: (time) => (lamp.alpha = 0.5 + Math.sin(time * 0.8 + ph) * 0.06) },
        { view: shaft, layer: 'lights', obstacles: [] },
      ];
    }

    // ---- The Kuppel: a rosette in the floor under the moon lamp (walk-over) ---------------------
    case 'domeFloor': {
      const rx = (w || 460) / 2;
      const ry = (d.h || 200) / 2;
      const v = new Container();
      v.addChild(
        propSprite(x, y, rx * 2 + 20, ry * 2 + 20, rx + 10, ry + 10, (c) => {
          c.save();
          c.scale(1, ry / rx);
          const R = rx;
          c.beginPath();
          c.arc(0, 0, R, 0, Math.PI * 2);
          const g = c.createRadialGradient(0, 0, 10, 0, 0, R);
          g.addColorStop(0, '#2a3a74');
          g.addColorStop(0.7, '#141e48');
          g.addColorStop(1, '#0c1434');
          c.fillStyle = g;
          c.fill();
          c.lineWidth = 6;
          c.strokeStyle = gold(c, -R, -R, R, R);
          c.stroke();
          c.beginPath();
          c.arc(0, 0, R - 12, 0, Math.PI * 2);
          c.lineWidth = 1.6;
          c.strokeStyle = 'rgba(223,232,255,0.5)';
          c.stroke();
          // Pearls round the edge.
          for (let i = 0; i < 64; i++) {
            const a = (i / 64) * Math.PI * 2;
            c.beginPath();
            c.arc(Math.cos(a) * (R - 6), Math.sin(a) * (R - 6), 2.2, 0, Math.PI * 2);
            c.fillStyle = 'rgba(240,244,255,0.75)';
            c.fill();
          }
          // Brass and silver rays: the sun under the moon.
          for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            const len = (i % 2 ? 0.62 : 0.86) * R;
            c.beginPath();
            c.moveTo(Math.cos(a - 0.05) * R * 0.2, Math.sin(a - 0.05) * R * 0.2);
            c.lineTo(Math.cos(a) * len, Math.sin(a) * len);
            c.lineTo(Math.cos(a + 0.05) * R * 0.2, Math.sin(a + 0.05) * R * 0.2);
            c.closePath();
            c.fillStyle = i % 2 ? 'rgba(200,214,240,0.55)' : gold(c, -R, -R, R, R);
            c.fill();
          }
          c.beginPath();
          c.arc(0, 0, R * 0.2, 0, Math.PI * 2);
          c.fillStyle = '#0c1434';
          c.fill();
          c.lineWidth = 3;
          c.strokeStyle = gold(c, -R * 0.2, -R * 0.2, R * 0.2, R * 0.2);
          c.stroke();
          // Crescent in the middle.
          c.beginPath();
          c.arc(-2, 0, R * 0.12, 0, Math.PI * 2);
          c.arc(R * 0.04, -R * 0.03, R * 0.1, 0, Math.PI * 2, true);
          c.fillStyle = '#eef2ff';
          c.fill('evenodd');
          c.restore();
          glowAt(c, -rx * 0.2, -ry * 0.3, rx * 0.6, ry * 0.5, MOON, 0.12, 'lighter');
        }),
      );
      return [{ view: v, layer: 'floor', obstacles: [] }];
    }
  }
  void t;
  return null;
}

/** Era of each corridor machine, left to right, with its floor (for the plaques). */
export const ERA_NAMES = [
  { era: 'Kerze', floor: FLOOR_NAMES.f1 },
  { era: 'Mond', floor: FLOOR_NAMES.f2 },
  { era: 'Gas', floor: FLOOR_NAMES.f3 },
  { era: 'Neon', floor: FLOOR_NAMES.f4 },
  { era: 'Mondlampe', floor: FLOOR_NAMES.f5 },
] as const;

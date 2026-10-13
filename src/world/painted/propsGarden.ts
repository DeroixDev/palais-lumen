// Painted pieces for the night garden ("Mondgarten", floor 2) in the slanted 3/4 view:
// hedges, flowerbeds, trees, lantern posts, the moon pool, the floor mosaic, arched windows
// and ivy on the back wall. Moonlit blues and silvers, warm lantern light, fireflies.
// Coordinates follow decor.ts: (x, y) is the middle of the footprint; wall pieces hang at x.

import { Container, Graphics, Sprite } from 'pixi.js';
import type { DecorPlacement, RoomTheme } from '../../core/registry';
import { COLORS, drawEmblem, emblemTexture } from '../../core/fx';
import type { BuiltDecor } from '../decor';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, mix, propSprite, rgb, rim, rrect, seeded, shadow, vgrad, type Ctx } from './brush';
import { box, ent, glow, kicker, leaf } from './foyerProps';

/** The wall height decor.ts lays wall pieces out against (same as P_WALL_H). */
const WALL_H = 150;
const MOON = 0xbfe0ff;
const SILVER = 0xdfe8f4;
const LEAF = [0x1f4a3a, 0x24563e, 0x2c6446, 0x1a4034];
const BLOOMS = [0xffe7a8, 0xc9a0ff, 0xff9ac0, 0xffffff, 0x9fd8ff];

/** Moonlit tint: cool silver-blue instead of the warm foyer light. */
const moon = (c: number, k: number) => mix(c, MOON, k);

/** A round foliage clump, lit by the moon from the upper left, with an ink outline. */
function clump(c: Ctx, x: number, y: number, r: number, col: number, lw = 1.8) {
  ellipse(c, x, y, r, r * 0.92);
  const g = c.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, rgb(moon(col, 0.45)));
  g.addColorStop(0.55, rgb(col));
  g.addColorStop(1, rgb(dark(col, 0.45)));
  fillInk(c, g, lw);
}

/** Little leaf ticks over foliage so it reads as leaves, not balls. */
function leafTicks(c: Ctx, x: number, y: number, w: number, h: number, n: number, rnd: () => number, col: number) {
  for (let i = 0; i < n; i++) {
    const px = x + rnd() * w;
    const py = y + rnd() * h;
    const a = -0.6 + rnd() * 1.2 + (rnd() < 0.5 ? Math.PI : 0);
    c.beginPath();
    c.ellipse(px, py, 2.6, 1.3, a, 0, Math.PI * 2);
    c.fillStyle = rnd() < 0.55 ? rgb(moon(col, 0.6), 0.55) : rgb(dark(col, 0.5), 0.5);
    c.fill();
  }
}

/** A small five-petal blossom seen from slightly above. */
function blossom(c: Ctx, x: number, y: number, s: number, col: number) {
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    c.beginPath();
    c.ellipse(x + Math.cos(a) * s * 0.9, y + Math.sin(a) * s * 0.65, s * 0.75, s * 0.55, a, 0, Math.PI * 2);
    c.fillStyle = rgb(Math.sin(a) < 0 ? light(col, 0.25) : dark(col, 0.12));
    c.fill();
  }
  c.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    c.moveTo(x + Math.cos(a) * s * 1.65, y + Math.sin(a) * s * 1.2);
    c.ellipse(x + Math.cos(a) * s * 0.9, y + Math.sin(a) * s * 0.65, s * 0.75, s * 0.55, a, 0, Math.PI * 2);
  }
  c.strokeStyle = 'rgba(22,10,20,0.55)';
  c.lineWidth = 0.9;
  c.stroke();
  ellipse(c, x, y, s * 0.42, s * 0.36);
  c.fillStyle = col === 0xffe7a8 ? '#c9762e' : '#ffd36a';
  c.fill();
}

/** The house sunburst with an ink outline (for medallions). */
function paintedSun(c: Ctx, x: number, y: number, s: number, wing: string | CanvasGradient, body: string, spots?: string) {
  drawEmblem(c, x + 1.2, y + 1.6, s * 1.04, INK, INK);
  drawEmblem(c, x, y, s, wing, body, spots);
}

/** A firefly: a little point of light (it pulses, it doesn't flap). */
function fireflySprite(c: Container, size: number, tint: number) {
  const m = new Sprite(emblemTexture());
  m.blendMode = 'add';
  m.anchor.set(0.5);
  m.width = m.height = size;
  m.tint = tint;
  c.addChild(m);
  return m;
}

// ---- The pieces ---------------------------------------------------------------------------------

export function buildPaintedGarden(d: DecorPlacement, t: RoomTheme): BuiltDecor[] | null {
  const { x, y } = d;
  const w = d.w ?? 0;
  const h = d.h ?? 0;
  const rnd = seeded(Math.round(x * 29 + y * 11 + 5));
  switch (d.kind) {
    // ---- Floor ------------------------------------------------------------------------------
    case 'mosaic': {
      const r = w || 110;
      const base = dark(t.carpet, 0.25);
      const acc = t.carpetAccent;
      const res = r > 220 ? 1.5 : 2;
      const v = new Container();
      v.addChild(
        propSprite(x, y, r * 2 + 24, r * 2 + 24, r + 12, r + 12, (c) => {
          shadow(c, 3, 5, r + 8, r + 8, 0.35);
          // Grout disc.
          ellipse(c, 0, 0, r, r);
          c.fillStyle = rgb(dark(base, 0.45));
          c.fill();
          // Tesserae in rings (opus vermiculatum): each stone a tiny lit trapezoid.
          const tile = r > 200 ? 8 : 6.5;
          const star = (a: number, rr: number) => {
            // Eight-pointed star of the moon compass.
            const k = ((a / (Math.PI * 2)) * 8) % 1;
            const tri = 1 - Math.abs(k - 0.5) * 2;
            return rr < r * 0.72 * (0.32 + 0.68 * Math.pow(tri, 2.2)) && rr > r * 0.24;
          };
          for (let rr = tile * 0.6; rr < r - 1; rr += tile) {
            const n = Math.max(6, Math.round((Math.PI * 2 * rr) / tile));
            const off = rnd() * Math.PI;
            for (let i = 0; i < n; i++) {
              const a = off + (i / n) * Math.PI * 2;
              let col = mix(base, rnd() < 0.5 ? 0x0a1a20 : moon(base, 0.4), rnd() * 0.35);
              if (rr > r - tile * 2.2) col = mix(acc, dark(acc, 0.5), rnd() * 0.4); // Outer band.
              else if (rr > r - tile * 3.2) col = dark(base, 0.35 + rnd() * 0.15);
              else if (Math.abs(rr - r * 0.8) < tile * 0.55) col = mix(acc, base, 0.3 + rnd() * 0.2); // Thin ring.
              else if (star(a, rr)) col = mix(Math.floor((((a - off + 10 * Math.PI) / (Math.PI * 2)) * 16)) % 2 ? acc : light(acc, 0.15), dark(acc, 0.4), rnd() * 0.3 + (rr / r) * 0.25);
              else if (rr <= r * 0.24) col = mix(dark(base, 0.3), 0x0a1430, 0.4 + rnd() * 0.2);
              const a0 = a - (Math.PI / n) * 0.82;
              const a1 = a + (Math.PI / n) * 0.82;
              const r0 = rr - tile * 0.42;
              const r1 = rr + tile * 0.42;
              c.beginPath();
              c.arc(0, 0, Math.max(0.5, r1), a0, a1);
              c.arc(0, 0, Math.max(0.1, r0), a1, a0, true);
              c.closePath();
              const g = c.createLinearGradient(-r, -r, r, r);
              g.addColorStop(0, rgb(light(col, 0.12)));
              g.addColorStop(1, rgb(dark(col, 0.15)));
              c.fillStyle = g;
              c.fill();
              // A few glass tesserae catch the light.
              if (rnd() < 0.025) {
                c.fillStyle = rgb(t.neon, 0.55);
                c.fill();
              }
            }
          }
          // Moon phases around the ring.
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
            const mx = Math.cos(a) * r * 0.8;
            const my = Math.sin(a) * r * 0.8;
            const mr = r * 0.055;
            ellipse(c, mx, my, mr + 3, mr + 3);
            fillInk(c, rgb(dark(base, 0.5)), 1.4);
            ellipse(c, mx, my, mr, mr);
            c.fillStyle = rgb(dark(base, 0.4));
            c.fill();
            // Phase i/8: the lit half, then the terminator ellipse adds or removes light.
            const p = i / 8;
            const k = Math.cos(p * Math.PI * 2);
            const side = p < 0.5 ? 1 : -1;
            const lit = rgb(light(acc, 0.3));
            if (i !== 0) {
              c.beginPath();
              c.ellipse(mx, my, mr, mr, 0, -Math.PI / 2, Math.PI / 2, side < 0);
              c.closePath();
              c.fillStyle = lit;
              c.fill();
              ellipse(c, mx, my, mr * Math.abs(k), mr);
              c.fillStyle = k > 0 ? rgb(dark(base, 0.4)) : lit;
              c.fill();
            } else {
              ellipse(c, mx, my, mr, mr);
              c.strokeStyle = rgb(acc, 0.5);
              c.lineWidth = 1;
              c.stroke();
            }
          }
          // Medallion with the house sunburst.
          const cr = r * 0.24;
          ellipse(c, 0, 0, cr, cr);
          c.strokeStyle = rgb(acc);
          c.lineWidth = Math.max(2, r * 0.02);
          c.stroke();
          const mg = c.createLinearGradient(-cr, -cr, cr, cr);
          mg.addColorStop(0, rgb(light(acc, 0.5)));
          mg.addColorStop(0.5, rgb(acc));
          mg.addColorStop(1, rgb(dark(acc, 0.4)));
          paintedSun(c, 0, cr * 0.05, cr * 1.5, mg, rgb(dark(acc, 0.55)), rgb(t.neon, 0.8));
          // Gold rim around the whole mosaic.
          ellipse(c, 0, 0, r, r);
          c.strokeStyle = INK;
          c.lineWidth = 3;
          c.stroke();
          ellipse(c, 0, 0, r - 2.5, r - 2.5);
          c.strokeStyle = gold(c, -r, -r, r, r);
          c.lineWidth = 2;
          c.stroke();
          grain(c, -r, -r, r * 2, r * 2, Math.round(r * 0.8), 11, 0.04);
          // Moonlight sheen on the stone.
          glowAt(c, -r * 0.35, -r * 0.4, r * 0.7, r * 0.5, MOON, 0.1, 'lighter');
        }, res),
      );
      // Glass tesserae glinting now and then.
      const glints: { s: Sprite; ph: number }[] = [];
      for (let i = 0; i < Math.round(r / 30); i++) {
        const a = rnd() * Math.PI * 2;
        const rr = r * (0.3 + rnd() * 0.65);
        glints.push({ s: glow(v, x + Math.cos(a) * rr, y + Math.sin(a) * rr, 26, 26, t.neon, 0), ph: rnd() * 10 });
      }
      return [{
        view: v,
        layer: 'floor',
        obstacles: [],
        update: (time) => glints.forEach((g) => (g.s.alpha = 0.55 * Math.pow(Math.max(0, Math.sin(time * 0.9 + g.ph)), 12))),
      }];
    }

    // ---- Plants -----------------------------------------------------------------------------
    case 'tree': {
      const r = w || 56;
      const by = 10; // decor.ts puts the trunk 10 below the spot.
      const trunkTop = by - 46;
      const v = new Container();
      v.addChild(
        propSprite(x, y, 120, 110, 60, 80, (c) => {
          shadow(c, 6, by + 6, r * 0.95, r * 0.42, 0.45);
          // Stone ring around the roots.
          const rx = 22;
          const ry = 9;
          c.beginPath();
          c.ellipse(0, by, rx, ry, 0, 0, Math.PI);
          c.lineTo(-rx, by - 7);
          c.ellipse(0, by - 7, rx, ry, 0, Math.PI, 0, true);
          c.closePath();
          fillInk(c, vgrad(c, by - 7, by + ry, 0x8a8aa0, 0.15, 0.45), 1.8);
          for (let k = 1; k < 6; k++) {
            const a = (k / 6) * Math.PI;
            c.beginPath();
            c.moveTo(Math.cos(a) * rx, by - 7 + Math.sin(a) * ry);
            c.lineTo(Math.cos(a) * rx, by + Math.sin(a) * ry);
            c.strokeStyle = 'rgba(30,24,40,0.45)';
            c.lineWidth = 1.2;
            c.stroke();
          }
          ellipse(c, 0, by - 7, rx, ry);
          fillInk(c, rgb(moon(0x8a8aa0, 0.3)), 1.8);
          ellipse(c, 0, by - 6, rx - 4, ry - 3);
          c.fillStyle = '#2a1e18';
          c.fill();
          for (let k = 0; k < 5; k++) {
            ellipse(c, -12 + k * 6, by - 5 + (k % 2) * 2, 1.6, 1.2);
            c.fillStyle = 'rgba(120,150,110,0.6)';
            c.fill();
          }
          // Trunk with flaring roots.
          c.beginPath();
          c.moveTo(-10, by - 5);
          c.quadraticCurveTo(-5, by - 12, -5, by - 22);
          c.lineTo(-4, trunkTop);
          c.lineTo(4, trunkTop);
          c.lineTo(5, by - 22);
          c.quadraticCurveTo(5, by - 12, 11, by - 4);
          c.quadraticCurveTo(0, by - 8, -10, by - 5);
          c.closePath();
          const tg = c.createLinearGradient(-8, 0, 8, 0);
          tg.addColorStop(0, '#8a7a8a');
          tg.addColorStop(0.35, '#5a4636');
          tg.addColorStop(1, '#2a1c16');
          fillInk(c, tg, 1.8);
          c.strokeStyle = 'rgba(20,10,10,0.4)';
          c.lineWidth = 1;
          for (const k of [-2, 1.5]) {
            c.beginPath();
            c.moveTo(k, by - 10);
            c.lineTo(k + 0.5, trunkTop + 4);
            c.stroke();
          }
        }),
      );
      // The crown sways as one piece around the top of the trunk.
      const crown = new Container();
      crown.position.set(x, y + trunkTop + 6);
      const cw = r * 2.6 + 30;
      const chh = r * 2.2 + 30;
      const blobs: [number, number, number, number][] = [];
      for (let i = 0; i < 16; i++) {
        const a = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd());
        blobs.push([Math.cos(a) * rr * r * 0.78, -r * 0.75 + Math.sin(a) * rr * r * 0.55, r * (0.36 + rnd() * 0.14), LEAF[i % LEAF.length]]);
      }
      blobs.push([0, -r * 0.2, r * 0.42, LEAF[1]], [-r * 0.5, -r * 0.35, r * 0.36, LEAF[2]], [r * 0.5, -r * 0.32, r * 0.36, LEAF[0]]);
      blobs.sort((a, b) => a[1] - b[1]);
      crown.addChild(
        propSprite(0, 0, cw, chh, cw / 2, chh - 18, (c) => {
          // Branches peeking out under the crown.
          c.strokeStyle = '#3a2a22';
          c.lineCap = 'round';
          for (const s of [-1, 1]) {
            c.beginPath();
            c.moveTo(0, 4);
            c.quadraticCurveTo(s * 6, -r * 0.1, s * r * 0.42, -r * 0.3);
            c.lineWidth = 4;
            c.stroke();
          }
          for (const [bx, bby, br, col] of blobs) {
            clump(c, bx, bby, br, col);
            // Silver moonlit edge on each clump's upper left.
            c.beginPath();
            c.arc(bx, bby, br - 3, Math.PI * 1.1, Math.PI * 1.42);
            c.strokeStyle = rgb(SILVER, bby < -r * 0.6 ? 0.5 : 0.25);
            c.lineWidth = 1.8;
            c.stroke();
          }
          c.save();
          c.beginPath();
          for (const [bx, bby, br] of blobs) {
            c.moveTo(bx + br - 2, bby);
            c.ellipse(bx, bby, br - 2, (br - 2) * 0.92, 0, 0, Math.PI * 2);
          }
          c.clip();
          leafTicks(c, -r * 1.2, -r * 1.4, r * 2.4, r * 1.6, Math.round(r * 3), rnd, LEAF[2]);
          c.restore();
          // Moonlight on the upper left.
          glowAt(c, -r * 0.45, -r * 1.05, r * 0.8, r * 0.55, MOON, 0.22, 'lighter');
          // A few pale night blossoms.
          for (let i = 0; i < 6; i++) blossom(c, (rnd() - 0.5) * r * 1.5, -r * 0.75 + (rnd() - 0.5) * r * 0.9, 2.4, [0xffffff, 0xc9a0ff, 0x9fd8ff][i % 3]);
        }),
      );
      // Fairy lights strung through the branches.
      const string = new Graphics();
      const bulbs: [number, number][] = [];
      for (let i = 0; i < 7; i++) {
        const k = i / 6;
        bulbs.push([(-0.8 + k * 1.6) * r, -r * 0.55 + Math.sin(k * Math.PI) * r * 0.3 - (k - 0.5) * r * 0.25]);
      }
      string.moveTo(bulbs[0][0], bulbs[0][1]);
      for (let i = 1; i < bulbs.length; i++) {
        const [px, py] = bulbs[i - 1];
        const [qx, qy] = bulbs[i];
        string.quadraticCurveTo((px + qx) / 2, (py + qy) / 2 + 6, qx, qy);
      }
      string.stroke({ color: 0x1a1420, width: 1.2, alpha: 0.8 });
      crown.addChild(string);
      const dots = bulbs.map(([bx, bby]) => {
        const g = new Graphics().circle(0, 0, 2.6).fill(0xffe7a8).circle(-0.7, -0.8, 1).fill(0xffffff);
        g.position.set(bx, bby);
        crown.addChild(g);
        return g;
      });
      const lights = bulbs.map(([bx, bby]) => glow(crown, bx, bby, 30, 30, 0xffe7a8, 0.6));
      v.addChild(crown);
      const ph = rnd() * 10;
      return [ent(v, [box(x, y, 34, 34)], y + 24, (time) => {
        crown.rotation = Math.sin(time * 0.5 + ph) * 0.02;
        lights.forEach((l, i) => {
          const k = 0.35 + 0.65 * Math.max(0, Math.sin(time * 2 + i * 1.7 + ph));
          l.alpha = 0.25 + 0.5 * k;
          dots[i].alpha = 0.55 + 0.45 * k;
        });
      })];
    }

    case 'hedge': {
      const hw = w || 160;
      const hh = h || 40;
      const H = 30; // Height of the front face.
      const L = -hw / 2;
      const top0 = -hh / 2 - H;
      const front0 = hh / 2 - H;
      const bot = hh / 2;
      const v = new Container();
      v.addChild(
        propSprite(x, y, hw + 40, hh + H + 50, hw / 2 + 20, hh / 2 + H + 22, (c) => {
          shadow(c, 4, bot + 2, hw / 2 + 14, Math.min(26, hh / 2 + 8), 0.55);
          // Bumpy leafy silhouette: bumps along every edge, outlined as one shape.
          const bumpsTop: [number, number, number][] = [];
          const bumpsFront: [number, number, number][] = [];
          const step = 9;
          for (let px = L + 5; px <= hw / 2 - 5 + 0.1; px += Math.max(6, (hw - 10) / Math.max(1, Math.round((hw - 10) / step)))) {
            bumpsTop.push([px, top0 + 3, 6 + rnd() * 2]);
            bumpsFront.push([px, bot - 3, 5 + rnd() * 2]);
          }
          for (let py = top0 + 6; py <= bot - 4; py += step) {
            const fr = py > front0;
            (fr ? bumpsFront : bumpsTop).push([L + 3, py, 5.5 + rnd() * 2], [-L - 3, py, 5.5 + rnd() * 2]);
          }
          const shapeTop = () => rrect(c, L, top0, hw, hh, 10);
          const shapeFront = () => rrect(c, L, front0 - 4, hw, H + 4, 8);
          // Pass 1: ink.
          c.fillStyle = INK;
          c.strokeStyle = INK;
          c.lineWidth = 4;
          for (const s of [shapeTop, shapeFront]) {
            s();
            c.fill();
            c.stroke();
          }
          for (const [bx, bby, br] of [...bumpsTop, ...bumpsFront]) {
            ellipse(c, bx, bby, br, br * 0.9);
            c.fill();
            c.stroke();
          }
          // Pass 2: front face, in the shade, built from overlapping leaf clumps.
          c.fillStyle = vgrad(c, front0, bot, LEAF[0], 0.05, 0.5);
          shapeFront();
          c.fill();
          for (const [bx, bby, br] of bumpsFront) {
            ellipse(c, bx, bby, br, br * 0.9);
            c.fill();
          }
          c.save();
          shapeFront();
          for (const [bx, bby, br] of bumpsFront) {
            c.moveTo(bx + br, bby);
            c.ellipse(bx, bby, br, br * 0.9, 0, 0, Math.PI * 2);
          }
          c.clip();
          const fc: [number, number, number][] = [];
          for (let py = front0 + 2; py < bot + 6; py += 7) for (let px = L - 2 + (py % 2) * 4; px < hw / 2 + 4; px += 9) fc.push([px + (rnd() - 0.5) * 4, py + (rnd() - 0.5) * 3, 6 + rnd() * 2]);
          for (const [px, py, pr] of fc) {
            const k = (py - front0) / H;
            ellipse(c, px, py, pr, pr * 0.85);
            const g = c.createRadialGradient(px - pr * 0.4, py - pr * 0.5, 0.5, px, py, pr);
            g.addColorStop(0, rgb(dark(LEAF[1], 0.05 + k * 0.2)));
            g.addColorStop(1, rgb(dark(LEAF[0], 0.4 + k * 0.3)));
            c.fillStyle = g;
            c.fill();
            c.strokeStyle = 'rgba(8,16,14,0.35)';
            c.lineWidth = 1;
            c.stroke();
          }
          c.restore();
          // Top face, catching the moonlight: a carpet of small lit clumps.
          c.fillStyle = rgb(LEAF[1]);
          shapeTop();
          c.fill();
          for (const [bx, bby, br] of bumpsTop) {
            ellipse(c, bx, bby, br, br * 0.9);
            c.fill();
          }
          c.save();
          shapeTop();
          for (const [bx, bby, br] of bumpsTop) {
            c.moveTo(bx + br, bby);
            c.ellipse(bx, bby, br, br * 0.9, 0, 0, Math.PI * 2);
          }
          c.clip();
          const tc: [number, number, number][] = [];
          for (let py = top0 - 2; py < top0 + hh + 6; py += 6.5) for (let px = L - 2 + (Math.round(py) % 2) * 4; px < hw / 2 + 4; px += 8.5) tc.push([px + (rnd() - 0.5) * 4, py + (rnd() - 0.5) * 3, 5.5 + rnd() * 2.5]);
          for (const [px, py, pr] of tc) {
            const k = Math.min(1, (py - top0) / Math.max(40, hh));
            const lx = (px - L) / hw;
            const col = LEAF[(Math.floor(px * 7 + py * 3) & 3)];
            ellipse(c, px, py, pr, pr * 0.85);
            const g = c.createRadialGradient(px - pr * 0.4, py - pr * 0.5, 0.5, px, py, pr);
            g.addColorStop(0, rgb(moon(light(col, 0.12), 0.55 - k * 0.15 - lx * 0.12)));
            g.addColorStop(1, rgb(moon(col, 0.12 - k * 0.1)));
            c.fillStyle = g;
            c.fill();
            c.strokeStyle = 'rgba(8,16,14,0.22)';
            c.lineWidth = 1;
            c.stroke();
          }
          leafTicks(c, L, top0, hw, hh, Math.round((hw * hh) / 45), rnd, LEAF[2]);
          c.restore();
          // Shadowed seam where the top meets the front, with leaves hanging over it.
          c.beginPath();
          c.moveTo(L + 4, front0 + 1);
          c.lineTo(hw / 2 - 4, front0 + 1);
          c.strokeStyle = 'rgba(6,14,12,0.55)';
          c.lineWidth = 2.5;
          c.stroke();
          for (let px = L + 6; px < hw / 2 - 4; px += 8) {
            c.beginPath();
            c.arc(px, front0 - 1, 4.5, 0.1, Math.PI - 0.1);
            c.fillStyle = rgb(dark(LEAF[2], 0.1));
            c.fill();
            c.strokeStyle = 'rgba(8,16,14,0.5)';
            c.lineWidth = 1;
            c.stroke();
          }
          glowAt(c, L + hw * 0.3, top0 + hh * 0.3, Math.max(30, hw * 0.4), Math.max(20, hh * 0.5), MOON, 0.12, 'lighter');
          // A handful of small white flowers.
          for (let i = 0; i < Math.max(2, Math.round((hw + hh) / 40)); i++) {
            const top = rnd() < 0.6;
            blossom(c, L + 6 + rnd() * (hw - 12), top ? top0 + 6 + rnd() * (hh - 12) : front0 + 6 + rnd() * (H - 12), 2, top ? 0xffffff : 0xc9a0ff);
          }
        }),
      );
      // Fireflies drifting over the hedge.
      const flies: { s: Sprite; ph: number; px: number; py: number }[] = [];
      for (let i = 0; i < Math.max(1, Math.round((hw + hh) / 110)); i++) {
        const px = x + L + 10 + rnd() * (hw - 20);
        const py = y + top0 + rnd() * hh - 10;
        flies.push({ s: glow(v, px, py, 18, 18, 0xd8ff9a, 0.7), ph: rnd() * 10, px, py });
      }
      return [ent(v, [box(x, y, hw, hh)], y + hh / 2, (time) => {
        for (const f of flies) {
          f.s.position.set(f.px + Math.sin(time * 0.6 + f.ph) * 14, f.py + Math.sin(time * 0.9 + f.ph * 2) * 8);
          f.s.alpha = 0.8 * Math.max(0, Math.sin(time * 1.3 + f.ph));
        }
      })];
    }

    case 'flowerbed': {
      const fw = w || 120;
      const fh = h || 36;
      const Hc = 14; // Stone curb height.
      const L = -fw / 2;
      const top0 = -fh / 2 - Hc;
      const bot = fh / 2;
      const stone = 0x8a8aa0;
      const v = new Container();
      const flowers: [number, number, number, number][] = [];
      const n = Math.round(Math.max(fw, fh) / 6 + (fw * fh) / 260);
      for (let i = 0; i < n; i++) {
        const fx = L + 8 + rnd() * (fw - 16);
        const fy = top0 + 8 + rnd() * (fh - 14);
        flowers.push([fx, fy, BLOOMS[Math.floor(rnd() * 5)], 6 + rnd() * 10]);
      }
      flowers.sort((a, b) => a[1] - b[1]);
      v.addChild(
        propSprite(x, y, fw + 40, fh + Hc + 60, fw / 2 + 20, fh / 2 + Hc + 42, (c) => {
          shadow(c, 3, bot + 2, fw / 2 + 12, Math.min(22, fh / 2 + 6), 0.5);
          // Stone curb: front face with blocks, then the top rim.
          rrect(c, L, bot - Hc - 6, fw, Hc + 6, 6);
          fillInk(c, vgrad(c, bot - Hc, bot, stone, 0.1, 0.5), 2);
          for (let px = L + 16 + (rnd() * 8); px < fw / 2 - 6; px += 18 + rnd() * 6) {
            c.beginPath();
            c.moveTo(px, bot - Hc + 1);
            c.lineTo(px, bot - 1);
            c.strokeStyle = 'rgba(30,24,40,0.45)';
            c.lineWidth = 1.2;
            c.stroke();
          }
          rrect(c, L, top0, fw, fh, 7);
          const sg = c.createLinearGradient(L, top0, L + fw * 0.4, top0 + fh);
          sg.addColorStop(0, rgb(moon(stone, 0.45)));
          sg.addColorStop(1, rgb(stone));
          fillInk(c, sg, 2);
          rrect(c, L, top0, fw, fh, 7);
          rim(c, 0.35, 1.3);
          // Soil.
          rrect(c, L + 5, top0 + 4, fw - 10, fh - 9, 5);
          const so = c.createLinearGradient(0, top0, 0, top0 + fh);
          so.addColorStop(0, '#1e1410');
          so.addColorStop(1, '#3a2a1e');
          c.fillStyle = so;
          c.fill();
          c.strokeStyle = 'rgba(10,4,8,0.6)';
          c.lineWidth = 1.2;
          c.stroke();
          // Low leafy mounds.
          for (let i = 0; i < (fw * fh) / 90; i++) {
            const px = L + 9 + rnd() * (fw - 18);
            const py = top0 + 8 + rnd() * (fh - 15);
            ellipse(c, px, py, 4 + rnd() * 2.5, 3 + rnd() * 1.5);
            c.fillStyle = rgb(rnd() < 0.5 ? LEAF[2] : moon(LEAF[1], 0.2));
            c.fill();
            c.strokeStyle = 'rgba(10,20,16,0.5)';
            c.lineWidth = 1;
            c.stroke();
          }
          // Flowers on stems, back to front.
          for (const [fx, fy, col, sh] of flowers) {
            c.beginPath();
            c.moveTo(fx, fy);
            c.quadraticCurveTo(fx + 2, fy - sh * 0.5, fx, fy - sh);
            c.strokeStyle = rgb(LEAF[2]);
            c.lineWidth = 1.6;
            c.stroke();
            leaf(c, fx, fy - sh * 0.4, rnd() < 0.5 ? -0.5 : Math.PI + 0.5, 6, 2.6, LEAF[2]);
            blossom(c, fx, fy - sh, 3.4, col);
          }
          glowAt(c, L + fw * 0.3, top0 + fh * 0.2, Math.max(24, fw * 0.4), Math.max(18, fh * 0.4), MOON, 0.15, 'lighter');
        }),
      );
      // The pale moonflowers glow softly.
      const glowing = flowers.filter((f) => f[2] === 0xffffff || f[2] === 0x9fd8ff).slice(0, 6);
      const gl = glowing.map((f) => ({ s: glow(v, x + f[0], y + f[1] - f[3], 22, 22, f[2] === 0xffffff ? 0xeaf4ff : 0x9fd8ff, 0.4), ph: rnd() * 10 }));
      return [ent(v, [box(x, y, fw, fh)], y + fh / 2, (time) => gl.forEach((g) => (g.s.alpha = 0.25 + 0.25 * Math.sin(time * 1.4 + g.ph))))];
    }

    // ---- Lights and water -------------------------------------------------------------------
    case 'lanternPost': {
      const LY = -104; // Centre of the lantern glass.
      const v = new Container();
      v.addChild(
        propSprite(x, y, 80, 170, 40, 150, (c) => {
          shadow(c, 3, 2, 18, 7, 0.55);
          // Stone foot and iron base.
          c.beginPath();
          c.ellipse(0, 0, 11, 4.5, 0, 0, Math.PI);
          c.lineTo(-11, -6);
          c.ellipse(0, -6, 11, 4.5, 0, Math.PI, 0, true);
          c.closePath();
          fillInk(c, vgrad(c, -6, 4, 0x8a8aa0, 0.1, 0.5), 1.6);
          ellipse(c, 0, -6, 11, 4.5);
          fillInk(c, rgb(moon(0x8a8aa0, 0.3)), 1.6);
          c.beginPath();
          c.moveTo(-7, -7);
          c.lineTo(-4.5, -22);
          c.lineTo(4.5, -22);
          c.lineTo(7, -7);
          c.closePath();
          const ig = c.createLinearGradient(-7, 0, 7, 0);
          ig.addColorStop(0, '#5a6078');
          ig.addColorStop(0.4, '#2a2a38');
          ig.addColorStop(1, '#121218');
          fillInk(c, ig, 1.6);
          // Iron post.
          rrect(c, -2.6, LY + 20, 5.2, -22 - LY - 20, 2);
          const pg = c.createLinearGradient(-3, 0, 3, 0);
          pg.addColorStop(0, '#7a84a0');
          pg.addColorStop(0.35, '#2a2a38');
          pg.addColorStop(1, '#0e0e14');
          fillInk(c, pg, 1.4);
          for (const ry of [-26, -54, LY + 24]) {
            rrect(c, -4.5, ry - 2, 9, 4, 2);
            fillInk(c, gold(c, -4.5, ry - 2, 4.5, ry + 2), 1);
          }
          // Curly iron scrolls under the lantern.
          for (const s of [-1, 1]) {
            c.beginPath();
            c.moveTo(0, LY + 34);
            c.bezierCurveTo(s * 4, LY + 24, s * 14, LY + 26, s * 12, LY + 18);
            c.arc(s * 9.5, LY + 18, 2.5, 0, Math.PI * 2 * (s < 0 ? 1 : 1));
            c.strokeStyle = '#1a1a24';
            c.lineWidth = 2;
            c.stroke();
          }
          // Lantern: brass tray, glass cage, roof and finial.
          rrect(c, -11, LY + 14, 22, 5, 2);
          fillInk(c, gold(c, -11, LY + 14, 11, LY + 19), 1.4);
          c.beginPath();
          c.moveTo(-10, LY + 14);
          c.lineTo(-12, LY - 12);
          c.lineTo(12, LY - 12);
          c.lineTo(10, LY + 14);
          c.closePath();
          const gg = c.createLinearGradient(0, LY - 12, 0, LY + 14);
          gg.addColorStop(0, '#fff6d8');
          gg.addColorStop(0.5, '#ffd27a');
          gg.addColorStop(1, '#e08a3a');
          fillInk(c, gg, 1.8);
          glowAt(c, 0, LY, 9, 11, 0xffffff, 0.8);
          // Frame bars and a little flame inside.
          c.strokeStyle = '#1a1a24';
          c.lineWidth = 1.6;
          for (const k of [-0.5, 0, 0.5]) {
            c.beginPath();
            c.moveTo(k * 22, LY - 12);
            c.lineTo(k * 20, LY + 14);
            c.stroke();
          }
          c.beginPath();
          c.moveTo(-11, LY + 1);
          c.lineTo(11, LY + 1);
          c.stroke();
          c.fillStyle = 'rgba(255,255,255,0.45)';
          c.beginPath();
          c.moveTo(-9, LY - 10);
          c.lineTo(-6.5, LY - 10);
          c.lineTo(-7.5, LY + 12);
          c.lineTo(-9, LY + 12);
          c.fill();
          // Roof.
          c.beginPath();
          c.moveTo(-15, LY - 12);
          c.quadraticCurveTo(-6, LY - 18, -3, LY - 26);
          c.lineTo(3, LY - 26);
          c.quadraticCurveTo(6, LY - 18, 15, LY - 12);
          c.closePath();
          const rg = c.createLinearGradient(-15, LY - 26, 15, LY - 12);
          rg.addColorStop(0, '#6a7490');
          rg.addColorStop(0.5, '#2a2a38');
          rg.addColorStop(1, '#101016');
          fillInk(c, rg, 1.8);
          c.fillStyle = gold(c, -15, 0, 15, 0);
          c.fillRect(-15, LY - 13.5, 30, 2.6);
          ellipse(c, 0, LY - 29, 3.4, 3.4);
          fillInk(c, gold(c, -3, LY - 32, 3, LY - 26), 1.2);
          c.beginPath();
          c.arc(0, LY - 34, 3, Math.PI * 0.2, Math.PI * 1.8);
          c.strokeStyle = '#1a1a24';
          c.lineWidth = 1.6;
          c.stroke();
          // Warm light on the post and roof underside.
          glowAt(c, 0, LY + 22, 16, 10, 0xffb347, 0.35, 'lighter');
        }),
      );
      const core = new Graphics().ellipse(0, -3, 3, 5).fill({ color: 0xffb347, alpha: 0.95 }).ellipse(0, -2, 1.5, 3).fill(0xfff6d0);
      core.position.set(x, y + LY + 6);
      v.addChild(core);
      const gl = glow(v, x, y + LY, 200, 200, COLORS.lamp, 0.45);
      const hot = glow(v, x, y + LY, 60, 70, 0xfff1c4, 0.5);
      const flies = [0, 1, 2].map(() => fireflySprite(v, 10, 0xe8ff9a));
      // Warm pool of light on the ground (on the floor layer, under everyone's feet).
      const pool = new Container();
      pool.addChild(
        propSprite(x, y, 240, 120, 120, 60, (c) => {
          glowAt(c, 0, 4, 110, 48, 0xffc070, 0.32, 'lighter');
          glowAt(c, 0, 4, 50, 22, 0xffe0a0, 0.25, 'lighter');
        }),
      );
      const ph = rnd() * 10;
      const base = 10 / 64;
      const kick = kicker(2200);
      return [
        ent(v, [box(x, y, 20, 20)], y + 8, (time, dt) => {
          const kk = kick.step(dt);
          const spread = 1 + Math.sin(kk * Math.PI) * 3.5;
          const fl = 1 + Math.sin(time * 17 + ph) * 0.08 + Math.sin(time * 7.3 + ph) * 0.06;
          gl.alpha = 0.4 + Math.sin(time * 4 + ph) * 0.05 + kk * 0.2;
          hot.alpha = 0.4 + (fl - 1) * 2 + kk * 0.3;
          core.scale.set(1, fl);
          pool.alpha = 0.9 + (fl - 1) * 0.8 + kk * 0.3;
          // Fireflies drifting round the lantern, blinking slowly; a poke scatters them.
          flies.forEach((m, i) => {
            const a = time * (0.35 + i * 0.12) * (1 + kk * 3) + i * 2 + ph;
            m.position.set(x + Math.cos(a) * (20 + i * 7) * spread, y + LY - 4 + Math.sin(a * 1.3) * 12 * spread + Math.sin(time * 1.9 + i) * 3);
            const blink = Math.max(0, Math.sin(time * (1.3 + i * 0.3) + i * 2 + ph));
            m.alpha = 0.25 + blink * 0.75;
            m.scale.set(base * (0.8 + blink * 0.35));
          });
        }, kick.poke),
        { view: pool, layer: 'floor', obstacles: [] },
      ];
    }

    case 'moonPool': {
      const r = w || 100;
      const ry = r * 0.7;
      const wall = 12;
      const sy = -wall; // Water surface.
      const v = new Container();
      const pads: [number, number, number, boolean][] = [];
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2;
        const rr = r * (0.4 + rnd() * 0.42);
        pads.push([Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.7 * 0.88, 9 + rnd() * 3, i % 2 === 1]);
      }
      pads.sort((a, b) => a[1] - b[1]);
      v.addChild(
        propSprite(x, y, r * 2 + 70, ry * 2 + 120, r + 35, ry + 90, (c) => {
          shadow(c, 3, 8, r + 22, ry + 14, 0.5);
          const orx = r + 10;
          const ory = ry + 8;
          // Cattails behind the pool.
          for (let i = 0; i < 6; i++) {
            const cx = -orx * 0.55 + i * 5 + (i % 2) * 2;
            const cy = sy - ory * 0.8;
            const hgt = 34 + ((i * 7) % 5) * 6;
            c.beginPath();
            c.moveTo(cx, cy);
            c.quadraticCurveTo(cx - 2 + i * 0.6, cy - hgt * 0.5, cx - 4 + i * 1.5, cy - hgt);
            c.strokeStyle = rgb(LEAF[2]);
            c.lineWidth = 2;
            c.stroke();
            if (i % 2 === 0) {
              rrect(c, cx - 4 + i * 1.5 - 2.4, cy - hgt - 2, 4.8, 12, 2.4);
              fillInk(c, '#5a3a24', 1.1);
            }
          }
          for (let i = 0; i < 4; i++) leaf(c, -orx * 0.5 + i * 6, sy - ory * 0.78, -Math.PI / 2 - 0.5 + i * 0.3, 26 + i * 3, 3.5, LEAF[i % 3]);
          // Stone wall, front face.
          c.beginPath();
          c.ellipse(0, 0, orx, ory, 0, 0, Math.PI);
          c.lineTo(-orx, -wall);
          c.ellipse(0, -wall, orx, ory, 0, Math.PI, 0, true);
          c.closePath();
          fillInk(c, vgrad(c, -wall, ory, 0x6a6a84, 0.15, 0.5), 2.4);
          for (let k = 1; k < 14; k++) {
            const a = (k / 14) * Math.PI;
            const px = Math.cos(a) * orx;
            c.beginPath();
            c.moveTo(px, Math.sin(a) * ory - wall);
            c.lineTo(px, Math.sin(a) * ory);
            c.strokeStyle = 'rgba(20,16,36,0.4)';
            c.lineWidth = 1.2;
            c.stroke();
          }
          // Rim stones (a ring of flat silver-grey slabs).
          c.beginPath();
          c.ellipse(0, sy, orx, ory, 0, 0, Math.PI * 2);
          c.ellipse(0, sy, r - 2, ry - 2, 0, 0, Math.PI * 2, true);
          const rg = c.createLinearGradient(0, sy - ory, 0, sy + ory);
          rg.addColorStop(0, rgb(moon(0xb8b8cc, 0.4)));
          rg.addColorStop(1, '#7a7a92');
          c.fillStyle = rg;
          c.fill('evenodd');
          c.strokeStyle = INK;
          c.lineWidth = 2;
          c.stroke();
          for (let k = 0; k < 18; k++) {
            const a = (k / 18) * Math.PI * 2 + 0.1;
            c.beginPath();
            c.moveTo(Math.cos(a) * (r - 1), sy + Math.sin(a) * (ry - 1));
            c.lineTo(Math.cos(a) * orx, sy + Math.sin(a) * ory);
            c.strokeStyle = 'rgba(30,24,50,0.4)';
            c.lineWidth = 1.2;
            c.stroke();
          }
          // Deep night water.
          c.beginPath();
          c.ellipse(0, sy + 1, r - 2, ry - 2, 0, 0, Math.PI * 2);
          const wg = c.createRadialGradient(-r * 0.2, sy - ry * 0.15, 4, 0, sy, r);
          wg.addColorStop(0, '#2a4a80');
          wg.addColorStop(0.5, '#122a52');
          wg.addColorStop(1, '#060e22');
          c.fillStyle = wg;
          c.fill();
          // Inner shadow at the back edge, so it looks deep.
          c.save();
          c.clip();
          c.beginPath();
          c.ellipse(0, sy - 6, r + 4, ry + 2, 0, 0, Math.PI * 2);
          c.ellipse(0, sy + 4, r - 4, ry - 4, 0, 0, Math.PI * 2, true);
          c.fillStyle = 'rgba(4,8,20,0.55)';
          c.fill('evenodd');
          // Reflected stars.
          for (let i = 0; i < 22; i++) {
            const sx = (rnd() - 0.5) * r * 1.8;
            const syy = sy + (rnd() - 0.5) * ry * 1.6;
            ellipse(c, sx, syy, 0.6 + rnd() * 0.9, 0.5 + rnd() * 0.5);
            c.fillStyle = `rgba(230,240,255,${0.35 + rnd() * 0.5})`;
            c.fill();
          }
          c.restore();
          // Silver sheen and a moonbeam streak.
          glowAt(c, -r * 0.2, sy - ry * 0.1, r * 0.55, ry * 0.4, MOON, 0.18, 'lighter');
          for (let k = 0; k < 4; k++) {
            const ww = r * 0.24 - k * r * 0.04;
            ellipse(c, -r * 0.2, sy - ry * 0.1 + r * 0.24 + k * 6, ww / 2, 1.2);
            c.fillStyle = `rgba(255,241,196,${0.22 - k * 0.04})`;
            c.fill();
          }
          // Lily pads and pink water lilies.
          for (const [px, py, pr, bloom] of pads) {
            c.beginPath();
            c.ellipse(px, py, pr, pr * 0.55, 0, 0.35, Math.PI * 2 - 0.05);
            c.lineTo(px, py);
            c.closePath();
            const lg = c.createLinearGradient(px - pr, py - pr * 0.5, px + pr, py + pr * 0.5);
            lg.addColorStop(0, rgb(moon(0x3d8a4a, 0.25)));
            lg.addColorStop(1, '#1f5a2c');
            fillInk(c, lg, 1.4);
            c.strokeStyle = 'rgba(160,220,170,0.4)';
            c.lineWidth = 0.8;
            for (let k = 0; k < 4; k++) {
              const a = 0.8 + k * 1.3;
              c.beginPath();
              c.moveTo(px, py);
              c.lineTo(px + Math.cos(a) * pr * 0.8, py + Math.sin(a) * pr * 0.44);
              c.stroke();
            }
            if (bloom) {
              for (let k = 0; k < 6; k++) {
                const a = (k / 6) * Math.PI * 2;
                c.beginPath();
                c.ellipse(px + 1 + Math.cos(a) * 2.6, py - 3 + Math.sin(a) * 1.4, 3.6, 1.8, a, 0, Math.PI * 2);
                c.fillStyle = k < 3 ? '#ffb8d4' : '#ff8ab8';
                c.fill();
                c.strokeStyle = 'rgba(22,10,20,0.5)';
                c.lineWidth = 0.8;
                c.stroke();
              }
              c.beginPath();
              c.moveTo(px - 2, py - 3);
              c.lineTo(px + 1, py - 9);
              c.lineTo(px + 4, py - 3);
              c.fillStyle = '#ffd6e6';
              c.fill();
              ellipse(c, px + 1, py - 3.5, 1.6, 1.2);
              c.fillStyle = '#ffd36a';
              c.fill();
            }
          }
          // A firefly jar standing on the rim, front right.
          const mx = orx * 0.62;
          const my = sy + ory * 0.72;
          rrect(c, mx - 6, my - 6, 12, 8, 2);
          fillInk(c, vgrad(c, my - 6, my + 2, 0xb8b8cc, 0.2, 0.4), 1.2);
          glowAt(c, mx, my - 16, 16, 16, 0xe8ff9a, 0.45, 'lighter');
          rrect(c, mx - 7, my - 26, 14, 20, 4);
          const jg = c.createLinearGradient(mx - 7, 0, mx + 7, 0);
          jg.addColorStop(0, 'rgba(230,250,255,0.55)');
          jg.addColorStop(0.5, 'rgba(200,240,210,0.25)');
          jg.addColorStop(1, 'rgba(150,190,200,0.5)');
          fillInk(c, jg, 1.2);
          rrect(c, mx - 5, my - 30, 10, 4, 1.5);
          fillInk(c, gold(c, mx - 5, 0, mx + 5, 0), 1);
          for (const [fx, fy] of [[-2, -18], [2.5, -13], [0, -22]]) {
            ellipse(c, mx + fx, my + fy, 1.4, 1.4);
            c.fillStyle = '#f4ffb0';
            c.fill();
          }
          grain(c, -orx, sy - ory, orx * 2, ory * 2 + wall, Math.round(r * 0.6), 7, 0.035);
        }),
      );
      // The moon's reflection, its glow, and the ripples drawn live.
      const mxw = x - r * 0.2;
      const myw = y + sy - r * 0.1;
      const moonGl = glow(v, mxw, myw, r * 0.9, r * 0.9, 0xfff1c4, 0.5);
      const disc = new Graphics()
        .ellipse(0, 0, r * 0.16, r * 0.16 * 0.8)
        .fill({ color: 0xfff1c4, alpha: 0.9 })
        .ellipse(r * 0.04, r * 0.02, r * 0.05, r * 0.035)
        .fill({ color: 0xd8c89a, alpha: 0.5 })
        .ellipse(-r * 0.05, -r * 0.04, r * 0.03, r * 0.022)
        .fill({ color: 0xd8c89a, alpha: 0.45 });
      disc.position.set(mxw, myw);
      v.addChild(disc);
      const ripple = new Graphics();
      v.addChild(ripple);
      const fly = fireflySprite(v, 11, 0xdff4ff);
      const flyGl = glow(v, x, y, 34, 34, 0x9fd8ff, 0.5);
      const ph = rnd() * 10;
      const kick = kicker(1600);
      return [
        ent(v, [{ x: x - r, y: y - r * 0.7, w: r * 2, h: r * 1.4 }], y + r * 0.7, (time, dt) => {
          const kk = kick.step(dt);
          disc.scale.x = 1 + Math.sin(time * 1.3) * 0.08;
          disc.alpha = 0.85 + Math.sin(time * 2.1) * 0.1;
          moonGl.alpha = 0.4 + Math.sin(time * 0.8) * 0.1 + kk * 0.5;
          moonGl.width = moonGl.height = r * 0.9 * (1 + kk * 0.6);
          ripple.clear();
          const k = (time * 0.25) % 1;
          ripple.ellipse(x + r * 0.3, y + sy + r * 0.2, 10 + k * 50, (10 + k * 50) * 0.6).stroke({ color: 0xbfe6ff, width: 1.5, alpha: (1 - k) * 0.4 });
          const k2 = (time * 0.25 + 0.5) % 1;
          ripple.ellipse(x - r * 0.45, y + sy - r * 0.15, 6 + k2 * 30, (6 + k2 * 30) * 0.6).stroke({ color: 0xbfe6ff, width: 1.2, alpha: (1 - k2) * 0.3 });
          if (kk > 0) for (let i = 0; i < 3; i++) {
            const e = Math.min(1, (1 - kk) * 1.6 - i * 0.2);
            if (e > 0) ripple.ellipse(mxw, myw, 8 + e * r * 0.9, (8 + e * r * 0.9) * 0.6).stroke({ color: 0xfff1c4, width: 2, alpha: (1 - e) * 0.7 });
          }
          // A moon-pale firefly drifting over the water.
          const a = time * 0.35 + ph;
          fly.position.set(x + Math.cos(a) * r * 0.55, y + sy + Math.sin(a) * ry * 0.45 - 18 - Math.sin(time * 1.6) * 4);
          fly.alpha = 0.55 + 0.45 * Math.sin(time * 1.8 + ph);
          flyGl.position.set(fly.x, fly.y);
          flyGl.alpha = 0.45 + kk * 0.3;
        }, kick.poke),
      ];
    }

    // ---- Wall -------------------------------------------------------------------------------
    case 'window': {
      const ww = w || 80;
      const T = 18;
      const H = WALL_H - 50;
      const fr = 6; // Frame width.
      const hasMoon = rnd() < 0.5;
      const v = new Container();
      const stars: [number, number, number][] = [];
      for (let i = 0; i < 14; i++) stars.push([-ww / 2 + 6 + rnd() * (ww - 12), T + 10 + rnd() * (H - 26), rnd() * 1.2 + 0.4]);
      const arch = (c: Ctx, ox: number, oy: number, aw: number, ah: number) => {
        const rr = aw / 2;
        c.beginPath();
        c.moveTo(ox - rr, oy + ah);
        c.lineTo(ox - rr, oy + rr);
        c.arc(ox, oy + rr, rr, Math.PI, 0);
        c.lineTo(ox + rr, oy + ah);
        c.closePath();
      };
      v.addChild(
        propSprite(x, 0, ww + 40, WALL_H + 20, ww / 2 + 20, 0, (c) => {
          // Shadow cast on the wall.
          c.fillStyle = 'rgba(0,0,0,0.35)';
          arch(c, 4, T - fr + 6, ww + fr * 2, H + fr * 2);
          c.fill();
          // Stone frame (wall trim colour).
          arch(c, 0, T - fr, ww + fr * 2, H + fr * 2);
          const tg = c.createLinearGradient(-ww / 2, T, ww / 2, T + H);
          tg.addColorStop(0, rgb(light(t.wallTrim, 0.3)));
          tg.addColorStop(0.5, rgb(t.wallTrim));
          tg.addColorStop(1, rgb(dark(t.wallTrim, 0.35)));
          fillInk(c, tg, 2);
          // Keystone.
          c.beginPath();
          c.moveTo(-6, T - fr - 3);
          c.lineTo(6, T - fr - 3);
          c.lineTo(4, T + 5);
          c.lineTo(-4, T + 5);
          c.closePath();
          fillInk(c, vgrad(c, T - fr - 3, T + 5, t.wallTrim, 0.35, 0.2), 1.4);
          // Night sky glass.
          arch(c, 0, T, ww, H);
          const sky = c.createLinearGradient(0, T, 0, T + H);
          sky.addColorStop(0, '#060a24');
          sky.addColorStop(0.6, '#13214a');
          sky.addColorStop(1, '#2a3a6a');
          c.fillStyle = sky;
          c.fill();
          c.save();
          c.clip();
          // Moon and stars.
          if (hasMoon) {
            const mx = ww * 0.15;
            const my = T + H * 0.3;
            glowAt(c, mx, my, ww * 0.45, ww * 0.45, 0xfff1c4, 0.35, 'lighter');
            ellipse(c, mx, my, ww * 0.14, ww * 0.14);
            c.fillStyle = '#fff1c4';
            c.fill();
            ellipse(c, mx + ww * 0.05, my - ww * 0.02, ww * 0.12, ww * 0.12);
            c.fillStyle = 'rgba(19,33,74,0.0)';
            c.fill();
            for (const [dx, dy, dr] of [[-0.04, 0.02, 0.03], [0.04, -0.04, 0.02], [0.03, 0.05, 0.018]] as const) {
              ellipse(c, mx + ww * dx, my + ww * dy, ww * dr, ww * dr);
              c.fillStyle = 'rgba(200,180,130,0.5)';
              c.fill();
            }
          }
          for (const [sx, sy, sr] of stars) {
            ellipse(c, sx, sy, sr, sr);
            c.fillStyle = '#fff6e6';
            c.fill();
          }
          // Treetops silhouetted against the sky.
          for (let i = 0; i < 6; i++) {
            const tx = -ww / 2 + (i / 5) * ww + (rnd() - 0.5) * 8;
            ellipse(c, tx, T + H - 4 - rnd() * 6, 9 + rnd() * 6, 10 + rnd() * 5);
            c.fillStyle = '#0a1426';
            c.fill();
          }
          // Glass sheen.
          c.beginPath();
          c.moveTo(-ww / 2 + 6, T + H - 6);
          c.lineTo(-ww / 2 + 22, T + 30);
          c.lineTo(-ww / 2 + 30, T + 30);
          c.lineTo(-ww / 2 + 14, T + H - 6);
          c.fillStyle = 'rgba(220,235,255,0.09)';
          c.fill();
          c.restore();
          arch(c, 0, T, ww, H);
          c.strokeStyle = INK;
          c.lineWidth = 1.6;
          c.stroke();
          // Mullion and transom.
          rrect(c, -2, T + 1, 4, H - 1, 1.5);
          fillInk(c, vgrad(c, T, T + H, t.wallTrim, 0.25, 0.3), 1.2);
          rrect(c, -ww / 2, T + H * 0.55 - 2, ww, 4, 1.5);
          fillInk(c, vgrad(c, T + H * 0.55 - 2, T + H * 0.55 + 2, t.wallTrim, 0.3, 0.3), 1.2);
          // Sill.
          rrect(c, -ww / 2 - fr - 4, T + H + fr - 3, ww + fr * 2 + 8, 7, 2);
          fillInk(c, vgrad(c, T + H + fr - 3, T + H + fr + 4, t.wallTrim, 0.35, 0.4), 1.6);
          // Moonlight on the frame.
          arch(c, 0, T - fr, ww + fr * 2, H + fr * 2);
          rim(c, 0.4, 1.4);
        }),
      );
      // Stars twinkle.
      const tw = stars.slice(0, 4).map(([sx, sy]) => ({ s: glow(v, x + sx, sy, 12, 12, 0xeaf4ff, 0), ph: rnd() * 10 }));
      return [{ view: v, layer: 'wall', obstacles: [], update: (time) => tw.forEach((s) => (s.s.alpha = 0.9 * Math.pow(Math.max(0, Math.sin(time * 1.1 + s.ph)), 6))) }];
    }

    case 'ivy': {
      const iw = w || 120;
      const v = new Container();
      const tips: [number, number][] = [];
      v.addChild(
        propSprite(x, 0, iw + 40, WALL_H + 10, iw / 2 + 20, 0, (c) => {
          // Vines trail down from the top of the wall, longer in the middle.
          const nv = Math.max(3, Math.round(iw / 22));
          const vines: [number, number][][] = [];
          for (let i = 0; i < nv; i++) {
            const vx = -iw / 2 + (i + 0.5) * (iw / nv) + (rnd() - 0.5) * 10;
            const mid = 1 - Math.abs(vx / (iw / 2)) * 0.6;
            const len = (WALL_H - 30) * (0.35 + rnd() * 0.6) * mid + 10;
            const pts: [number, number][] = [];
            const ph = rnd() * 6;
            for (let k = 0; k <= 12; k++) {
              const yy = (k / 12) * len;
              pts.push([vx + Math.sin(yy * 0.07 + ph) * 6, yy]);
            }
            vines.push(pts);
            tips.push(pts[pts.length - 1]);
          }
          for (const pts of vines) {
            c.beginPath();
            c.moveTo(pts[0][0], pts[0][1]);
            for (const [px, py] of pts) c.lineTo(px, py);
            c.strokeStyle = 'rgba(0,0,0,0.3)';
            c.lineWidth = 3;
            c.save();
            c.translate(2, 3);
            c.stroke();
            c.restore();
            c.strokeStyle = '#2a3a22';
            c.lineWidth = 2;
            c.stroke();
          }
          // Thick mat along the top edge.
          for (let i = 0; i < iw / 7; i++) {
            const lx = -iw / 2 + rnd() * iw;
            leaf(c, lx, rnd() * 10, Math.PI / 2 + (rnd() - 0.5) * 2.4, 9 + rnd() * 5, 4 + rnd() * 1.5, LEAF[Math.floor(rnd() * 4)]);
          }
          // Heart-shaped ivy leaves along every vine, in pairs.
          for (const pts of vines) {
            for (let k = 1; k < pts.length; k++) {
              const [px, py] = pts[k];
              for (const s of [-1, 1]) {
                if (rnd() < 0.2) continue;
                const col = LEAF[Math.floor(rnd() * 4)];
                const sz = 7 + rnd() * 3 - k * 0.2;
                c.save();
                c.translate(px + s * 2, py);
                c.rotate(s * (0.9 + rnd() * 0.5));
                c.beginPath();
                c.moveTo(0, 0);
                c.bezierCurveTo(-sz * 0.9, sz * 0.2, -sz * 0.7, sz * 1.1, 0, sz * 1.3);
                c.bezierCurveTo(sz * 0.7, sz * 1.1, sz * 0.9, sz * 0.2, 0, 0);
                const g = c.createLinearGradient(-sz, 0, sz, sz);
                g.addColorStop(0, rgb(moon(col, 0.4)));
                g.addColorStop(1, rgb(dark(col, 0.3)));
                fillInk(c, g, 1.2);
                c.beginPath();
                c.moveTo(0, 1);
                c.lineTo(0, sz);
                c.strokeStyle = rgb(moon(col, 0.6), 0.6);
                c.lineWidth = 0.8;
                c.stroke();
                c.restore();
              }
            }
          }
          // Small pale flowers.
          for (let i = 0; i < 6; i++) blossom(c, -iw / 2 + rnd() * iw, 4 + rnd() * 56, 2.4, 0xffe7a8);
          glowAt(c, -iw * 0.25, 20, iw * 0.4, 40, MOON, 0.12, 'lighter');
        }),
      );
      // Glowing buds at the vine tips.
      const buds = tips.filter((_, i) => i % 2 === 0).map(([tx, ty]) => ({ s: glow(v, x + tx, ty + 6, 22, 22, 0xffe7a8, 0.4), ph: rnd() * 10 }));
      return [{ view: v, layer: 'wall', obstacles: [], update: (time) => buds.forEach((b) => (b.s.alpha = 0.25 + 0.25 * Math.sin(time * 1.6 + b.ph))) }];
    }
  }
  return null;
}

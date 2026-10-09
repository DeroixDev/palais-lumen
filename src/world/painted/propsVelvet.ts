// Painted bar, bookshelves, cabinets, curtains, pillars, sconces and statues in the slanted
// 3/4 view. These stand on several floors (velvet, garden, clockwork, crystal, throne), so wood,
// metal and stone come from the room theme. Each piece is painted once; small overlays animate.
// Coordinates: (x, y) is where the piece stands on the floor (the middle of its footprint);
// wall pieces hang on the back wall at x, with y = 0 at the top of the wall.

import { Container, Graphics } from 'pixi.js';
import type { DecorPlacement, RoomTheme } from '../../core/registry';
import { FONT_BODY } from '../../core/fx';
import type { BuiltDecor } from '../decor';
import { P_WALL_H } from './foyerShell';
import { box, ent, flame, glow, kicker } from './foyerProps';
import { GOLD, INK, dark, ellipse, fillInk, glowAt, gold, grain, light, mix, propSprite, rgb, rim, rrect, seeded, shadow, vgrad, type Ctx } from './brush';

// ---- Theme materials ----------------------------------------------------------------------------

/** Polished metal in the theme's trim colour: real gold on gold floors, copper or silver elsewhere. */
function metal(c: Ctx, t: RoomTheme, x0: number, y0: number, x1: number, y1: number) {
  if (t.wallTrim === GOLD) return gold(c, x0, y0, x1, y1);
  const col = t.wallTrim;
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgb(light(col, 0.75)));
  g.addColorStop(0.25, rgb(light(col, 0.2)));
  g.addColorStop(0.55, rgb(dark(col, 0.4)));
  g.addColorStop(0.8, rgb(light(col, 0.15)));
  g.addColorStop(1, rgb(dark(col, 0.6)));
  return g;
}

/** Furniture wood (or lacquer) that suits each floor. */
function wood(t: RoomTheme) {
  switch (t.style) {
    case 'clockwork': return 0x6a3a1c;
    case 'crystal': return 0x2c4868;
    case 'throne': return 0x3a1634;
    case 'garden': return 0x4a3a28;
    default: return 0x5a2414;
  }
}

/** Polished stone for columns. */
function marble(t: RoomTheme) {
  switch (t.style) {
    case 'velvet': return 0x6a2238;
    case 'clockwork': return 0x5a3a2a;
    case 'throne': return 0x3a1a4a;
    case 'crystal': return 0x9ab8d8;
    case 'garden': return 0xb8c0c8;
    default: return light(t.wall, 0.3);
  }
}

/** Counter top: dark marble, polished wood or frosted ice. */
function counterTop(t: RoomTheme) {
  switch (t.style) {
    case 'crystal': return 0xbfe6ff;
    case 'clockwork': return 0x8a5a32;
    case 'throne': return 0x2a1238;
    default: return 0x2a141c;
  }
}

/** Horizontal cylinder gradient, lit from the left. */
function cyl(c: Ctx, x0: number, x1: number, col: number) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, rgb(dark(col, 0.15)));
  g.addColorStop(0.22, rgb(light(col, 0.4)));
  g.addColorStop(0.5, rgb(col));
  g.addColorStop(1, rgb(dark(col, 0.55)));
  return g;
}

const BOTTLES = [0x5fe3ff, 0xff5fa2, 0xffcf7a, 0x7bd47b, 0xc9a0ff, 0xffa94a, 0xd94a4a, 0x9fe8ff];

/** A bottle standing with its base at (x, y). */
function bottle(c: Ctx, x: number, y: number, h: number, w: number, col: number, kind: number) {
  const nh = h * 0.32;
  c.beginPath();
  if (kind === 0) {
    // Wine bottle: round shoulders, long neck.
    c.moveTo(x - w / 2, y);
    c.lineTo(x - w / 2, y - h + nh + w * 0.4);
    c.quadraticCurveTo(x - w / 2, y - h + nh, x - 1.6, y - h + nh - 1);
    c.lineTo(x - 1.6, y - h);
    c.lineTo(x + 1.6, y - h);
    c.lineTo(x + 1.6, y - h + nh - 1);
    c.quadraticCurveTo(x + w / 2, y - h + nh, x + w / 2, y - h + nh + w * 0.4);
    c.lineTo(x + w / 2, y);
  } else if (kind === 1) {
    // Square decanter with a round stopper.
    c.rect(x - w / 2, y - h + nh, w, h - nh);
  } else {
    // Round flask.
    c.moveTo(x - 1.8, y - h);
    c.lineTo(x + 1.8, y - h);
    c.lineTo(x + 1.8, y - h + nh);
    c.arc(x, y - (h - nh) / 2, (h - nh) / 2, -Math.PI / 2 + 0.25, Math.PI * 1.5 - 0.25);
  }
  c.closePath();
  const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, rgb(light(col, 0.35), 0.95));
  g.addColorStop(0.5, rgb(col, 0.95));
  g.addColorStop(1, rgb(dark(col, 0.55), 0.95));
  fillInk(c, g, 1.2);
  if (kind === 1) {
    ellipse(c, x, y - h + nh - 2.5, 3, 3);
    fillInk(c, rgb(light(col, 0.5)), 1);
  } else {
    c.fillStyle = '#e0b25a';
    c.fillRect(x - 1.8, y - h, 3.6, 2.4);
  }
  // Label and a glint.
  if (h > 16) {
    c.fillStyle = 'rgba(255,246,226,0.85)';
    c.fillRect(x - w / 2 + 1.5, y - (h - nh) * 0.55, w - 3, Math.min(6, h * 0.2));
  }
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillRect(x - w / 2 + 1.4, y - h + nh + 2, 1.3, (h - nh) * 0.45);
}

/** A cocktail glass on a counter at (x, y). */
function cocktail(c: Ctx, x: number, y: number, kind: number, col: number) {
  ellipse(c, x + 1, y + 1, 6, 1.8);
  c.fillStyle = 'rgba(10,4,16,0.35)';
  c.fill();
  if (kind === 0) {
    // Martini glass with a cherry.
    ellipse(c, x, y, 4, 1.4);
    fillInk(c, 'rgba(230,246,255,0.8)', 1);
    c.fillStyle = 'rgba(230,246,255,0.9)';
    c.fillRect(x - 0.6, y - 8, 1.2, 8);
    c.beginPath();
    c.moveTo(x - 8, y - 16);
    c.lineTo(x + 8, y - 16);
    c.lineTo(x, y - 8);
    c.closePath();
    fillInk(c, rgb(col, 0.9), 1.2);
    c.beginPath();
    c.arc(x + 4, y - 17, 2.2, 0, Math.PI * 2);
    fillInk(c, '#d42a3a', 0.8);
  } else if (kind === 1) {
    // Highball with a straw and a slice.
    rrect(c, x - 4.5, y - 15, 9, 15, 2);
    fillInk(c, rgb(col, 0.85), 1.2);
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.fillRect(x - 3, y - 13, 1.4, 10);
    c.beginPath();
    c.moveTo(x + 1, y - 12);
    c.lineTo(x + 5, y - 22);
    c.strokeStyle = '#ff5fa2';
    c.lineWidth = 1.6;
    c.stroke();
    c.beginPath();
    c.arc(x - 4, y - 15, 3.4, Math.PI, 0);
    fillInk(c, '#ffe066', 0.8);
  } else {
    // Coupe with a little paper umbrella.
    ellipse(c, x, y, 3.6, 1.3);
    fillInk(c, 'rgba(230,246,255,0.8)', 1);
    c.fillStyle = 'rgba(230,246,255,0.9)';
    c.fillRect(x - 0.6, y - 7, 1.2, 7);
    c.beginPath();
    c.ellipse(x, y - 9, 7, 4, 0, 0, Math.PI);
    c.closePath();
    fillInk(c, rgb(col, 0.9), 1.2);
    c.beginPath();
    c.moveTo(x + 2, y - 10);
    c.lineTo(x + 5, y - 20);
    c.strokeStyle = '#7a4e18';
    c.lineWidth = 1;
    c.stroke();
    c.beginPath();
    c.moveTo(x - 1, y - 18);
    c.quadraticCurveTo(x + 5, y - 25, x + 11, y - 18);
    c.closePath();
    fillInk(c, '#5fe3ff', 0.8);
  }
}

/** A painted moth, wings spread, centred at (0, 0); used for the statue and emblems. */
function mothShape(c: Ctx, s: number, fill: (c: Ctx) => string | CanvasGradient, lw = 1.6) {
  for (const k of [-1, 1]) {
    // Upper wing.
    c.beginPath();
    c.moveTo(0, -2 * s);
    c.bezierCurveTo(k * 10 * s, -22 * s, k * 30 * s, -20 * s, k * 28 * s, -6 * s);
    c.bezierCurveTo(k * 26 * s, 2 * s, k * 10 * s, 4 * s, 0, 2 * s);
    fillInk(c, fill(c), lw);
    // Lower wing.
    c.beginPath();
    c.moveTo(0, 2 * s);
    c.bezierCurveTo(k * 14 * s, 2 * s, k * 22 * s, 12 * s, k * 14 * s, 20 * s);
    c.bezierCurveTo(k * 8 * s, 24 * s, k * 2 * s, 14 * s, 0, 8 * s);
    fillInk(c, fill(c), lw);
    // Eye spot.
    ellipse(c, k * 17 * s, -8 * s, 4 * s, 3.4 * s);
    c.fillStyle = 'rgba(40,20,10,0.35)';
    c.fill();
    ellipse(c, k * 17 * s, -8 * s, 1.8 * s, 1.6 * s);
    c.fillStyle = 'rgba(255,250,230,0.6)';
    c.fill();
    // Antenna.
    c.beginPath();
    c.moveTo(k * 1.5 * s, -9 * s);
    c.quadraticCurveTo(k * 6 * s, -20 * s, k * 10 * s, -20 * s);
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.stroke();
  }
  ellipse(c, 0, 2 * s, 3.2 * s, 11 * s);
  fillInk(c, fill(c), lw);
}

// ---- The pieces ---------------------------------------------------------------------------------

export function buildPaintedVelvet(d: DecorPlacement, t: RoomTheme): BuiltDecor[] | null {
  const { x, y } = d;
  const w = d.w ?? 0;
  const h = d.h ?? 0;
  const rnd = seeded(Math.round(x * 31 + y * 17));
  switch (d.kind) {
    // ---- The bar: counter, back bar full of bottles, stools in front --------------------------
    case 'bar': {
      const bw = w || 300;
      const bh = h || 70;
      const L = x - bw / 2;
      const T = y - bh / 2;
      const by = bh / 2;
      const H = 46;
      const D = Math.round(bh * 0.72);
      const topY = by - H - D;
      const backH = 108;
      const backTop = topY - backH;
      const up = -backTop + 44;
      const col = wood(t);
      const topCol = counterTop(t);
      const label = t.barLabel ?? 'BAR · Limo & Mocktails';
      const icy = t.style === 'crystal';
      const v = new Container();
      const stoolsX: number[] = [];
      for (let i = 0; i < Math.floor(bw / 60); i++) stoolsX.push(-bw / 2 + 30 + i * 60);
      v.addChild(
        propSprite(x, y, bw + 60, up + by + 30, bw / 2 + 30, up, (c) => {
          shadow(c, 0, by - 2, bw * 0.58, 22, 0.6);
          // ---- Back bar: a mirrored cabinet with two shelves of bottles.
          const bx = -bw / 2 + 12;
          const bwid = bw - 24;
          rrect(c, bx, backTop, bwid, backH + 10, 8);
          fillInk(c, vgrad(c, backTop, topY, col, 0.15, 0.4), 2.4);
          rrect(c, bx + 9, backTop + 10, bwid - 18, backH - 12, 5);
          const mg = c.createLinearGradient(bx, backTop, bx + bwid * 0.6, topY);
          mg.addColorStop(0, rgb(mix(t.wall, 0x9ab8d0, 0.35)));
          mg.addColorStop(0.5, rgb(dark(t.wall, 0.2)));
          mg.addColorStop(1, rgb(mix(t.wall, 0x6a8aa8, 0.2)));
          c.fillStyle = mg;
          c.fill();
          c.save();
          c.clip();
          // Mirror sheen and the neon reflected in it.
          for (let k = 0; k < 3; k++) {
            c.beginPath();
            const sx = bx + 30 + k * (bwid / 3);
            c.moveTo(sx, backTop + 10);
            c.lineTo(sx + 26, backTop + 10);
            c.lineTo(sx - 14, topY);
            c.lineTo(sx - 40, topY);
            c.closePath();
            c.fillStyle = 'rgba(255,255,255,0.07)';
            c.fill();
          }
          glowAt(c, 0, backTop + backH * 0.45, bwid * 0.5, backH * 0.6, t.neon, 0.25, 'lighter');
          c.restore();
          // Pilasters between the mirror bays.
          const bays = Math.max(2, Math.round(bwid / 90));
          for (let k = 0; k <= bays; k++) {
            const px = bx + 9 + ((bwid - 18) / bays) * k;
            c.fillStyle = metal(c, t, px - 2.5, 0, px + 2.5, 0);
            c.fillRect(px - 2, backTop + 10, 4, backH - 12);
          }
          // Shelves with bottles.
          for (const [si, sy] of [[0, backTop + 50], [1, backTop + 92]] as const) {
            let px = bx + 18;
            while (px < bx + bwid - 18) {
              const kind = Math.floor(rnd() * 3);
              const bwd = kind === 2 ? 11 : 7 + rnd() * 3;
              const bht = (kind === 2 ? 16 : 20) + rnd() * 10 - si * 2;
              bottle(c, px + bwd / 2, sy, bht, bwd, BOTTLES[Math.floor(rnd() * BOTTLES.length)], kind);
              px += bwd + 3 + rnd() * 4;
            }
            rrect(c, bx + 8, sy - 1, bwid - 16, 5, 2);
            fillInk(c, metal(c, t, 0, sy - 1, 0, sy + 4), 1.2);
          }
          // Crest with the bar's name.
          c.font = `700 12px ${FONT_BODY}`;
          const tw = Math.min(bwid - 30, c.measureText(label).width + 36);
          c.beginPath();
          c.moveTo(-tw / 2 - 8, backTop + 6);
          c.lineTo(-tw / 2 + 6, backTop - 18);
          c.quadraticCurveTo(0, backTop - 32, tw / 2 - 6, backTop - 18);
          c.lineTo(tw / 2 + 8, backTop + 6);
          c.closePath();
          fillInk(c, metal(c, t, -tw / 2, backTop - 28, tw / 2, backTop + 6), 2);
          c.beginPath();
          c.moveTo(-tw / 2 + 2, backTop + 2);
          c.lineTo(-tw / 2 + 10, backTop - 14);
          c.quadraticCurveTo(0, backTop - 26, tw / 2 - 10, backTop - 14);
          c.lineTo(tw / 2 - 2, backTop + 2);
          c.closePath();
          c.fillStyle = rgb(dark(t.wall, 0.3));
          c.fill();
          c.textAlign = 'center';
          c.fillStyle = rgb(light(t.neon, 0.55));
          c.fillText(label, 0, backTop - 4, tw - 20);
          glowAt(c, 0, backTop - 8, tw * 0.5, 16, t.neon, 0.35, 'lighter');
          // Two little lamps on the back bar.
          for (const lx of [bx + 10, bx + bwid - 10]) {
            c.fillStyle = metal(c, t, lx - 1.5, 0, lx + 1.5, 0);
            c.fillRect(lx - 1.5, backTop - 16, 3, 16);
            c.beginPath();
            c.moveTo(lx - 9, backTop - 16);
            c.quadraticCurveTo(lx, backTop - 30, lx + 9, backTop - 16);
            c.closePath();
            fillInk(c, vgrad(c, backTop - 30, backTop - 16, t.light, 0.4, 0.2), 1.4);
            glowAt(c, lx, backTop - 12, 30, 22, t.light, 0.5, 'lighter');
          }
          // ---- Counter: front face with panels, neon strip and a brass foot rail.
          rrect(c, -bw / 2, by - H, bw, H, 8);
          fillInk(c, vgrad(c, by - H, by, col, 0.12, 0.5), 2.6);
          const np = Math.max(3, Math.round(bw / 64));
          const pw = (bw - 24) / np;
          for (let k = 0; k < np; k++) {
            const px = -bw / 2 + 12 + k * pw;
            c.beginPath();
            c.moveTo(px + 5, by - 10);
            c.lineTo(px + 5, by - H + 20);
            c.quadraticCurveTo(px + pw / 2, by - H + 8, px + pw - 5, by - H + 20);
            c.lineTo(px + pw - 5, by - 10);
            c.closePath();
            c.fillStyle = rgb(dark(col, 0.25));
            c.fill();
            c.strokeStyle = metal(c, t, px, 0, px + pw, 0);
            c.lineWidth = 1.6;
            c.stroke();
            // Small moth emblem in each panel.
            c.save();
            c.translate(px + pw / 2, by - H + 26);
            mothShape(c, 0.28, (cc) => metal(cc, t, -8, -6, 8, 6), 0.8);
            c.restore();
          }
          grain(c, -bw / 2, by - H, bw, H, Math.round(bw / 6), 7, 0.05);
          // Neon strip under the top's lip.
          c.fillStyle = rgb(light(t.neon, 0.4));
          c.fillRect(-bw / 2 + 6, by - H + 3, bw - 12, 2);
          glowAt(c, 0, by - H + 6, bw * 0.55, 10, t.neon, 0.4, 'lighter');
          // Foot rail.
          c.fillStyle = metal(c, t, 0, by - 9, 0, by - 4);
          rrect(c, -bw / 2 + 4, by - 10, bw - 8, 5, 2.5);
          fillInk(c, metal(c, t, 0, by - 10, 0, by - 5), 1.2);
          for (let k = 0; k <= np; k++) {
            const px = -bw / 2 + 12 + k * pw;
            c.fillStyle = metal(c, t, px - 2, 0, px + 2, 0);
            c.fillRect(px - 1.5, by - 6, 3, 5);
          }
          // Floor glow from the neon spilling under the counter.
          glowAt(c, 0, by + 6, bw * 0.5, 10, t.neon, 0.25, 'lighter');
          // ---- Counter top: thick lip, then the polished surface.
          rrect(c, -bw / 2 - 5, by - H - 8, bw + 10, 12, 6);
          fillInk(c, vgrad(c, by - H - 8, by - H + 4, icy ? topCol : light(col, 0.12), 0.3, 0.45), 2.2);
          rrect(c, -bw / 2 - 5, topY, bw + 10, D - 2, 8);
          const tg = c.createLinearGradient(-bw / 2, topY, -bw / 2 + bw * 0.4, topY + D);
          tg.addColorStop(0, rgb(light(topCol, icy ? 0.4 : 0.22)));
          tg.addColorStop(1, rgb(dark(topCol, 0.15)));
          fillInk(c, tg, 2.2);
          // Marble veins / frost.
          c.save();
          rrect(c, -bw / 2 - 5, topY, bw + 10, D - 2, 8);
          c.clip();
          const vr = seeded(Math.round(bw * 7 + bh));
          for (let k = 0; k < bw / 26; k++) {
            const vx = -bw / 2 + vr() * bw;
            c.beginPath();
            c.moveTo(vx, topY);
            c.bezierCurveTo(vx + 14, topY + D * 0.3, vx - 10, topY + D * 0.6, vx + 8, topY + D);
            c.strokeStyle = icy ? 'rgba(255,255,255,0.35)' : rgb(light(t.wallTrim, 0.3), 0.18);
            c.lineWidth = 1 + vr();
            c.stroke();
          }
          c.fillStyle = 'rgba(255,250,235,0.12)';
          c.fillRect(-bw / 2, topY + 3, bw, 3);
          c.restore();
          rrect(c, -bw / 2 - 5, topY, bw + 10, D - 2, 8);
          rim(c, 0.35, 1.6);
          // Brass rail along the back edge of the top (the bartender's side).
          c.fillStyle = metal(c, t, 0, topY + 2, 0, topY + 6);
          c.fillRect(-bw / 2 + 4, topY + 3, bw - 8, 3);
          // ---- Things on the counter.
          const ty = by - H - 12;
          const drinkCols = [0xff9ac0, 0xffcf7a, 0x9fe8ff, 0x7bd47b, 0xc9a0ff, 0xffa94a];
          stoolsX.forEach((sx, i) => cocktail(c, sx + (i % 2 ? 6 : -4), ty, i % 3, drinkCols[i % drinkCols.length]));
          // A bowl of citrus, a tray of glasses and a candle near the middle.
          const midA = stoolsX.length > 1 ? (stoolsX[0] + stoolsX[1]) / 2 : -bw / 4;
          ellipse(c, midA, topY + D * 0.45 + 4, 14, 5);
          fillInk(c, metal(c, t, midA - 14, 0, midA + 14, 0), 1.4);
          for (const [fx, fy, fc] of [[-7, -2, '#ffd23a'], [0, -4, '#9ad94a'], [7, -2, '#ffa94a'], [-3, 1, '#ffe066'], [4, 1, '#ffd23a']] as const) {
            c.beginPath();
            c.arc(midA + fx, topY + D * 0.45 + fy, 4.2, 0, Math.PI * 2);
            fillInk(c, fc, 1);
          }
          const midB = stoolsX.length > 2 ? (stoolsX[stoolsX.length - 2] + stoolsX[stoolsX.length - 1]) / 2 : bw / 4;
          rrect(c, midB - 20, topY + D * 0.3, 40, 12, 4);
          fillInk(c, metal(c, t, midB - 20, 0, midB + 20, 0), 1.4);
          for (let k = 0; k < 4; k++) {
            const gx = midB - 13 + k * 9;
            rrect(c, gx - 3, topY + D * 0.3 - 6, 6, 11, 1.5);
            fillInk(c, 'rgba(230,246,255,0.55)', 1);
            c.fillStyle = 'rgba(255,255,255,0.7)';
            c.fillRect(gx - 2, topY + D * 0.3 - 4, 1, 6);
          }
          // Candle in a glass (flame is an overlay).
          rrect(c, -5, topY + D * 0.5 - 10, 10, 12, 3);
          fillInk(c, rgb(mix(t.neon, 0xffffff, 0.4), 0.6), 1.2);
          c.fillStyle = '#fff6e6';
          c.fillRect(-2.5, topY + D * 0.5 - 7, 5, 8);
        }),
      );
      // Overlays: candle, lamp glows, twinkling bottle glints and a shaker that jiggles when used.
      const candle = flame(v, x, y + topY + D * 0.5 - 7, 0.7);
      const lampGl = glow(v, x, y + backTop - 10, bw * 1.1, 120, t.light, 0.22);
      const neonGl = glow(v, x, y + by - H + 4, bw * 1.2, 50, t.neon, 0.2);
      const glints: Graphics[] = [];
      for (let i = 0; i < 6; i++) {
        const g = new Graphics().moveTo(-4, 0).lineTo(4, 0).moveTo(0, -4).lineTo(0, 4).stroke({ color: 0xffffff, width: 1.3 });
        g.position.set(x - bw / 2 + 30 + rnd() * (bw - 60), y + backTop + (rnd() < 0.5 ? 34 : 76));
        v.addChild(g);
        glints.push(g);
      }
      const sxk = x + (stoolsX.length > 1 ? (stoolsX[Math.floor(stoolsX.length / 2)] + stoolsX[Math.floor(stoolsX.length / 2) - 1]) / 2 : 30);
      const shaker = propSprite(sxk, y + topY + D * 0.55, 24, 40, 12, 32, (c) => {
        ellipse(c, 1, 0, 7, 2.5);
        c.fillStyle = 'rgba(10,4,16,0.35)';
        c.fill();
        c.beginPath();
        c.moveTo(-6, 0);
        c.lineTo(-5, -16);
        c.lineTo(5, -16);
        c.lineTo(6, 0);
        c.closePath();
        fillInk(c, cyl(c, -6, 6, 0xc8d0dc), 1.4);
        rrect(c, -4.5, -24, 9, 8, 3);
        fillInk(c, cyl(c, -5, 5, 0xc8d0dc), 1.4);
        ellipse(c, 0, -25, 2.5, 1.8);
        fillInk(c, '#e8eef6', 1);
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.fillRect(-3.5, -14, 1.4, 12);
      });
      v.addChild(shaker);
      const kick = kicker(1100);
      const ph = rnd() * 10;
      const parts: BuiltDecor[] = [
        ent(v, [{ x: L, y: T, w: bw, h: bh }], T + bh, (time, dt) => {
          candle(time);
          const kk = kick.step(dt);
          lampGl.alpha = 0.22 + Math.sin(time * 1.2 + ph) * 0.03 + kk * 0.2;
          neonGl.alpha = 0.18 + Math.sin(time * 2.1 + ph) * 0.04;
          shaker.rotation = Math.sin(time * 40) * 0.35 * kk;
          shaker.y = y + topY + D * 0.55 - Math.abs(Math.sin(time * 20)) * 8 * kk;
          glints.forEach((g, i) => {
            const k = (time * 0.35 + i / glints.length + ph) % 1;
            g.alpha = Math.max(0, Math.sin(k * Math.PI * 3)) * (k < 0.33 ? 0.9 : 0);
            g.scale.set(0.4 + k * 1.5);
          });
        }, kick.poke),
      ];
      // Bar stools: their own entities so guests sitting at them sort correctly.
      const seat = t.sofa ?? 0x3a2230;
      for (const sx of stoolsX) {
        const sv = new Container();
        sv.addChild(
          propSprite(x + sx, T + bh + 18, 56, 70, 28, 46, (c) => {
            shadow(c, 2, 12, 18, 6, 0.55);
            ellipse(c, 0, 12, 10, 3.4);
            fillInk(c, metal(c, t, -10, 8, 10, 15), 1.4);
            rrect(c, -2.5, -6, 5, 18, 2);
            fillInk(c, metal(c, t, -2.5, 0, 2.5, 0), 1);
            // Cushion: a thick round seat with a metal band.
            c.beginPath();
            c.ellipse(0, -8, 15, 5.5, 0, 0, Math.PI);
            c.lineTo(-15, -15);
            c.ellipse(0, -15, 15, 5.5, 0, Math.PI, 0, true);
            c.closePath();
            fillInk(c, vgrad(c, -15, -3, seat, 0.15, 0.45), 1.6);
            c.beginPath();
            c.ellipse(0, -9, 15, 5.5, 0, 0.1, Math.PI - 0.1);
            c.strokeStyle = metal(c, t, -15, 0, 15, 0);
            c.lineWidth = 2;
            c.stroke();
            ellipse(c, 0, -15, 15, 5.5);
            const g = c.createRadialGradient(-5, -17, 1, 0, -15, 15);
            g.addColorStop(0, rgb(light(seat, 0.5)));
            g.addColorStop(0.6, rgb(seat));
            g.addColorStop(1, rgb(dark(seat, 0.3)));
            fillInk(c, g, 1.6);
            ellipse(c, 0, -15, 1.6, 1);
            c.fillStyle = rgb(dark(seat, 0.5));
            c.fill();
          }),
        );
        parts.push(ent(sv, [], T + bh + 24));
      }
      return parts;
    }

    // ---- Sideboard with a vase, a lamp and a little moth box --------------------------------
    case 'cabinet': {
      const cw = w || 110;
      const ch = h || 40;
      const L = x - cw / 2;
      const T = y - ch / 2;
      const by = ch / 2;
      const H = 34;
      const D = Math.round(ch * 0.7);
      const topY = by - H - D;
      const col = wood(t);
      const lampX = cw / 2 - 22;
      const v = new Container();
      v.addChild(
        propSprite(x, y, cw + 40, 140, cw / 2 + 20, 110 - by, (c) => {
          shadow(c, 0, by - 2, cw * 0.58, 12, 0.55);
          // Little gold feet.
          for (const fx of [-cw / 2 + 8, cw / 2 - 8]) {
            c.beginPath();
            c.moveTo(fx - 4, by - 4);
            c.lineTo(fx + 4, by - 4);
            c.lineTo(fx + 2, by + 2);
            c.lineTo(fx - 2, by + 2);
            c.closePath();
            fillInk(c, metal(c, t, fx - 4, 0, fx + 4, 0), 1.2);
          }
          // Body with two doors and a drawer.
          rrect(c, -cw / 2, by - H - 2, cw, H - 2, 6);
          fillInk(c, vgrad(c, by - H, by - 4, col, 0.15, 0.45), 2.2);
          rrect(c, -cw / 2 + 6, by - H + 4, cw - 12, 8, 3);
          c.strokeStyle = metal(c, t, -cw / 2, 0, cw / 2, 0);
          c.lineWidth = 1.4;
          c.stroke();
          for (const s of [-1, 1]) {
            const dx = s < 0 ? -cw / 2 + 6 : 2;
            rrect(c, dx, by - H + 15, cw / 2 - 8, H - 23, 3);
            c.fillStyle = rgb(dark(col, 0.2));
            c.fill();
            c.strokeStyle = metal(c, t, dx, 0, dx + cw / 2, 0);
            c.lineWidth = 1.4;
            c.stroke();
            ellipse(c, s * 5, by - H + 22, 2, 2);
            fillInk(c, metal(c, t, s * 5 - 2, 0, s * 5 + 2, 0), 0.8);
          }
          ellipse(c, 0, by - H + 8, 2, 1.6);
          fillInk(c, metal(c, t, -2, 0, 2, 0), 0.8);
          grain(c, -cw / 2, by - H, cw, H, Math.round(cw / 5), 11, 0.05);
          // Top.
          rrect(c, -cw / 2 - 3, topY, cw + 6, D + 2, 5);
          const tg = c.createLinearGradient(-cw / 2, topY, -cw / 2 + cw * 0.4, topY + D);
          tg.addColorStop(0, rgb(light(col, 0.3)));
          tg.addColorStop(1, rgb(col));
          fillInk(c, tg, 2);
          rrect(c, -cw / 2 - 3, topY, cw + 6, D + 2, 5);
          rim(c, 0.35, 1.4);
          // A lace runner.
          rrect(c, -cw / 2 + 12, topY + 4, cw - 24, D - 6, 3);
          c.fillStyle = 'rgba(255,246,226,0.22)';
          c.fill();
          // Vase with flowers.
          const vx = -cw / 2 + 20;
          const vy = topY + D * 0.6;
          c.beginPath();
          c.moveTo(vx - 4, vy - 22);
          c.quadraticCurveTo(vx - 11, vy - 10, vx - 7, vy);
          c.lineTo(vx + 7, vy);
          c.quadraticCurveTo(vx + 11, vy - 10, vx + 4, vy - 22);
          c.closePath();
          fillInk(c, cyl(c, vx - 10, vx + 10, 0x2f6fd6), 1.4);
          c.fillStyle = 'rgba(255,246,226,0.7)';
          c.fillRect(vx - 7, vy - 12, 14, 1.6);
          for (let i = 0; i < 6; i++) {
            const a = -Math.PI / 2 + (i - 2.5) * 0.45;
            const len = 14 + (i % 2) * 6;
            c.beginPath();
            c.moveTo(vx, vy - 20);
            c.lineTo(vx + Math.cos(a) * len, vy - 20 + Math.sin(a) * len);
            c.strokeStyle = '#3a7a3a';
            c.lineWidth = 1.4;
            c.stroke();
          }
          for (let i = 0; i < 6; i++) {
            const a = -Math.PI / 2 + (i - 2.5) * 0.45;
            const len = 14 + (i % 2) * 6;
            const px = vx + Math.cos(a) * len;
            const py = vy - 20 + Math.sin(a) * len;
            for (let p = 0; p < 5; p++) {
              const pa = (p / 5) * Math.PI * 2;
              ellipse(c, px + Math.cos(pa) * 2.6, py + Math.sin(pa) * 2.6, 2.4, 2.4);
              c.fillStyle = ['#ff9ac0', '#ffe7a8', '#fff6e6'][i % 3];
              c.fill();
            }
            ellipse(c, px, py, 1.4, 1.4);
            c.fillStyle = '#c9902e';
            c.fill();
          }
          // Moth jewellery box in the middle.
          rrect(c, -13, topY + D * 0.4 - 6, 26, 12, 3);
          fillInk(c, vgrad(c, topY + D * 0.4 - 6, topY + D * 0.4 + 6, 0x1b1013, 0.3, 0.2), 1.4);
          rrect(c, -14, topY + D * 0.4 - 10, 28, 6, 3);
          fillInk(c, metal(c, t, -14, 0, 14, 0), 1.2);
          c.save();
          c.translate(0, topY + D * 0.4 - 16);
          mothShape(c, 0.26, (cc) => metal(cc, t, -8, -6, 8, 6), 0.8);
          c.restore();
          // Table lamp.
          const ly = topY + D * 0.6;
          ellipse(c, lampX, ly, 8, 3);
          fillInk(c, metal(c, t, lampX - 8, 0, lampX + 8, 0), 1.2);
          c.beginPath();
          c.moveTo(lampX - 6, ly - 2);
          c.quadraticCurveTo(lampX - 9, ly - 14, lampX, ly - 18);
          c.quadraticCurveTo(lampX + 9, ly - 14, lampX + 6, ly - 2);
          c.closePath();
          fillInk(c, cyl(c, lampX - 9, lampX + 9, t.curtain ?? 0x8a1a2e), 1.4);
          c.beginPath();
          c.moveTo(lampX - 9, ly - 40);
          c.lineTo(lampX + 9, ly - 40);
          c.lineTo(lampX + 15, ly - 22);
          c.lineTo(lampX - 15, ly - 22);
          c.closePath();
          const sg = c.createLinearGradient(0, ly - 40, 0, ly - 22);
          sg.addColorStop(0, rgb(light(t.light, 0.6)));
          sg.addColorStop(1, rgb(dark(t.light, 0.15)));
          fillInk(c, sg, 1.6);
          for (let k = -14; k <= 14; k += 4) {
            c.beginPath();
            c.moveTo(lampX + k, ly - 22);
            c.lineTo(lampX + k, ly - 18);
            c.strokeStyle = rgb(dark(t.light, 0.3));
            c.lineWidth = 1.2;
            c.stroke();
          }
          glowAt(c, lampX, ly - 18, 50, 24, t.light, 0.35, 'lighter');
        }),
      );
      const gl = glow(v, x + lampX, y + topY + D * 0.6 - 30, 130, 100, t.light, 0.35);
      const ph = rnd() * 10;
      return [ent(v, [{ x: L, y: T, w: cw, h: ch }], T + ch, (time) => (gl.alpha = 0.33 + Math.sin(time * 1.3 + ph) * 0.03))];
    }

    // ---- Bookshelf: a tall case against the back (r 0/2) or a side wall (r 1/3) ----------------
    case 'bookshelf': {
      const vertical = (d.r ?? 0) % 2 === 1;
      const len = w || 140;
      const dep = 30;
      const bw = vertical ? dep : len;
      const bh = vertical ? len : dep;
      const L = x - bw / 2;
      const T = y - bh / 2;
      const col = wood(t);
      const bookCols = [0x8a2a2a, 0x2a4a8a, 0x2f6b3a, 0xc9902e, 0x5a2a6a, 0xd9c6a0, 0x1b1b22, 0x6b1a2e, 0x1f5a5a];
      const v = new Container();
      if (!vertical) {
        // Front view: four rows of books behind a carved crown.
        const H = 118;
        const by = bh / 2;
        const top = by - H;
        v.addChild(
          propSprite(x, y, len + 30, H + 70, len / 2 + 15, H + 40 - by, (c) => {
            shadow(c, 0, by - 2, len * 0.58, 12, 0.55);
            rrect(c, -len / 2, top, len, H, 5);
            fillInk(c, vgrad(c, top, by, col, 0.15, 0.45), 2.4);
            rrect(c, -len / 2 + 7, top + 10, len - 14, H - 18, 3);
            c.fillStyle = rgb(dark(col, 0.55));
            c.fill();
            const rows = 4;
            const rh = (H - 18) / rows;
            for (let r = 0; r < rows; r++) {
              const sy = top + 10 + rh * (r + 1);
              let px = -len / 2 + 9;
              while (px < len / 2 - 12) {
                const bt = 5 + Math.floor(rnd() * 5);
                const bht = rh - 4 - Math.floor(rnd() * 6);
                const bc = bookCols[Math.floor(rnd() * bookCols.length)];
                if (px + bt > len / 2 - 9) break;
                if (rnd() < 0.08 && px < len / 2 - 30) {
                  // A leaning book, then a gap.
                  c.save();
                  c.translate(px + 2, sy - 2);
                  c.rotate(0.35);
                  rrect(c, 0, -bht + 2, bt, bht - 2, 1.5);
                  fillInk(c, cyl(c, 0, bt, bc), 1);
                  c.restore();
                  px += bt + 10;
                  continue;
                }
                rrect(c, px, sy - 2 - bht, bt, bht, 1.5);
                fillInk(c, cyl(c, px, px + bt, bc), 1);
                if (rnd() < 0.5) {
                  c.fillStyle = 'rgba(240,200,104,0.8)';
                  c.fillRect(px + 1, sy - 2 - bht + 4, bt - 2, 1.2);
                  c.fillRect(px + 1, sy - 2 - 6, bt - 2, 1.2);
                }
                px += bt + 1;
              }
              rrect(c, -len / 2 + 6, sy - 2, len - 12, 5, 2);
              fillInk(c, vgrad(c, sy - 2, sy + 3, light(col, 0.2), 0.2, 0.3), 1.2);
            }
            // A candle lantern on the top shelf's end and an hourglass.
            // Crown moulding.
            rrect(c, -len / 2 - 6, top - 8, len + 12, 12, 4);
            fillInk(c, vgrad(c, top - 8, top + 4, light(col, 0.1), 0.3, 0.35), 2);
            c.fillStyle = metal(c, t, 0, top - 2, 0, top + 1);
            c.fillRect(-len / 2 - 4, top - 2, len + 8, 2.4);
            c.save();
            c.translate(0, top - 14);
            mothShape(c, 0.36, (cc) => metal(cc, t, -10, -8, 10, 8), 1);
            c.restore();
            rrect(c, -len / 2, top, len, H, 5);
            rim(c, 0.3, 1.4);
            // Plinth.
            rrect(c, -len / 2 - 3, by - 8, len + 6, 9, 3);
            fillInk(c, vgrad(c, by - 8, by + 1, dark(col, 0.1), 0.15, 0.4), 1.8);
          }),
        );
        return [ent(v, [{ x: L, y: T, w: bw, h: bh }], T + bh)];
      }
      // Side view: the case stands along a side wall; we look down onto its top and into the
      // shelves from the room side, with the end panel facing us.
      const H = 92;
      const faceRight = x < 700;
      const s = faceRight ? 1 : -1;
      const top = -len / 2 - H;
      v.addChild(
        propSprite(x, y, dep + 50, len + H + 40, dep / 2 + 25, len / 2 + H + 20, (c) => {
          shadow(c, s * 4, 4, dep * 0.9, len * 0.55, 0.5);
          // Room-facing inside: shelves seen from above with books standing on them.
          const wx = -dep / 2;
          rrect(c, wx, top, dep, len + H, 4);
          fillInk(c, vgrad(c, top, len / 2, col, 0.15, 0.3), 2.4);
          rrect(c, wx + 5, top + 8, dep - 10, len - 10, 3);
          c.fillStyle = rgb(dark(col, 0.55));
          c.fill();
          const rows = 4;
          const rl = (len - 10) / rows;
          for (let r = 0; r < rows; r++) {
            const sy0 = top + 8 + rl * r;
            let py = sy0 + 3;
            while (py < sy0 + rl - 6) {
              const bt = 5 + Math.floor(rnd() * 4);
              const bl = dep - 11 - Math.floor(rnd() * 5);
              const bc = bookCols[Math.floor(rnd() * bookCols.length)];
              const bx0 = faceRight ? wx + dep - 5 - bl : wx + 5;
              rrect(c, bx0, py, bl, bt, 1.4);
              const g = c.createLinearGradient(0, py, 0, py + bt);
              g.addColorStop(0, rgb(light(bc, 0.35)));
              g.addColorStop(1, rgb(dark(bc, 0.35)));
              fillInk(c, g, 0.9);
              // Cream page edges seen from above; the spine faces the room.
              c.fillStyle = 'rgba(250,236,200,0.75)';
              c.fillRect(faceRight ? bx0 + 1.5 : bx0 + 5, py + 1.6, bl - 6.5, Math.max(1, bt - 3.2));
              if (rnd() < 0.5) {
                c.fillStyle = 'rgba(240,200,104,0.9)';
                c.fillRect(faceRight ? bx0 + bl - 2.6 : bx0 + 1.2, py + 0.8, 1.4, bt - 1.6);
              }
              py += bt + 1;
            }
            rrect(c, wx + 3, sy0 + rl - 3, dep - 6, 5, 2);
            fillInk(c, vgrad(c, sy0 + rl - 3, sy0 + rl + 2, light(col, 0.2), 0.2, 0.3), 1.2);
          }
          // End panel facing us.
          const ey = len / 2 - H;
          rrect(c, wx - 2, ey, dep + 4, H, 4);
          fillInk(c, vgrad(c, ey, len / 2, col, 0.1, 0.5), 2.2);
          rrect(c, wx + 5, ey + 12, dep - 10, H - 24, 3);
          c.strokeStyle = metal(c, t, wx, 0, wx + dep, 0);
          c.lineWidth = 1.4;
          c.stroke();
          ellipse(c, 0, ey + H / 2, 4, 4);
          fillInk(c, metal(c, t, -4, ey + H / 2 - 4, 4, ey + H / 2 + 4), 1);
          grain(c, wx, ey, dep, H, 14, 5, 0.06);
          // Crown along the top edge.
          rrect(c, wx - 3, top - 6, dep + 6, 10, 4);
          fillInk(c, vgrad(c, top - 6, top + 4, light(col, 0.15), 0.3, 0.3), 1.8);
          c.fillStyle = metal(c, t, wx, 0, wx + dep, 0);
          c.fillRect(wx - 1, top - 1, dep + 2, 2);
          rrect(c, wx, top, dep, len + H, 4);
          rim(c, 0.3, 1.4);
        }),
      );
      return [ent(v, [{ x: L, y: T, w: bw, h: bh }], T + bh)];
    }

    // ---- Column: marble shaft with metal base and capital -----------------------------------
    case 'pillar': {
      const v = new Container();
      const col = marble(t);
      const R = 20;
      const SH = 150;
      v.addChild(
        propSprite(x, y, 90, SH + 90, 45, SH + 50, (c) => {
          shadow(c, 3, 18, 42, 16, 0.6);
          // Plinth.
          rrect(c, -28, 6, 56, 20, 4);
          fillInk(c, vgrad(c, 6, 26, dark(col, 0.25), 0.1, 0.45), 2.2);
          rrect(c, -28, -12, 56, 22, 5);
          const pg = c.createLinearGradient(-28, -12, -10, 10);
          pg.addColorStop(0, rgb(light(col, 0.3)));
          pg.addColorStop(1, rgb(dark(col, 0.1)));
          fillInk(c, pg, 2.2);
          c.fillStyle = metal(c, t, 0, 22, 0, 25);
          c.fillRect(-27, 21, 54, 2.4);
          // Base torus.
          c.beginPath();
          c.ellipse(0, 2, R + 6, 8, 0, 0, Math.PI);
          c.lineTo(-R - 6, -4);
          c.ellipse(0, -4, R + 6, 8, 0, Math.PI, 0, true);
          c.closePath();
          fillInk(c, metal(c, t, -R - 6, 0, R + 6, 0), 2);
          // Shaft.
          c.beginPath();
          c.moveTo(-R, -SH);
          c.lineTo(-R, -4);
          c.ellipse(0, -4, R, 6.5, 0, Math.PI, 0, true);
          c.lineTo(R, -SH);
          c.closePath();
          fillInk(c, cyl(c, -R, R, col), 2.2);
          c.save();
          c.clip();
          // Fluting.
          for (let k = -3; k <= 3; k++) {
            const fx = Math.sin((k / 4) * (Math.PI / 2)) * R;
            c.beginPath();
            c.moveTo(fx, -SH + 4);
            c.lineTo(fx, -8);
            c.strokeStyle = k < 0 ? 'rgba(255,244,220,0.18)' : 'rgba(10,4,16,0.25)';
            c.lineWidth = 2.2;
            c.stroke();
          }
          // Marble veins.
          const vr = seeded(Math.round(x + y));
          for (let k = 0; k < 4; k++) {
            const vx = -R + vr() * R * 2;
            c.beginPath();
            c.moveTo(vx, -SH);
            c.bezierCurveTo(vx + 10, -SH * 0.7, vx - 12, -SH * 0.4, vx + 4, 0);
            c.strokeStyle = rgb(light(t.wallTrim, 0.4), 0.18);
            c.lineWidth = 1.2;
            c.stroke();
          }
          glowAt(c, -R * 0.4, -SH * 0.55, R * 0.6, SH * 0.45, 0xfff4dc, 0.16, 'lighter');
          c.restore();
          // A metal band a third of the way up.
          c.beginPath();
          c.ellipse(0, -46, R + 1, 6.5, 0, 0, Math.PI);
          c.lineTo(-R - 1, -51);
          c.ellipse(0, -51, R + 1, 6.5, 0, Math.PI, 0, true);
          c.closePath();
          fillInk(c, metal(c, t, -R, 0, R, 0), 1.4);
          // Capital: flared echinus and a square abacus.
          c.beginPath();
          c.moveTo(-R, -SH);
          c.quadraticCurveTo(-R - 2, -SH - 8, -R - 10, -SH - 12);
          c.lineTo(R + 10, -SH - 12);
          c.quadraticCurveTo(R + 2, -SH - 8, R, -SH);
          c.closePath();
          fillInk(c, metal(c, t, -R - 10, -SH - 12, R + 10, -SH), 2);
          // Volutes.
          for (const s of [-1, 1]) {
            c.beginPath();
            c.arc(s * (R + 8), -SH - 8, 5, 0, Math.PI * 2);
            fillInk(c, metal(c, t, s * (R + 8) - 5, -SH - 13, s * (R + 8) + 5, -SH - 3), 1.4);
            c.beginPath();
            c.arc(s * (R + 8), -SH - 8, 2, 0, Math.PI * 2);
            c.fillStyle = 'rgba(60,30,8,0.6)';
            c.fill();
          }
          rrect(c, -R - 13, -SH - 22, (R + 13) * 2, 10, 3);
          fillInk(c, vgrad(c, -SH - 22, -SH - 12, col, 0.35, 0.3), 2);
          rrect(c, -R - 13, -SH - 32, (R + 13) * 2, 12, 3);
          const ag = c.createLinearGradient(-R, -SH - 32, -R + 20, -SH - 20);
          ag.addColorStop(0, rgb(light(col, 0.35)));
          ag.addColorStop(1, rgb(col));
          fillInk(c, ag, 2);
          c.fillStyle = metal(c, t, 0, -SH - 22, 0, -SH - 20);
          c.fillRect(-R - 12, -SH - 22, (R + 12) * 2, 2);
        }),
      );
      return [ent(v, [box(x, y, 52, 52)], y + 28)];
    }

    // ---- Moth statue on a plinth --------------------------------------------------------------
    case 'statue': {
      const v = new Container();
      const golden = t.style === 'throne' || t.style === 'velvet';
      const mat = golden ? 0xe0b25a : 0xcfd6e0;
      const stone = t.style === 'garden' ? 0x9aa4a0 : 0x8a8aa0;
      const matGrad = (c: Ctx, x0: number, y0: number, x1: number, y1: number) => {
        if (golden) return gold(c, x0, y0, x1, y1);
        const g = c.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, rgb(mat));
        g.addColorStop(0.7, rgb(dark(mat, 0.3)));
        g.addColorStop(1, rgb(dark(mat, 0.5)));
        return g;
      };
      v.addChild(
        propSprite(x, y, 110, 170, 55, 140, (c) => {
          shadow(c, 3, 22, 40, 14, 0.6);
          // Stepped plinth.
          rrect(c, -30, 12, 60, 14, 4);
          fillInk(c, vgrad(c, 12, 26, dark(stone, 0.2), 0.1, 0.45), 2);
          rrect(c, -30, 2, 60, 12, 4);
          fillInk(c, vgrad(c, 2, 14, stone, 0.3, 0.2), 2);
          rrect(c, -24, -26, 48, 34, 4);
          fillInk(c, vgrad(c, -26, 8, stone, 0.12, 0.45), 2.2);
          rrect(c, -18, -18, 36, 18, 3);
          c.strokeStyle = metal(c, t, -18, 0, 18, 0);
          c.lineWidth = 1.6;
          c.stroke();
          // Little moth plaque.
          c.save();
          c.translate(0, -10);
          mothShape(c, 0.26, (cc) => metal(cc, t, -8, -6, 8, 6), 0.8);
          c.restore();
          if (t.style === 'garden') {
            // Moss creeping up the stone.
            for (let k = 0; k < 9; k++) {
              ellipse(c, -26 + k * 6.5, 12 + Math.sin(k * 1.7) * 2, 4, 2.6);
              c.fillStyle = k % 2 ? 'rgba(80,140,70,0.75)' : 'rgba(110,170,90,0.7)';
              c.fill();
            }
          }
          rrect(c, -28, -36, 56, 12, 4);
          const tg = c.createLinearGradient(-28, -36, -10, -24);
          tg.addColorStop(0, rgb(light(stone, 0.4)));
          tg.addColorStop(1, rgb(stone));
          fillInk(c, tg, 2);
          // Orb and the moth on top.
          ellipse(c, 0, -32, 14, 4.5);
          c.fillStyle = 'rgba(10,4,16,0.3)';
          c.fill();
          c.beginPath();
          c.arc(0, -42, 10, 0, Math.PI * 2);
          fillInk(c, matGrad(c, -10, -52, 10, -32), 1.8);
          c.save();
          c.translate(0, -74);
          c.rotate(-0.04);
          mothShape(c, 1.25, (cc) => matGrad(cc, -34, -26, 34, 26), 2);
          // Wing veins.
          c.strokeStyle = golden ? 'rgba(90,50,10,0.45)' : 'rgba(60,70,90,0.4)';
          c.lineWidth = 1;
          for (const k of [-1, 1])
            for (const a of [-0.9, -0.5, -0.1]) {
              c.beginPath();
              c.moveTo(k * 3, -2);
              c.lineTo(k * 3 + k * Math.cos(a) * 30, -2 + Math.sin(a) * 18);
              c.stroke();
            }
          c.restore();
          glowAt(c, -14, -90, 26, 20, 0xfff4dc, 0.28, 'lighter');
        }),
      );
      const gl = glow(v, x, y - 84, 150, 110, golden ? 0xffcf7a : t.light, 0.18);
      const glint = new Graphics().moveTo(-6, 0).lineTo(6, 0).moveTo(0, -6).lineTo(0, 6).stroke({ color: 0xffffff, width: 1.6 });
      v.addChild(glint);
      const ph = rnd() * 10;
      return [
        ent(v, [box(x, y, 52, 52)], y + 26, (time) => {
          gl.alpha = 0.16 + Math.sin(time * 0.9 + ph) * 0.04;
          const k = (time * 0.25 + ph) % 1;
          glint.position.set(x - 30 + k * 60, y - 96 + Math.sin(k * Math.PI) * -6);
          glint.alpha = Math.max(0, Math.sin(k * Math.PI)) * 0.8;
          glint.rotation = time * 1.5;
        }),
      ];
    }

    // ---- Wall: two-arm candle sconce --------------------------------------------------------
    case 'sconce': {
      const T = 52;
      const v = new Container();
      const icy = t.style === 'crystal';
      v.addChild(
        propSprite(x, 0, 150, 150, 75, 0, (c) => {
          glowAt(c, 0, T - 6, 64, 50, t.light, 0.35, 'lighter');
          // Back plate.
          c.fillStyle = 'rgba(0,0,0,0.35)';
          ellipse(c, 3, T + 14, 9, 17);
          c.fill();
          c.beginPath();
          c.moveTo(0, T - 6);
          c.quadraticCurveTo(10, T + 2, 8, T + 16);
          c.quadraticCurveTo(6, T + 26, 0, T + 32);
          c.quadraticCurveTo(-6, T + 26, -8, T + 16);
          c.quadraticCurveTo(-10, T + 2, 0, T - 6);
          fillInk(c, metal(c, t, -8, T - 6, 8, T + 32), 1.8);
          ellipse(c, 0, T + 14, 4, 5);
          fillInk(c, icy ? rgb(t.crystal ?? 0x9fe8ff) : rgb(t.curtain ?? 0x8a1a2e), 1.2);
          // Curved arms, drip cups, candles.
          for (const s of [-1, 1]) {
            c.beginPath();
            c.moveTo(0, T + 20);
            c.bezierCurveTo(s * 10, T + 26, s * 20, T + 16, s * 16, T + 2);
            c.strokeStyle = INK;
            c.lineWidth = 5.5;
            c.stroke();
            c.strokeStyle = metal(c, t, -18, T, 18, T + 20);
            c.lineWidth = 3.2;
            c.stroke();
            c.beginPath();
            c.ellipse(s * 16, T + 2, 7, 2.6, 0, 0, Math.PI);
            c.lineTo(s * 16 - 7, T);
            c.ellipse(s * 16, T, 7, 2.6, 0, Math.PI, 0, true);
            c.closePath();
            fillInk(c, metal(c, t, s * 16 - 7, 0, s * 16 + 7, 0), 1.2);
            rrect(c, s * 16 - 3, T - 12, 6, 12, 2);
            fillInk(c, vgrad(c, T - 12, T, 0xfff6e6, 0.2, 0.2), 1.2);
            if (icy) {
              // Crystal drops under the cups.
              for (const dx of [-5, 0, 5]) {
                c.beginPath();
                c.moveTo(s * 16 + dx, T + 3);
                c.lineTo(s * 16 + dx - 2, T + 8);
                c.lineTo(s * 16 + dx, T + 12);
                c.lineTo(s * 16 + dx + 2, T + 8);
                c.closePath();
                fillInk(c, 'rgba(223,246,255,0.95)', 0.8);
              }
            }
          }
          // Finial.
          c.beginPath();
          c.arc(0, T - 9, 3, 0, Math.PI * 2);
          fillInk(c, metal(c, t, -3, T - 12, 3, T - 6), 1);
        }),
      );
      const f1 = flame(v, x - 16, T - 12, 0.85);
      const f2 = flame(v, x + 16, T - 12, 0.85);
      const gl = glow(v, x, T, 170, 140, t.light, 0.28);
      const ph = rnd() * 10;
      return [{ view: v, layer: 'wall', obstacles: [], update: (time) => (f1(time), f2(time + 3), (gl.alpha = 0.26 + Math.sin(time * 1.7 + ph) * 0.03)) }];
    }

    // ---- Wall: draped curtains with swag and tiebacks -----------------------------------------
    case 'curtain': {
      const cw = w || 120;
      const T = 6;
      const H = P_WALL_H - 30;
      const col = t.curtain ?? 0x8a1a2e;
      const v = new Container();
      const panelW = cw * 0.34;
      // A drape gathered at a tieback 60 % down; side -1 is the left one.
      const drape = (side: number) =>
        propSprite(0, 0, panelW + 20, H + 20, side < 0 ? 4 : panelW + 16, 0, (c) => {
          const x0 = side < 0 ? 0 : -panelW;
          const x1 = side < 0 ? panelW : 0;
          const inner = side < 0 ? x1 : x0;
          const outer = side < 0 ? x0 : x1;
          const tie = H * 0.6;
          const pinch = inner + side * panelW * 0.5;
          c.beginPath();
          c.moveTo(outer, 0);
          c.lineTo(inner, 0);
          c.quadraticCurveTo(inner - side * 4, tie * 0.6, pinch, tie);
          c.quadraticCurveTo(inner - side * 2, tie + 18, inner + side * 2, H);
          c.lineTo(outer - side * 3, H);
          c.quadraticCurveTo(outer, tie + 10, outer + side * 2, tie);
          c.lineTo(outer, 0);
          c.closePath();
          const g = c.createLinearGradient(x0, 0, x1, 0);
          const folds = 5;
          for (let i = 0; i <= folds * 2; i++) {
            const k = i / (folds * 2);
            g.addColorStop(k, rgb(i % 2 ? light(col, 0.22) : dark(col, 0.4)));
          }
          fillInk(c, g, 2);
          c.save();
          c.clip();
          const sh = c.createLinearGradient(0, 0, 0, H);
          sh.addColorStop(0, 'rgba(10,4,16,0.35)');
          sh.addColorStop(0.3, 'rgba(10,4,16,0)');
          sh.addColorStop(1, 'rgba(10,4,16,0.25)');
          c.fillStyle = sh;
          c.fillRect(x0 - 4, 0, panelW + 8, H);
          c.restore();
          // Gold hem.
          c.beginPath();
          c.moveTo(inner + side * 2, H - 1);
          c.lineTo(outer - side * 3, H - 1);
          c.strokeStyle = metal(c, t, x0, 0, x1, 0);
          c.lineWidth = 3;
          c.stroke();
          // Tieback cord from the wall to the gathered drape, with a tassel.
          c.beginPath();
          c.moveTo(outer + side * 2, tie - 3);
          c.quadraticCurveTo((pinch + outer) / 2, tie + 6, pinch - side * 3, tie - 1);
          c.strokeStyle = INK;
          c.lineWidth = 5;
          c.stroke();
          c.strokeStyle = metal(c, t, outer, tie - 3, pinch, tie + 3);
          c.lineWidth = 3;
          c.stroke();
          c.beginPath();
          c.moveTo(pinch - side * 3, tie);
          c.lineTo(pinch - side * 3, tie + 8);
          c.strokeStyle = metal(c, t, 0, tie, 0, tie + 8);
          c.lineWidth = 1.6;
          c.stroke();
          c.beginPath();
          c.moveTo(pinch - side * 3 - 3, tie + 8);
          c.lineTo(pinch - side * 3 + 3, tie + 8);
          c.lineTo(pinch - side * 3 + 4, tie + 18);
          c.lineTo(pinch - side * 3 - 4, tie + 18);
          c.closePath();
          fillInk(c, metal(c, t, pinch - 4, 0, pinch + 4, 0), 1);
        });
      // Soft light behind the opening, so the drapes frame something.
      v.addChild(
        propSprite(x, 0, cw + 40, H + 30, cw / 2 + 20, 0, (c) => {
          c.fillStyle = 'rgba(0,0,0,0.3)';
          c.fillRect(-cw / 2 + 4, T + 6, cw, H);
          glowAt(c, 0, T + H * 0.5, cw * 0.32, H * 0.45, t.light, 0.16, 'lighter');
        }),
      );
      const left = drape(-1);
      const right = drape(1);
      left.position.set(x - cw / 2, T + 8);
      right.position.set(x + cw / 2, T + 8);
      v.addChild(left, right);
      v.addChild(
        propSprite(x, 0, cw + 40, 50, cw / 2 + 20, 0, (c) => {
          // Swagged valance.
          const n = Math.max(2, Math.round(cw / 50));
          const sw = cw / n;
          for (let i = 0; i < n; i++) {
            const sx = -cw / 2 + i * sw;
            c.beginPath();
            c.moveTo(sx - 2, T + 4);
            c.quadraticCurveTo(sx + sw / 2, T + 34, sx + sw + 2, T + 4);
            c.closePath();
            fillInk(c, vgrad(c, T + 4, T + 24, col, 0.3, 0.35), 1.8);
            c.beginPath();
            c.moveTo(sx + 4, T + 8);
            c.quadraticCurveTo(sx + sw / 2, T + 24, sx + sw - 4, T + 8);
            c.strokeStyle = rgb(light(col, 0.3), 0.6);
            c.lineWidth = 1.4;
            c.stroke();
            // Fringe.
            for (let k = 1; k < 8; k++) {
              const fk = k / 8;
              const fx = sx + sw * fk;
              const fy = T + 4 + Math.sin(fk * Math.PI) * 15;
              c.beginPath();
              c.moveTo(fx, fy);
              c.lineTo(fx, fy + 4);
              c.strokeStyle = metal(c, t, fx - 1, 0, fx + 1, 0);
              c.lineWidth = 1.4;
              c.stroke();
            }
          }
          // Rod with finials.
          rrect(c, -cw / 2 - 8, T, cw + 16, 6, 3);
          fillInk(c, metal(c, t, 0, T, 0, T + 6), 1.6);
          for (const s of [-1, 1]) {
            c.beginPath();
            c.arc(s * (cw / 2 + 10), T + 3, 5, 0, Math.PI * 2);
            fillInk(c, metal(c, t, s * (cw / 2 + 10) - 5, T - 2, s * (cw / 2 + 10) + 5, T + 8), 1.4);
          }
        }),
      );
      const ph = rnd() * 10;
      return [
        {
          view: v,
          layer: 'wall',
          obstacles: [],
          update: (time) => {
            left.skew.x = Math.sin(time * 0.7 + ph) * 0.012;
            right.skew.x = Math.sin(time * 0.7 + ph + 1.3) * 0.012;
          },
        },
      ];
    }
  }
  return null;
}

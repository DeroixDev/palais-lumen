// Painted pieces of "Kristall-Baccarat": the crystal chandelier, the wine-red oval table with
// crystal-framed betting fields and card boxes, crystal beads for the result road, and the
// station on the casino floor.

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { velvetNap } from '../../core/ui';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, paint, propSprite, rgb, rim, rrect, shadow, type Ctx } from '../../world/painted/brush';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';

export const FELT = 0x6a1426;
export const SIDE_COLOR = { player: 0x4a8ad8, banker: 0xd84a5a, tie: 0x4ac88a } as const;

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** A faceted crystal prism (diamond outline with facets), tinted by `col`. */
export function crystal(c: Ctx, x: number, y: number, w: number, h: number, col = 0xdff4ff) {
  c.beginPath();
  c.moveTo(x, y - h / 2);
  c.lineTo(x + w / 2, y - h * 0.12);
  c.lineTo(x, y + h / 2);
  c.lineTo(x - w / 2, y - h * 0.12);
  c.closePath();
  const g = c.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
  g.addColorStop(0, rgb(light(col, 0.7)));
  g.addColorStop(0.45, rgb(col, 0.85));
  g.addColorStop(1, rgb(dark(col, 0.35), 0.9));
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = 'rgba(20,10,30,0.7)';
  c.lineWidth = 1.2;
  c.stroke();
  // Facets.
  c.beginPath();
  c.moveTo(x - w / 2, y - h * 0.12);
  c.lineTo(x + w / 2, y - h * 0.12);
  c.moveTo(x, y - h / 2);
  c.lineTo(x - w * 0.18, y - h * 0.12);
  c.lineTo(x, y + h / 2);
  c.moveTo(x, y - h / 2);
  c.lineTo(x + w * 0.18, y - h * 0.12);
  c.lineTo(x, y + h / 2);
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = 0.8;
  c.stroke();
  ellipse(c, x - w * 0.14, y - h * 0.26, w * 0.08, h * 0.06);
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.fill();
}

// ---- Chandelier --------------------------------------------------------------------------------

export const CHANDELIER_W = 420;
export const CHANDELIER_H = 200;
/** Candle flames in the chandelier texture (for glow sprites). */
export const CANDLES: { x: number; y: number }[] = [];

export function chandelierTexture() {
  return cached('bac-chandelier', () => {
    CANDLES.length = 0;
    return paint(CHANDELIER_W, CHANDELIER_H, (c) => {
      const cx = CHANDELIER_W / 2;
      // Chain from the ceiling.
      for (let i = 0; i < 6; i++) {
        ellipse(c, cx, 6 + i * 9, 3, 5);
        c.strokeStyle = gold(c, cx - 3, i * 9, cx + 3, i * 9 + 10);
        c.lineWidth = 2;
        c.stroke();
      }
      // Two tiers of swags of crystal beads.
      for (const [ry, rx, n, y0] of [[22, 180, 14, 96], [16, 110, 10, 70]] as const) {
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI;
          const a1 = ((i + 1) / n) * Math.PI;
          const x0 = cx - Math.cos(a0) * rx;
          const x1 = cx - Math.cos(a1) * rx;
          const sy0 = y0 + Math.sin(a0) * ry;
          const sy1 = y0 + Math.sin(a1) * ry;
          for (let k = 1; k < 5; k++) {
            const t = k / 5;
            const bx = x0 + (x1 - x0) * t;
            const by = sy0 + (sy1 - sy0) * t + Math.sin(t * Math.PI) * 10;
            ellipse(c, bx, by, 2, 2);
            c.fillStyle = 'rgba(230,245,255,0.85)';
            c.fill();
          }
        }
      }
      // Brass ring and arms.
      ellipse(c, cx, 96, 184, 26);
      c.strokeStyle = INK;
      c.lineWidth = 7;
      c.stroke();
      c.strokeStyle = gold(c, cx - 184, 70, cx + 184, 122);
      c.lineWidth = 4.5;
      c.stroke();
      ellipse(c, cx, 70, 112, 16);
      c.strokeStyle = INK;
      c.lineWidth = 6;
      c.stroke();
      c.strokeStyle = gold(c, cx - 112, 54, cx + 112, 86);
      c.lineWidth = 3.5;
      c.stroke();
      // Central column with a crystal ball.
      rrect(c, cx - 7, 52, 14, 70, 5);
      fillInk(c, gold(c, cx - 7, 52, cx + 7, 122), 1.8);
      ellipse(c, cx, 132, 18, 18);
      const bg = c.createRadialGradient(cx - 6, 126, 2, cx, 132, 18);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(0.5, '#cfeaff');
      bg.addColorStop(1, '#6a8ab0');
      fillInk(c, bg, 1.6);
      // Hanging prisms below the big ring.
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        const x = cx - Math.cos(a) * 184;
        const y = 96 + Math.sin(a) * 26;
        c.strokeStyle = 'rgba(230,240,255,0.6)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + 12 + (i % 2) * 8);
        c.stroke();
        crystal(c, x, y + 26 + (i % 2) * 8, 11, 26);
      }
      crystal(c, cx, 170, 16, 40);
      // Candles on both rings (front ones only, as seen from below).
      const candle = (x: number, y: number) => {
        rrect(c, x - 4, y - 18, 8, 18, 2);
        fillInk(c, '#fbf1dc', 1.2);
        ellipse(c, x, y - 2, 9, 3.5);
        fillInk(c, gold(c, x - 9, y - 5, x + 9, y + 1), 1.2);
        c.beginPath();
        c.moveTo(x, y - 30);
        c.quadraticCurveTo(x + 4, y - 22, x, y - 18);
        c.quadraticCurveTo(x - 4, y - 22, x, y - 30);
        c.fillStyle = '#ffe7a8';
        c.fill();
        CANDLES.push({ x, y: y - 24 });
      };
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI;
        candle(cx - Math.cos(a) * 184, 96 + Math.sin(a) * 26);
      }
      for (let i = 1; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        candle(cx - Math.cos(a) * 112, 70 + Math.sin(a) * 16);
      }
    }, 2);
  });
}

// ---- Table ------------------------------------------------------------------------------------------

export interface BacGeo {
  w: number;
  h: number;
  /** Oval felt (wide screens) or a rounded table (portrait). */
  shape: 'oval' | 'round';
  /** Felt: centre and half sizes. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Card boxes (centre, size) for Spieler and Bank. */
  boxes: { player: Box; banker: Box };
  /** Betting fields. */
  fields: { player: Box; tie: Box; banker: Box };
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ovalPath = ellipse;

const FIELD_TEXT: Record<'player' | 'tie' | 'banker', [string, string]> = {
  player: ['SPIELER', 'zahlt 0,95 : 1'],
  tie: ['UNENTSCHIEDEN', 'zahlt 9 : 1'],
  banker: ['BANK', 'zahlt 0,9 : 1'],
};

export function bacTableTexture(g: BacGeo) {
  return cached(`bac-table-${g.w}x${g.h}`, () =>
    paint(g.w, g.h, (c) => {
      const { cx, cy, rx, ry } = g;
      const ellipse = (c: Ctx, x: number, y: number, a: number, b: number) => {
        if (g.shape === 'oval') return ovalPath(c, x, y, a, b);
        const grow = a - rx;
        rrect(c, x - a, y - b, a * 2, b * 2, 110 + grow);
      };
      shadow(c, cx, cy + ry * 0.2, rx * 1.05, ry * 1.0, 0.65);
      // Wooden skirt, padded rail, felt.
      ellipse(c, cx, cy + 22, rx + 30, ry + 30);
      fillInk(c, '#2a0c10', 3);
      ellipse(c, cx, cy, rx + 30, ry + 30);
      const rg = c.createLinearGradient(0, cy - ry, 0, cy + ry + 30);
      rg.addColorStop(0, '#3a1a20');
      rg.addColorStop(1, '#14060a');
      fillInk(c, rg, 3);
      c.save();
      ellipse(c, cx, cy, rx + 30, ry + 30);
      c.clip();
      velvetNap(c, cx - rx - 30, cy - ry - 30, rx * 2 + 60, ry * 2 + 60, 77, 0.4, 0.05);
      c.restore();
      ellipse(c, cx, cy, rx + 3, ry + 3);
      c.strokeStyle = gold(c, cx - rx, cy - ry, cx + rx, cy + ry);
      c.lineWidth = 5;
      c.stroke();
      ellipse(c, cx, cy, rx, ry);
      const fg = c.createRadialGradient(cx, cy - ry * 0.2, 20, cx, cy, Math.max(rx, ry));
      fg.addColorStop(0, rgb(light(FELT, 0.2)));
      fg.addColorStop(0.65, rgb(FELT));
      fg.addColorStop(1, rgb(dark(FELT, 0.45)));
      c.fillStyle = fg;
      c.fill();
      c.save();
      ellipse(c, cx, cy, rx, ry);
      c.clip();
      velvetNap(c, cx - rx, cy - ry, rx * 2, ry * 2, 31, 0.6, 0.045);
      glowAt(c, cx, cy - ry * 0.5, rx * 0.8, ry * 0.6, 0xffe7c0, 0.16, 'lighter');
      // Card boxes: gilt outlines with the side's name.
      for (const side of ['player', 'banker'] as const) {
        const b = g.boxes[side];
        rrect(c, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 14);
        c.strokeStyle = 'rgba(240,206,130,0.75)';
        c.lineWidth = 2.5;
        c.stroke();
        rrect(c, b.x - b.w / 2 + 6, b.y - b.h / 2 + 6, b.w - 12, b.h - 12, 10);
        c.strokeStyle = 'rgba(240,206,130,0.25)';
        c.lineWidth = 1;
        c.stroke();
        c.font = '22px Bungee, Impact, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = rgb(light(SIDE_COLOR[side], 0.35), 0.55);
        c.fillText(side === 'player' ? 'SPIELER' : 'BANK', b.x, b.y + b.h / 2 - 18);
      }
      // Betting fields framed with crystal prisms.
      for (const side of ['player', 'tie', 'banker'] as const) {
        const f = g.fields[side];
        const col = SIDE_COLOR[side];
        rrect(c, f.x - f.w / 2, f.y - f.h / 2, f.w, f.h, 18);
        c.fillStyle = rgb(dark(col, 0.55), 0.35);
        c.fill();
        c.strokeStyle = rgb(light(col, 0.45), 0.85);
        c.lineWidth = 3;
        c.stroke();
        const [name, pays] = FIELD_TEXT[side];
        const fs = Math.min(26, (f.w - 30) / (name.length * 0.82));
        c.font = `${Math.round(fs)}px Bungee, Impact, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = 'rgba(255,240,220,0.92)';
        c.fillText(name, f.x, f.y - 12);
        c.font = '700 19px "Barlow Condensed", "Arial Narrow", sans-serif';
        c.fillStyle = 'rgba(240,206,130,0.9)';
        c.fillText(pays, f.x, f.y + 18);
        for (const [px, py] of [[f.x - f.w / 2, f.y - f.h / 2], [f.x + f.w / 2, f.y - f.h / 2], [f.x - f.w / 2, f.y + f.h / 2], [f.x + f.w / 2, f.y + f.h / 2]]) {
          crystal(c, px + (px < f.x ? 8 : -8), py + (py < f.y ? 8 : -8), 12, 20, light(col, 0.5));
        }
      }
      c.restore();
    }, 1.5),
  );
}

/** A round crystal bead for the result road (Spieler blue, Bank red, Unentschieden green). */
export function beadTexture(side: 'player' | 'banker' | 'tie') {
  return cached(`bac-bead-${side}`, () =>
    paint(36, 36, (c) => {
      const col = SIDE_COLOR[side];
      ellipse(c, 18, 18, 14, 14);
      const g = c.createRadialGradient(13, 12, 1, 18, 18, 15);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, rgb(light(col, 0.4)));
      g.addColorStop(1, rgb(dark(col, 0.35)));
      fillInk(c, g, 1.6);
      c.font = '16px Bungee, Impact, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = 'rgba(20,8,16,0.85)';
      c.fillText(side === 'player' ? 'S' : side === 'banker' ? 'B' : 'U', 18, 19);
    }, 2),
  );
}

/** A tiny four-point glint (tint it, add-blend it) for the twinkling crystals. */
export function glintTexture() {
  return cached('bac-glint', () =>
    paint(32, 32, (c) => {
      glowAt(c, 16, 16, 8, 8, 0xffffff, 0.8, 'lighter');
      c.fillStyle = 'rgba(255,255,255,0.95)';
      c.beginPath();
      c.moveTo(16, 1);
      c.lineTo(17.5, 14.5);
      c.lineTo(31, 16);
      c.lineTo(17.5, 17.5);
      c.lineTo(16, 31);
      c.lineTo(14.5, 17.5);
      c.lineTo(1, 16);
      c.lineTo(14.5, 14.5);
      c.closePath();
      c.fill();
    }, 2),
  );
}

// ---- Station on the casino floor ------------------------------------------------------------------

function chair(c: Ctx, x: number, y: number) {
  shadow(c, x, y + 4, 15, 6, 0.45);
  rrect(c, x - 11, y - 26, 22, 16, 6);
  fillInk(c, '#5a1426', 1.4);
  rrect(c, x - 12, y - 14, 24, 12, 5);
  fillInk(c, '#7a2036', 1.4);
  c.fillStyle = gold(c, x - 10, y - 2, x + 10, y + 2);
  c.fillRect(x - 10, y - 3, 3, 6);
  c.fillRect(x + 7, y - 3, 3, 6);
}

export function station(): PaintedStation {
  const W = 146;
  const H = 84;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H / 2, 210, 230, 105, 140, (x) => {
    shadow(x, 0, 24, 86, 28, 0.6);
    for (const sx of [-48, -16, 16, 48]) chair(x, sx, 58);
    // Oval table: skirt, rail, wine-red felt.
    ellipse(x, 0, 6, 70, 32);
    fillInk(x, '#2a0c10', 2);
    ellipse(x, 0, -2, 70, 32);
    fillInk(x, '#3a1a20', 2);
    ellipse(x, 0, -2, 62, 26);
    const fg = x.createRadialGradient(0, -8, 4, 0, -2, 62);
    fg.addColorStop(0, rgb(light(FELT, 0.25)));
    fg.addColorStop(1, rgb(dark(FELT, 0.3)));
    x.fillStyle = fg;
    x.fill();
    x.strokeStyle = 'rgba(224,178,90,0.85)';
    x.lineWidth = 1.5;
    x.stroke();
    // Card boxes and three fields.
    for (const bx of [-22, 22]) {
      rrect(x, bx - 15, -16, 30, 16, 3);
      x.strokeStyle = 'rgba(240,206,130,0.7)';
      x.lineWidth = 1;
      x.stroke();
    }
    for (const [fx, col] of [[-30, '#4a8ad8'], [0, '#4ac88a'], [30, '#d84a5a']] as const) {
      rrect(x, fx - 13, 4, 26, 9, 3);
      x.fillStyle = col;
      x.globalAlpha = 0.6;
      x.fill();
      x.globalAlpha = 1;
    }
    for (const [cx0, face] of [[-26, true], [-18, true], [18, false], [26, true]] as const) {
      rrect(x, cx0 - 4, -14, 8, 11, 1.5);
      fillInk(x, face ? '#fbf1dc' : '#2a1446', 0.8);
    }
    // The little crystal chandelier above.
    x.strokeStyle = gold(x, -1, -110, 1, -70);
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(0, -126);
    x.lineTo(0, -84);
    x.stroke();
    ellipse(x, 0, -80, 26, 6);
    x.strokeStyle = INK;
    x.lineWidth = 4;
    x.stroke();
    x.strokeStyle = gold(x, -26, -86, 26, -74);
    x.lineWidth = 2.5;
    x.stroke();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI;
      crystal(x, -Math.cos(a) * 26, -80 + Math.sin(a) * 6 + 9, 5, 12);
      ellipse(x, -Math.cos(a) * 26, -88 + Math.sin(a) * 6, 2, 3);
      x.fillStyle = '#ffe7a8';
      x.fill();
    }
    crystal(x, 0, -64, 8, 18);
    glowAt(x, 0, -82, 44, 20, 0xfff0d0, 0.55, 'lighter');
    rim(x, 0.3, 1);
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.position.set(W / 2, H / 2 - 82);
  glow.width = 150;
  glow.height = 80;
  glow.tint = 0xdff0ff;
  glow.alpha = 0.55;
  glow.blendMode = 'add';
  lamp.addChild(glow);
  c.addChild(lamp);
  c.labelY = H / 2 - 140;
  return c;
}

registerPaintedStation('baccarat', station);

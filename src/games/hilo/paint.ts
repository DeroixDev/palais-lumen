// Painted pieces of the "Kartenleiter": the narrow petrol-felt card table, the brass ladder
// with its rungs, the climbing moth, and the station on the casino floor.

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { velvetNap } from '../../core/ui';
import { paintEmblem } from '../slots/symbols';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, paint, propSprite, rgb, rim, rrect, shadow, type Ctx } from '../../world/painted/brush';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';

export const FELT = 0x0f4a52;

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** The narrow card table seen from the 3/4 view: walnut frame, petrol felt, a printed card spot. */
export function stripTexture(w: number, h: number, spot: { x: number; y: number; w: number; h: number }) {
  return cached(`hilo-strip-${w}x${h}`, () =>
    paint(w, h, (c) => {
      shadow(c, w / 2, h - 24, w * 0.52, 30, 0.6);
      rrect(c, 4, 22, w - 8, h - 30, 46);
      fillInk(c, '#2a1206', 3);
      rrect(c, 4, 4, w - 8, h - 30, 46);
      const wood = c.createLinearGradient(0, 0, 0, h);
      wood.addColorStop(0, '#8a4a22');
      wood.addColorStop(0.5, '#5a2a12');
      wood.addColorStop(1, '#3a180a');
      fillInk(c, wood, 3);
      rim(c, 0.4, 2);
      rrect(c, 24, 24, w - 48, h - 70, 30);
      c.strokeStyle = gold(c, 0, 0, w, h);
      c.lineWidth = 4;
      c.stroke();
      rrect(c, 28, 28, w - 56, h - 78, 27);
      const fg = c.createRadialGradient(w / 2, h * 0.35, 20, w / 2, h * 0.45, Math.max(w, h) * 0.7);
      fg.addColorStop(0, rgb(light(FELT, 0.22)));
      fg.addColorStop(0.6, rgb(FELT));
      fg.addColorStop(1, rgb(dark(FELT, 0.45)));
      c.fillStyle = fg;
      c.fill();
      c.save();
      c.clip();
      velvetNap(c, 28, 28, w - 56, h - 78, 404, 0.6, 0.045);
      glowAt(c, w / 2, h * 0.3, w * 0.4, h * 0.3, 0xffe7c0, 0.14, 'lighter');
      // Printed card spot with corner marks.
      rrect(c, spot.x - spot.w / 2, spot.y - spot.h / 2, spot.w, spot.h, 14);
      c.strokeStyle = 'rgba(240,206,130,0.55)';
      c.lineWidth = 2.5;
      c.setLineDash([10, 8]);
      c.stroke();
      c.setLineDash([]);
      c.restore();
      // Brass corner fittings.
      for (const [x, y] of [[30, 30], [w - 30, 30], [30, h - 52], [w - 30, h - 52]]) {
        ellipse(c, x, y, 7, 7);
        fillInk(c, gold(c, x - 7, y - 7, x + 7, y + 7), 1.4);
      }
    }, 1.5),
  );
}

export const LADDER_W = 150;

/** A brass ladder with `n` rungs `step` apart, rung 1 at the bottom (y = height - foot). */
export function ladderTexture(n: number, step: number) {
  const H = n * step + 70;
  return cached(`hilo-ladder-${n}-${step}`, () =>
    paint(LADDER_W, H, (c) => {
      const l = 30, r = LADDER_W - 30;
      shadow(c, LADDER_W / 2, H - 10, 70, 12, 0.6);
      // Rungs first, rails over them.
      for (let i = 1; i <= n; i++) {
        const y = H - 40 - i * step;
        rrect(c, l, y - 5, r - l, 10, 5);
        fillInk(c, gold(c, l, y - 5, r, y + 5), 1.8);
      }
      for (const x of [l, r]) {
        rrect(c, x - 8, 10, 16, H - 26, 8);
        fillInk(c, gold(c, x - 8, 0, x + 8, H), 2.2);
        rim(c, 0.6, 1.4);
        // Little moon finials.
        ellipse(c, x, 10, 10, 10);
        fillInk(c, gold(c, x - 10, 0, x + 10, 20), 1.6);
      }
      // Feet.
      for (const x of [l, r]) {
        rrect(c, x - 13, H - 22, 26, 10, 4);
        fillInk(c, '#3a180a', 1.6);
      }
      void INK;
    }, 2),
  );
}

/** The climbing moth (glowing, wings open). */
export function emblemTexture() {
  return cached('hilo-moth', () =>
    paint(90, 90, (c) => {
      glowAt(c, 45, 45, 42, 42, 0xfff1c4, 0.5, 'lighter');
      paintEmblem(c, 45, 48, 72, { wing: 0xf3d58a, wingDark: 0x9a6418, body: 0x5a3010, eye: 0x5fe3ff }, 2);
    }, 2),
  );
}

/** A small brass plate behind a rung's multiplier. */
export function plateTexture(w: number, h: number, lit: boolean) {
  return cached(`hilo-plate-${w}-${h}-${lit}`, () =>
    paint(w + 6, h + 6, (c) => {
      rrect(c, 3, 3, w, h, h / 2);
      if (lit) fillInk(c, gold(c, 3, 3, w, h + 3), 1.6);
      else fillInk(c, 'rgba(30,16,30,0.75)', 1.4);
    }, 2),
  );
}

// ---- Station on the casino floor ------------------------------------------------------------------

function stool(c: Ctx, x: number, y: number) {
  shadow(c, x, y + 4, 14, 5, 0.45);
  c.fillStyle = gold(c, x - 2, y - 10, x + 2, y);
  c.fillRect(x - 2, y - 12, 4, 14);
  ellipse(c, x, y - 14, 10, 5);
  fillInk(c, '#1a4a50', 1.4);
}

export function station(): PaintedStation {
  const W = 120;
  const H = 76;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H / 2, 190, 200, 95, 120, (x) => {
    shadow(x, 0, 22, 70, 22, 0.6);
    for (const sx of [-24, 24]) stool(x, sx, 44);
    // Narrow table: walnut frame, petrol felt strip.
    rrect(x, -56, -22, 112, 40, 10);
    fillInk(x, '#3a180a', 2);
    rrect(x, -56, -28, 112, 38, 10);
    fillInk(x, '#6a3416', 2);
    rrect(x, -50, -24, 100, 30, 7);
    const fg = x.createLinearGradient(0, -24, 0, 6);
    fg.addColorStop(0, rgb(light(FELT, 0.25)));
    fg.addColorStop(1, rgb(dark(FELT, 0.25)));
    x.fillStyle = fg;
    x.fill();
    x.strokeStyle = 'rgba(224,178,90,0.8)';
    x.lineWidth = 1.2;
    x.stroke();
    // Cards: deck and an open card with an arrow up.
    rrect(x, 22, -20, 14, 19, 2);
    fillInk(x, '#2a1446', 1);
    rrect(x, -14, -20, 14, 19, 2);
    fillInk(x, '#fbf1dc', 1);
    x.fillStyle = '#b81f45';
    x.beginPath();
    x.moveTo(-7, -16);
    x.lineTo(-3, -10);
    x.lineTo(-11, -10);
    x.closePath();
    x.fill();
    // The little brass ladder leaning at the end, a moth on top.
    x.save();
    x.translate(-62, -20);
    x.rotate(-0.12);
    for (const lx of [-7, 7]) {
      rrect(x, lx - 2, -78, 4, 82, 2);
      fillInk(x, gold(x, lx - 2, -78, lx + 2, 4), 1);
    }
    for (let i = 0; i < 7; i++) {
      rrect(x, -7, -70 + i * 11, 14, 3, 1.5);
      fillInk(x, gold(x, -7, -70 + i * 11, 7, -67 + i * 11), 0.8);
    }
    glowAt(x, 0, -84, 18, 14, 0xfff1c4, 0.7, 'lighter');
    for (const s of [-1, 1]) {
      ellipse(x, s * 5, -84, 5, 3.5);
      x.fillStyle = '#f3d58a';
      x.fill();
    }
    x.restore();
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.position.set(W / 2 - 66, H / 2 - 104);
  glow.width = 80;
  glow.height = 80;
  glow.tint = 0xfff1c4;
  glow.alpha = 0.55;
  glow.blendMode = 'add';
  lamp.addChild(glow);
  const glow2 = new Sprite(glowTexture());
  glow2.anchor.set(0.5);
  glow2.position.set(W / 2, H / 2 - 4);
  glow2.width = 150;
  glow2.height = 60;
  glow2.tint = 0x7af0e0;
  glow2.alpha = 0.18;
  glow2.blendMode = 'add';
  lamp.addChild(glow2);
  c.addChild(lamp);
  c.labelY = H / 2 - 124;
  return c;
}

registerPaintedStation('hilo', station);

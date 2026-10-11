// Painted parts of Mondmünze: the velvet stage with its brass flipping table, the two coin
// faces, the milled edge, the moon-phase streak lights, and the coin machine in the casino.

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { INK, ellipse, fillInk, glowAt, gold, paint, propSprite, rim, rrect, seeded, shadow, vgrad, type Ctx } from '../../world/painted/brush';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';
import { paintEmblem } from '../slots/symbols';
import { SCENE_H, SCENE_W } from '../ladderKit';
import type { Side } from './rules';

export const COIN_R = 64;
export const TABLE = { x: SCENE_W / 2, y: 330, rx: 132, ry: 38 };
export const MOON = 0xfff1c4;

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Velvet curtain, brass frame, title ribbon, status plate and the round flipping table. */
export function sceneTexture() {
  return cached('scene', () =>
    paint(SCENE_W, SCENE_H, (c) => {
      rrect(c, 0, 0, SCENE_W, SCENE_H, 22);
      const bg = c.createLinearGradient(0, 0, 0, SCENE_H);
      bg.addColorStop(0, '#3a0e2a');
      bg.addColorStop(1, '#16061a');
      fillInk(c, bg, 3);
      c.save();
      rrect(c, 0, 0, SCENE_W, SCENE_H, 22);
      c.clip();
      // Curtain folds.
      for (let i = 0; i < 12; i++) {
        const x = (i + 0.5) * (SCENE_W / 12);
        const g = c.createLinearGradient(x - 18, 0, x + 18, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.25)');
        g.addColorStop(0.5, 'rgba(255,170,200,0.08)');
        g.addColorStop(1, 'rgba(0,0,0,0.25)');
        c.fillStyle = g;
        c.fillRect(x - 18, 0, 36, SCENE_H);
      }
      // Spotlight from above onto the table.
      c.beginPath();
      c.moveTo(SCENE_W / 2 - 40, 100);
      c.lineTo(SCENE_W / 2 + 40, 100);
      c.lineTo(TABLE.x + TABLE.rx, TABLE.y);
      c.lineTo(TABLE.x - TABLE.rx, TABLE.y);
      c.closePath();
      const sp = c.createLinearGradient(0, 100, 0, TABLE.y);
      sp.addColorStop(0, 'rgba(255,240,200,0.02)');
      sp.addColorStop(1, 'rgba(255,240,200,0.1)');
      c.fillStyle = sp;
      c.fill();
      glowAt(c, TABLE.x, TABLE.y - 10, 170, 70, 0xffcf7a, 0.22, 'lighter');
      // Stars.
      const r = seeded(12);
      for (let i = 0; i < 30; i++) {
        ellipse(c, r() * SCENE_W, 100 + r() * 160, 0.7 + r(), 0.7 + r());
        c.fillStyle = `rgba(255,240,220,${0.2 + r() * 0.4})`;
        c.fill();
      }
      c.restore();
      // The table: brass rim, velvet top, a skirt below.
      ellipse(c, TABLE.x, TABLE.y + 22, TABLE.rx, TABLE.ry);
      fillInk(c, vgrad(c, TABLE.y, TABLE.y + 60, 0x5a1a3a, 0.2, 0.5), 2.4);
      c.fillStyle = vgrad(c, TABLE.y, TABLE.y + 22, 0x5a1a3a, 0.2, 0.5);
      c.fillRect(TABLE.x - TABLE.rx, TABLE.y, TABLE.rx * 2, 22);
      c.strokeStyle = INK;
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(TABLE.x - TABLE.rx, TABLE.y);
      c.lineTo(TABLE.x - TABLE.rx, TABLE.y + 22);
      c.moveTo(TABLE.x + TABLE.rx, TABLE.y);
      c.lineTo(TABLE.x + TABLE.rx, TABLE.y + 22);
      c.stroke();
      ellipse(c, TABLE.x, TABLE.y, TABLE.rx, TABLE.ry);
      fillInk(c, gold(c, TABLE.x - TABLE.rx, TABLE.y - TABLE.ry, TABLE.x + TABLE.rx, TABLE.y + TABLE.ry), 2.4);
      ellipse(c, TABLE.x, TABLE.y, TABLE.rx - 10, TABLE.ry - 6);
      const top = c.createRadialGradient(TABLE.x - 30, TABLE.y - 10, 4, TABLE.x, TABLE.y, TABLE.rx);
      top.addColorStop(0, '#2a6a5a');
      top.addColorStop(1, '#0e2a26');
      c.fillStyle = top;
      c.fill();
      c.strokeStyle = 'rgba(255,230,170,0.35)';
      c.lineWidth = 1.2;
      ellipse(c, TABLE.x, TABLE.y, TABLE.rx - 22, TABLE.ry - 12);
      c.stroke();
      // Title ribbon and plate.
      c.beginPath();
      c.moveTo(70, 8);
      c.lineTo(SCENE_W - 70, 8);
      c.lineTo(SCENE_W - 52, 26);
      c.lineTo(SCENE_W - 70, 44);
      c.lineTo(70, 44);
      c.lineTo(52, 26);
      c.closePath();
      fillInk(c, vgrad(c, 8, 44, 0x1d3a6a, 0.25, 0.4), 2.2);
      rrect(c, 104, 12, SCENE_W - 208, 28, 7);
      fillInk(c, gold(c, 104, 12, SCENE_W - 104, 40), 2);
      rim(c, 0.7, 1.4);
      // Status plate.
      rrect(c, 70, 50, SCENE_W - 140, 46, 12);
      fillInk(c, gold(c, 70, 50, SCENE_W - 70, 96), 2.2);
      rrect(c, 75, 54, SCENE_W - 150, 38, 9);
      c.fillStyle = vgrad(c, 54, 92, 0x2a0e22, 0.1, 0.4);
      c.fill();
    }),
  );
}

function coinDisc(c: Ctx, R: number) {
  ellipse(c, 0, 0, R, R);
  const g = c.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
  g.addColorStop(0, '#fff6cc');
  g.addColorStop(0.45, '#f0c25a');
  g.addColorStop(1, '#a8741f');
  fillInk(c, g, 3);
  // Beaded rim.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ellipse(c, Math.cos(a) * (R - 6), Math.sin(a) * (R - 6), 1.8, 1.8);
    c.fillStyle = i % 2 ? 'rgba(122,82,20,0.7)' : 'rgba(255,244,200,0.8)';
    c.fill();
  }
  ellipse(c, 0, 0, R - 12, R - 12);
  c.strokeStyle = 'rgba(122,82,20,0.6)';
  c.lineWidth = 2;
  c.stroke();
}

/** One side of the brass coin: a crescent moon with stars, or a moth. */
export function faceTexture(side: Side) {
  return cached(`face-${side}`, () =>
    paint(COIN_R * 2 + 8, COIN_R * 2 + 8, (c) => {
      c.translate(COIN_R + 4, COIN_R + 4);
      coinDisc(c, COIN_R);
      if (side === 'mond') {
        // Embossed crescent: dark offset, then the lit face.
        for (const [dx, dy, col] of [[2, 3, 'rgba(110,70,15,0.7)'], [0, 0, '#ffe7a0']] as const) {
          c.save();
          c.translate(dx, dy);
          c.beginPath();
          c.arc(-4, 0, 34, 0, Math.PI * 2);
          c.arc(10, -8, 30, 0, Math.PI * 2, true);
          c.fillStyle = col;
          c.fill('evenodd');
          c.restore();
        }
        c.strokeStyle = 'rgba(122,82,20,0.8)';
        c.lineWidth = 1.6;
        c.beginPath();
        c.arc(-4, 0, 34, 0, Math.PI * 2);
        c.stroke();
        for (const [sx, sy, s] of [[22, -20, 6], [30, 6, 4], [14, 22, 5]]) {
          c.beginPath();
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const rr = k % 2 ? s * 0.4 : s;
            c.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
          }
          c.closePath();
          c.fillStyle = '#fff1c4';
          c.fill();
          c.strokeStyle = 'rgba(122,82,20,0.7)';
          c.lineWidth = 1;
          c.stroke();
        }
      } else {
        paintEmblem(c, 2, 5, 96, { wing: 0xa8741f, wingDark: 0x6e4a10, body: 0x5a3a0a, eye: 0x6e4a10 }, 0.01);
        paintEmblem(c, 0, 2, 96, { wing: 0xffe7a0, wingDark: 0xc9902e, body: 0x9a6418, eye: 0xd8a040 }, 1.6);
      }
      // Sheen.
      c.save();
      ellipse(c, 0, 0, COIN_R - 2, COIN_R - 2);
      c.clip();
      const sh = c.createLinearGradient(-COIN_R, -COIN_R, COIN_R, COIN_R);
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(0.42, 'rgba(255,255,255,0)');
      sh.addColorStop(0.5, 'rgba(255,255,255,0.25)');
      sh.addColorStop(0.58, 'rgba(255,255,255,0)');
      c.fillStyle = sh;
      c.fillRect(-COIN_R, -COIN_R, COIN_R * 2, COIN_R * 2);
      c.restore();
    }, 2),
  );
}

/** The underside seen past the edge: a darker brass disc. */
export function capTexture() {
  return cached('cap', () =>
    paint(COIN_R * 2 + 8, COIN_R * 2 + 8, (c) => {
      c.translate(COIN_R + 4, COIN_R + 4);
      ellipse(c, 0, 0, COIN_R, COIN_R);
      const g = c.createLinearGradient(0, -COIN_R, 0, COIN_R);
      g.addColorStop(0, '#c8902e');
      g.addColorStop(1, '#5a3a0a');
      fillInk(c, g, 3);
    }, 1),
  );
}

/** The milled edge band (stretch its height). */
export function bandTexture() {
  return cached('band', () =>
    paint(COIN_R * 2 + 8, 16, (c) => {
      const g = c.createLinearGradient(4, 0, COIN_R * 2 + 4, 0);
      g.addColorStop(0, '#6a4410');
      g.addColorStop(0.3, '#e0b25a');
      g.addColorStop(0.55, '#b07a2a');
      g.addColorStop(1, '#4a2e08');
      c.fillStyle = g;
      c.fillRect(4, 0, COIN_R * 2, 16);
      c.fillStyle = 'rgba(60,36,6,0.45)';
      for (let x = 6; x < COIN_R * 2 + 4; x += 4) c.fillRect(x, 0, 1.4, 16);
      c.fillStyle = INK;
      c.fillRect(2.5, 0, 3, 16);
      c.fillRect(COIN_R * 2 + 2.5, 0, 3, 16);
    }, 2),
  );
}

/** A moon phase for the streak meter: i = 0 (thin crescent) … 7 (full moon). */
export function phaseTexture(i: number, lit: boolean) {
  return cached(`phase-${i}-${lit}`, () =>
    paint(44, 44, (c) => {
      c.translate(22, 22);
      const R = 15;
      if (lit) glowAt(c, 0, 0, 21, 21, MOON, 0.55, 'lighter');
      ellipse(c, 0, 0, R, R);
      c.fillStyle = lit ? '#2a2440' : '#1a1222';
      c.fill();
      // Lit part: the disc minus an offset disc (crescent grows to full).
      const frac = (i + 1) / 8;
      c.save();
      ellipse(c, 0, 0, R, R);
      c.clip();
      c.beginPath();
      c.arc(0, 0, R, 0, Math.PI * 2);
      if (i < 7) c.arc(-2 * R * frac, 0, R, 0, Math.PI * 2, true);
      const g = c.createRadialGradient(-4, -5, 2, 0, 0, R);
      g.addColorStop(0, lit ? '#fffbe8' : '#4a3e52');
      g.addColorStop(1, lit ? '#e0c070' : '#2e2636');
      c.fillStyle = g;
      c.fill('evenodd');
      c.restore();
      ellipse(c, 0, 0, R, R);
      c.strokeStyle = lit ? 'rgba(255,230,170,0.9)' : 'rgba(224,178,90,0.45)';
      c.lineWidth = 1.6;
      c.stroke();
    }, 2),
  );
}

// ---- The cabinet in the casino ---------------------------------------------------------------

function station(): PaintedStation {
  const W = 76;
  const H = 64;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H, 140, 220, 70, 180, (x) => {
    shadow(x, 0, -4, 46, 14, 0.6);
    // Pedestal body: navy lacquer with brass bands.
    rrect(x, -30, -92, 60, 84, 8);
    fillInk(x, vgrad(x, -92, -8, 0x1d2a5a, 0.25, 0.45), 2.2);
    const sg = x.createLinearGradient(-30, 0, 30, 0);
    sg.addColorStop(0, 'rgba(255,240,220,0.18)');
    sg.addColorStop(0.3, 'rgba(255,240,220,0)');
    sg.addColorStop(1, 'rgba(0,0,0,0.35)');
    rrect(x, -30, -92, 60, 84, 8);
    x.fillStyle = sg;
    x.fill();
    for (const by of [-90, -18]) {
      rrect(x, -32, by, 64, 7, 3);
      fillInk(x, gold(x, -32, by, 32, by + 7), 1.4);
    }
    // Eight moon-phase lights on the front, half of them lit.
    for (let i = 0; i < 8; i++) {
      const px = -24.5 + i * 7;
      ellipse(x, px, -70, 2.6, 2.6);
      x.fillStyle = i < 4 ? '#fff1c4' : '#3a3050';
      x.fill();
      if (i < 4) glowAt(x, px, -70, 5, 5, 0xfff1c4, 0.7, 'lighter');
    }
    // Coin slot and tray.
    rrect(x, -12, -50, 24, 10, 3);
    fillInk(x, gold(x, -12, -50, 12, -40), 1.4);
    rrect(x, -6, -47, 12, 3, 1);
    x.fillStyle = '#0a0410';
    x.fill();
    rrect(x, -14, -34, 28, 9, 3);
    fillInk(x, '#140a1a', 1.4);
    ellipse(x, -4, -30, 4, 2);
    fillInk(x, gold(x, -8, -32, 0, -28), 0.8);
    // Thumb lever on the right.
    x.strokeStyle = INK;
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(30, -62);
    x.lineTo(40, -62);
    x.lineTo(44, -80);
    x.stroke();
    x.strokeStyle = gold(x, 30, -80, 44, -62);
    x.lineWidth = 2.2;
    x.stroke();
    ellipse(x, 44, -82, 4.5, 4.5);
    fillInk(x, '#c8243a', 1.2);
    // Glass dome with the big brass coin tumbling inside.
    ellipse(x, 0, -92, 30, 8);
    fillInk(x, gold(x, -30, -100, 30, -84), 1.6);
    x.beginPath();
    x.moveTo(-26, -94);
    x.bezierCurveTo(-28, -150, 28, -150, 26, -94);
    x.closePath();
    x.fillStyle = 'rgba(160,200,255,0.12)';
    x.fill();
    x.strokeStyle = 'rgba(220,235,255,0.6)';
    x.lineWidth = 1.6;
    x.stroke();
    glowAt(x, 0, -118, 26, 24, 0xffcf7a, 0.45, 'lighter');
    // The coin in 3/4: a tilted ellipse with its milled edge.
    x.save();
    x.translate(0, -118);
    x.rotate(-0.35);
    ellipse(x, 0, 3, 17, 10);
    fillInk(x, '#8a5a14', 1.4);
    x.fillStyle = '#8a5a14';
    x.fillRect(-17, 0, 34, 3);
    ellipse(x, 0, 0, 17, 10);
    const cg = x.createRadialGradient(-5, -4, 1, 0, 0, 17);
    cg.addColorStop(0, '#fff6cc');
    cg.addColorStop(1, '#c08a2a');
    fillInk(x, cg, 1.4);
    x.beginPath();
    x.arc(-1, 0, 7, 0, Math.PI * 2);
    x.arc(3, -2, 6, 0, Math.PI * 2, true);
    x.fillStyle = '#ffe7a0';
    x.fill('evenodd');
    x.restore();
    // Dome highlight and crown finial.
    x.strokeStyle = 'rgba(255,255,255,0.5)';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(-6, -118, 16, Math.PI * 1.1, Math.PI * 1.45);
    x.stroke();
    ellipse(x, 0, -142, 4, 4);
    fillInk(x, gold(x, -4, -146, 4, -138), 1.2);
    // Moon sign on a little arm above.
    ellipse(x, 0, -156, 9, 9);
    x.fillStyle = '#fff1c4';
    x.fill();
    ellipse(x, 4, -158, 8, 8);
    x.fillStyle = '#1d2a5a';
    x.fill();
    glowAt(x, -2, -156, 14, 14, 0xfff1c4, 0.5, 'lighter');
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const glow = (gx: number, gy: number, w: number, h: number, tint: number, a: number) => {
    const s = new Sprite(glowTexture());
    s.anchor.set(0.5);
    s.position.set(gx, gy);
    s.width = w;
    s.height = h;
    s.tint = tint;
    s.alpha = a;
    s.blendMode = 'add';
    lamp.addChild(s);
  };
  glow(W / 2, H - 118, 90, 80, 0xffcf7a, 0.45);
  glow(W / 2, H - 156, 40, 40, MOON, 0.5);
  c.addChild(lamp);
  c.labelY = H - 176;
  return c;
}

registerPaintedStation('coin', station);

// The Falter-Poker machine on the floor: a slant-top bar cabinet in midnight teal and brass,
// suit pips glowing in the marquee, five little cards on the screen and the hold buttons.

import { Container, Sprite } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, propSprite, rgb, rrect, shadow, vgrad, type Ctx } from '../../world/painted/brush';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';
import { suitPath } from './cards';

export const STATION_W = 62;
export const STATION_H = 50;
const BODY = 0x16424a;
const NEON = 0x5fe3ff;

function glow(c: Container, x: number, y: number, w: number, h: number, tint: number, alpha: number) {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.position.set(x, y);
  s.width = w;
  s.height = h;
  s.tint = tint;
  s.alpha = alpha;
  s.blendMode = 'add';
  c.addChild(s);
}

function stool(x: Ctx, sx: number, sy: number) {
  shadow(x, sx, sy + 4, 16, 6, 0.45);
  x.fillStyle = gold(x, sx - 2, sy - 10, sx + 2, sy);
  x.fillRect(sx - 2, sy - 12, 4, 14);
  ellipse(x, sx, sy - 14, 12, 6);
  fillInk(x, vgrad(x, sy - 20, sy - 8, 0x1a3a40, 0.35, 0.3), 1.6);
}

export function pokerStation(): PaintedStation {
  const W = STATION_W;
  const H = STATION_H;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H, 110, 190, 55, 150, (x) => {
    shadow(x, 0, -2, 40, 12, 0.6);
    stool(x, 0, 30);
    const bw = 56;
    // Body.
    rrect(x, -bw / 2, -104, bw, 96, 8);
    fillInk(x, vgrad(x, -104, -8, BODY, 0.25, 0.5), 2.2);
    const sg = x.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    sg.addColorStop(0, 'rgba(255,240,220,0.18)');
    sg.addColorStop(0.3, 'rgba(255,240,220,0)');
    sg.addColorStop(0.8, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(0,0,0,0.38)');
    rrect(x, -bw / 2, -104, bw, 96, 8);
    x.fillStyle = sg;
    x.fill();
    // Marquee: a brass crest with the four suits.
    rrect(x, -bw / 2 - 2, -128, bw + 4, 26, 7);
    fillInk(x, gold(x, -bw / 2, -128, bw / 2, -102), 2);
    rrect(x, -bw / 2 + 3, -124, bw - 6, 18, 5);
    x.fillStyle = rgb(dark(BODY, 0.6));
    x.fill();
    glowAt(x, 0, -115, 30, 10, NEON, 0.55, 'lighter');
    [0, 1, 2, 3].forEach((s, i) => {
      suitPath(x, s, -15 + i * 10, -115, 9);
      x.fillStyle = s === 1 || s === 2 ? '#ff6a86' : '#fff1c4';
      x.fill();
    });
    // Little moth on top.
    for (const s of [-1, 1]) {
      ellipse(x, s * 5, -131, 6, 3.5);
      x.fillStyle = '#f0c868';
      x.fill();
      x.strokeStyle = INK;
      x.lineWidth = 1;
      x.stroke();
    }
    // Screen: slanted glass with five cards and a lit paytable stripe.
    rrect(x, -23, -98, 46, 38, 5);
    fillInk(x, gold(x, -23, -98, 23, -60), 1.8);
    rrect(x, -20, -95, 40, 32, 3);
    const sc = x.createLinearGradient(0, -95, 0, -63);
    sc.addColorStop(0, '#0a2a3a');
    sc.addColorStop(1, '#06141e');
    x.fillStyle = sc;
    x.fill();
    for (let r = 0; r < 3; r++) {
      x.fillStyle = r === 1 ? 'rgba(255,207,122,0.85)' : 'rgba(255,207,122,0.35)';
      x.fillRect(-17, -92 + r * 3.4, 34, 1.6);
    }
    for (let i = 0; i < 5; i++) {
      const cx = -16 + i * 8;
      rrect(x, cx - 3.2, -81, 6.4, 13, 1.2);
      x.fillStyle = '#fbf3e2';
      x.fill();
      ellipse(x, cx, -74.5, 1.6, 1.6);
      x.fillStyle = i % 2 ? '#d02040' : '#2a1a38';
      x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,0.14)';
    x.beginPath();
    x.moveTo(-20, -95);
    x.lineTo(-8, -95);
    x.lineTo(-15, -63);
    x.lineTo(-20, -63);
    x.closePath();
    x.fill();
    // Slanted deck with five hold buttons and the draw button.
    x.beginPath();
    x.moveTo(-bw / 2 - 3, -56);
    x.lineTo(bw / 2 + 3, -56);
    x.lineTo(bw / 2 + 5, -42);
    x.lineTo(-bw / 2 - 5, -42);
    x.closePath();
    fillInk(x, vgrad(x, -56, -42, dark(BODY, 0.25), 0.45, 0.3), 1.8);
    for (let i = 0; i < 5; i++) {
      rrect(x, -24 + i * 8.2, -53, 6.2, 4, 1.4);
      x.fillStyle = '#ffd98a';
      x.fill();
    }
    ellipse(x, 0, -46, 7, 2.6);
    fillInk(x, vgrad(x, -49, -43, NEON, 0.5, 0.2), 1.2);
    // Brass belly band and kick plate.
    x.fillStyle = gold(x, -bw / 2, -36, bw / 2, -32);
    x.fillRect(-bw / 2 + 2, -36, bw - 4, 3);
    rrect(x, -10, -30, 20, 8, 3);
    fillInk(x, gold(x, -10, -30, 10, -22), 1.4);
    x.fillStyle = gold(x, -bw / 2, -14, bw / 2, -8);
    x.fillRect(-bw / 2 + 3, -14, bw - 6, 4);
    // Side bulbs.
    for (let k = 0; k < 5; k++) {
      for (const s of [-1, 1]) {
        ellipse(x, s * (bw / 2 - 4), -98 + k * 15, 1.8, 1.8);
        x.fillStyle = rgb(light(NEON, 0.6));
        x.fill();
      }
    }
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  glow(lamp, W / 2, H - 115, 90, 46, NEON, 0.75);
  glow(lamp, W / 2, H - 79, 52, 40, 0xfff1c4, 0.35);
  c.addChild(lamp);
  c.labelY = H - 146;
  return c;
}

registerPaintedStation('poker', pokerStation);

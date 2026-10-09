// Painted pieces of "Sternenhimmel": the observatory dome window full of night sky, the stars in
// their four states, the shooting-star tail, the constellation line and the star-gazing machine
// for the room. Everything is painted once with Canvas 2D (no ctx.filter).

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { ellipse, fillInk, glowAt, gold, grain, paint, propSprite, rim, rrect, seeded, shadow, vgrad, type Ctx } from '../../world/painted/brush';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

export function starPath(c: Ctx, x: number, y: number, R: number, r: number, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  }
  c.closePath();
}

// ---- Scene ---------------------------------------------------------------------------------------

/** The dome window: brass arch, deep sky with the milky way, faint moon, rail along the bottom. */
export function domeTexture(W: number, H: number) {
  return cached(`dome-${W}x${H}`, () =>
    paint(W, H, (c) => {
      const arch = (inset: number) => {
        c.beginPath();
        c.moveTo(inset, H - inset);
        c.lineTo(inset, 100 + inset * 0.6);
        c.quadraticCurveTo(W / 2, -32 + inset * 1.6, W - inset, 100 + inset * 0.6);
        c.lineTo(W - inset, H - inset);
        c.closePath();
      };
      // Brass frame.
      arch(2);
      fillInk(c, gold(c, 0, 0, W * 0.7, H), 4);
      rim(c, 0.6, 2.5);
      arch(11);
      c.strokeStyle = 'rgba(80,46,10,0.55)';
      c.lineWidth = 2;
      c.stroke();
      // Sky.
      arch(18);
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#060a24');
      g.addColorStop(0.5, '#141a4a');
      g.addColorStop(0.85, '#2a1648');
      g.addColorStop(1, '#3a1a40');
      fillInk(c, g, 3);
      c.save();
      arch(18);
      c.clip();
      const r = seeded(404);
      // Milky way: a diagonal band of soft dabs.
      for (let i = 0; i < 46; i++) {
        const t = r();
        const x = -40 + t * (W + 80);
        const y = H * 0.82 - t * H * 0.6 + (r() - 0.5) * 90;
        glowAt(c, x, y, 50 + r() * 70, 24 + r() * 30, r() < 0.5 ? 0x8a6ad8 : 0x4a7ad8, 0.06 + r() * 0.05, 'lighter');
      }
      glowAt(c, W * 0.86, H * 0.2, 220, 180, 0xfff1c4, 0.08, 'lighter');
      grain(c, 0, 0, W, H, 900, 12, 0.03);
      for (let i = 0; i < 420; i++) {
        const a = 0.15 + r() * 0.5;
        c.fillStyle = r() < 0.15 ? `rgba(200,220,255,${a})` : `rgba(255,246,230,${a})`;
        c.beginPath();
        c.arc(r() * W, r() * H, 0.4 + r() * 1.1, 0, Math.PI * 2);
        c.fill();
      }
      // Faint old star-chart rings.
      c.strokeStyle = 'rgba(224,178,90,0.08)';
      c.lineWidth = 1.5;
      for (const rr of [160, 260, 380]) {
        c.beginPath();
        c.arc(W / 2, H + 40, rr, Math.PI, Math.PI * 2);
        c.stroke();
      }
      // Glass reflection.
      c.fillStyle = 'rgba(255,255,255,0.035)';
      c.beginPath();
      c.moveTo(18, 0);
      c.lineTo(W * 0.3, 0);
      c.lineTo(W * 0.12, H);
      c.lineTo(18, H);
      c.closePath();
      c.fill();
      c.restore();
      // Brass rivets along the frame.
      for (let i = 0; i < 9; i++) {
        const y = 130 + i * ((H - 160) / 8);
        for (const x of [9, W - 9]) {
          ellipse(c, x, y, 2.6, 2.6);
          fillInk(c, '#fff1c4', 1);
        }
      }
    }),
  );
}

export type StarKind = 'dim' | 'pick' | 'hit' | 'miss';
const STAR_COL: Record<StarKind, [string, string, number, number]> = {
  dim: ['#d8d0e4', '#6a6288', 0x9aa8ff, 0.18],
  pick: ['#fff6c8', '#e09a2a', 0xffcf7a, 0.6],
  hit: ['#ffffff', '#ffc24a', 0xfff1c4, 0.95],
  miss: ['#eef6ff', '#5a8ad8', 0x7fc8ff, 0.5],
};

/** One star of the sky (96×96, star radius 34). */
export function starTexture(kind: StarKind) {
  return cached(`star-${kind}`, () =>
    paint(96, 96, (c) => {
      const [hi, lo, glow, ga] = STAR_COL[kind];
      glowAt(c, 48, 48, 46, 46, glow, ga, 'lighter');
      starPath(c, 48, 50, 36, 17);
      c.fillStyle = 'rgba(6,2,12,0.45)';
      c.fill();
      starPath(c, 48, 47, 36, 17);
      const g = c.createRadialGradient(42, 38, 2, 48, 48, 38);
      g.addColorStop(0, hi);
      g.addColorStop(1, lo);
      fillInk(c, g, 2.4);
      // Facets for a cut-glass look.
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        c.beginPath();
        c.moveTo(48, 47);
        c.lineTo(48 + Math.cos(a) * 30, 47 + Math.sin(a) * 30);
        c.stroke();
      }
      ellipse(c, 40, 36, 5, 3);
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.fill();
    }, 2),
  );
}

/** Golden ring around a chosen star. */
export function ringTexture() {
  return cached('pick-ring', () =>
    paint(110, 110, (c) => {
      c.beginPath();
      c.arc(55, 55, 46, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(255,207,122,0.9)';
      c.lineWidth = 3;
      c.setLineDash([7, 6]);
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.arc(55, 55, 50, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(255,207,122,0.25)';
      c.lineWidth = 5;
      c.stroke();
    }, 2),
  );
}

/** The tail of a shooting star: a long tapering streak, the head at the right end. */
export function tailTexture() {
  return cached('tail', () =>
    paint(320, 40, (c) => {
      const g = c.createLinearGradient(0, 0, 320, 0);
      g.addColorStop(0, 'rgba(160,190,255,0)');
      g.addColorStop(0.6, 'rgba(220,230,255,0.35)');
      g.addColorStop(0.92, 'rgba(255,246,220,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 20);
      c.quadraticCurveTo(220, 12, 312, 13);
      c.arc(312, 20, 7, -Math.PI / 2, Math.PI / 2);
      c.quadraticCurveTo(220, 28, 0, 20);
      c.closePath();
      c.fill();
      glowAt(c, 306, 20, 18, 14, 0xfff1c4, 0.9, 'lighter');
    }, 2),
  );
}

/** A soft glowing line segment (stretch its width), for the constellation. */
export function lineTexture() {
  return cached('cline', () =>
    paint(64, 16, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 16);
      g.addColorStop(0, 'rgba(255,220,150,0)');
      g.addColorStop(0.5, 'rgba(255,240,200,1)');
      g.addColorStop(1, 'rgba(255,220,150,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 16);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillRect(0, 7.2, 64, 1.6);
    }, 2),
  );
}

// ---- Room station: star-gazing machine with a glass dome ------------------------------------------

function stool(c: Ctx, x: number, y: number, col: number) {
  shadow(c, x, y + 4, 16, 6, 0.45);
  c.fillStyle = gold(c, x - 2, y - 10, x + 2, y);
  c.fillRect(x - 2, y - 12, 4, 14);
  ellipse(c, x, y - 14, 12, 6);
  fillInk(c, vgrad(c, y - 20, y - 8, col, 0.35, 0.3), 1.6);
}

function kenoStation(): PaintedStation {
  const W = 76;
  const H = 64;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H, 140, 210, 70, 170, (x) => {
    shadow(x, 0, -4, 46, 14, 0.6);
    stool(x, 0, 30, 0x1a2a4a);
    const bw = 64;
    // Body: midnight-blue cabinet with brass corners.
    rrect(x, -bw / 2, -96, bw, 88, 9);
    fillInk(x, vgrad(x, -96, -8, 0x1c2a5a, 0.25, 0.5), 2.2);
    const sg = x.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    sg.addColorStop(0, 'rgba(255,240,220,0.16)');
    sg.addColorStop(0.3, 'rgba(255,240,220,0)');
    sg.addColorStop(0.8, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(0,0,0,0.38)');
    rrect(x, -bw / 2, -96, bw, 88, 9);
    x.fillStyle = sg;
    x.fill();
    // Brass collar under the dome.
    rrect(x, -bw / 2 - 3, -104, bw + 6, 12, 5);
    fillInk(x, gold(x, -bw / 2, -104, bw / 2, -92), 2);
    // Glass dome with stars and a moon.
    x.beginPath();
    x.moveTo(-29, -102);
    x.bezierCurveTo(-29, -150, 29, -150, 29, -102);
    x.closePath();
    const dg = x.createRadialGradient(-6, -130, 4, 0, -112, 40);
    dg.addColorStop(0, '#3a4a9a');
    dg.addColorStop(1, '#0a1030');
    fillInk(x, dg, 2);
    const r = seeded(9);
    for (let i = 0; i < 22; i++) {
      const a = Math.PI + r() * Math.PI;
      const rr = 4 + r() * 22;
      ellipse(x, Math.cos(a) * rr, -104 + Math.sin(a) * rr * 1.2, 0.8 + r() * 0.6, 0.8 + r() * 0.6);
      x.fillStyle = 'rgba(255,246,230,0.9)';
      x.fill();
    }
    // Constellation in gold.
    x.strokeStyle = 'rgba(255,207,122,0.85)';
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(-16, -112);
    x.lineTo(-6, -124);
    x.lineTo(6, -118);
    x.lineTo(15, -130);
    x.stroke();
    for (const [px, py] of [[-16, -112], [-6, -124], [6, -118], [15, -130]]) {
      ellipse(x, px, py, 2, 2);
      x.fillStyle = '#fff1c4';
      x.fill();
    }
    // Shooting star streak.
    x.strokeStyle = 'rgba(220,235,255,0.8)';
    x.lineWidth = 1.4;
    x.beginPath();
    x.moveTo(-20, -134);
    x.lineTo(-4, -138);
    x.stroke();
    // Dome highlight.
    x.beginPath();
    x.moveTo(-22, -108);
    x.bezierCurveTo(-22, -132, -10, -140, 0, -141);
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    x.lineWidth = 2.5;
    x.stroke();
    // Brass telescope poking out to the side.
    x.save();
    x.translate(22, -122);
    x.rotate(-0.6);
    rrect(x, -3, -4, 26, 8, 3);
    fillInk(x, gold(x, -3, -4, 23, 4), 1.4);
    rrect(x, 20, -5.5, 6, 11, 2);
    fillInk(x, gold(x, 20, -5, 26, 5), 1.2);
    x.restore();
    // Front: star-chart screen.
    rrect(x, -24, -86, 48, 34, 5);
    fillInk(x, gold(x, -24, -86, 24, -52), 1.6);
    rrect(x, -20, -82, 40, 26, 3);
    x.fillStyle = '#0a1030';
    x.fill();
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 8; j++) {
        ellipse(x, -17 + j * 4.9, -78 + i * 6.2, 1, 1);
        x.fillStyle = (i * 8 + j) % 7 === 2 ? '#ffcf7a' : 'rgba(200,210,255,0.6)';
        x.fill();
      }
    // Deck with a round star button.
    rrect(x, -bw / 2 - 2, -46, bw + 4, 14, 4);
    fillInk(x, vgrad(x, -46, -32, 0x101a3a, 0.4, 0.3), 1.8);
    ellipse(x, 0, -40, 8, 4.5);
    fillInk(x, vgrad(x, -44, -36, 0xffcf7a, 0.5, 0.2), 1.4);
    x.fillStyle = gold(x, -bw / 2, -14, bw / 2, -8);
    x.fillRect(-bw / 2 + 3, -14, bw - 6, 4);
    // Little brass stars on the cabinet corners.
    for (const sx of [-1, 1]) {
      starPath(x, sx * (bw / 2 - 7), -22, 4, 1.8);
      fillInk(x, '#f0c868', 1);
    }
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.position.set(W / 2, H - 122);
  glow.width = 96;
  glow.height = 80;
  glow.tint = 0x8ab0ff;
  glow.alpha = 0.6;
  glow.blendMode = 'add';
  lamp.addChild(glow);
  c.addChild(lamp);
  c.labelY = H - 160;
  return c;
}

registerPaintedStation('keno', kenoStation);
export { kenoStation };

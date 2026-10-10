// Painted pieces of the Zielscheibe: the moonlit glade, the target face for each throwing
// style (ring sizes follow the odds), the straw board on its easel, the dart in flight and
// stuck, the moth archer, and the target stand in the room. Painted once and cached.

import { Container, Sprite, type Texture } from 'pixi.js';
import { drawMoth, glowTexture } from '../../core/fx';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, paint, propSprite, rgb, rrect, seeded, shadow, vgrad } from '../../world/painted/brush';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';
import { eyeRadii, ringRadii, type Style } from './rules';

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Ring colours from the bullseye outwards. */
export const RING_COLORS = [0xf0c868, 0xb8243a, 0xf2e6c9, 0x2a3a8a, 0x5a2a6a];
export const RING_INK = [0x2a1406, 0xfff3dc, 0x2a1406, 0xfff3dc, 0xfff3dc];

// ---- Glade -----------------------------------------------------------------------------------------

/** The night glade behind the target: sky, the full moon right behind the board, trees, grass. */
export function gladeTexture(w: number, h: number, tx: number, ty: number, R: number) {
  return paint(w, h, (c) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a0c2a');
    g.addColorStop(0.6, '#1e1a48');
    g.addColorStop(1, '#2a1838');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const r = seeded(23);
    for (let i = 0; i < (w * h) / 1100; i++) {
      c.fillStyle = `rgba(255,246,230,${0.2 + r() * 0.5})`;
      c.beginPath();
      c.arc(r() * w, r() * h * 0.6, 0.5 + r() * 0.8, 0, Math.PI * 2);
      c.fill();
    }
    // The full moon sits right behind the target: "moonlit".
    const mr = R * 1.25;
    glowAt(c, tx, ty, mr * 2.6, mr * 2.2, 0xfff1c4, 0.28);
    ellipse(c, tx + R * 0.2, ty - R * 0.15, mr, mr);
    const mg = c.createRadialGradient(tx - mr * 0.2, ty - mr * 0.4, 4, tx, ty, mr);
    mg.addColorStop(0, '#fffbe8');
    mg.addColorStop(1, '#d8c088');
    c.fillStyle = mg;
    c.fill();
    for (const [dx, dy, rr] of [[-0.4, -0.3, 0.16], [0.35, 0.25, 0.12], [0.5, -0.45, 0.09], [-0.2, 0.55, 0.1]]) {
      ellipse(c, tx + R * 0.2 + dx * mr, ty - R * 0.15 + dy * mr, rr * mr, rr * mr);
      c.fillStyle = 'rgba(170,140,80,0.3)';
      c.fill();
    }
    // Tree silhouettes at the sides.
    const horizon = h * 0.78;
    for (const [x, s] of [[w * 0.04, 1.2], [w * 0.16, 0.9], [w * 0.86, 1.1], [w * 0.97, 1.3]] as const) {
      const th = h * 0.55 * s;
      c.fillStyle = '#120c22';
      c.fillRect(x - 5 * s, horizon - th * 0.5, 10 * s, th * 0.5);
      for (let k = 0; k < 4; k++) {
        ellipse(c, x + (k % 2 ? 1 : -1) * 12 * s, horizon - th * (0.45 + k * 0.15), 44 * s - k * 6, 30 * s);
        c.fill();
      }
    }
    // Meadow.
    c.beginPath();
    c.moveTo(0, horizon);
    for (let x = 0; x <= w; x += 30) c.lineTo(x, horizon - 6 + Math.sin(x * 0.02) * 6);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.closePath();
    const mg2 = c.createLinearGradient(0, horizon, 0, h);
    mg2.addColorStop(0, '#1e3a30');
    mg2.addColorStop(1, '#0e1e18');
    c.fillStyle = mg2;
    c.fill();
    c.strokeStyle = 'rgba(80,140,100,0.5)';
    c.lineWidth = 1.2;
    for (let i = 0; i < w / 6; i++) {
      const x = r() * w;
      const y = horizon + r() * (h - horizon);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.5) * 6, y - 6 - r() * 8);
      c.stroke();
    }
    // Fireflies.
    for (let i = 0; i < 14; i++) glowAt(c, r() * w, h * 0.4 + r() * h * 0.5, 6, 6, 0xd8ff7a, 0.5, 'lighter');
  }, 1.25);
}

// ---- Target ----------------------------------------------------------------------------------------

/** Design radius of the painted target face. */
export const RT = 160;

/** The target face for a style: rings sized by their odds, a deco pattern that shows the spin. */
/** The face of a style; `eye`: with the Eulenauge (bigger bull, amber owl's-eye iris round it). */
export function faceTexture(style: Style, eye = false) {
  return cached(`face-${style}${eye ? '-eye' : ''}`, () =>
    paint(RT * 2 + 24, RT * 2 + 24, (c) => {
      c.translate(RT + 12, RT + 12);
      const radii = (eye ? eyeRadii(style) : ringRadii(style)).map((k) => k * RT);
      // Brass rim.
      ellipse(c, 0, 0, RT + 10, RT + 10);
      fillInk(c, gold(c, -RT, -RT, RT, RT), 2.6);
      for (let i = radii.length - 1; i >= 0; i--) {
        const col = RING_COLORS[i];
        ellipse(c, 0, 0, radii[i], radii[i]);
        const g = c.createRadialGradient(-radii[i] * 0.3, -radii[i] * 0.3, 2, 0, 0, radii[i]);
        g.addColorStop(0, rgb(light(col, 0.18)));
        g.addColorStop(1, rgb(dark(col, 0.2)));
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = 'rgba(240,200,104,0.9)';
        c.lineWidth = 2.2;
        c.stroke();
      }
      // Sixteen segments, alternately shaded, so the turning is visible.
      c.save();
      ellipse(c, 0, 0, RT, RT);
      c.clip();
      for (let k = 0; k < 16; k++) {
        if (k % 2) continue;
        const a = (k / 16) * Math.PI * 2;
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, RT, a, a + Math.PI / 8);
        c.closePath();
        c.fillStyle = 'rgba(10,4,20,0.12)';
        c.fill();
      }
      // Little stars on the outer ring.
      const r = seeded(7);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + r() * 0.2;
        const rr = (radii[radii.length - 1] + (radii[radii.length - 2] ?? 0)) / 2;
        ellipse(c, Math.cos(a) * rr, Math.sin(a) * rr, 1.6, 1.6);
        c.fillStyle = 'rgba(255,246,220,0.8)';
        c.fill();
      }
      // Moonlight sheen.
      glowAt(c, -RT * 0.35, -RT * 0.4, RT * 0.8, RT * 0.6, 0xfff4dc, 0.18);
      c.restore();
      // A brass moth in the bullseye.
      const b = radii[0];
      if (eye) {
        // The owl's eye: an amber iris with dark streaks round the grown bull.
        glowAt(c, 0, 0, b * 1.25, b * 1.25, 0xffb43a, 0.55, 'lighter');
        c.strokeStyle = 'rgba(122,60,10,0.55)';
        c.lineWidth = 1.6;
        c.beginPath();
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          c.moveTo(Math.cos(a) * b * 0.45, Math.sin(a) * b * 0.45);
          c.lineTo(Math.cos(a) * b * 0.92, Math.sin(a) * b * 0.92);
        }
        c.stroke();
        ellipse(c, 0, 0, b, b);
        c.strokeStyle = 'rgba(255,180,58,0.95)';
        c.lineWidth = 4;
        c.stroke();
      }
      drawMoth(c, 0, 1, b * 1.1, 'rgba(90,50,10,0.55)', 'rgba(60,30,8,0.7)');
    }, 2),
  );
}

/** Straw board on a wooden easel, behind the target; origin at the target's centre. */
export function boardTexture() {
  return cached('board', () =>
    paint(RT * 3, RT * 3.6, (c) => {
      c.translate(RT * 1.5, RT * 1.5);
      const S = RT * 1.32;
      // Easel legs.
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(s * S * 0.7, -S * 0.2);
        c.lineTo(s * S * 0.95, RT * 2.05);
        c.lineTo(s * S * 0.95 - s * 12, RT * 2.05);
        c.lineTo(s * S * 0.7 - s * 12, -S * 0.2);
        c.closePath();
        fillInk(c, vgrad(c, -S, RT * 2, 0x6a3a1a, 0.2, 0.4), 2);
      }
      shadow(c, 0, RT * 2.02, S * 1.1, 14, 0.5);
      // Straw board.
      rrect(c, -S, -S, S * 2, S * 2, 18);
      fillInk(c, vgrad(c, -S, S, 0xb8904a, 0.2, 0.45), 3);
      c.save();
      rrect(c, -S, -S, S * 2, S * 2, 18);
      c.clip();
      const r = seeded(3);
      for (let i = 0; i < 900; i++) {
        const x = -S + r() * S * 2;
        const y = -S + r() * S * 2;
        const a = r() * Math.PI;
        c.strokeStyle = r() < 0.5 ? 'rgba(90,60,20,0.25)' : 'rgba(255,230,160,0.2)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
        c.stroke();
      }
      grain(c, -S, -S, S * 2, S * 2, 200, 4, 0.06);
      glowAt(c, -S * 0.4, -S * 0.5, S, S * 0.7, 0xfff1c4, 0.15);
      c.restore();
      // Brass corner caps.
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ellipse(c, x * (S - 12), y * (S - 12), 8, 8);
        fillInk(c, gold(c, x * S - 10, y * S - 10, x * S + 10, y * S + 10), 1.6);
      }
    }, 1.5),
  );
}

// ---- Dart ------------------------------------------------------------------------------------------

/** The dart in flight, pointing right; origin at the tip. */
export function dartTexture() {
  return cached('dart', () =>
    paint(120, 36, (c) => {
      c.translate(112, 18);
      // Brass tip.
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-18, -3);
      c.lineTo(-18, 3);
      c.closePath();
      fillInk(c, gold(c, -18, -3, 0, 3), 1.2);
      // Wooden barrel.
      rrect(c, -62, -4.5, 46, 9, 4);
      fillInk(c, vgrad(c, -5, 5, 0x7a3a1a, 0.3, 0.3), 1.4);
      for (let k = 0; k < 3; k++) {
        c.fillStyle = 'rgba(240,200,104,0.9)';
        c.fillRect(-56 + k * 12, -4.5, 3, 9);
      }
      // Moth-wing fletching.
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(-60, 0);
        c.quadraticCurveTo(-82, s * 18, -102, s * 14);
        c.lineTo(-96, 0);
        c.closePath();
        fillInk(c, vgrad(c, -16, 16, 0xe6c07a, 0.3, 0.3), 1.3);
        ellipse(c, -84, s * 8, 3, 3);
        c.fillStyle = '#8a3a2a';
        c.fill();
      }
    }, 2.5),
  );
}

/** A dart stuck in the target, seen from the front: the fletching towards us. Origin at the tip. */
export function stuckTexture() {
  return cached('dart-stuck', () =>
    paint(60, 60, (c) => {
      c.translate(14, 46);
      shadow(c, 2, 2, 6, 3, 0.6);
      c.save();
      c.rotate(-0.75);
      rrect(c, 0, -3, 30, 6, 3);
      fillInk(c, vgrad(c, -3, 3, 0x7a3a1a, 0.3, 0.3), 1.2);
      c.fillStyle = 'rgba(240,200,104,0.9)';
      c.fillRect(8, -3, 2.5, 6);
      c.fillRect(16, -3, 2.5, 6);
      c.restore();
      // Fletching seen end-on: a little cross of moth wings.
      c.save();
      c.translate(28, -26);
      for (let k = 0; k < 4; k++) {
        c.rotate(Math.PI / 2);
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(8, -4, 13, 0);
        c.quadraticCurveTo(8, 4, 0, 0);
        fillInk(c, '#e6c07a', 1);
      }
      ellipse(c, 0, 0, 2.6, 2.6);
      c.fillStyle = '#8a3a2a';
      c.fill();
      c.restore();
    }, 2.5),
  );
}

// ---- Moth archer -----------------------------------------------------------------------------------

/** The moth thrower, a fuzzy moth in a little velvet waistcoat, seen from the side facing right. */
export function archerTexture() {
  return cached('archer', () =>
    paint(170, 200, (c) => {
      c.translate(84, 176);
      shadow(c, 0, 14, 50, 12, 0.5);
      // Back wing (raised).
      c.save();
      c.translate(-10, -100);
      c.rotate(-0.5);
      ellipse(c, -30, -10, 46, 30);
      fillInk(c, vgrad(c, -40, 20, 0xc8a8e8, 0.3, 0.35), 2);
      ellipse(c, -34, -12, 12, 10);
      c.fillStyle = 'rgba(90,40,120,0.5)';
      c.fill();
      c.restore();
      // Legs.
      for (const s of [-1, 1]) {
        c.strokeStyle = INK;
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(s * 8, -40);
        c.lineTo(s * 12, 8);
        c.stroke();
        c.strokeStyle = '#3a2a40';
        c.lineWidth = 3;
        c.stroke();
        ellipse(c, s * 12 + 4, 10, 8, 4);
        fillInk(c, '#2a1a24', 1.2);
      }
      // Fuzzy body.
      ellipse(c, 0, -72, 30, 40);
      fillInk(c, vgrad(c, -112, -32, 0xe8d0a8, 0.35, 0.35), 2.4);
      c.save();
      ellipse(c, 0, -72, 30, 40);
      c.clip();
      const r = seeded(11);
      for (let i = 0; i < 140; i++) {
        c.strokeStyle = r() < 0.5 ? 'rgba(255,250,230,0.5)' : 'rgba(120,80,40,0.25)';
        c.lineWidth = 1;
        const x = -30 + r() * 60;
        const y = -112 + r() * 80;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + (r() - 0.5) * 4, y + 4);
        c.stroke();
      }
      // Waistcoat.
      c.beginPath();
      c.moveTo(-30, -80);
      c.quadraticCurveTo(0, -66, 30, -80);
      c.lineTo(30, -32);
      c.lineTo(-30, -32);
      c.closePath();
      c.fillStyle = vgrad(c, -80, -32, 0x7a1a3a, 0.2, 0.3);
      c.fill();
      for (let k = 0; k < 3; k++) {
        ellipse(c, 6, -66 + k * 11, 2, 2);
        c.fillStyle = gold(c, 4, -68 + k * 11, 8, -64 + k * 11);
        c.fill();
      }
      c.restore();
      // Head with big eyes and feathery antennae.
      ellipse(c, 14, -124, 22, 20);
      fillInk(c, vgrad(c, -144, -104, 0xf0dcb8, 0.35, 0.3), 2.2);
      ellipse(c, 24, -126, 8, 9);
      fillInk(c, '#1a0c18', 1.2);
      ellipse(c, 26, -129, 2.6, 2.6);
      c.fillStyle = '#ffffff';
      c.fill();
      glowAt(c, 22, -114, 6, 4, 0xff7a9a, 0.5);
      for (const [ax, bend] of [[4, -1], [16, 1]] as const) {
        c.strokeStyle = '#6a4a20';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(ax, -140);
        c.quadraticCurveTo(ax + 6 * bend, -166, ax + 18, -176);
        c.stroke();
        for (let k = 0; k < 6; k++) {
          const t = k / 6;
          const x = ax + 3 * bend * t + 18 * t * t;
          const y = -140 - 36 * t;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x - 6, y - 3);
          c.moveTo(x, y);
          c.lineTo(x + 6, y - 2);
          c.lineWidth = 1;
          c.stroke();
        }
      }
      // Front wing (folded down along the side).
      c.save();
      c.translate(-6, -84);
      c.rotate(0.35);
      ellipse(c, -16, 10, 24, 40);
      fillInk(c, vgrad(c, -30, 50, 0xd8b8f0, 0.35, 0.35), 2);
      ellipse(c, -16, 4, 8, 10);
      c.fillStyle = 'rgba(90,40,120,0.45)';
      c.fill();
      drawMoth(c, -16, 26, 12, 'rgba(255,240,200,0.6)', 'rgba(255,240,200,0.6)');
      c.restore();
    }, 2),
  );
}

/** The throwing arm: a fuzzy arm with a three-fingered hand; origin at the shoulder, pointing up. */
export function armTexture() {
  return cached('arm', () =>
    paint(30, 70, (c) => {
      c.translate(15, 62);
      c.beginPath();
      c.moveTo(-5, 0);
      c.quadraticCurveTo(-7, -30, -3, -50);
      c.lineTo(5, -50);
      c.quadraticCurveTo(7, -30, 5, 0);
      c.closePath();
      fillInk(c, vgrad(c, -50, 0, 0xe0c498, 0.3, 0.3), 1.8);
      ellipse(c, 1, -54, 7, 6);
      fillInk(c, '#e8d0a8', 1.6);
    }, 2.5),
  );
}

// ---- Station in the room ---------------------------------------------------------------------------

/** The target stand: a round velvet table with darts, an easel with a moonlit target behind it. */
function targetStand(): PaintedStation {
  const W = 120;
  const H = 84;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H / 2, 200, 230, 100, 150, (x) => {
    shadow(x, 0, 30, 76, 24, 0.6);
    for (const sx of [-40, 0, 40]) {
      shadow(x, sx, 66, 14, 5, 0.45);
      x.fillStyle = gold(x, sx - 2, 50, sx + 2, 64);
      x.fillRect(sx - 2, 50, 4, 14);
      ellipse(x, sx, 50, 11, 5.5);
      fillInk(x, vgrad(x, 44, 56, 0x5a1a3a, 0.35, 0.3), 1.6);
    }
    // Easel and the target rising behind the table.
    for (const s of [-1, 1]) {
      x.strokeStyle = INK;
      x.lineWidth = 5;
      x.beginPath();
      x.moveTo(s * 22, -112);
      x.lineTo(s * 34, -14);
      x.stroke();
      x.strokeStyle = '#7a4a24';
      x.lineWidth = 3;
      x.stroke();
    }
    glowAt(x, 0, -96, 70, 60, 0xfff1c4, 0.35, 'lighter');
    rrect(x, -40, -138, 80, 80, 8);
    fillInk(x, vgrad(x, -138, -58, 0xb8904a, 0.2, 0.4), 2);
    const rings = [36, 29, 22, 15, 6];
    const cols = [0x5a2a6a, 0x2a3a8a, 0xf2e6c9, 0xb8243a, 0xf0c868];
    rings.forEach((rr, i) => {
      ellipse(x, 0, -98, rr, rr);
      fillInk(x, rgb(cols[i]), i === 0 ? 2 : 1);
    });
    // Two darts in the board.
    for (const [dx, dy] of [[9, -104], [-14, -90]]) {
      x.strokeStyle = '#7a3a1a';
      x.lineWidth = 2.4;
      x.beginPath();
      x.moveTo(dx, dy);
      x.lineTo(dx + 8, dy + 8);
      x.stroke();
      ellipse(x, dx + 9, dy + 9, 3, 3);
      x.fillStyle = '#e6c07a';
      x.fill();
    }
    // Round velvet table in front with a dart tray.
    ellipse(x, 0, 6, 66, 26);
    fillInk(x, vgrad(x, -20, 32, 0x3a1424, 0.2, 0.45), 2.2);
    x.fillRect(-66, -4, 132, 10);
    ellipse(x, 0, -4, 66, 26);
    fillInk(x, gold(x, -66, -30, 66, 22), 2.2);
    ellipse(x, 0, -4, 58, 21);
    x.fillStyle = vgrad(x, -25, 17, 0x6a1a3a, 0.25, 0.35);
    x.fill();
    rrect(x, -26, -10, 52, 12, 5);
    fillInk(x, gold(x, -26, -10, 26, 2), 1.4);
    for (let k = 0; k < 3; k++) {
      x.strokeStyle = '#7a3a1a';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(-18 + k * 14, -4);
      x.lineTo(-6 + k * 14, -4);
      x.stroke();
      ellipse(x, -4 + k * 14, -4, 2.6, 2.2);
      x.fillStyle = '#e6c07a';
      x.fill();
    }
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.position.set(W / 2, H / 2 - 98);
  glow.width = 150;
  glow.height = 130;
  glow.tint = 0xfff1c4;
  glow.alpha = 0.45;
  glow.blendMode = 'add';
  lamp.addChild(glow);
  c.addChild(lamp);
  c.labelY = H / 2 - 150;
  return c;
}

registerPaintedStation('target', targetStand);


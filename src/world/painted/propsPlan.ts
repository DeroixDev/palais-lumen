// Painted pieces that give each floor its own floor plan, not just its own paint: a velvet
// runner and a marble dais for the Kerzensaal, a pond with a bridge, flagstone paths and a
// pavilion for the Mondgarten, a conveyor belt with catwalks and steel grating for the Uhrwerk.
// Same conventions as the other prop files: (x, y) is the middle of the footprint.

import { Container, Graphics, Sprite } from 'pixi.js';
import type { DecorPlacement, RoomTheme } from '../../core/registry';
import type { BuiltDecor, Rect } from '../decor';
import { ent, glow } from './foyerProps';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, mix, paint, propSprite, rgb, rrect, seeded, shadow, vgrad, type Ctx } from './brush';

const floorPart = (view: Container, obstacles: Rect[] = [], update?: BuiltDecor['update']): BuiltDecor => ({ view, layer: 'floor', obstacles, update });

/** Hazard stripes (yellow and black) along a strip. */
function hazard(c: Ctx, x: number, y: number, w: number, h: number) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.fillStyle = '#e8b22a';
  c.fillRect(x, y, w, h);
  c.fillStyle = '#1a1410';
  const s = Math.max(w, h);
  for (let k = -s; k < s * 2; k += 14) {
    c.beginPath();
    if (w >= h) {
      c.moveTo(x + k, y + h);
      c.lineTo(x + k + 7, y + h);
      c.lineTo(x + k + 7 + h, y);
      c.lineTo(x + k + h, y);
    } else {
      c.moveTo(x, y + k);
      c.lineTo(x, y + k + 7);
      c.lineTo(x + w, y + k + 7 + w);
      c.lineTo(x + w, y + k + w);
    }
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** Steel grating: a plate with a diamond mesh and rivets. */
function grating(c: Ctx, x: number, y: number, w: number, h: number, rnd: () => number) {
  const g = c.createLinearGradient(x, y, x + w * 0.4, y + h);
  g.addColorStop(0, '#5a5a62');
  g.addColorStop(1, '#2a2a32');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  // Mesh holes with the dark beneath.
  for (let yy = y + 4; yy < y + h; yy += 9) {
    for (let xx = x + ((yy - y) % 18 ? 0 : 6) + 3; xx < x + w; xx += 12) {
      c.beginPath();
      c.moveTo(xx, yy - 3);
      c.lineTo(xx + 4, yy);
      c.lineTo(xx, yy + 3);
      c.lineTo(xx - 4, yy);
      c.closePath();
      c.fillStyle = 'rgba(8,6,10,0.75)';
      c.fill();
      c.strokeStyle = 'rgba(200,205,215,0.18)';
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(xx - 4, yy);
      c.lineTo(xx, yy - 3);
      c.stroke();
    }
  }
  // Scuffs.
  for (let i = 0; i < (w * h) / 900; i++) {
    c.fillStyle = `rgba(255,240,220,${0.03 + rnd() * 0.04})`;
    c.fillRect(x + rnd() * w, y + rnd() * h, 6 + rnd() * 18, 1.2);
  }
  c.restore();
  c.strokeStyle = 'rgba(10,8,12,0.9)';
  c.lineWidth = 2;
  c.strokeRect(x, y, w, h);
  for (const [rx, ry] of [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]]) {
    ellipse(c, rx, ry, 2.2, 2.2);
    c.fillStyle = '#c8ccd6';
    c.fill();
  }
}

/** A wooden crate for the conveyor (drawn around its bottom centre). */
function crate(c: Ctx, w: number, h: number, col: number) {
  shadow(c, 2, 2, w * 0.6, 5, 0.5);
  rrect(c, -w / 2, -h, w, h, 3);
  fillInk(c, vgrad(c, -h, 0, col, 0.2, 0.35), 1.6);
  c.strokeStyle = rgb(dark(col, 0.45));
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(-w / 2 + 3, -h + 3);
  c.lineTo(w / 2 - 3, -3);
  c.moveTo(w / 2 - 3, -h + 3);
  c.lineTo(-w / 2 + 3, -3);
  c.stroke();
  rrect(c, -w / 2, -h, w, h * 0.28, 3);
  c.fillStyle = rgb(light(col, 0.25), 0.8);
  c.fill();
}

/** A brass gear lying on the belt. */
function looseGear(c: Ctx, r: number) {
  shadow(c, 2, 2, r * 1.2, r * 0.4, 0.5);
  c.save();
  c.translate(0, -r * 0.5);
  c.scale(1, 0.55);
  c.beginPath();
  const teeth = 10;
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 0.78;
    i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
  fillInk(c, gold(c, -r, -r, r, r), 1.4);
  ellipse(c, 0, 0, r * 0.3, r * 0.3);
  c.fillStyle = '#2a1a10';
  c.fill();
  c.restore();
}

export function buildPaintedPlan(d: DecorPlacement, t: RoomTheme): BuiltDecor[] | null {
  const { x, y } = d;
  const w = d.w ?? 0;
  const h = d.h ?? 0;
  const rnd = seeded(Math.round(x * 37 + y * 13 + 3));
  switch (d.kind) {
    // ---- Kerzensaal ----------------------------------------------------------------------------
    case 'runner': {
      // A long velvet runner down the nave, gold edges and moth medallions.
      const rw = w || 160;
      const rh = h || 600;
      const col = t.carpetPattern;
      const s = propSprite(x, y, rw + 20, rh + 20, rw / 2 + 10, rh / 2 + 10, (c) => {
        shadow(c, 0, 4, rw * 0.55, rh * 0.52, 0.3);
        const g = c.createLinearGradient(-rw / 2, 0, rw / 2, 0);
        g.addColorStop(0, rgb(dark(col, 0.35)));
        g.addColorStop(0.5, rgb(light(col, 0.12)));
        g.addColorStop(1, rgb(dark(col, 0.35)));
        c.fillStyle = g;
        c.fillRect(-rw / 2, -rh / 2, rw, rh);
        for (let i = 0; i < rh * 1.6; i++) {
          c.fillStyle = rnd() < 0.5 ? rgb(light(col, 0.3), 0.12) : rgb(dark(col, 0.4), 0.15);
          c.fillRect(-rw / 2 + rnd() * rw, -rh / 2 + rnd() * rh, 2 + rnd() * 3, 1);
        }
        for (const ex of [-rw / 2, rw / 2 - 9]) {
          c.fillStyle = gold(c, ex, 0, ex + 9, 0);
          c.fillRect(ex, -rh / 2, 9, rh);
        }
        c.strokeStyle = rgb(t.carpetAccent, 0.5);
        c.lineWidth = 1.5;
        c.strokeRect(-rw / 2 + 16, -rh / 2 + 10, rw - 32, rh - 20);
        // Medallions every few steps.
        for (let my = -rh / 2 + 60; my < rh / 2 - 30; my += 110) {
          c.save();
          c.translate(0, my);
          c.beginPath();
          c.moveTo(0, -26);
          c.lineTo(rw * 0.3, 0);
          c.lineTo(0, 26);
          c.lineTo(-rw * 0.3, 0);
          c.closePath();
          c.fillStyle = rgb(dark(col, 0.3), 0.8);
          c.fill();
          c.strokeStyle = rgb(t.carpetAccent, 0.75);
          c.lineWidth = 2;
          c.stroke();
          for (const sd of [-1, 1]) {
            ellipse(c, sd * 8, -2, 8, 5);
            c.fillStyle = rgb(t.carpetAccent, 0.6);
            c.fill();
          }
          ellipse(c, 0, 0, 2, 7);
          c.fillStyle = rgb(light(t.carpetAccent, 0.3), 0.9);
          c.fill();
          c.restore();
        }
        // Fringe at both ends.
        for (let k = -rw / 2 + 4; k < rw / 2 - 2; k += 5) {
          c.fillStyle = '#e8d6a8';
          c.fillRect(k, -rh / 2 - 7, 2, 7);
          c.fillRect(k, rh / 2, 2, 7);
        }
      }, rh > 700 ? 1.25 : 1.6);
      const v = new Container();
      v.addChild(s);
      return [floorPart(v)];
    }

    case 'dais': {
      // Raised marble stage with two steps at the front; you can walk up onto it.
      const dw = w || 420;
      const dh = h || 220;
      const s = propSprite(x, y, dw + 40, dh + 50, dw / 2 + 20, dh / 2 + 16, (c) => {
        shadow(c, 0, dh / 2 + 8, dw * 0.55, 22, 0.5);
        const step = (inset: number, top: number, hgt: number) => {
          rrect(c, -dw / 2 + inset, -dh / 2 + top + hgt, dw - inset * 2, dh - top, 26);
          fillInk(c, vgrad(c, dh / 2 - 20, dh / 2 + 10, 0x8a7a72, 0.1, 0.4), 1.6);
        };
        step(0, 18, 12);
        step(14, 8, 8);
        // Top: pale veined marble.
        rrect(c, -dw / 2 + 26, -dh / 2, dw - 52, dh - 18, 22);
        const mg = c.createLinearGradient(-dw / 2, -dh / 2, dw / 2, dh / 2);
        mg.addColorStop(0, '#f2e6dc');
        mg.addColorStop(0.5, '#d8c4ba');
        mg.addColorStop(1, '#a8928a');
        fillInk(c, mg, 2);
        c.save();
        c.clip();
        for (let i = 0; i < 18; i++) {
          c.beginPath();
          let vx = -dw / 2 + rnd() * dw;
          let vy = -dh / 2;
          c.moveTo(vx, vy);
          while (vy < dh / 2) {
            vx += (rnd() - 0.5) * 30;
            vy += 10 + rnd() * 16;
            c.lineTo(vx, vy);
          }
          c.strokeStyle = `rgba(120,90,90,${0.12 + rnd() * 0.15})`;
          c.lineWidth = 0.6 + rnd();
          c.stroke();
        }
        glowAt(c, -dw * 0.2, -dh * 0.25, dw * 0.4, dh * 0.4, 0xfff4e0, 0.25, 'lighter');
        c.restore();
        // Gold inlay ring and a compass star in the middle.
        rrect(c, -dw / 2 + 42, -dh / 2 + 14, dw - 84, dh - 46, 16);
        c.strokeStyle = gold(c, -dw / 2, 0, dw / 2, 0);
        c.lineWidth = 3;
        c.stroke();
        c.save();
        c.translate(0, -9);
        c.scale(1, 0.6);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(Math.cos(a - 0.2) * 16, Math.sin(a - 0.2) * 16);
          c.lineTo(Math.cos(a) * (i % 2 ? 40 : 62), Math.sin(a) * (i % 2 ? 40 : 62));
          c.lineTo(Math.cos(a + 0.2) * 16, Math.sin(a + 0.2) * 16);
          c.closePath();
          c.fillStyle = i % 2 ? rgb(dark(t.carpet, 0.1), 0.8) : 'rgba(224,178,90,0.85)';
          c.fill();
        }
        c.restore();
      }, 1.6);
      const v = new Container();
      v.addChild(s);
      return [floorPart(v)];
    }

    // ---- Mondgarten ----------------------------------------------------------------------------
    case 'pond': {
      // Moonlit pond with lilies and reeds; a wooden bridge crosses it from north to south.
      const pw = w || 480;
      const ph = h || 260;
      const bw = 84;
      const s = propSprite(x, y, pw + 60, ph + 70, pw / 2 + 30, ph / 2 + 40, (c) => {
        shadow(c, 0, 6, pw * 0.55, ph * 0.55, 0.4);
        // Stone rim.
        ellipse(c, 0, 0, pw / 2 + 10, ph / 2 + 10);
        fillInk(c, vgrad(c, -ph / 2, ph / 2, 0x6a7280, 0.2, 0.35), 2);
        for (let i = 0; i < 46; i++) {
          const a = (i / 46) * Math.PI * 2;
          ellipse(c, Math.cos(a) * (pw / 2 + 4), Math.sin(a) * (ph / 2 + 4), 9 + rnd() * 5, 5 + rnd() * 2);
          c.fillStyle = rgb(mix(0x8a94a4, 0x4a5262, rnd()));
          c.fill();
          c.strokeStyle = 'rgba(20,24,34,0.6)';
          c.lineWidth = 1;
          c.stroke();
        }
        // Water.
        ellipse(c, 0, 0, pw / 2 - 4, ph / 2 - 4);
        const wg = c.createRadialGradient(-pw * 0.15, -ph * 0.2, 10, 0, 0, pw / 2);
        wg.addColorStop(0, '#2a5a7a');
        wg.addColorStop(0.6, '#123048');
        wg.addColorStop(1, '#081a2a');
        c.fillStyle = wg;
        c.fill();
        c.save();
        c.clip();
        // Moon reflection and ripples.
        glowAt(c, -pw * 0.22, -ph * 0.1, 46, 18, 0xdff0ff, 0.5, 'lighter');
        for (let i = 0; i < 26; i++) {
          const rx = (rnd() - 0.5) * pw * 0.9;
          const ry = (rnd() - 0.5) * ph * 0.8;
          c.beginPath();
          c.ellipse(rx, ry, 10 + rnd() * 18, 3 + rnd() * 3, 0, Math.PI * 1.1, Math.PI * 1.9);
          c.strokeStyle = 'rgba(180,220,255,0.18)';
          c.lineWidth = 1;
          c.stroke();
        }
        // Lily pads with pale flowers, away from the bridge.
        for (let i = 0; i < 12; i++) {
          let lx = (rnd() - 0.5) * pw * 0.8;
          if (Math.abs(lx) < bw * 0.7) lx += Math.sign(lx || 1) * bw;
          const ly = (rnd() - 0.5) * ph * 0.7;
          const lr = 9 + rnd() * 7;
          c.beginPath();
          c.ellipse(lx, ly, lr, lr * 0.55, 0, 0.3, Math.PI * 2 - 0.1);
          c.lineTo(lx, ly);
          c.closePath();
          fillInk(c, rgb(mix(0x2f6a3a, 0x4f8a4a, rnd())), 1);
          if (rnd() < 0.5) {
            for (let p = 0; p < 6; p++) {
              const a = (p / 6) * Math.PI * 2;
              ellipse(c, lx + Math.cos(a) * 3.5, ly - 3 + Math.sin(a) * 2, 3, 2);
              c.fillStyle = p % 2 ? '#fff4fa' : '#f0c8e0';
              c.fill();
            }
            ellipse(c, lx, ly - 3, 1.6, 1.4);
            c.fillStyle = '#ffd36a';
            c.fill();
          }
        }
        c.restore();
        // Reeds at the far corners.
        for (const sx of [-1, 1]) {
          for (let k = 0; k < 9; k++) {
            const rx = sx * (pw / 2 - 24 - rnd() * 30);
            const ry = -ph / 2 + 18 + rnd() * 20;
            c.beginPath();
            c.moveTo(rx, ry);
            c.quadraticCurveTo(rx + sx * 3, ry - 18, rx + sx * (2 + rnd() * 6), ry - 30 - rnd() * 16);
            c.strokeStyle = '#2f5a2a';
            c.lineWidth = 2;
            c.stroke();
            if (k % 3 === 0) {
              ellipse(c, rx + sx * 4, ry - 30, 2.2, 6);
              c.fillStyle = '#6a3a1a';
              c.fill();
            }
          }
        }
        // The bridge: planks over the water, a gentle hump, rails on both sides.
        const top = -ph / 2 - 26;
        const bot = ph / 2 + 26;
        shadow(c, 6, 0, bw * 0.6, ph * 0.5, 0.35);
        rrect(c, -bw / 2, top, bw, bot - top, 6);
        fillInk(c, '#5a3a22', 2);
        for (let py = top + 4; py < bot - 6; py += 11) {
          rrect(c, -bw / 2 + 4, py, bw - 8, 9, 2);
          c.fillStyle = rgb(mix(0x9a6a3e, 0x7a4e2a, rnd()));
          c.fill();
          c.fillStyle = 'rgba(255,230,190,0.18)';
          c.fillRect(-bw / 2 + 5, py, bw - 10, 1.4);
        }
        // Light on the hump.
        glowAt(c, 0, 0, bw * 0.5, ph * 0.3, 0xffe2b0, 0.2, 'lighter');
        for (const sx of [-1, 1]) {
          const rx = sx * (bw / 2 - 2);
          c.beginPath();
          c.moveTo(rx, top + 6);
          c.lineTo(rx, bot - 6);
          c.strokeStyle = INK;
          c.lineWidth = 6;
          c.stroke();
          c.strokeStyle = '#d9c6a0';
          c.lineWidth = 3.5;
          c.stroke();
          for (let py = top + 8; py <= bot - 6; py += (bot - top - 14) / 5) {
            rrect(c, rx - 4, py - 8, 8, 12, 2);
            fillInk(c, '#e8dcc0', 1.4);
          }
        }
      }, 1.5);
      const glints = new Container();
      const gl: Sprite[] = [];
      for (let i = 0; i < 8; i++) {
        const gx = x + (rnd() < 0.5 ? -1 : 1) * (bw * 0.7 + rnd() * (pw / 2 - bw * 0.9));
        const gy = y + (rnd() - 0.5) * ph * 0.6;
        gl.push(glow(glints, gx, gy, 30 + rnd() * 30, 8, 0xbfe0ff, 0.2));
      }
      const v = new Container();
      v.addChild(s, glints);
      // Water on both sides of the bridge, as bands that follow the ellipse.
      const obs: Rect[] = [];
      const bands = 4;
      for (let k = 0; k < bands; k++) {
        const y0 = -ph / 2 + (ph / bands) * k;
        const yc = y0 + ph / bands / 2;
        const half = (pw / 2) * Math.sqrt(Math.max(0, 1 - (yc / (ph / 2)) ** 2)) - 6;
        if (half <= bw / 2) continue;
        obs.push({ x: x - half, y: y + y0, w: half - bw / 2 + 4, h: ph / bands }, { x: x + bw / 2 - 4, y: y + y0, w: half - bw / 2 + 4, h: ph / bands });
      }
      return [floorPart(v, obs, (time) => gl.forEach((g, i) => (g.alpha = 0.1 + 0.18 * (0.5 + 0.5 * Math.sin(time * 1.3 + i * 1.7)))))];
    }

    case 'path': {
      // Flagstones bedded in gravel, running along the longer side.
      const pw = w || 300;
      const ph = h || 60;
      const horiz = pw >= ph;
      const s = propSprite(x, y, pw + 20, ph + 20, pw / 2 + 10, ph / 2 + 10, (c) => {
        rrect(c, -pw / 2, -ph / 2, pw, ph, Math.min(pw, ph) / 2);
        c.fillStyle = 'rgba(150,140,120,0.35)';
        c.fill();
        for (let i = 0; i < (pw * ph) / 40; i++) {
          ellipse(c, -pw / 2 + 6 + rnd() * (pw - 12), -ph / 2 + 4 + rnd() * (ph - 8), 1.2, 0.9);
          c.fillStyle = `rgba(${200 + rnd() * 40},${190 + rnd() * 40},170,${0.25 + rnd() * 0.3})`;
          c.fill();
        }
        const len = horiz ? pw : ph;
        const across = horiz ? ph : pw;
        for (let k = 22; k < len - 10; k += 34 + rnd() * 8) {
          for (const off of across > 70 ? [-across * 0.22, across * 0.22] : [0]) {
            const cx = horiz ? -pw / 2 + k : off + (rnd() - 0.5) * 6;
            const cy = horiz ? off + (rnd() - 0.5) * 6 : -ph / 2 + k;
            const sz = 14 + rnd() * 6;
            c.save();
            c.translate(cx, cy);
            c.scale(1, 0.66);
            c.beginPath();
            for (let p = 0; p < 7; p++) {
              const a = (p / 7) * Math.PI * 2;
              const rr = sz * (0.8 + rnd() * 0.3);
              p ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            c.closePath();
            const g = c.createLinearGradient(-sz, -sz, sz, sz);
            g.addColorStop(0, '#b4bcc8');
            g.addColorStop(1, '#58606e');
            fillInk(c, g, 1.4);
            c.restore();
          }
        }
      }, 1.5);
      const v = new Container();
      v.addChild(s);
      return [floorPart(v)];
    }

    case 'pavilion': {
      // Round wooden deck under four white iron posts with lanterns; a table stands in the middle.
      const R = w || 150;
      const ry = R * 0.62;
      const deck = propSprite(x, y, R * 2 + 40, ry * 2 + 50, R + 20, ry + 18, (c) => {
        shadow(c, 0, 8, R + 10, ry + 8, 0.45);
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          c.lineTo(Math.cos(a) * R, Math.sin(a) * ry);
        }
        c.closePath();
        c.save();
        c.translate(0, 10);
        fillInk(c, '#3a2414', 2);
        c.restore();
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          c.lineTo(Math.cos(a) * R, Math.sin(a) * ry);
        }
        c.closePath();
        fillInk(c, '#7a5232', 2);
        c.save();
        c.clip();
        for (let px = -R; px < R; px += 13) {
          c.fillStyle = rgb(mix(0x9a6a40, 0x6a4424, rnd()));
          c.fillRect(px + 1, -ry, 11, ry * 2);
          c.fillStyle = 'rgba(20,10,4,0.5)';
          c.fillRect(px, -ry, 1.5, ry * 2);
        }
        glowAt(c, 0, 0, R * 0.8, ry * 0.8, 0xffd49a, 0.3, 'lighter');
        c.restore();
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          c.lineTo(Math.cos(a) * (R - 8), Math.sin(a) * (ry - 6));
        }
        c.closePath();
        c.strokeStyle = 'rgba(232,220,192,0.6)';
        c.lineWidth = 2;
        c.stroke();
      }, 1.6);
      const parts: BuiltDecor[] = [floorPart((() => {
        const v = new Container();
        v.addChild(deck);
        return v;
      })())];
      // Four posts on the diagonals, each with a hanging lantern.
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = x + sx * R * 0.78;
        const py = y + sy * ry * 0.78;
        const v = new Container();
        v.addChild(
          propSprite(px, py, 50, 150, 25, 136, (c) => {
            shadow(c, 0, 4, 14, 5, 0.5);
            rrect(c, -4, -118, 8, 120, 3);
            fillInk(c, vgrad(c, -118, 0, 0xe8e4dc, 0.1, 0.35), 1.6);
            rrect(c, -7, -6, 14, 8, 2);
            fillInk(c, '#cfc8bc', 1.2);
            // Scroll bracket and lantern.
            c.beginPath();
            c.moveTo(0, -112);
            c.quadraticCurveTo(sx * -14, -122, sx * -16, -108);
            c.strokeStyle = INK;
            c.lineWidth = 2.4;
            c.stroke();
            rrect(c, sx * -16 - 6, -106, 12, 16, 3);
            fillInk(c, 'rgba(255,214,140,0.95)', 1.4);
            glowAt(c, sx * -16, -98, 18, 18, 0xffd49a, 0.6, 'lighter');
            c.beginPath();
            c.moveTo(sx * -16 - 7, -106);
            c.lineTo(sx * -16, -112);
            c.lineTo(sx * -16 + 7, -106);
            c.closePath();
            fillInk(c, '#2a2a30', 1.2);
          }),
        );
        const lamp = glow(v, px - sx * 16, py - 98, 60, 60, 0xffd49a, 0.35);
        const ph = rnd() * 6;
        parts.push(ent(v, [{ x: px - 7, y: py - 6, w: 14, h: 10 }], py + 2, (time) => (lamp.alpha = 0.3 + 0.06 * Math.sin(time * 3 + ph))));
      }
      return parts;
    }

    // ---- Uhrwerk ----------------------------------------------------------------------------------
    case 'grate': {
      // Steel walkway plates with hazard edges.
      const gw = w || 120;
      const gh = h || 300;
      const s = propSprite(x, y, gw + 10, gh + 10, gw / 2 + 5, gh / 2 + 5, (c) => {
        shadow(c, 0, 3, gw * 0.55, gh * 0.52, 0.35);
        const plate = gw >= gh ? Math.max(60, Math.round(gw / Math.round(gw / 90))) : 0;
        const plateH = gh > gw ? Math.max(60, Math.round(gh / Math.round(gh / 90))) : 0;
        if (gw >= gh) for (let px = -gw / 2; px < gw / 2 - 1; px += plate) grating(c, px, -gh / 2 + 5, Math.min(plate, gw / 2 - px), gh - 10, rnd);
        else for (let py = -gh / 2; py < gh / 2 - 1; py += plateH) grating(c, -gw / 2 + 5, py, gw - 10, Math.min(plateH, gh / 2 - py), rnd);
        if (gw >= gh) {
          hazard(c, -gw / 2, -gh / 2, gw, 5);
          hazard(c, -gw / 2, gh / 2 - 5, gw, 5);
        } else {
          hazard(c, -gw / 2, -gh / 2, 5, gh);
          hazard(c, gw / 2 - 5, -gh / 2, 5, gh);
        }
      }, gh > 600 || gw > 600 ? 1.25 : 1.6);
      const v = new Container();
      v.addChild(s);
      return [floorPart(v)];
    }

    case 'catwalk': {
      // A steel bridge across the conveyor gap; the belt runs on beneath the grating.
      const cw = w || 120;
      const ch = h || 130;
      const s = propSprite(x, y, cw + 30, ch + 30, cw / 2 + 15, ch / 2 + 15, (c) => {
        // The belt seen through the gap.
        rrect(c, -cw / 2 - 10, -26, cw + 20, 52, 4);
        fillInk(c, '#1a1614', 1.5);
        for (let k = -cw / 2 - 6; k < cw / 2 + 8; k += 10) {
          c.fillStyle = 'rgba(90,84,80,0.6)';
          c.fillRect(k, -22, 3, 44);
        }
        shadow(c, 0, 6, cw * 0.6, ch * 0.5, 0.45);
        grating(c, -cw / 2 + 12, -ch / 2, cw - 24, ch, rnd);
        // Railings with yellow posts.
        for (const sx of [-1, 1]) {
          const rx = sx * (cw / 2 - 8);
          rrect(c, rx - 3, -ch / 2, 6, ch, 2);
          fillInk(c, '#e8b22a', 1.4);
          for (const py of [-ch / 2 + 4, 0, ch / 2 - 4]) {
            ellipse(c, rx, py, 4.5, 3.5);
            fillInk(c, '#3a3440', 1.2);
          }
        }
        hazard(c, -cw / 2 + 12, -ch / 2, cw - 24, 6);
        hazard(c, -cw / 2 + 12, ch / 2 - 6, cw - 24, 6);
      }, 1.6);
      const v = new Container();
      v.addChild(s);
      return [floorPart(v)];
    }

    case 'conveyor': {
      // A long belt on iron legs; crates and loose gears ride along it.
      const cw = w || 400;
      const L = -cw / 2;
      const frame = propSprite(x, y, cw + 20, 110, cw / 2 + 10, 70, (c) => {
        shadow(c, 0, 26, cw * 0.52, 14, 0.55);
        // Legs.
        for (let lx = L + 20; lx < cw / 2 - 10; lx += 90) {
          rrect(c, lx - 4, 4, 8, 22, 2);
          fillInk(c, '#3a3440', 1.4);
        }
        // Side rail (front face) with hazard stripe.
        rrect(c, L, -6, cw, 18, 4);
        fillInk(c, vgrad(c, -6, 12, 0x5a5a66, 0.2, 0.35), 2);
        hazard(c, L + 4, -2, cw - 8, 6);
        // Belt surface.
        rrect(c, L + 2, -40, cw - 4, 36, 6);
        fillInk(c, '#201c1a', 2);
        // Back rail.
        rrect(c, L, -48, cw, 10, 4);
        fillInk(c, vgrad(c, -48, -38, 0x6a6a76, 0.3, 0.3), 1.6);
        // Rollers at the ends.
        for (const ex of [L + 4, cw / 2 - 4]) {
          ellipse(c, ex, -22, 8, 20);
          fillInk(c, vgrad(c, -42, -2, 0x8a8a96, 0.3, 0.4), 1.6);
        }
      }, 1.6);
      // Moving slats and cargo, clipped to the belt.
      const belt = new Container();
      const mask = new Graphics().rect(x + L + 8, y - 40, cw - 16, 40).fill(0xffffff);
      const slats = new Graphics();
      for (let k = 0; k < cw + 20; k += 12) slats.rect(k, 0, 3, 32).fill({ color: 0x5a5450, alpha: 0.55 });
      slats.position.set(x + L, y - 38);
      const cargo: { s: Sprite; off: number }[] = [];
      const kinds = [0, 1, 0, 2];
      const n = Math.max(2, Math.round(cw / 150));
      for (let i = 0; i < n; i++) {
        const k = kinds[i % kinds.length];
        const tex = paint(44, 44, (c) => {
          c.translate(22, 36);
          if (k === 2) looseGear(c, 12);
          else crate(c, k ? 26 : 22, k ? 22 : 18, k ? 0x8a5a32 : 0xa07040);
        });
        const s = new Sprite(tex);
        s.anchor.set(0.5, 36 / 44);
        s.y = y - 16;
        cargo.push({ s, off: (i / n) * cw + rnd() * 40 });
      }
      belt.addChild(slats, ...cargo.map((c) => c.s));
      belt.mask = mask;
      const v = new Container();
      v.addChild(frame, belt, mask);
      const update = (time: number) => {
        const shift = (time * 34) % 12;
        slats.x = x + L + shift - 12;
        for (const c of cargo) c.s.x = x + L + ((c.off + time * 34) % cw);
      };
      return [ent(v, [{ x: x + L, y: y - 46, w: cw, h: 66 }], y + 26, update)];
    }
  }
  return null;
}

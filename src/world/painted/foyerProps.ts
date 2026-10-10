// Painted furniture for the foyer in the slanted 3/4 view. Each piece is painted once into a
// texture; small overlays (water, flames, records, curtains) animate on top.
// Coordinates: (x, y) is where the piece stands on the floor (the middle of its footprint).

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { DecorPlacement, RoomTheme } from '../../core/registry';
import { COLORS, FONT_BODY, glowTexture, mothTexture } from '../../core/fx';
import type { BuiltDecor, Rect } from '../decor';
import { Chibi } from './chibi';
import { P_WALL_H } from './foyerShell';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, propSprite, rgb, rim, rrect, seeded, shadow, vgrad, type Ctx } from './brush';

export function glow(c: Container, x: number, y: number, w: number, h: number, tint: number, alpha: number) {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.position.set(x, y);
  s.width = w;
  s.height = h;
  s.tint = tint;
  s.alpha = alpha;
  s.blendMode = 'add';
  c.addChild(s);
  return s;
}

export function kicker(ms = 900) {
  let k = 0;
  return { poke: () => void (k = 1), step: (dt: number) => (k = Math.max(0, k - dt / ms)) };
}

export const box = (x: number, y: number, w: number, h: number): Rect => ({ x: x - w / 2, y: y - h / 2, w, h });

export function ent(view: Container, obstacles: Rect[], z: number, update?: BuiltDecor['update'], poke?: () => void): BuiltDecor {
  return { view, layer: 'entities', obstacles, z, update, poke };
}

/** A candle or bulb flame with a flickering glow. */
export function flame(c: Container, x: number, y: number, size = 1, tint = 0xffb347) {
  const f = new Graphics();
  f.ellipse(0, -4 * size, 3 * size, 6 * size).fill(0xffb347);
  f.ellipse(0, -3 * size, 1.5 * size, 3.4 * size).fill(0xfff6d0);
  f.position.set(x, y);
  c.addChild(f);
  const gl = glow(c, x, y - 4 * size, 60 * size, 60 * size, tint, 0.6);
  const ph = Math.random() * 10;
  return (t: number) => {
    const k = 1 + Math.sin(t * 17 + ph) * 0.08 + Math.sin(t * 7.3 + ph) * 0.06;
    f.scale.set(1, k);
    gl.alpha = 0.5 + (k - 1) * 1.6;
  };
}

/** Brass cylinder pot in the slanted view. */
export function pot(c: Ctx, w: number, h: number, col?: number) {
  const rx = w / 2;
  const ry = w * 0.22;
  shadow(c, 3, 2, rx + 12, ry + 6, 0.55);
  c.beginPath();
  c.moveTo(-rx, -h);
  c.lineTo(-rx * 0.82, 0);
  c.ellipse(0, 0, rx * 0.82, ry * 0.8, 0, Math.PI, 0, true);
  c.lineTo(rx, -h);
  c.closePath();
  const g = col === undefined ? gold(c, -rx, 0, rx, 0) : c.createLinearGradient(-rx, 0, rx, 0);
  if (col !== undefined) {
    g.addColorStop(0, rgb(light(col, 0.35)));
    g.addColorStop(0.4, rgb(col));
    g.addColorStop(1, rgb(dark(col, 0.5)));
  }
  fillInk(c, g);
  ellipse(c, 0, -h, rx, ry);
  fillInk(c, col === undefined ? '#7a4e18' : rgb(dark(col, 0.3)));
  ellipse(c, 0, -h + 1, rx - 3, ry - 2);
  c.fillStyle = '#2a1a10';
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(-rx * 0.6, -h + ry + 2, 3, h * 0.6);
}

export function leaf(c: Ctx, x: number, y: number, ang: number, len: number, wid: number, col: number) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -wid, len, 0);
  c.quadraticCurveTo(len * 0.5, wid, 0, 0);
  const g = c.createLinearGradient(0, -wid, 0, wid);
  g.addColorStop(0, rgb(light(col, 0.3)));
  g.addColorStop(1, rgb(dark(col, 0.35)));
  fillInk(c, g, 1.4);
  c.beginPath();
  c.moveTo(2, 0);
  c.lineTo(len - 3, 0);
  c.strokeStyle = rgb(light(col, 0.4), 0.6);
  c.lineWidth = 1;
  c.stroke();
  c.restore();
}

// ---- The pieces ---------------------------------------------------------------------------------

export function buildPainted(d: DecorPlacement, t: RoomTheme): BuiltDecor[] | null {
  const { x, y } = d;
  const w = d.w ?? 0;
  const h = d.h ?? 0;
  const rnd = seeded(Math.round(x * 13 + y * 7));
  switch (d.kind) {
    case 'rug': {
      const rw = w || 300;
      const rh = (h || 180) * 0.9;
      const s = propSprite(x, y, rw + 30, rh + 30, (rw + 30) / 2, (rh + 30) / 2, (c) => {
        shadow(c, 0, 4, rw * 0.55, rh * 0.55, 0.35);
        rrect(c, -rw / 2, -rh / 2, rw, rh, 10);
        const g = c.createRadialGradient(0, 0, 10, 0, 0, rw * 0.6);
        g.addColorStop(0, '#9a2a40');
        g.addColorStop(1, '#4a0f22');
        c.fillStyle = g;
        c.fill();
        rrect(c, -rw / 2 + 12, -rh / 2 + 10, rw - 24, rh - 20, 6);
        c.strokeStyle = '#e0b25a';
        c.lineWidth = 3;
        c.stroke();
        rrect(c, -rw / 2 + 22, -rh / 2 + 18, rw - 44, rh - 36, 4);
        c.strokeStyle = 'rgba(95,227,210,0.55)';
        c.lineWidth = 2;
        c.stroke();
        c.save();
        c.scale(1, rh / rw);
        for (const [rr, col] of [[rw * 0.24, '#1d4f4c'], [rw * 0.17, '#e0b25a'], [rw * 0.12, '#6b1a2e']] as const) {
          c.beginPath();
          c.arc(0, 0, rr, 0, Math.PI * 2);
          c.fillStyle = col;
          c.fill();
        }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          c.beginPath();
          c.arc(Math.cos(a) * rw * 0.2, Math.sin(a) * rw * 0.2, 5, 0, Math.PI * 2);
          c.fillStyle = '#f3d68a';
          c.fill();
        }
        c.restore();
        for (let k = -rh / 2 + 4; k < rh / 2 - 2; k += 5) {
          c.fillStyle = '#e8d6a8';
          c.fillRect(-rw / 2 - 7, k, 7, 2);
          c.fillRect(rw / 2, k, 7, 2);
        }
        glowAt(c, -rw * 0.2, -rh * 0.2, rw * 0.4, rh * 0.3, 0xffe2a8, 0.12, 'lighter');
      });
      const v = new Container();
      v.addChild(s);
      return [{ view: v, layer: 'floor', obstacles: [] }];
    }

    case 'bench': {
      const v = new Container();
      v.addChild(
        propSprite(x, y, 120, 80, 60, 50, (c) => {
          shadow(c, 2, 12, 56, 13, 0.5);
          for (const lx of [-40, 40]) {
            c.fillStyle = gold(c, lx - 3, 0, lx + 3, 0);
            c.fillRect(lx - 3, 0, 6, 14);
          }
          rrect(c, -48, -10, 96, 16, 6);
          fillInk(c, vgrad(c, -10, 6, 0x1f5a5a, 0.05, 0.4));
          rrect(c, -48, -26, 96, 22, 10);
          const g = c.createLinearGradient(0, -26, 0, -4);
          g.addColorStop(0, '#4fa8a0');
          g.addColorStop(1, '#1f5a5a');
          fillInk(c, g);
          for (let i = 0; i < 5; i++) {
            ellipse(c, -36 + i * 18, -15, 2, 1.5);
            c.fillStyle = '#e0b25a';
            c.fill();
          }
          rrect(c, -48, -26, 96, 22, 10);
          rim(c, 0.4);
        }),
      );
      return [ent(v, [box(x, y, 96, 30)], y + 15)];
    }

    case 'shopCounter': {
      const cw = w || 260;
      const ch = h || 64;
      const L = x - cw / 2;
      const T = y - ch / 2;
      const H = 48;
      const v = new Container();
      v.addChild(
        propSprite(x, y, cw + 40, ch + H + 90, (cw + 40) / 2, ch / 2 + H + 70, (c) => {
          const by = ch / 2;
          shadow(c, 0, by, cw * 0.56, 18, 0.6);
          // Front: mahogany with three lit display windows.
          rrect(c, -cw / 2, by - H, cw, H, 6);
          fillInk(c, vgrad(c, by - H, by, 0x5a2414, 0.1, 0.45), 2.4);
          const win = (cw - 60) / 3;
          for (let i = 0; i < 3; i++) {
            const wx = -cw / 2 + 15 + i * (win + 15);
            rrect(c, wx, by - H + 9, win, H - 20, 4);
            const g = c.createLinearGradient(0, by - H + 9, 0, by - 11);
            g.addColorStop(0, '#ffe7b0');
            g.addColorStop(1, '#7a4e26');
            c.fillStyle = g;
            c.fill();
            c.strokeStyle = gold(c, wx, 0, wx + win, 0);
            c.lineWidth = 2;
            c.stroke();
            for (let k = 0; k < 4; k++) {
              const gx = wx + 10 + k * ((win - 20) / 3);
              const cols = [0x5fe3ff, 0xff9ac0, 0xc9962e, 0x9fe8ff];
              ellipse(c, gx, by - 18, 5, 4);
              fillInk(c, rgb(cols[(k + i) % 4]), 1.2);
            }
          }
          c.fillStyle = gold(c, 0, by - H - 3, 0, by - H + 3);
          c.fillRect(-cw / 2, by - H - 2, cw, 4);
          // Top: glass with goods underneath.
          const ty = by - H - 34;
          rrect(c, -cw / 2, ty, cw, 34, 6);
          const tg = c.createLinearGradient(0, ty, 0, ty + 34);
          tg.addColorStop(0, '#2a5a64');
          tg.addColorStop(1, '#173840');
          fillInk(c, tg);
          for (let i = 0; i < Math.floor(cw / 30); i++) {
            const gx = -cw / 2 + 18 + i * 30;
            const cols = [0xc9962e, 0x9fe8ff, 0xff9ac0, 0xfff1c4, 0x7bd47b];
            c.beginPath();
            c.moveTo(gx, ty + 10);
            c.lineTo(gx + 6, ty + 17);
            c.lineTo(gx, ty + 24);
            c.lineTo(gx - 6, ty + 17);
            c.closePath();
            fillInk(c, rgb(cols[i % cols.length]), 1);
          }
          c.fillStyle = 'rgba(255,255,255,0.14)';
          c.beginPath();
          c.moveTo(-cw / 2 + 20, ty + 3);
          c.lineTo(-cw / 2 + 60, ty + 3);
          c.lineTo(-cw / 2 + 40, ty + 31);
          c.lineTo(-cw / 2 + 4, ty + 31);
          c.fill();
          // Hat stand on the counter and a brass till.
          const hx = -cw / 2 + 40;
          c.fillStyle = gold(c, hx - 2, 0, hx + 2, 0);
          c.fillRect(hx - 1.5, ty - 22, 3, 26);
          ellipse(c, hx, ty - 22, 14, 4);
          fillInk(c, '#1b1b22', 1.5);
          rrect(c, hx - 8, ty - 36, 16, 14, 3);
          fillInk(c, '#1b1b22', 1.5);
          c.fillStyle = '#e0b25a';
          c.fillRect(hx - 8, ty - 26, 16, 3);
          const rx = cw / 2 - 46;
          rrect(c, rx - 18, ty - 22, 36, 30, 5);
          fillInk(c, gold(c, rx - 18, ty - 22, rx + 18, ty + 8));
          rrect(c, rx - 13, ty - 18, 26, 10, 2);
          c.fillStyle = '#1b1013';
          c.fill();
          c.font = `700 8px ${FONT_BODY}`;
          c.fillStyle = '#9fe8ff';
          c.textAlign = 'center';
          c.fillText('◆ 0', rx, ty - 10);
          for (let k = 0; k < 3; k++) {
            ellipse(c, rx - 8 + k * 8, ty - 2, 2.6, 1.8);
            c.fillStyle = '#fff1c4';
            c.fill();
          }
          // Name plate on the front.
          rrect(c, -64, by - H - 14, 128, 20, 5);
          fillInk(c, gold(c, -64, by - H - 14, 64, by - H + 6), 1.8);
          c.font = `700 12px ${FONT_BODY}`;
          c.fillStyle = '#3a1a08';
          c.textAlign = 'center';
          c.fillText('ANDENKEN · MONDSTEINE', 0, by - H);
        }),
      );
      // A moth in a bell jar on the counter, glowing softly.
      const jar = glow(v, x - 20, y - ch / 2 - 64 + 10, 70, 70, 0x9fe8ff, 0.5);
      const moth = new Sprite(mothTexture());
      moth.anchor.set(0.5);
      moth.width = moth.height = 16;
      moth.tint = 0x9fe8ff;
      moth.position.set(x - 20, y - ch / 2 - 56);
      v.addChild(moth);
      const mBase = moth.scale.x;
      const keeper = new Chibi(0x5fe3ff, { jacket: 0x1f5a44, hairStyle: 'sidePart', hair: 0xcfd6e0, accessory: 'bowTie', skin: 0xd9a27a });
      keeper.view.position.set(x + 40, T - 34);
      keeper.faceTowards(Math.PI / 2);
      const kv = new Container();
      kv.addChild(keeper.view);
      const kick = kicker(1200);
      return [
        ent(v, [{ x: L - 10, y: P_WALL_H, w: cw + 20, h: T + ch - P_WALL_H }], T + ch, (time) => {
          moth.scale.x = mBase * (0.4 + 0.6 * Math.abs(Math.cos(time * 9)));
          moth.y = y - ch / 2 - 56 + Math.sin(time * 2) * 3;
          jar.alpha = 0.4 + Math.sin(time * 1.7) * 0.1;
        }, kick.poke),
        ent(kv, [], T - 34, (time, dt) => {
          const kk = kick.step(dt);
          keeper.faceTowards(kk > 0 ? Math.PI / 2 : Math.PI / 2 + Math.sin(time * 0.4) * 0.9 * (Math.sin(time * 0.13) > 0.2 ? 1 : 0));
          keeper.update(dt, null);
          keeper.view.y = T - 34 - Math.sin(kk * Math.PI * 2) * 3;
        }),
      ];
    }

    case 'reception': {
      const r = w || 76;
      const H = 40;
      const v = new Container();
      v.addChild(
        propSprite(x, y, r * 2 + 40, r + H + 120, r + 20, H + 90, (c) => {
          const ry = r * 0.5;
          shadow(c, 0, r * 0.45, r + 10, 22, 0.55);
          // Curved front of the desk.
          c.beginPath();
          c.ellipse(0, 0, r, ry, 0, 0, Math.PI);
          c.lineTo(-r, -H);
          c.ellipse(0, -H, r, ry, 0, Math.PI, 0, true);
          c.closePath();
          const fg = c.createLinearGradient(-r, 0, r, 0);
          fg.addColorStop(0, '#2a1208');
          fg.addColorStop(0.35, '#7a3a1c');
          fg.addColorStop(0.6, '#5a2814');
          fg.addColorStop(1, '#1e0c06');
          fillInk(c, fg, 2.4);
          for (const dy of [-H + 6, -6]) {
            c.beginPath();
            c.ellipse(0, dy, r - 1, ry, 0, 0.15, Math.PI - 0.15);
            c.strokeStyle = gold(c, -r, 0, r, 0);
            c.lineWidth = 2.5;
            c.stroke();
          }
          // Gold moth emblem.
          c.save();
          c.translate(0, ry - 16);
          for (const s of [-1, 1]) {
            c.beginPath();
            c.ellipse(s * 8, -2, 8, 6, s * 0.4, 0, Math.PI * 2);
            fillInk(c, gold(c, -14, -8, 14, 6), 1.2);
          }
          c.fillStyle = '#3a2008';
          c.fillRect(-1.2, -8, 2.4, 14);
          c.restore();
          // Marble top.
          c.beginPath();
          c.ellipse(0, -H, r, ry, 0, 0, Math.PI * 2);
          c.ellipse(0, -H - 6, r - 24, ry - 16, 0, 0, Math.PI * 2, true);
          const tg = c.createLinearGradient(-r, -H - ry, r, -H + ry);
          tg.addColorStop(0, '#fbf3e0');
          tg.addColorStop(1, '#cdb894');
          c.fillStyle = tg;
          c.fill('evenodd');
          c.strokeStyle = INK;
          c.lineWidth = 2;
          c.stroke();
          // Guest book, bell and a banker's lamp.
          c.save();
          c.translate(-30, -H + 14);
          c.rotate(-0.15);
          rrect(c, -16, -9, 32, 18, 2);
          fillInk(c, '#fff6e6', 1.5);
          c.fillStyle = '#6b1a2e';
          c.fillRect(-1, -9, 2, 18);
          for (let k = 0; k < 3; k++) {
            c.fillStyle = 'rgba(60,40,60,0.5)';
            c.fillRect(-13, -5 + k * 4, 10, 1);
            c.fillRect(3, -5 + k * 4, 10, 1);
          }
          c.restore();
          c.beginPath();
          c.ellipse(34, -H + 14, 9, 5, 0, Math.PI, 0);
          c.lineTo(34 + 9, -H + 14);
          c.closePath();
          fillInk(c, gold(c, 25, -H + 6, 43, -H + 14), 1.4);
          ellipse(c, 34, -H + 15, 11, 3);
          fillInk(c, '#7a4e18', 1.2);
          // Lamp.
          c.fillStyle = gold(c, -4, 0, 4, 0);
          c.fillRect(-1.5, -H - 34, 3, 26);
          c.beginPath();
          c.moveTo(-16, -H - 30);
          c.quadraticCurveTo(0, -H - 46, 16, -H - 30);
          c.closePath();
          fillInk(c, vgrad(c, -H - 44, -H - 30, 0x1f7a4a, 0.3, 0.3), 1.6);
          ellipse(c, 0, -H - 8, 10, 3.5);
          fillInk(c, gold(c, -10, -H - 10, 10, -H - 6), 1.2);
          c.fillStyle = 'rgba(255,255,255,0.25)';
          c.fillRect(-10, -H - 36, 6, 2);
          const sign = 'EMPFANG';
          c.font = `700 11px ${FONT_BODY}`;
          c.textAlign = 'center';
          rrect(c, -34, ry - 2, 68, 16, 4);
          fillInk(c, gold(c, -34, ry - 2, 34, ry + 14), 1.4);
          c.fillStyle = '#3a1a08';
          c.fillText(sign, 0, ry + 10);
        }),
      );
      const lampGlow = glow(v, x, y - H - 22, 140, 90, 0xb8ffb0, 0.3);
      const host = new Chibi(0xff5fa2, { outfit: 'dress', jacket: 0x1d2a4a, hairStyle: 'bun', hair: 0x1b1b22, skin: 0xc68a5e });
      host.view.position.set(x - 6, y - 52);
      host.faceTowards(Math.PI / 2);
      const hv = new Container();
      hv.addChild(host.view);
      const kick = kicker(900);
      return [
        ent(v, [{ x: x - r, y: y - 64, w: r * 2, h: r * 0.5 + 64 }], y + r * 0.5, (time) => (lampGlow.alpha = 0.28 + Math.sin(time * 1.1) * 0.03), kick.poke),
        ent(hv, [], y - 52, (time, dt) => {
          const kk = kick.step(dt);
          host.faceTowards(kk > 0 ? Math.PI / 2 : Math.PI / 2 + Math.sin(time * 0.3) * 0.6);
          host.update(dt, null);
          host.view.scale.set(0.82 * (1 + Math.sin(kk * Math.PI * 2) * 0.04));
        }),
      ];
    }

    case 'jukebox': {
      const v = new Container();
      const jw = 74;
      const jh = 118;
      const base = y + 20;
      v.addChild(
        propSprite(x, base, jw + 40, jh + 40, (jw + 40) / 2, jh + 20, (c) => {
          shadow(c, 0, 0, jw * 0.65, 12, 0.6);
          // Cabinet with an arched top.
          c.beginPath();
          c.moveTo(-jw / 2, 0);
          c.lineTo(-jw / 2, -jh + jw / 2);
          c.arc(0, -jh + jw / 2, jw / 2, Math.PI, 0);
          c.lineTo(jw / 2, 0);
          c.closePath();
          const g = c.createLinearGradient(-jw / 2, 0, jw / 2, 0);
          g.addColorStop(0, '#3a1408');
          g.addColorStop(0.4, '#8a3e1c');
          g.addColorStop(1, '#2a0e06');
          fillInk(c, g, 2.4);
          // Chrome arch where the light tubes run.
          c.beginPath();
          c.moveTo(-jw / 2 + 6, -6);
          c.lineTo(-jw / 2 + 6, -jh + jw / 2);
          c.arc(0, -jh + jw / 2, jw / 2 - 6, Math.PI, 0);
          c.lineTo(jw / 2 - 6, -6);
          c.strokeStyle = 'rgba(255,255,255,0.85)';
          c.lineWidth = 6;
          c.stroke();
          // Window with the record.
          c.beginPath();
          c.arc(0, -jh + jw / 2 + 6, jw / 2 - 16, Math.PI, 0);
          c.lineTo(jw / 2 - 16, -jh + jw / 2 + 26);
          c.lineTo(-jw / 2 + 16, -jh + jw / 2 + 26);
          c.closePath();
          const wg = c.createLinearGradient(0, -jh + 20, 0, -jh + jw / 2 + 26);
          wg.addColorStop(0, '#ffe7b0');
          wg.addColorStop(1, '#5a2a14');
          fillInk(c, wg, 1.6);
          // Song list and buttons.
          rrect(c, -jw / 2 + 14, -jh + jw / 2 + 32, jw - 28, 16, 3);
          fillInk(c, '#fff6e6', 1.2);
          for (let k = 0; k < 3; k++) {
            c.fillStyle = 'rgba(60,30,40,0.5)';
            c.fillRect(-jw / 2 + 18, -jh + jw / 2 + 35 + k * 4, jw - 36, 1);
          }
          for (let k = 0; k < 6; k++) {
            ellipse(c, -jw / 2 + 18 + k * 7.6, -jh + jw / 2 + 54, 2.6, 2);
            fillInk(c, k % 2 ? '#ff5fa2' : '#ffcf7a', 1);
          }
          // Speaker grille.
          rrect(c, -jw / 2 + 12, -40, jw - 24, 32, 5);
          fillInk(c, '#1b0e0a', 1.4);
          c.save();
          rrect(c, -jw / 2 + 12, -40, jw - 24, 32, 5);
          c.clip();
          for (let k = -6; k < 12; k++) {
            c.beginPath();
            c.moveTo(-jw / 2 + 12 + k * 8, -40);
            c.lineTo(-jw / 2 + 12 + k * 8 + 32, -8);
            c.moveTo(-jw / 2 + 12 + k * 8 + 32, -40);
            c.lineTo(-jw / 2 + 12 + k * 8, -8);
            c.strokeStyle = 'rgba(224,178,90,0.7)';
            c.lineWidth = 1.2;
            c.stroke();
          }
          c.restore();
          c.beginPath();
          c.moveTo(-jw / 2, 0);
          c.lineTo(-jw / 2, -jh + jw / 2);
          c.arc(0, -jh + jw / 2, jw / 2, Math.PI, 0);
          rim(c, 0.35, 2);
        }),
      );
      // Light tubes (recoloured over time) and the spinning record.
      const tubes = new Graphics();
      const tubePath = (g: Graphics) => {
        g.moveTo(x - jw / 2 + 6, base - 6).lineTo(x - jw / 2 + 6, base - jh + jw / 2).arc(x, base - jh + jw / 2, jw / 2 - 6, Math.PI, 0).lineTo(x + jw / 2 - 6, base - 6);
      };
      v.addChild(tubes);
      const tubeGlow = glow(v, x, base - jh * 0.6, 200, 220, 0xff5fa2, 0.3);
      const rec = new Graphics();
      rec.ellipse(0, 0, 15, 6).fill(0x14080f);
      rec.ellipse(0, 0, 11, 4.4).stroke({ color: 0x3a3040, width: 0.8 });
      rec.ellipse(0, 0, 4, 1.8).fill(0xd8243a);
      rec.position.set(x, base - jh + jw / 2 + 14);
      const shine = new Graphics().rect(-1, -5, 2, 4).fill({ color: 0xffffff, alpha: 0.6 });
      shine.position.copyFrom(rec.position);
      v.addChild(rec, shine);
      const hues = [0xff5fa2, 0xffcf7a, 0x5fe3ff, 0x7bd47b, 0xc9a0ff];
      const kick = kicker(1500);
      let spin = 0;
      return [
        ent(v, [box(x, y + 6, jw + 4, 40)], base, (time, dt) => {
          const kk = kick.step(dt);
          spin += dt * (0.005 + kk * 0.03);
          shine.x = x + Math.cos(spin) * 10;
          shine.y = rec.y + Math.sin(spin) * 3.6;
          const k = time * 0.6 + kk * 3;
          const i = Math.floor(k) % hues.length;
          const col = hues[i];
          tubes.clear();
          tubePath(tubes);
          tubes.stroke({ color: col, width: 4.5, alpha: 0.95 });
          tubePath(tubes);
          tubes.stroke({ color: 0xffffff, width: 1.5, alpha: 0.7 });
          tubeGlow.tint = col;
          tubeGlow.alpha = 0.28 + Math.sin(time * 3) * 0.04 + kk * 0.35;
        }, kick.poke),
      ];
    }

    case 'fountain': {
      const r = w || 78;
      const v = new Container();
      const ry = r * 0.62;
      const wall = 22;
      v.addChild(
        propSprite(x, y, r * 2 + 60, r * 2 + 160, r + 30, r + 120, (c) => {
          shadow(c, 0, ry * 0.5 + 6, r + 26, ry + 12, 0.5);
          // Outer basin wall.
          c.beginPath();
          c.ellipse(0, 0, r + 12, ry + 8, 0, 0, Math.PI);
          c.lineTo(-r - 12, -wall);
          c.ellipse(0, -wall, r + 12, ry + 8, 0, Math.PI, 0, true);
          c.closePath();
          fillInk(c, vgrad(c, -wall, ry, 0xd8ccb4, 0.2, 0.45), 2.4);
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI;
            const px = Math.cos(a) * (r + 12);
            c.beginPath();
            c.moveTo(px, Math.sin(a) * (ry + 8) - wall);
            c.lineTo(px, Math.sin(a) * (ry + 8));
            c.strokeStyle = 'rgba(80,60,40,0.25)';
            c.lineWidth = 1.2;
            c.stroke();
          }
          // Rim.
          c.beginPath();
          c.ellipse(0, -wall, r + 12, ry + 8, 0, 0, Math.PI * 2);
          c.ellipse(0, -wall, r - 2, ry - 2, 0, 0, Math.PI * 2, true);
          const rg = c.createLinearGradient(0, -wall - ry, 0, -wall + ry);
          rg.addColorStop(0, '#fffaf0');
          rg.addColorStop(1, '#bfae8e');
          c.fillStyle = rg;
          c.fill('evenodd');
          c.strokeStyle = INK;
          c.lineWidth = 2;
          c.stroke();
          c.beginPath();
          c.ellipse(0, -wall, r + 5, ry + 3, 0, 0, Math.PI * 2);
          c.strokeStyle = gold(c, -r, 0, r, 0);
          c.lineWidth = 2;
          c.stroke();
          // Water with coins on the bottom.
          c.beginPath();
          c.ellipse(0, -wall + 2, r - 3, ry - 3, 0, 0, Math.PI * 2);
          const wg = c.createRadialGradient(-r * 0.3, -wall - ry * 0.3, 4, 0, -wall, r);
          wg.addColorStop(0, '#7fe8e0');
          wg.addColorStop(0.6, '#1f8a8a');
          wg.addColorStop(1, '#0e4a52');
          c.fillStyle = wg;
          c.fill();
          for (let k = 0; k < 16; k++) {
            const a = rnd() * Math.PI * 2;
            const d = (0.35 + rnd() * 0.55) * r;
            ellipse(c, Math.cos(a) * d * 0.9, -wall + Math.sin(a) * d * 0.55, 3, 1.8);
            c.fillStyle = 'rgba(255,214,110,0.75)';
            c.fill();
          }
          glowAt(c, -r * 0.35, -wall - ry * 0.3, r * 0.5, ry * 0.35, 0xffffff, 0.35, 'lighter');
          // Pedestal and upper bowl.
          rrect(c, -10, -wall - 74, 20, 72, 6);
          fillInk(c, (() => {
            const g = c.createLinearGradient(-10, 0, 10, 0);
            g.addColorStop(0, '#fff6e6');
            g.addColorStop(1, '#a8987a');
            return g;
          })());
          for (const by of [-wall - 30, -wall - 60]) {
            c.fillStyle = gold(c, -11, by, 11, by + 4);
            c.fillRect(-11, by, 22, 4);
          }
          c.beginPath();
          c.ellipse(0, -wall - 74, 32, 11, 0, 0, Math.PI);
          c.lineTo(-32, -wall - 80);
          c.ellipse(0, -wall - 80, 32, 11, 0, Math.PI, 0, true);
          c.closePath();
          fillInk(c, vgrad(c, -wall - 84, -wall - 64, 0xe0d4bc, 0.2, 0.4));
          c.beginPath();
          c.ellipse(0, -wall - 80, 27, 8, 0, 0, Math.PI * 2);
          c.fillStyle = '#3fb0b0';
          c.fill();
          // Golden moth on top.
          c.save();
          c.translate(0, -wall - 100);
          for (const s of [-1, 1]) {
            c.beginPath();
            c.ellipse(s * 13, -6, 13, 9, s * 0.5, 0, Math.PI * 2);
            fillInk(c, gold(c, -24, -16, 24, 6), 1.6);
            c.beginPath();
            c.ellipse(s * 9, 8, 7, 6, -s * 0.4, 0, Math.PI * 2);
            fillInk(c, gold(c, -16, 0, 16, 14), 1.4);
            ellipse(c, s * 13, -7, 3, 2.2);
            c.fillStyle = '#5fe3ff';
            c.fill();
          }
          rrect(c, -2.5, -14, 5, 28, 2.5);
          fillInk(c, '#7a4e18', 1.2);
          c.restore();
        }),
      );
      // Water: falling streams from the upper bowl, ripples and a splash for wishes.
      const water = new Graphics();
      v.addChild(water);
      const sparkle = glow(v, x, y - wall, r * 3, r * 1.6, 0x5fe3ff, 0.18);
      const kick = kicker(1100);
      let sx = x;
      let sy = y - wall;
      return [
        ent(v, [box(x, y - 4, (r + 12) * 2, (ry + 10) * 2)], y + ry + 8, (time, dt) => {
          const kk = kick.step(dt);
          water.clear();
          const by = y - wall - 80;
          for (let j = 0; j < 8; j++) {
            const a = (j / 8) * Math.PI * 2;
            const ex = Math.cos(a) * 54;
            const ey = Math.sin(a) * 30;
            for (let i = 0; i < 7; i++) {
              const k = ((time * 1.4 + i / 7 + j * 0.13) % 1);
              const px = x + Math.cos(a) * 26 + (ex - Math.cos(a) * 26) * k;
              const py = by + Math.sin(a) * 8 + (ey + wall + 80 - 12 - Math.sin(a) * 8) * k * k - Math.sin(k * Math.PI) * 12;
              water.circle(px, py, 1.7 - k * 0.6).fill({ color: 0xe8fcff, alpha: 0.85 - k * 0.4 });
            }
            const rk = (time * 0.8 + j * 0.37) % 1;
            water.ellipse(x + ex, y - wall + ey, 4 + rk * 14, (4 + rk * 14) * 0.45).stroke({ color: 0xffffff, width: 1.2, alpha: (1 - rk) * 0.45 });
          }
          if (kk > 0) {
            const e = 1 - kk;
            water.ellipse(sx, sy, 6 + e * 40, (6 + e * 40) * 0.45).stroke({ color: 0xffffff, width: 2.5, alpha: kk * 0.8 });
            for (let i = 0; i < 9; i++) {
              const a = (i / 9) * Math.PI * 2;
              water.circle(sx + Math.cos(a) * e * 22, sy - Math.sin(e * Math.PI) * 20 + Math.sin(a) * e * 8, 2).fill({ color: 0xe8fcff, alpha: kk });
            }
          }
          sparkle.alpha = 0.16 + Math.sin(time * 1.2) * 0.04 + kk * 0.3;
        }, () => {
          const a = Math.random() * Math.PI * 2;
          sx = x + Math.cos(a) * r * 0.65;
          sy = y - wall + Math.sin(a) * ry * 0.6;
          kick.poke();
        }),
      ];
    }

    case 'chandelier': {
      const r = w || 46;
      // How high it hangs above its spot on the floor (h overrides).
      const drop = h || 60 + r * 1.4;
      const v = new Container();
      const hang = new Container();
      hang.position.set(x, y - drop - 200);
      const body = propSprite(0, 200, r * 3 + 20, r * 2 + 80, (r * 3 + 20) / 2, r + 20, (c) => {
        // Chain up to the ceiling is drawn separately.
        for (const [ry, rr] of [[0, r], [-r * 0.45, r * 0.62], [-r * 0.85, r * 0.3]] as const) {
          c.beginPath();
          c.ellipse(0, ry, rr * 1.3, rr * 0.36, 0, 0, Math.PI * 2);
          c.strokeStyle = gold(c, -rr, ry, rr, ry);
          c.lineWidth = 3;
          c.stroke();
          const n = Math.round(rr / 3.4);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const px = Math.cos(a) * rr * 1.3;
            const py = ry + Math.sin(a) * rr * 0.36;
            if (Math.sin(a) < -0.2) continue;
            c.beginPath();
            c.moveTo(px, py);
            c.lineTo(px - 2.6, py + 7);
            c.lineTo(px, py + 12);
            c.lineTo(px + 2.6, py + 7);
            c.closePath();
            const g = c.createLinearGradient(px - 3, py, px + 3, py + 12);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(1, '#bfe6ff');
            c.fillStyle = g;
            c.fill();
            c.strokeStyle = 'rgba(90,120,150,0.6)';
            c.lineWidth = 0.8;
            c.stroke();
          }
        }
        c.beginPath();
        c.moveTo(0, -r * 1.2);
        c.lineTo(0, r * 0.3);
        c.strokeStyle = gold(c, -2, 0, 2, 0);
        c.lineWidth = 4;
        c.stroke();
        ellipse(c, 0, r * 0.36, 6, 9);
        fillInk(c, gold(c, -6, r * 0.3, 6, r * 0.45), 1.4);
        // Candle bulbs.
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const px = Math.cos(a) * r * 1.3;
          const py = Math.sin(a) * r * 0.36 - 8;
          rrect(c, px - 2.5, py, 5, 9, 2);
          c.fillStyle = '#fff6e6';
          c.fill();
          glowAt(c, px, py - 3, 9, 9, 0xffe0a0, 0.9, 'lighter');
        }
      });
      // The chain fades out upwards instead of crossing the wall art.
      const chain = new Graphics();
      const top = 200 - r * 1.2;
      for (let k = 0; k < 10; k++) chain.rect(-1.2, top - (k + 1) * 16, 2.4, 16).fill({ color: 0xc9963e, alpha: 0.9 * (1 - k / 10) });
      hang.addChild(chain, body);
      const gl = glow(hang, 0, 200, r * 7, r * 5, t.light, 0.32);
      const sparkles: Graphics[] = [];
      for (let i = 0; i < 5; i++) {
        const s = new Graphics().moveTo(-4, 0).lineTo(4, 0).moveTo(0, -4).lineTo(0, 4).stroke({ color: 0xffffff, width: 1.4 });
        hang.addChild(s);
        sparkles.push(s);
      }
      v.addChild(hang);
      const ph = rnd() * 10;
      return [
        {
          view: v,
          layer: 'lights',
          obstacles: [],
          update: (time) => {
            hang.rotation = Math.sin(time * 0.5 + ph) * 0.012;
            gl.alpha = 0.3 + Math.sin(time * 1.1 + ph) * 0.03;
            sparkles.forEach((s, i) => {
              const k = (time * 0.6 + i / 5 + ph) % 1;
              const a = i * 1.9 + ph;
              s.position.set(Math.cos(a) * r * 1.2, 200 + Math.sin(a) * r * 0.3 + 6);
              s.alpha = Math.max(0, Math.sin(k * Math.PI)) * 0.9;
              s.scale.set(0.5 + k);
            });
          },
        },
      ];
    }

    case 'wardrobe': {
      const bw = w || 150;
      const bh = h || 110;
      const L = x - bw / 2;
      const T = y - bh / 2;
      const H = 132;
      const v = new Container();
      const curtainCol = t.curtain ?? 0x6b1a2e;
      v.addChild(
        propSprite(x, y, bw + 140, bh + H + 60, bw / 2 + 70, bh / 2 + H + 40, (c) => {
          const by = bh / 2;
          shadow(c, 0, by - 4, bw * 0.7, 20, 0.55);
          // Back and side panels.
          const back = -bh / 2 - H + 30;
          rrect(c, -bw / 2, back, bw, H + bh - 30, 6);
          fillInk(c, vgrad(c, back, by, 0x3a1a10, 0.12, 0.35), 2.4);
          rrect(c, -bw / 2 + 10, back + 12, bw - 20, H + bh - 60, 4);
          c.fillStyle = '#24100a';
          c.fill();
          // A dress on a hook inside and the stool.
          c.beginPath();
          c.moveTo(bw / 2 - 40, back + 26);
          c.quadraticCurveTo(bw / 2 - 30, back + 20, bw / 2 - 20, back + 26);
          c.lineTo(bw / 2 - 14, back + 80);
          c.lineTo(bw / 2 - 46, back + 80);
          c.closePath();
          fillInk(c, vgrad(c, back + 20, back + 80, 0x2f4aa0, 0.2, 0.3), 1.4);
          ellipse(c, bw / 2 - 30, by - 30, 15, 6);
          fillInk(c, vgrad(c, by - 36, by - 24, 0x1f5a5a, 0.2, 0.2), 1.4);
          // Crest with the sign.
          c.beginPath();
          c.moveTo(-bw / 2 - 6, back + 4);
          c.lineTo(-bw / 2 + 20, back - 18);
          c.lineTo(bw / 2 - 20, back - 18);
          c.lineTo(bw / 2 + 6, back + 4);
          c.closePath();
          fillInk(c, gold(c, -bw / 2, back - 18, bw / 2, back + 4), 2);
          c.font = `700 13px ${FONT_BODY}`;
          c.textAlign = 'center';
          c.fillStyle = '#3a1a08';
          c.fillText('UMKLEIDE', 0, back - 3);
          // Brass rail across the front.
          c.fillStyle = gold(c, 0, back + 10, 0, back + 15);
          c.fillRect(-bw / 2 + 2, back + 10, bw - 4, 4);
          // Standing mirror on the right.
          const mx = bw / 2 + 36;
          shadow(c, mx, by - 6, 26, 8, 0.5);
          for (const lx of [-14, 14]) {
            c.beginPath();
            c.moveTo(mx + lx, by - 8);
            c.lineTo(mx + lx * 0.6, by - 50);
            c.strokeStyle = gold(c, mx - 14, 0, mx + 14, 0);
            c.lineWidth = 3;
            c.stroke();
          }
          ellipse(c, mx, by - 74, 20, 34);
          fillInk(c, gold(c, mx - 20, by - 108, mx + 20, by - 40), 2);
          ellipse(c, mx, by - 74, 15, 28);
          const mg = c.createLinearGradient(mx - 15, by - 100, mx + 15, by - 46);
          mg.addColorStop(0, '#dff6ff');
          mg.addColorStop(0.5, '#6a8aa8');
          mg.addColorStop(1, '#2a3a50');
          c.fillStyle = mg;
          c.fill();
          c.beginPath();
          c.moveTo(mx - 8, by - 94);
          c.lineTo(mx - 2, by - 98);
          c.lineTo(mx - 10, by - 60);
          c.lineTo(mx - 14, by - 66);
          c.closePath();
          c.fillStyle = 'rgba(255,255,255,0.45)';
          c.fill();
          // Hat stand on the left.
          const hx = -bw / 2 - 34;
          shadow(c, hx, by - 8, 18, 6, 0.5);
          c.fillStyle = gold(c, hx - 2, 0, hx + 2, 0);
          c.fillRect(hx - 2, by - 104, 4, 96);
          ellipse(c, hx, by - 8, 13, 4);
          fillInk(c, gold(c, hx - 13, by - 12, hx + 13, by - 4), 1.4);
          ellipse(c, hx - 6, by - 98, 12, 3.5);
          fillInk(c, '#1b1b22', 1.4);
          rrect(c, hx - 13, by - 116, 14, 18, 3);
          fillInk(c, '#1b1b22', 1.4);
          c.fillStyle = '#c0504a';
          c.fillRect(hx - 13, by - 103, 14, 3);
          c.beginPath();
          c.moveTo(hx + 2, by - 90);
          c.quadraticCurveTo(hx + 14, by - 70, hx + 6, by - 46);
          c.strokeStyle = '#c0504a';
          c.lineWidth = 5;
          c.stroke();
        }),
      );
      // The curtain: its own sprite so it can sway and open.
      const curtain = propSprite(L + 4, T - H + 44, bw * 0.75, H + bh - 40, 0, 0, (c) => {
        const cw = bw * 0.75;
        const ch = H + bh - 46;
        const n = 7;
        for (let i = 0; i < n; i++) {
          const fx = (cw / n) * i;
          c.beginPath();
          c.moveTo(fx, 0);
          c.lineTo(fx + cw / n + 2, 0);
          c.quadraticCurveTo(fx + cw / n + 4, ch * 0.6, fx + cw / n + 1, ch);
          c.lineTo(fx - 1, ch);
          c.closePath();
          const g = c.createLinearGradient(fx, 0, fx + cw / n, 0);
          g.addColorStop(0, rgb(dark(curtainCol, 0.35)));
          g.addColorStop(0.5, rgb(light(curtainCol, 0.25)));
          g.addColorStop(1, rgb(dark(curtainCol, 0.2)));
          c.fillStyle = g;
          c.fill();
        }
        c.strokeStyle = INK;
        c.lineWidth = 2;
        c.strokeRect(0, 0, cw, ch);
        c.fillStyle = gold(c, 0, ch - 8, 0, ch);
        c.fillRect(0, ch - 7, cw, 5);
        for (let i = 0; i <= 7; i++) {
          c.beginPath();
          c.arc((cw / 7) * i, 2, 2.4, 0, Math.PI * 2);
          c.fillStyle = '#e0b25a';
          c.fill();
        }
      });
      v.addChild(curtain);
      const kick = kicker(1000);
      return [
        ent(v, [{ x: L - 46, y: T, w: bw + 100, h: bh }], T + bh, (time, dt) => {
          const kk = kick.step(dt);
          curtain.scale.x = 1 - Math.sin(kk * Math.PI) * 0.45;
          curtain.skew.y = Math.sin(time * 0.8) * 0.006;
        }, kick.poke),
      ];
    }

    case 'clothesRack': {
      const rw = w || 110;
      const v = new Container();
      const cols = [0x2a1630, 0x1f5a44, 0xc0504a, 0x2f4aa0, 0xe8e0d0, 0x5a2a7a, 0xc9962e, 0x1b1b22];
      const rack = propSprite(x, y, rw + 30, 110, (rw + 30) / 2, 96, (c) => {
        shadow(c, 0, 0, rw * 0.6, 10, 0.5);
        for (const px of [-rw / 2, rw / 2]) {
          c.fillStyle = gold(c, px - 2, 0, px + 2, 0);
          c.fillRect(px - 2, -78, 4, 78);
          ellipse(c, px, 0, 8, 3);
          fillInk(c, '#7a4e18', 1.2);
        }
        c.fillStyle = gold(c, 0, -80, 0, -75);
        c.fillRect(-rw / 2 - 3, -80, rw + 6, 4);
        const n = Math.floor(rw / 15);
        for (let i = 0; i < n; i++) {
          const gx = -rw / 2 + 10 + i * ((rw - 20) / (n - 1));
          const col = cols[(i * 3 + Math.floor(rnd() * 3)) % cols.length];
          const dress = i % 3 === 1;
          c.beginPath();
          c.moveTo(gx, -78);
          c.lineTo(gx, -72);
          c.strokeStyle = '#8a8a90';
          c.lineWidth = 1;
          c.stroke();
          c.beginPath();
          if (dress) {
            c.moveTo(gx - 4, -70);
            c.lineTo(gx + 4, -70);
            c.lineTo(gx + 9, -30);
            c.lineTo(gx - 9, -30);
          } else {
            c.moveTo(gx - 7, -70);
            c.lineTo(gx + 7, -70);
            c.lineTo(gx + 6, -40);
            c.lineTo(gx - 6, -40);
          }
          c.closePath();
          fillInk(c, vgrad(c, -70, -30, col, 0.25, 0.35), 1.4);
          if (!dress) {
            c.beginPath();
            c.moveTo(gx - 2, -70);
            c.lineTo(gx, -62);
            c.lineTo(gx + 2, -70);
            c.fillStyle = '#fff6e6';
            c.fill();
          }
        }
      });
      v.addChild(rack);
      const ph = rnd() * 10;
      return [ent(v, [box(x, y - 4, rw + 12, 28)], y + 6, (time) => (rack.skew.x = Math.sin(time * 1.1 + ph) * 0.012))];
    }

    case 'piano': {
      const v = new Container();
      v.addChild(
        propSprite(x, y, 200, 260, 100, 150, (c) => {
          shadow(c, 0, 66, 84, 22, 0.55);
          // Legs.
          for (const [lx, ly] of [[-52, 58], [52, 58], [10, -40]] as const) {
            rrect(c, lx - 5, ly - 34, 10, 36, 3);
            fillInk(c, '#0e0a10', 1.6);
            ellipse(c, lx, ly + 1, 6, 2.4);
            fillInk(c, gold(c, lx - 6, ly, lx + 6, ly + 2), 1.2);
          }
          // Body (seen from above and front), lacquered black.
          c.beginPath();
          c.moveTo(-60, 24);
          c.lineTo(60, 24);
          c.lineTo(60, -40);
          c.bezierCurveTo(58, -100, 30, -126, 4, -120);
          c.bezierCurveTo(-30, -112, -40, -80, -60, -60);
          c.closePath();
          const bg = c.createLinearGradient(-60, -120, 60, 24);
          bg.addColorStop(0, '#3a3248');
          bg.addColorStop(0.4, '#120c18');
          bg.addColorStop(1, '#05030a');
          fillInk(c, bg, 2.6);
          // Strings and harp under the open lid.
          c.save();
          c.clip();
          c.beginPath();
          c.moveTo(-50, 14);
          c.lineTo(50, 14);
          c.lineTo(48, -36);
          c.bezierCurveTo(44, -88, 26, -108, 4, -106);
          c.bezierCurveTo(-24, -100, -36, -76, -50, -58);
          c.closePath();
          c.fillStyle = '#b07a2a';
          c.fill();
          for (let i = 0; i < 14; i++) {
            c.beginPath();
            c.moveTo(-44 + i * 6.8, 12);
            c.lineTo(-38 + i * 5.4, -60 - Math.sin((i / 13) * Math.PI) * 40);
            c.strokeStyle = 'rgba(255,240,200,0.55)';
            c.lineWidth = 0.8;
            c.stroke();
          }
          c.restore();
          // The lid, propped open to the back.
          c.beginPath();
          c.moveTo(60, -40);
          c.bezierCurveTo(70, -120, 20, -170, -30, -150);
          c.lineTo(-58, -64);
          c.bezierCurveTo(-36, -84, -22, -114, 4, -120);
          c.bezierCurveTo(30, -126, 58, -100, 60, -40);
          c.closePath();
          const lg = c.createLinearGradient(-30, -160, 60, -40);
          lg.addColorStop(0, '#4a4060');
          lg.addColorStop(0.5, '#1a1424');
          lg.addColorStop(1, '#0a0610');
          fillInk(c, lg, 2.2);
          c.beginPath();
          c.moveTo(20, -126);
          c.lineTo(34, -150);
          c.strokeStyle = gold(c, 20, -150, 34, -126);
          c.lineWidth = 2;
          c.stroke();
          c.beginPath();
          c.moveTo(-26, -146);
          c.bezierCurveTo(10, -158, 50, -130, 56, -70);
          c.strokeStyle = 'rgba(255,255,255,0.22)';
          c.lineWidth = 3;
          c.stroke();
          // Keyboard at the front.
          rrect(c, -60, 18, 120, 22, 3);
          fillInk(c, '#0e0a10', 2);
          c.fillStyle = '#fff6e6';
          c.fillRect(-56, 22, 112, 12);
          for (let k = 0; k <= 22; k++) {
            c.fillStyle = 'rgba(0,0,0,0.35)';
            c.fillRect(-56 + k * (112 / 22), 22, 0.8, 12);
          }
          for (let k = 0; k < 22; k++) {
            if (k % 7 === 2 || k % 7 === 6) continue;
            c.fillStyle = '#14080f';
            c.fillRect(-56 + k * (112 / 22) + 3.2, 22, 3, 7);
          }
          c.fillStyle = gold(c, 0, 34, 0, 37);
          c.fillRect(-58, 34, 116, 2);
          // Candelabra on the piano.
          c.fillStyle = gold(c, 36, 0, 40, 0);
          c.fillRect(37, -10, 3, 20);
          // Bench.
          rrect(c, -30, 56, 60, 14, 4);
          fillInk(c, vgrad(c, 56, 70, 0x1f5a5a, 0.3, 0.3), 1.8);
          for (const lx of [-24, 24]) {
            c.fillStyle = '#0e0a10';
            c.fillRect(lx - 2, 70, 4, 10);
          }
        }),
      );
      const fl = flame(v, x + 38.5, y - 10, 0.8);
      const pressed = new Graphics();
      v.addChild(pressed);
      const kick = kicker(350);
      let key = 0;
      return [
        {
          ...ent(v, [{ x: x - 62, y: y - 104, w: 124, h: 186 }], y + 80, (time, dt) => {
            fl(time);
            const k = kick.step(dt);
            pressed.clear();
            if (k > 0) pressed.rect(x - 56 + key * (112 / 22), y + 22, 112 / 22, 12).fill({ color: COLORS.lamp, alpha: k * 0.9 });
          }, () => {
            key = Math.floor(Math.random() * 22);
            kick.poke();
          }),
          useFrom: 'below',
        } as BuiltDecor,
      ];
    }

    case 'sofa': {
      const sw = w || 160;
      const v = new Container();
      const col = t.sofa ?? 0x1f5a5a;
      v.addChild(
        propSprite(x, y, sw + 40, 130, sw / 2 + 20, 90, (c) => {
          shadow(c, 0, 26, sw * 0.6, 16, 0.55);
          // Backrest.
          rrect(c, -sw / 2 + 6, -64, sw - 12, 46, 18);
          fillInk(c, vgrad(c, -64, -18, col, 0.3, 0.3), 2.2);
          for (let i = 0; i < 6; i++)
            for (let j = 0; j < 2; j++) {
              ellipse(c, -sw / 2 + 24 + i * ((sw - 48) / 5), -50 + j * 14, 2, 1.6);
              c.fillStyle = rgb(dark(col, 0.45));
              c.fill();
            }
          rrect(c, -sw / 2 + 6, -64, sw - 12, 46, 18);
          rim(c, 0.35, 2);
          // Seat cushions.
          for (let i = 0; i < 3; i++) {
            const cw = (sw - 40) / 3;
            rrect(c, -sw / 2 + 20 + i * cw, -24, cw - 2, 30, 8);
            fillInk(c, vgrad(c, -24, 6, col, 0.35, 0.2), 1.8);
          }
          // Front and arms.
          rrect(c, -sw / 2 + 14, 2, sw - 28, 20, 6);
          fillInk(c, vgrad(c, 2, 22, dark(col, 0.2), 0.05, 0.4), 2);
          for (const s of [-1, 1]) {
            rrect(c, s < 0 ? -sw / 2 : sw / 2 - 26, -40, 26, 62, 12);
            fillInk(c, vgrad(c, -40, 22, col, 0.3, 0.35), 2.2);
            ellipse(c, s < 0 ? -sw / 2 + 13 : sw / 2 - 13, -36, 10, 5);
            c.fillStyle = rgb(light(col, 0.35));
            c.fill();
          }
          for (const lx of [-sw / 2 + 10, sw / 2 - 10]) {
            c.fillStyle = gold(c, lx - 3, 0, lx + 3, 0);
            c.fillRect(lx - 3, 22, 6, 8);
          }
          // A cushion in the accent colour.
          c.save();
          c.translate(-sw / 2 + 40, -30);
          c.rotate(-0.25);
          rrect(c, -13, -12, 26, 24, 8);
          fillInk(c, vgrad(c, -12, 12, 0xc9962e, 0.3, 0.3), 1.6);
          c.restore();
        }),
      );
      return [ent(v, [box(x, y, sw, 54)], y + 28)];
    }

    case 'table': {
      const v = new Container();
      v.addChild(
        propSprite(x, y, 100, 100, 50, 70, (c) => {
          shadow(c, 0, 4, 34, 10, 0.5);
          c.fillStyle = gold(c, -4, 0, 4, 0);
          c.fillRect(-4, -26, 8, 28);
          ellipse(c, 0, 2, 16, 5);
          fillInk(c, gold(c, -16, -2, 16, 6), 1.4);
          c.beginPath();
          c.ellipse(0, -26, 32, 13, 0, 0, Math.PI);
          c.lineTo(-32, -31);
          c.ellipse(0, -31, 32, 13, 0, Math.PI, 0, true);
          c.closePath();
          fillInk(c, gold(c, -32, -40, 32, -20), 2);
          ellipse(c, 0, -31, 29, 11);
          const g = c.createLinearGradient(-29, -42, 29, -20);
          g.addColorStop(0, '#fffaf0');
          g.addColorStop(1, '#c9b894');
          c.fillStyle = g;
          c.fill();
          // Two glasses of something sparkly.
          for (const gx of [-12, 10]) {
            c.beginPath();
            c.moveTo(gx - 4, -48);
            c.lineTo(gx + 4, -48);
            c.lineTo(gx + 3, -38);
            c.lineTo(gx - 3, -38);
            c.closePath();
            fillInk(c, 'rgba(255,214,140,0.85)', 1.2);
            c.fillStyle = 'rgba(255,255,255,0.6)';
            c.fillRect(gx - 3, -47, 1.2, 7);
          }
        }),
      );
      return [ent(v, [box(x, y - 4, 64, 26)], y + 6)];
    }

    case 'armchair': {
      const v = new Container();
      const col = t.sofa ?? 0x1f5a5a;
      const flip = (d.r ?? 0) === 3 ? -1 : 1;
      const s = propSprite(x, y, 100, 110, 50, 74, (c) => {
        shadow(c, 0, 12, 40, 12, 0.5);
        rrect(c, -30, -58, 60, 42, 16);
        fillInk(c, vgrad(c, -58, -16, col, 0.3, 0.3), 2.2);
        rrect(c, -26, -24, 52, 30, 9);
        fillInk(c, vgrad(c, -24, 6, col, 0.35, 0.25), 1.8);
        for (const sx of [-32, 18]) {
          rrect(c, sx, -34, 14, 44, 7);
          fillInk(c, vgrad(c, -34, 10, col, 0.3, 0.35), 2);
        }
        rrect(c, -30, -58, 60, 42, 16);
        rim(c, 0.35, 2);
        for (const lx of [-26, 26]) {
          c.fillStyle = gold(c, lx - 2, 0, lx + 2, 0);
          c.fillRect(lx - 2, 8, 4, 8);
        }
      });
      s.scale.x = flip;
      v.addChild(s);
      return [ent(v, [box(x, y - 4, 60, 40)], y + 14)];
    }

    case 'palm': {
      const v = new Container();
      v.addChild(propSprite(x, y, 80, 80, 40, 60, (c) => pot(c, 40, 34)));
      const fronds = propSprite(x, y - 34, 200, 170, 100, 150, (c) => {
        const greens = [0x2f7a3a, 0x3d8a4a, 0x236a32, 0x4a9a50];
        for (let i = 0; i < 11; i++) {
          const a = -Math.PI / 2 + (i / 10 - 0.5) * 3.2 + (rnd() - 0.5) * 0.2;
          const len = 64 + rnd() * 28;
          const col = greens[i % greens.length];
          // Frond: a curved rib with leaflets.
          c.save();
          c.rotate(a);
          c.beginPath();
          c.moveTo(0, 0);
          c.quadraticCurveTo(len * 0.5, -10, len, 12);
          c.strokeStyle = rgb(dark(col, 0.3));
          c.lineWidth = 2.4;
          c.stroke();
          for (let k = 2; k < 12; k++) {
            const tt = k / 12;
            const px = len * tt;
            const py = -10 * Math.sin(tt * Math.PI) + 12 * tt * tt;
            for (const s of [-1, 1]) {
              c.beginPath();
              c.moveTo(px, py);
              c.quadraticCurveTo(px + 6, py + s * 10, px + 4 + tt * 6, py + s * (16 - tt * 9));
              c.strokeStyle = rgb(s < 0 ? light(col, 0.25) : dark(col, 0.15));
              c.lineWidth = 3.4 - tt * 1.6;
              c.stroke();
            }
          }
          c.restore();
        }
        glowAt(c, -10, -20, 40, 30, 0xfff4c0, 0.12, 'lighter');
      });
      v.addChild(fronds);
      const ph = rnd() * 10;
      return [ent(v, [box(x, y - 6, 40, 26)], y + 10, (time) => (fronds.rotation = Math.sin(time * 0.7 + ph) * 0.025))];
    }

    case 'plant': {
      const v = new Container();
      v.addChild(
        propSprite(x, y, 110, 130, 55, 104, (c) => {
          pot(c, 34, 30, 0x1f6a6a);
          const greens = [0x2f7a3a, 0x3d8a4a, 0x4fa858];
          for (let i = 0; i < 14; i++) {
            const a = -Math.PI / 2 + (rnd() - 0.5) * 2.6;
            const len = 22 + rnd() * 22;
            leaf(c, (rnd() - 0.5) * 10, -30 - rnd() * 8, a, len, 7 + rnd() * 4, greens[i % 3]);
          }
        }),
      );
      return [ent(v, [box(x, y - 6, 34, 24)], y + 6)];
    }

    case 'floorLamp': {
      const v = new Container();
      v.addChild(
        propSprite(x, y, 70, 170, 35, 150, (c) => {
          shadow(c, 0, 0, 18, 6, 0.5);
          ellipse(c, 0, 0, 12, 4);
          fillInk(c, gold(c, -12, -4, 12, 4), 1.4);
          c.fillStyle = gold(c, -2, 0, 2, 0);
          c.fillRect(-1.6, -112, 3.2, 112);
          c.beginPath();
          c.moveTo(-14, -140);
          c.lineTo(14, -140);
          c.lineTo(22, -112);
          c.lineTo(-22, -112);
          c.closePath();
          const g = c.createLinearGradient(0, -140, 0, -112);
          g.addColorStop(0, '#fff1c4');
          g.addColorStop(1, '#e0a050');
          fillInk(c, g, 1.8);
          for (let k = -20; k <= 20; k += 4) {
            c.beginPath();
            c.moveTo(k, -112);
            c.lineTo(k, -106);
            c.strokeStyle = '#c9963e';
            c.lineWidth = 1.4;
            c.stroke();
          }
        }),
      );
      const gl = glow(v, x, y - 126, 220, 180, 0xffcf7a, 0.45);
      const ph = rnd() * 10;
      return [ent(v, [box(x, y - 2, 24, 18)], y + 4, (time) => (gl.alpha = 0.42 + Math.sin(time * 1.3 + ph) * 0.03))];
    }

    case 'entrance': {
      const v = new Container();
      const wy = y;
      v.addChild(
        propSprite(x, wy, 260, 160, 130, 110, (c) => {
          // Warm street light spilling in through the door.
          glowAt(c, 0, 30, 120, 70, 0xffc070, 0.55, 'lighter');
          rrect(c, -90, -80, 180, 50, 8);
          const mg = c.createLinearGradient(0, -80, 0, -30);
          mg.addColorStop(0, '#6b1a2e');
          mg.addColorStop(1, '#3a0c18');
          fillInk(c, mg, 2);
          rrect(c, -82, -74, 164, 38, 5);
          c.strokeStyle = '#e0b25a';
          c.lineWidth = 1.6;
          c.stroke();
          c.font = `700 15px ${FONT_BODY}`;
          c.textAlign = 'center';
          c.fillStyle = '#f3d68a';
          c.fillText('W I L L K O M M E N', 0, -50);
          c.fillStyle = gold(c, -80, 0, 80, 0);
          c.fillRect(-80, -4, 160, 8);
        }),
      );
      const wings = new Graphics();
      v.addChild(wings);
      const ring = new Graphics().ellipse(x, wy + 24, 62, 20).stroke({ color: 0xe0b25a, width: 4 });
      v.addChild(ring);
      const kick = kicker(2500);
      let ang = 0;
      return [
        {
          view: v,
          layer: 'entities',
          obstacles: [],
          z: wy + 60,
          update: (_time, dt) => {
            ang += dt * (0.0003 + kick.step(dt) * 0.004);
            wings.clear();
            for (let i = 0; i < 4; i++) {
              const a = ang + (i / 4) * Math.PI * 2;
              wings.moveTo(x, wy + 24).lineTo(x + Math.cos(a) * 60, wy + 24 + Math.sin(a) * 19).stroke({ color: 0xbfe6ff, width: 4, alpha: 0.5 });
            }
            wings.circle(x, wy + 24, 5).fill(0xe0b25a);
          },
          poke: kick.poke,
        },
      ];
    }

    case 'plaque': {
      const pw = w || 120;
      const v = new Container();
      v.addChild(
        propSprite(x, 0, pw + 20, 110, (pw + 20) / 2, 0, (c) => {
          const T = 34;
          c.fillStyle = 'rgba(0,0,0,0.35)';
          rrect(c, -pw / 2 + 4, T + 5, pw, 60, 6);
          c.fill();
          rrect(c, -pw / 2, T, pw, 60, 6);
          fillInk(c, gold(c, -pw / 2, T, pw / 2, T + 60), 2);
          rrect(c, -pw / 2 + 6, T + 6, pw - 12, 48, 4);
          c.strokeStyle = 'rgba(80,46,10,0.7)';
          c.lineWidth = 1;
          c.stroke();
          c.textAlign = 'center';
          c.fillStyle = '#3a2008';
          c.font = `700 12px ${FONT_BODY}`;
          c.fillText('HAUSORDNUNG', 0, T + 20);
          c.font = `600 11px ${FONT_BODY}`;
          c.fillText('Nur Spielgeld.', 0, T + 35);
          c.fillText('Kein Echtgeld.', 0, T + 48);
        }),
      );
      // Usable: opens "Wie das Haus gewinnt"; the thin strip at the wall foot puts the prompt below it.
      return [{ view: v, layer: 'wall', obstacles: [{ x: x - pw / 2, y: P_WALL_H - 8, w: pw, h: 8 }], useFrom: 'below' }];
    }

    case 'painting': {
      const pw = w || 80;
      const ph = h || 64;
      const v = new Container();
      const scene = Math.floor(rnd() * 3);
      v.addChild(
        propSprite(x, 0, pw + 20, ph + 60, (pw + 20) / 2, 0, (c) => {
          const T = 30;
          c.fillStyle = 'rgba(0,0,0,0.4)';
          c.fillRect(-pw / 2 + 4, T + 6, pw, ph);
          c.fillStyle = gold(c, -pw / 2, T, pw / 2, T + ph);
          c.fillRect(-pw / 2, T, pw, ph);
          c.strokeStyle = INK;
          c.lineWidth = 2;
          c.strokeRect(-pw / 2, T, pw, ph);
          const L = -pw / 2 + 7;
          const IT = T + 7;
          const iw = pw - 14;
          const ih = ph - 14;
          c.save();
          c.beginPath();
          c.rect(L, IT, iw, ih);
          c.clip();
          if (scene === 0) {
            const g = c.createLinearGradient(0, IT, 0, IT + ih);
            g.addColorStop(0, '#1d2a5a');
            g.addColorStop(1, '#5a3a6a');
            c.fillStyle = g;
            c.fillRect(L, IT, iw, ih);
            glowAt(c, L + iw * 0.7, IT + ih * 0.3, 14, 14, 0xfff1c4, 0.9);
            c.fillStyle = '#0e1430';
            c.fillRect(L, IT + ih * 0.65, iw, ih * 0.35);
            for (let k = 0; k < 6; k++) {
              c.fillStyle = 'rgba(255,241,196,0.5)';
              c.fillRect(L + iw * 0.7 - 6 + Math.sin(k) * 4, IT + ih * 0.68 + k * 3, 12 - k, 1.4);
            }
          } else if (scene === 1) {
            c.fillStyle = '#2a1a14';
            c.fillRect(L, IT, iw, ih);
            glowAt(c, L + iw * 0.4, IT + ih * 0.5, iw * 0.5, ih * 0.5, 0x8a5a2a, 0.6);
            ellipse(c, L + iw * 0.5, IT + ih * 0.75, iw * 0.3, 5);
            c.fillStyle = '#5a3a2a';
            c.fill();
            for (const [fx, fy, col] of [[0.35, 0.45, '#c0504a'], [0.5, 0.38, '#ffcf7a'], [0.62, 0.5, '#ff9ac0']] as const) {
              c.beginPath();
              c.arc(L + iw * fx, IT + ih * fy, 5, 0, Math.PI * 2);
              c.fillStyle = col;
              c.fill();
            }
            c.fillStyle = '#9ab8d0';
            c.fillRect(L + iw * 0.45, IT + ih * 0.5, iw * 0.1, ih * 0.25);
          } else {
            const g = c.createLinearGradient(0, IT, 0, IT + ih);
            g.addColorStop(0, '#3a1a3a');
            g.addColorStop(1, '#1b1013');
            c.fillStyle = g;
            c.fillRect(L, IT, iw, ih);
            c.beginPath();
            c.ellipse(L + iw / 2, IT + ih * 0.55, iw * 0.18, ih * 0.3, 0, 0, Math.PI * 2);
            c.fillStyle = '#e8b48a';
            c.fill();
            c.beginPath();
            c.ellipse(L + iw / 2, IT + ih * 1.05, iw * 0.35, ih * 0.4, 0, 0, Math.PI * 2);
            c.fillStyle = '#6b1a2e';
            c.fill();
            c.beginPath();
            c.ellipse(L + iw / 2, IT + ih * 0.36, iw * 0.21, ih * 0.18, 0, Math.PI, 0);
            c.fillStyle = '#1b1013';
            c.fill();
          }
          c.restore();
          glowAt(c, 0, T - 2, pw * 0.5, 16, 0xffe2a8, 0.35, 'lighter');
          // Little picture lamp above.
          rrect(c, -14, T - 8, 28, 6, 3);
          fillInk(c, gold(c, -14, T - 8, 14, T - 2), 1.2);
        }),
      );
      return [{ view: v, layer: 'wall', obstacles: [] }];
    }
  }
  return null;
}

/** The trophy cabinet's case: back, shelf, and a glass front painted separately. */
export function paintedVitrine(w: number, h: number) {
  const back = propSprite(0, 0, w + 20, h + 90, 10, 70, (c) => {
    shadow(c, w / 2, h + 8, w * 0.6, 14, 0.55);
    rrect(c, 0, -62, w, h + 72, 8);
    fillInk(c, vgrad(c, -62, h + 10, 0x3a1a10, 0.15, 0.4), 2.4);
    rrect(c, 7, -54, w - 14, h + 48, 5);
    const g = c.createLinearGradient(0, -54, 0, h);
    g.addColorStop(0, '#4a0f22');
    g.addColorStop(1, '#22060f');
    c.fillStyle = g;
    c.fill();
    glowAt(c, w / 2, -50, w * 0.5, 30, 0xffe2a8, 0.4, 'lighter');
    c.fillStyle = gold(c, 0, h - 8, 0, h - 2);
    c.fillRect(7, h - 8, w - 14, 6);
    c.fillStyle = gold(c, 0, -66, 0, -58);
    c.fillRect(-3, -66, w + 6, 8);
    rrect(c, w / 2 - 34, h + 2, 68, 16, 4);
    fillInk(c, gold(c, w / 2 - 34, h + 2, w / 2 + 34, h + 18), 1.4);
    c.font = `700 11px ${FONT_BODY}`;
    c.textAlign = 'center';
    c.fillStyle = '#3a1a08';
    c.fillText('VITRINE', w / 2, h + 14);
  });
  const glass = propSprite(0, 0, w + 20, h + 90, 10, 70, (c) => {
    c.beginPath();
    c.moveTo(16, -52);
    c.lineTo(44, -52);
    c.lineTo(24, h - 10);
    c.lineTo(8, h - 10);
    c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fill();
    c.beginPath();
    c.moveTo(56, -52);
    c.lineTo(64, -52);
    c.lineTo(44, h - 10);
    c.lineTo(36, h - 10);
    c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fill();
    rrect(c, 7, -54, w - 14, h + 48, 5);
    c.strokeStyle = 'rgba(224,178,90,0.9)';
    c.lineWidth = 2;
    c.stroke();
  });
  return { back, glass };
}

/** The achievements board on the back wall. */
export function paintedAchBoard(w: number, h: number, done: boolean[], label: string) {
  return propSprite(0, 0, w + 16, h + 16, 8, 8, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.4)';
    rrect(c, 4, 6, w, h, 8);
    c.fill();
    rrect(c, 0, 0, w, h, 8);
    fillInk(c, gold(c, 0, 0, w, h), 2.2);
    rrect(c, 7, 7, w - 14, h - 14, 5);
    const g = c.createLinearGradient(0, 7, 0, h - 7);
    g.addColorStop(0, '#3a1a10');
    g.addColorStop(1, '#1a0a06');
    c.fillStyle = g;
    c.fill();
    c.font = `700 13px ${FONT_BODY}`;
    c.textAlign = 'center';
    c.fillStyle = '#fff1c4';
    c.fillText(label, w / 2, 24);
    const cols = Math.ceil(done.length / 3);
    const step = (w - 26) / cols;
    done.forEach((on, i) => {
      const mx = 13 + step * ((i % cols) + 0.5);
      const my = 42 + Math.floor(i / cols) * 22;
      ellipse(c, mx, my, 7.5, 7.5);
      if (on) {
        c.fillStyle = gold(c, mx - 8, my - 8, mx + 8, my + 8);
        c.fill();
        glowAt(c, mx, my, 12, 12, 0xffe2a8, 0.5, 'lighter');
      } else {
        c.fillStyle = '#120808';
        c.fill();
      }
      c.strokeStyle = on ? '#fff1c4' : '#5a3a14';
      c.lineWidth = 1.4;
      c.stroke();
    });
  });
}

export { Text };

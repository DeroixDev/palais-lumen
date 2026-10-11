// Painted parts of Drei Laternen: the night garden booth, the brass lanterns and their flames,
// the moth, and the station on the casino floor.

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture } from '../../core/fx';
import { paintEmblem } from '../slots/symbols';
import { registerPaintedStation, type PaintedStation } from '../../world/painted/stations';
import { INK, dark, ellipse, fillInk, glowAt, gold, grain, light, paint, propSprite, rgb, rim, rrect, seeded, shadow, vgrad, type Ctx } from '../../world/painted/brush';

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

const VELVET = 0x123a4a;

// ---- Lantern ------------------------------------------------------------------------------------------

/** Lantern texture size; the foot's middle is at (LANTERN.ax, LANTERN.ay). */
export const LANTERN = { w: 130, h: 200, ax: 65, ay: 192 };
/** Where the flame sits, relative to the foot. */
export const FLAME_Y = -78;

/** A brass hurricane lantern: ring handle, dome, four glass panes lit from inside, a heavy foot. */
export function lanternTexture() {
  return cached('lantern', () =>
    paint(LANTERN.w, LANTERN.h, (c) => {
      c.translate(LANTERN.ax, LANTERN.ay);
      // Glass body (drawn first so the frame sits on top).
      const gw = 76;
      const gTop = -140;
      const gBot = -24;
      c.beginPath();
      c.moveTo(-gw / 2 + 6, gTop);
      c.lineTo(gw / 2 - 6, gTop);
      c.lineTo(gw / 2, gBot);
      c.lineTo(-gw / 2, gBot);
      c.closePath();
      const gg = c.createRadialGradient(0, FLAME_Y + 6, 4, 0, FLAME_Y, 70);
      gg.addColorStop(0, 'rgba(255,240,190,0.95)');
      gg.addColorStop(0.45, 'rgba(255,190,90,0.75)');
      gg.addColorStop(1, 'rgba(150,70,30,0.7)');
      c.fillStyle = gg;
      c.fill();
      // Frosted panes: side panes darker for volume.
      c.save();
      c.clip();
      const side = c.createLinearGradient(-gw / 2, 0, gw / 2, 0);
      side.addColorStop(0, 'rgba(60,20,10,0.45)');
      side.addColorStop(0.22, 'rgba(60,20,10,0)');
      side.addColorStop(0.78, 'rgba(60,20,10,0)');
      side.addColorStop(1, 'rgba(60,20,10,0.5)');
      c.fillStyle = side;
      c.fillRect(-gw / 2, gTop, gw, gBot - gTop);
      // Glass reflection.
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.beginPath();
      c.moveTo(-gw / 2 + 12, gTop + 6);
      c.lineTo(-gw / 2 + 22, gTop + 6);
      c.lineTo(-gw / 2 + 16, gBot - 6);
      c.lineTo(-gw / 2 + 7, gBot - 6);
      c.closePath();
      c.fill();
      c.restore();
      c.strokeStyle = INK;
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(-gw / 2 + 6, gTop);
      c.lineTo(gw / 2 - 6, gTop);
      c.lineTo(gw / 2, gBot);
      c.lineTo(-gw / 2, gBot);
      c.closePath();
      c.stroke();
      // Frame bars.
      for (const x of [-gw / 2 + 3, -12, 12, gw / 2 - 3]) {
        const top = x < 0 ? x + 3 : x - 3;
        c.beginPath();
        c.moveTo(top * 0.92, gTop);
        c.lineTo(x, gBot);
        c.strokeStyle = INK;
        c.lineWidth = 5.5;
        c.stroke();
        c.strokeStyle = gold(c, x - 3, gTop, x + 3, gBot);
        c.lineWidth = 3;
        c.stroke();
      }
      // Wick holder inside.
      rrect(c, -8, -40, 16, 14, 3);
      fillInk(c, gold(c, -8, -40, 8, -26), 1.4);
      // Dome cap.
      c.beginPath();
      c.moveTo(-gw / 2 - 2, gTop + 4);
      c.quadraticCurveTo(-gw / 2 + 4, gTop - 30, 0, gTop - 36);
      c.quadraticCurveTo(gw / 2 - 4, gTop - 30, gw / 2 + 2, gTop + 4);
      c.closePath();
      fillInk(c, gold(c, -gw / 2, gTop - 36, gw / 2, gTop + 4), 2.4);
      rim(c, 0.6, 1.6);
      // Vent holes round the dome.
      for (let i = -2; i <= 2; i++) {
        ellipse(c, i * 10, gTop - 12 + Math.abs(i) * 2, 3, 2);
        c.fillStyle = 'rgba(40,16,4,0.8)';
        c.fill();
      }
      // Finial and ring handle.
      ellipse(c, 0, gTop - 40, 7, 6);
      fillInk(c, gold(c, -7, gTop - 46, 7, gTop - 34), 1.6);
      c.beginPath();
      c.ellipse(0, gTop - 52, 15, 11, 0, Math.PI * 0.05, Math.PI * 0.95, true);
      c.strokeStyle = INK;
      c.lineWidth = 6;
      c.stroke();
      c.strokeStyle = gold(c, -15, gTop - 64, 15, gTop - 40);
      c.lineWidth = 3.4;
      c.stroke();
      // Foot: a heavy brass base with a lip.
      rrect(c, -gw / 2 - 6, gBot - 4, gw + 12, 14, 5);
      fillInk(c, gold(c, -gw / 2, gBot - 4, gw / 2, gBot + 10), 2.2);
      c.beginPath();
      c.moveTo(-gw / 2 - 2, gBot + 10);
      c.lineTo(gw / 2 + 2, gBot + 10);
      c.lineTo(gw / 2 + 10, -2);
      c.quadraticCurveTo(0, 4, -gw / 2 - 10, -2);
      c.closePath();
      fillInk(c, vgrad(c, gBot + 10, 0, 0xb07a2a, 0.35, 0.45), 2.2);
      rim(c, 0.5, 1.4);
    }, 2),
  );
}

export function flameTexture() {
  return cached('lflame', () =>
    paint(32, 48, (c) => {
      c.translate(16, 42);
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(-11, -6, -6, -24, 0, -38);
      c.bezierCurveTo(6, -24, 11, -6, 0, 0);
      const g = c.createRadialGradient(0, -9, 1, 0, -11, 24);
      g.addColorStop(0, '#fffbe8');
      g.addColorStop(0.35, '#ffd25a');
      g.addColorStop(1, '#ff7a2a');
      c.fillStyle = g;
      c.fill();
      ellipse(c, 0, -6, 3, 5);
      c.fillStyle = 'rgba(90,120,255,0.55)';
      c.fill();
    }, 3),
  );
}

/** The moth (wings up; flap it by scaling x). */
export function emblemTexture() {
  return cached('smoth', () =>
    paint(72, 72, (c) => {
      glowAt(c, 36, 36, 32, 32, 0xfff1c4, 0.45, 'lighter');
      paintEmblem(c, 36, 38, 58, { wing: 0xf3e2b8, wingDark: 0xa8783a, body: 0x6a4420, eye: 0xff5fa2 }, 2.2);
    }, 2),
  );
}

// ---- Scene --------------------------------------------------------------------------------------------

export interface BoothLayout {
  sw: number;
  sh: number;
  /** Lantern foot positions (slots). */
  slots: { x: number; y: number }[];
  /** Lantern scale. */
  k: number;
  table: { cx: number; cy: number; rx: number; ry: number };
  moon: { x: number; y: number; r: number };
  /** Front apron of the cloth, where the luck line is written. */
  apronY: number;
}

export function boothLayout(sw: number, sh: number, tall: boolean): BoothLayout {
  const k = Math.max(0.5, Math.min((sw * (tall ? 0.29 : 0.17)) / LANTERN.w, (sh * 0.5) / LANTERN.h, 1.35));
  const spread = tall ? sw * 0.31 : Math.min(sw * 0.22, LANTERN.w * k * 1.9);
  const footY = Math.round(sh * (tall ? 0.66 : 0.68));
  const rx = Math.min(sw * 0.49, spread * 1.75 + LANTERN.w * k * 0.4);
  const ry = Math.max(46, Math.min(sh * 0.2, rx * 0.3));
  return {
    sw,
    sh,
    slots: [-1, 0, 1].map((i) => ({ x: sw / 2 + i * spread, y: footY })),
    k,
    table: { cx: sw / 2, cy: footY - ry * 0.25, rx, ry },
    moon: { x: sw * (tall ? 0.8 : 0.85), y: Math.min(70, sh * 0.13), r: Math.min(46, sh * 0.08) },
    apronY: footY - ry * 0.25 + ry + Math.min(26, sh * 0.05),
  };
}

/** Night garden behind a velvet booth table: moon, festoon lights, hedges and the cloth. */
export function boothTexture(L: BoothLayout, res = 2) {
  const { sw, sh } = L;
  return paint(sw, sh, (c) => {
    const sky = c.createLinearGradient(0, 0, 0, sh);
    sky.addColorStop(0, '#0a0c26');
    sky.addColorStop(0.55, '#1c1238');
    sky.addColorStop(1, '#2a0e2a');
    c.fillStyle = sky;
    c.fillRect(0, 0, sw, sh);
    const r = seeded(11);
    for (let i = 0; i < Math.round((sw * sh) / 2600); i++) {
      ellipse(c, r() * sw, r() * sh * 0.55, 0.6 + r() * 1.2, 0.6 + r() * 1.2);
      c.fillStyle = `rgba(255,246,230,${0.25 + r() * 0.5})`;
      c.fill();
    }
    // Moon.
    const m = L.moon;
    glowAt(c, m.x, m.y, m.r * 4, m.r * 4, 0xbfd0ff, 0.22, 'lighter');
    ellipse(c, m.x, m.y, m.r, m.r);
    const mg = c.createRadialGradient(m.x - m.r * 0.35, m.y - m.r * 0.4, 2, m.x, m.y, m.r);
    mg.addColorStop(0, '#fffbe8');
    mg.addColorStop(1, '#c9b27a');
    c.fillStyle = mg;
    c.fill();
    for (const [dx, dy, rr] of [[-0.3, 0.1, 0.18], [0.25, -0.2, 0.12], [0.1, 0.35, 0.1]]) {
      ellipse(c, m.x + dx * m.r, m.y + dy * m.r, rr * m.r, rr * m.r);
      c.fillStyle = 'rgba(150,120,70,0.25)';
      c.fill();
    }
    // Hedges along the back.
    const hy = L.table.cy - L.table.ry * 0.6;
    c.beginPath();
    c.moveTo(0, sh);
    c.lineTo(0, hy);
    for (let x = 0; x <= sw + 40; x += 40) c.quadraticCurveTo(x + 20, hy - 26 - r() * 18, x + 40, hy - r() * 6);
    c.lineTo(sw, sh);
    c.closePath();
    const hg = c.createLinearGradient(0, hy - 40, 0, sh);
    hg.addColorStop(0, '#163a2a');
    hg.addColorStop(1, '#0a1a14');
    c.fillStyle = hg;
    c.fill();
    grain(c, 0, hy - 40, sw, sh - hy + 40, Math.round(sw / 2), 4, 0.06);
    // Festoon lights across the top.
    for (let s = 0; s < 2; s++) {
      const y0 = 18 + s * 26;
      const sag = 26 + s * 10;
      c.beginPath();
      c.moveTo(-10, y0);
      c.quadraticCurveTo(sw / 2, y0 + sag * 2, sw + 10, y0);
      c.strokeStyle = 'rgba(20,10,10,0.9)';
      c.lineWidth = 1.6;
      c.stroke();
      const n = Math.round(sw / 60);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const x = -10 + (sw + 20) * t;
        const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (y0 + sag * 2) + t * t * y0 + 6;
        const col = [0xffcf7a, 0xff8ab0, 0x9fe0ff][(i + s) % 3];
        glowAt(c, x, y, 16, 16, col, 0.5, 'lighter');
        ellipse(c, x, y, 3.6, 4.6);
        fillInk(c, rgb(light(col, 0.4)), 1.2);
      }
    }
    // Table: a round velvet cloth with a gold fringe, a pool of lantern light on it.
    const T = L.table;
    shadow(c, T.cx, T.cy + T.ry + 14, T.rx * 1.05, T.ry * 0.5, 0.7);
    // Cloth drop (front skirt).
    c.beginPath();
    c.ellipse(T.cx, T.cy, T.rx, T.ry, 0, 0, Math.PI);
    c.lineTo(T.cx - T.rx, T.cy);
    c.closePath();
    c.save();
    c.beginPath();
    c.moveTo(T.cx - T.rx, T.cy);
    c.ellipse(T.cx, T.cy, T.rx, T.ry, 0, Math.PI, 0, true);
    c.lineTo(T.cx + T.rx, T.cy + Math.min(60, sh * 0.12));
    c.ellipse(T.cx, T.cy + Math.min(60, sh * 0.12), T.rx, T.ry, 0, 0, Math.PI);
    c.closePath();
    fillInk(c, vgrad(c, T.cy, T.cy + T.ry + 60, dark(VELVET, 0.15), 0.1, 0.5), 2.4);
    c.restore();
    // Fringe.
    const drop = Math.min(60, sh * 0.12);
    for (let a = 0.04; a < Math.PI; a += 0.035) {
      const x = T.cx + Math.cos(a) * T.rx;
      const y = T.cy + drop + Math.sin(a) * T.ry;
      c.strokeStyle = a % 0.07 < 0.035 ? '#f0c868' : '#b07a2a';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, y - 2);
      c.lineTo(x, y + 9);
      c.stroke();
    }
    // Top.
    ellipse(c, T.cx, T.cy, T.rx, T.ry);
    const tg = c.createRadialGradient(T.cx, T.cy - T.ry * 0.3, 10, T.cx, T.cy, T.rx);
    tg.addColorStop(0, rgb(light(VELVET, 0.18)));
    tg.addColorStop(1, rgb(dark(VELVET, 0.3)));
    fillInk(c, tg, 2.4);
    c.save();
    ellipse(c, T.cx, T.cy, T.rx, T.ry);
    c.clip();
    grain(c, T.cx - T.rx, T.cy - T.ry, T.rx * 2, T.ry * 2, Math.round(T.rx), 8, 0.05);
    for (const s of L.slots) glowAt(c, s.x, s.y - 4, LANTERN.w * L.k * 0.9, T.ry * 0.5, 0xffc070, 0.35, 'lighter');
    c.restore();
    // Gold edge line on the cloth.
    c.beginPath();
    c.ellipse(T.cx, T.cy, T.rx - 8, T.ry - 6, 0, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(240,200,104,0.55)';
    c.lineWidth = 1.6;
    c.stroke();
    // Brass number plates in front of each slot.
    L.slots.forEach((s, i) => {
      const py = s.y + Math.min(22, T.ry * 0.3);
      const pr = Math.max(11, 13 * L.k);
      ellipse(c, s.x, py, pr * 1.3, pr * 0.7);
      fillInk(c, gold(c, s.x - pr, py - pr, s.x + pr, py + pr), 1.6);
      c.font = `400 ${Math.round(pr * 1.05)}px Bungee, Impact, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#3a1606';
      c.fillText(String(i + 1), s.x, py + 1);
    });
  }, res);
}

// ---- Station on the floor -----------------------------------------------------------------------------

/** A small round table with a teal velvet cloth and three glowing lanterns on it. */
function shellsStation(): PaintedStation {
  const W = 110;
  const H = 72;
  const c: PaintedStation = new Container();
  const sp = propSprite(W / 2, H / 2, 180, 170, 90, 100, (x) => {
    shadow(x, 0, 26, 70, 22, 0.6);
    // Stools in front.
    for (const sx of [-30, 30]) {
      shadow(x, sx, 52, 14, 5, 0.45);
      x.fillStyle = gold(x, sx - 2, 38, sx + 2, 50);
      x.fillRect(sx - 2, 38, 4, 12);
      ellipse(x, sx, 37, 11, 5.5);
      fillInk(x, vgrad(x, 31, 43, 0x2a3a4a, 0.35, 0.3), 1.5);
    }
    // Table with cloth and fringe.
    ellipse(x, 0, 12, 58, 22);
    fillInk(x, vgrad(x, -10, 34, dark(VELVET, 0.1), 0.1, 0.5), 2.2);
    x.fillRect(-58, -2, 116, 14);
    for (let a = 0.1; a < Math.PI; a += 0.12) {
      const fx = Math.cos(a) * 58;
      const fy = 12 + Math.sin(a) * 22;
      x.strokeStyle = '#e8b84a';
      x.lineWidth = 1.4;
      x.beginPath();
      x.moveTo(fx, fy);
      x.lineTo(fx, fy + 5);
      x.stroke();
    }
    ellipse(x, 0, -2, 58, 22);
    fillInk(x, vgrad(x, -24, 20, VELVET, 0.3, 0.3), 2.2);
    x.beginPath();
    x.ellipse(0, -2, 52, 18, 0, 0, Math.PI * 2);
    x.strokeStyle = 'rgba(240,200,104,0.6)';
    x.lineWidth = 1;
    x.stroke();
    // Three lanterns.
    for (const lx of [-32, 0, 32]) {
      const ly = lx === 0 ? -8 : -1;
      glowAt(x, lx, ly - 2, 24, 9, 0xffc070, 0.6, 'lighter');
      x.save();
      x.translate(lx, ly);
      x.scale(0.31, 0.31);
      drawMiniLantern(x);
      x.restore();
    }
  });
  c.addChild(sp);
  const lamp = new Container();
  lamp.label = 'lamp';
  for (const lx of [-30, 0, 30]) {
    const g = new Sprite(glowTexture());
    g.anchor.set(0.5);
    g.position.set(W / 2 + lx * 32 / 30, H / 2 - (lx === 0 ? 34 : 27));
    g.width = 60;
    g.height = 70;
    g.tint = 0xffc070;
    g.alpha = 0.6;
    g.blendMode = 'add';
    lamp.addChild(g);
  }
  c.addChild(lamp);
  c.labelY = H / 2 - 62;
  return c;
}

/** The lantern at full size around (0, 0) = its foot; scale the context before calling. */
function drawMiniLantern(c: Ctx) {
  const gw = 76;
  c.beginPath();
  c.moveTo(-gw / 2 + 6, -140);
  c.lineTo(gw / 2 - 6, -140);
  c.lineTo(gw / 2, -24);
  c.lineTo(-gw / 2, -24);
  c.closePath();
  const g = c.createRadialGradient(0, -80, 4, 0, -80, 70);
  g.addColorStop(0, '#fff4c8');
  g.addColorStop(1, '#c0702a');
  fillInk(c, g, 8);
  for (const bx of [-12, 12]) {
    c.beginPath();
    c.moveTo(bx * 0.9, -140);
    c.lineTo(bx, -24);
    c.strokeStyle = '#7a4e18';
    c.lineWidth = 8;
    c.stroke();
  }
  c.beginPath();
  c.moveTo(-gw / 2 - 2, -136);
  c.quadraticCurveTo(0, -186, gw / 2 + 2, -136);
  c.closePath();
  fillInk(c, gold(c, -gw / 2, -180, gw / 2, -136), 8);
  rrect(c, -gw / 2 - 8, -28, gw + 16, 28, 8);
  fillInk(c, gold(c, -gw / 2, -28, gw / 2, 0), 8);
  c.beginPath();
  c.ellipse(0, -196, 16, 12, 0, Math.PI * 0.05, Math.PI * 0.95, true);
  c.strokeStyle = '#e0b25a';
  c.lineWidth = 8;
  c.stroke();
}

registerPaintedStation('shells', shellsStation);

export function drawShellsStation() {
  return shellsStation();
}

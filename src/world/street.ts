// The street in front of the casino at night, painted in the 3/4 look of the house: the
// lacquered art-deco façade with its neon sign, warm windows, wet pavement, drizzle and mist.
// It is the backdrop of the start screen and the stage for the arrival: the taxi pulls up,
// you step onto the red carpet, the doorman greets you and the doors open.

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS, FONT_DISPLAY, glowText, glowTexture, emblemTexture, reducedMotion } from '../core/fx';
import { animate, ease, tween, wait } from '../core/tween';
import { sfx } from '../core/audio';
import { Chibi } from './painted/chibi';
import type { PlayerLook } from './player';
import { INK, dark, ellipse, glowAt, gold, grain, light, mix, paint, rgb, rrect, seeded, type Ctx } from './painted/brush';

import { HOUSE_CAPS } from '../core/brand';
const W = 1600;
const H = 900;
/** Where the façade meets the pavement. */
const BASE = 600;
/** Front edge of the pavement (top of the kerb). */
const CURB = 702;
/** Where the road starts below the kerb. */
const ROAD = 720;
const DOOR_X = 1000;
const DOOR = { l: 915, r: 1085, top: 414 };
const FACADE = { x: 620, w: 760, top: 172 };
const SIGN = { x: DOOR_X - 300, y: 232, w: 600, h: 116 };
const CANOPY = { l: 816, r: 1184, top: 360, bottom: 402 };
/** Lanes: the taxi stops at the kerb, other traffic passes in the near lane. */
const LANE_KERB = 800;
const LANE_NEAR = 884;
const LAMPS = [470, 1520];

export interface Look extends PlayerLook {
  color: number;
  skin?: number;
  hair?: number;
  jacket?: number;
  /** Doorman's cap (kept for older callers; the doorman wears a top hat). */
  cap?: boolean;
}

/** The weather of the street: a clear night, light drizzle (title) or steady rain. */
export type StreetMood = 'clear' | 'drizzle' | 'rain';

// ---- Painting the backdrop ----------------------------------------------------------------------

function paintSky(c: Ctx) {
  // Canvas spans y -900..600 so tall screens get sky above the scene.
  c.translate(0, 900);
  const g = c.createLinearGradient(0, -900, 0, 600);
  g.addColorStop(0, '#07071a');
  g.addColorStop(0.45, '#0c0b26');
  g.addColorStop(0.7, '#1a1236');
  g.addColorStop(0.88, '#331c44');
  g.addColorStop(1, '#5a2a4a');
  c.fillStyle = g;
  c.fillRect(0, -900, W, 1500);
  // Warm city glow at the horizon.
  glowAt(c, 800, 600, 1100, 260, 0xc0506a, 0.35);
  glowAt(c, 1000, 560, 600, 200, 0xffb070, 0.18);
  const r = seeded(77);
  for (let i = 0; i < 260; i++) {
    const y = -900 + r() * 1300;
    const a = (0.25 + r() * 0.6) * Math.max(0, Math.min(1, (420 - y) / 400));
    c.fillStyle = `rgba(255,246,230,${a})`;
    c.beginPath();
    c.arc(r() * W, y, 0.9 + r() * 1.6, 0, Math.PI * 2);
    c.fill();
  }
  // Long soft clouds, lit from below by the city and from above by the moon.
  for (const [x, y, w, h, a] of [[260, 150, 520, 46, 0.55], [700, 70, 420, 30, 0.4], [1250, 190, 600, 54, 0.5], [1500, 40, 340, 26, 0.35], [420, -160, 560, 40, 0.35], [1150, -320, 460, 36, 0.3]]) {
    glowAt(c, x, y, w, h, 0x2a1c46, a);
    glowAt(c, x - w * 0.15, y - h * 0.35, w * 0.6, h * 0.35, 0x8a7ab0, a * 0.25);
    glowAt(c, x + w * 0.1, y + h * 0.4, w * 0.7, h * 0.3, 0xc0607a, a * 0.18);
  }
}

function paintMoon(c: Ctx) {
  glowAt(c, 90, 90, 90, 90, 0xd8d0ff, 0.25);
  glowAt(c, 90, 90, 55, 55, 0xfff1d0, 0.35);
  ellipse(c, 90, 90, 30, 30);
  const g = c.createRadialGradient(80, 80, 4, 90, 90, 32);
  g.addColorStop(0, '#fffbea');
  g.addColorStop(0.7, '#f0e4c4');
  g.addColorStop(1, '#c8b896');
  c.fillStyle = g;
  c.fill();
  for (const [x, y, r] of [[98, 82, 6], [82, 100, 4], [100, 102, 3.5], [78, 84, 2.5]]) {
    ellipse(c, x, y, r, r);
    c.fillStyle = 'rgba(160,140,110,0.35)';
    c.fill();
  }
  // A wisp of cloud across the moon.
  glowAt(c, 100, 104, 70, 9, 0x2a1c46, 0.75);
}

function paintSkyline(c: Ctx) {
  const r = seeded(4242);
  // Two layers of distant buildings, the far one hazier.
  for (const [col, hMin, hMax, haze, seedOff] of [[0x2a2044, 120, 300, 0.5, 0], [0x1d1630, 70, 200, 0.25, 9]] as const) {
    let x = -30 + seedOff * 7;
    while (x < W + 30) {
      const bw = 60 + r() * 110;
      const bh = hMin + r() * (hMax - hMin);
      const top = BASE - bh;
      c.fillStyle = rgb(col);
      c.fillRect(x, top, bw, bh);
      // Some roofs get a spire, a water tank or a stepped crown.
      const k = r();
      if (k < 0.2) {
        c.beginPath();
        c.moveTo(x + bw / 2 - 6, top);
        c.lineTo(x + bw / 2, top - 40 - r() * 30);
        c.lineTo(x + bw / 2 + 6, top);
        c.fill();
      } else if (k < 0.35) {
        c.fillRect(x + bw * 0.6, top - 18, 22, 18);
        c.fillRect(x + bw * 0.6 + 3, top - 22, 16, 4);
      } else if (k < 0.5) {
        c.fillRect(x + bw * 0.2, top - 16, bw * 0.6, 16);
      }
      for (let wy = top + 12; wy < BASE - 10; wy += 16)
        for (let wx = x + 8; wx < x + bw - 8; wx += 12)
          if (r() < 0.16) {
            c.fillStyle = r() < 0.8 ? `rgba(255,200,120,${0.25 + r() * 0.45})` : `rgba(160,210,255,${0.2 + r() * 0.3})`;
            c.fillRect(wx, wy, 4, 6);
          }
      x += bw + 4 + r() * 10;
    }
    const hz = c.createLinearGradient(0, BASE - 320, 0, BASE);
    hz.addColorStop(0, 'rgba(90,60,110,0)');
    hz.addColorStop(1, `rgba(110,70,120,${haze})`);
    c.fillStyle = hz;
    c.fillRect(0, BASE - 320, W, 320);
  }
}

/** A tall window: lit (warm room, maybe a curtain or a guest) or dark (moonlit glass). */
function paintWindow(c: Ctx, x: number, y: number, w: number, h: number, lit: boolean, r: () => number, arched = false) {
  const shape = () => {
    if (arched) {
      c.beginPath();
      c.moveTo(x, y + h);
      c.lineTo(x, y + w / 2);
      c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
      c.lineTo(x + w, y + h);
      c.closePath();
    } else rrect(c, x, y, w, h, 2);
  };
  // Light from the window falls on the wall around it.
  if (lit) glowAt(c, x + w / 2, y + h / 2, w * 1.3, h * 0.9, 0xffb860, 0.22);
  shape();
  if (lit) {
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#ffe2a0');
    g.addColorStop(0.6, '#f0a850');
    g.addColorStop(1, '#a8582a');
    c.fillStyle = g;
  } else {
    const g = c.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#3a3a64');
    g.addColorStop(1, '#141428');
    c.fillStyle = g;
  }
  c.fill();
  c.save();
  shape();
  c.clip();
  if (lit) {
    const k = r();
    if (k < 0.3) {
      // A guest's silhouette.
      c.fillStyle = 'rgba(70,30,30,0.55)';
      ellipse(c, x + w * (0.3 + r() * 0.4), y + h * 0.55, w * 0.13, w * 0.15);
      c.fill();
      rrect(c, x + w * 0.2 + r() * w * 0.3, y + h * 0.66, w * 0.34, h * 0.4, 6);
      c.fill();
    } else if (k < 0.55) {
      // Curtains drawn to the sides.
      c.fillStyle = 'rgba(150,40,60,0.85)';
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + w * 0.35, y + h * 0.4, x + w * 0.12, y + h);
      c.lineTo(x, y + h);
      c.fill();
      c.beginPath();
      c.moveTo(x + w, y);
      c.quadraticCurveTo(x + w * 0.65, y + h * 0.4, x + w * 0.88, y + h);
      c.lineTo(x + w, y + h);
      c.fill();
    } else if (k < 0.7) {
      // A lamp inside.
      glowAt(c, x + w * 0.5, y + h * 0.35, w * 0.5, w * 0.5, 0xfff4d0, 0.7);
    }
  } else {
    // Moonlight on the glass.
    c.strokeStyle = 'rgba(190,200,255,0.18)';
    c.lineWidth = w * 0.18;
    c.beginPath();
    c.moveTo(x - 4, y + h * 0.7);
    c.lineTo(x + w * 0.8, y - 4);
    c.stroke();
  }
  c.restore();
  // Mullions and frame.
  c.strokeStyle = lit ? 'rgba(90,40,20,0.7)' : 'rgba(10,8,20,0.7)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x + w / 2, y + (arched ? 4 : 0));
  c.lineTo(x + w / 2, y + h);
  c.moveTo(x, y + h * 0.5);
  c.lineTo(x + w, y + h * 0.5);
  c.stroke();
  shape();
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.stroke();
  // Sill with a lit top.
  rrect(c, x - 5, y + h, w + 10, 6, 2);
  c.fillStyle = '#8a7a8a';
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.stroke();
}

function paintNeighbours(c: Ctx) {
  const r = seeded(91);
  const blocks: [number, number, number, number][] = [
    // x, width, top, colour
    [-20, 330, 250, 0x45283a],
    [310, 330, 320, 0x2e2c48],
    [1380, 260, 210, 0x3e2a36],
  ];
  for (const [x, w, top, col] of blocks) {
    // Wall lit from the upper left.
    c.fillStyle = rgb(dark(col, 0.1));
    c.fillRect(x, top, w, BASE - top);
    const lg = c.createLinearGradient(x, 0, x + w, 0);
    lg.addColorStop(0, rgb(light(col, 0.12), 0.9));
    lg.addColorStop(0.5, rgb(col, 0));
    lg.addColorStop(1, rgb(dark(col, 0.4), 0.8));
    c.fillStyle = lg;
    c.fillRect(x, top, w, BASE - top);
    // Brick courses.
    c.strokeStyle = rgb(dark(col, 0.35), 0.35);
    c.lineWidth = 1;
    for (let by = top + 10; by < BASE; by += 9) {
      c.beginPath();
      c.moveTo(x, by);
      c.lineTo(x + w, by);
      c.stroke();
    }
    grain(c, x, top, w, BASE - top, w * 1.2, x + 7, 0.05);
    // Cornice.
    rrect(c, x - 6, top - 10, w + 12, 14, 2);
    c.fillStyle = rgb(light(col, 0.25));
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.stroke();
    // Windows, three to four storeys.
    const cols = Math.floor((w - 30) / 62);
    const off = x + (w - cols * 62) / 2 + 12;
    for (let wy = top + 28; wy < BASE - 150; wy += 92)
      for (let i = 0; i < cols; i++) paintWindow(c, off + i * 62, wy, 38, 58, r() < 0.45, r, wy < top + 40);
    c.strokeStyle = INK;
    c.lineWidth = 2.5;
    c.strokeRect(x, top, w, BASE - top);
  }
  // Ground floor of the left house: a closed café with a teal awning and a lit display.
  paintShop(c, 30, 'CAFÉ', 0x2a7a72, r);
  // Next door: a small bar with a cyan neon script.
  paintShop(c, 360, 'BAR', 0x6b1a2e, r);
  // The house on the right: a dark entrance with a brass lamp.
  rrect(c, 1450, 470, 80, 130, 6);
  c.fillStyle = '#1a1020';
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.stroke();
  glowAt(c, 1490, 462, 50, 30, 0xffcf7a, 0.5);
  ellipse(c, 1490, 462, 7, 9);
  c.fillStyle = '#fff1c4';
  c.fill();
}

function paintShop(c: Ctx, x: number, label: string, awning: number, r: () => number) {
  const top = 470;
  const w = 250;
  // Shop window with a warm display.
  rrect(c, x + 10, top + 30, w - 20, BASE - top - 40, 4);
  const g = c.createLinearGradient(0, top + 30, 0, BASE - 10);
  g.addColorStop(0, '#ffcf8a');
  g.addColorStop(1, '#8a4a2a');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.stroke();
  // Little tables and chairs in the window.
  for (let i = 0; i < 3; i++) {
    const tx = x + 50 + i * 75;
    c.fillStyle = 'rgba(60,24,20,0.6)';
    ellipse(c, tx, BASE - 52, 18, 5);
    c.fill();
    c.fillRect(tx - 2, BASE - 52, 4, 32);
    if (r() < 0.6) {
      ellipse(c, tx + 12, BASE - 64, 6, 7);
      c.fill();
    }
  }
  glowAt(c, x + w / 2, top + 70, w * 0.5, 50, 0xfff0c8, 0.45);
  // Striped awning.
  c.beginPath();
  c.moveTo(x - 4, top);
  c.lineTo(x + w + 4, top);
  c.lineTo(x + w + 14, top + 34);
  c.lineTo(x - 14, top + 34);
  c.closePath();
  c.fillStyle = rgb(awning);
  c.fill();
  c.save();
  c.clip();
  for (let sx = x - 20; sx < x + w + 20; sx += 28) {
    c.fillStyle = 'rgba(255,240,215,0.85)';
    c.beginPath();
    c.moveTo(sx, top);
    c.lineTo(sx + 14, top);
    c.lineTo(sx + 16, top + 34);
    c.lineTo(sx + 2, top + 34);
    c.fill();
  }
  const sh = c.createLinearGradient(0, top, 0, top + 34);
  sh.addColorStop(0, 'rgba(255,255,255,0.15)');
  sh.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = sh;
  c.fillRect(x - 20, top, w + 40, 34);
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.stroke();
  // Scalloped edge.
  for (let sx = x - 14; sx < x + w + 14; sx += 20) {
    c.beginPath();
    c.arc(sx + 10, top + 34, 10, 0, Math.PI);
    c.fillStyle = rgb(dark(awning, 0.2));
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.stroke();
  }
  // Painted sign on the fascia above.
  c.font = '700 22px "Barlow Condensed", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(255,230,190,0.85)';
  c.fillText(label, x + w / 2, top - 14);
}

function paintFacade(c: Ctx) {
  const { x, w, top } = FACADE;
  const body = 0x4a1834;
  const lacquer = (x0: number, y0: number, ww: number, y1: number) => {
    c.fillStyle = vg(c, y0, y1, body);
    c.fillRect(x0, y0, ww, y1 - y0);
    const lg = c.createLinearGradient(x0, 0, x0 + ww, 0);
    lg.addColorStop(0, 'rgba(255,200,220,0.12)');
    lg.addColorStop(0.4, 'rgba(255,200,220,0)');
    lg.addColorStop(1, 'rgba(10,0,10,0.35)');
    c.fillStyle = lg;
    c.fillRect(x0, y0, ww, y1 - y0);
    grain(c, x0, y0, ww, y1 - y0, ww * 0.8, x0 + y0, 0.045);
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.strokeRect(x0, y0, ww, y1 - y0);
  };
  // Stepped art-deco silhouette: crown, tower, main body.
  lacquer(DOOR_X - 110, top - 110, 220, top - 50);
  lacquer(DOOR_X - 240, top - 56, 480, top + 4);
  lacquer(x, top, w, BASE);
  // Brass cornices at every step.
  for (const [x0, ww, y] of [[DOOR_X - 118, 236, top - 112], [DOOR_X - 248, 496, top - 60], [x - 10, w + 20, top - 6]]) {
    rrect(c, x0, y, ww, 12, 3);
    c.fillStyle = gold(c, x0, y, x0 + ww * 0.3, y + 12);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.stroke();
  }
  // Chevrons and the golden moth on the crown.
  c.strokeStyle = 'rgba(224,178,90,0.7)';
  c.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.moveTo(DOOR_X - 90 + i * 8, top - 56 - i * 0);
    c.lineTo(DOOR_X, top - 96 + i * 14);
    c.lineTo(DOOR_X + 90 - i * 8, top - 56);
    c.stroke();
  }
  drawEmblemRelief(c, DOOR_X, top - 132, 52);
  // Porthole windows on the tower.
  for (let i = 0; i < 5; i++) {
    const px = DOOR_X - 180 + i * 90;
    if (i === 2) continue;
    glowAt(c, px, top - 26, 30, 22, 0xffb860, 0.3);
    ellipse(c, px, top - 26, 14, 14);
    const g = c.createRadialGradient(px - 4, top - 30, 2, px, top - 26, 14);
    g.addColorStop(0, '#fff0c0');
    g.addColorStop(1, '#d08840');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = gold(c, px - 14, top - 40, px + 14, top - 12);
    c.lineWidth = 4;
    c.stroke();
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    ellipse(c, px, top - 26, 16, 16);
    c.stroke();
  }
  // Fluted brass-edged pilasters.
  for (const px of [x + 14, x + 186, x + w - 186 - 22, x + w - 14 - 22]) {
    const pw = 22;
    c.fillStyle = vg(c, top, BASE, 0x2a0e1e, 0.15, 0.2);
    c.fillRect(px, top + 6, pw, BASE - top - 36);
    for (let k = 0; k < 3; k++) {
      c.fillStyle = 'rgba(255,220,200,0.08)';
      c.fillRect(px + 3 + k * 6, top + 10, 2, BASE - top - 46);
    }
    c.fillStyle = gold(c, px, 0, px + 4, 0);
    c.fillRect(px - 2, top + 6, 3, BASE - top - 36);
    c.fillRect(px + pw - 1, top + 6, 3, BASE - top - 36);
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.strokeRect(px - 2, top + 6, pw + 4, BASE - top - 36);
    // Capital.
    rrect(c, px - 6, top + 4, pw + 12, 10, 2);
    c.fillStyle = gold(c, px, top, px + pw, top + 14);
    c.fill();
    c.stroke();
  }
  // Tall arched windows, two each side, two storeys.
  const r = seeded(5150);
  const wxs = [x + 52, x + 116, x + w - 52 - 54, x + w - 116 - 54];
  for (const wx of wxs) {
    paintWindow(c, wx, 380, 54, 86, true, r, true);
    paintWindow(c, wx, 488, 54, 70, r() < 0.8, r, true);
    // Little brass balconet on the upper ones.
    c.strokeStyle = gold(c, wx, 456, wx + 54, 470);
    c.lineWidth = 2.5;
    rrect(c, wx - 6, 456, 66, 14, 3);
    c.stroke();
    for (let k = 0; k < 6; k++) {
      c.beginPath();
      c.moveTo(wx - 1 + k * 11, 457);
      c.lineTo(wx - 1 + k * 11, 469);
      c.stroke();
    }
  }
  // Sign board (the neon letters and bulbs are live on top of it).
  const s = SIGN;
  glowAt(c, s.x + s.w / 2, s.y + s.h / 2, s.w * 0.62, s.h * 1.1, 0xff5fa2, 0.25);
  rrect(c, s.x - 8, s.y - 8, s.w + 16, s.h + 16, 26);
  c.fillStyle = gold(c, s.x, s.y, s.x + 80, s.y + s.h);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.stroke();
  rrect(c, s.x, s.y, s.w, s.h, 20);
  const sg = c.createLinearGradient(0, s.y, 0, s.y + s.h);
  sg.addColorStop(0, '#2a1024');
  sg.addColorStop(1, '#0e0610');
  c.fillStyle = sg;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.stroke();
  // Gloss edge, upper left.
  c.beginPath();
  c.moveTo(s.x - 4, s.y + s.h - 20);
  c.lineTo(s.x - 4, s.y + 16);
  c.quadraticCurveTo(s.x - 4, s.y - 4, s.x + 16, s.y - 4);
  c.lineTo(s.x + s.w * 0.5, s.y - 4);
  c.strokeStyle = 'rgba(255,248,220,0.85)';
  c.lineWidth = 2;
  c.stroke();
  for (let i = 0; i < 14; i++) {
    for (const by of [s.y + 11, s.y + s.h - 11]) {
      ellipse(c, s.x + 14 + i * ((s.w - 28) / 13), by, 4.5, 4.5);
      c.fillStyle = '#3a2418';
      c.fill();
    }
  }
  // Brackets holding the sign.
  for (const bx of [s.x + 70, s.x + s.w - 70]) {
    c.fillStyle = gold(c, bx - 6, s.y - 30, bx + 6, s.y);
    c.fillRect(bx - 4, s.y - 34, 8, 28);
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.strokeRect(bx - 4, s.y - 34, 8, 28);
  }
  // Marble plinth.
  c.fillStyle = vg(c, BASE - 30, BASE, 0x3a3040, 0.2, 0.4);
  c.fillRect(x - 6, BASE - 30, w + 12, 30);
  c.fillStyle = gold(c, x, BASE - 32, x + 60, BASE - 28);
  c.fillRect(x - 6, BASE - 32, w + 12, 4);
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.strokeRect(x - 6, BASE - 32, w + 12, 32);
}

/** Vertical gradient that keeps the dark lacquer readable. */
function vg(c: Ctx, y0: number, y1: number, col: number, top = 0.18, bottom = 0.35) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgb(light(col, top)));
  g.addColorStop(0.5, rgb(col));
  g.addColorStop(1, rgb(dark(col, bottom)));
  return g;
}

function drawEmblemRelief(c: Ctx, x: number, y: number, s: number) {
  glowAt(c, x, y, s * 1.4, s, 0xffcf7a, 0.35);
  for (const side of [-1, 1]) {
    for (const [ox, oy, rx, ry, rot] of [[0.3, -0.08, 0.34, 0.22, -0.45], [0.2, 0.2, 0.2, 0.15, 0.6]]) {
      c.save();
      c.translate(x + side * ox * s, y + oy * s);
      c.rotate(side * rot);
      ellipse(c, 0, 0, rx * s, ry * s);
      c.restore();
      c.fillStyle = gold(c, x - s * 0.6, y - s * 0.3, x + s * 0.3, y + s * 0.4);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.stroke();
    }
  }
  ellipse(c, x, y + 0.02 * s, 0.06 * s, 0.28 * s);
  c.fillStyle = '#7a4e18';
  c.fill();
  c.stroke();
}

function paintDoorway(c: Ctx) {
  // The warm interior seen through the open door: chandelier light over a checkered floor.
  const { l, r, top } = DOOR;
  c.save();
  rrect(c, l, top, r - l, BASE - top, 6);
  c.clip();
  const g = c.createLinearGradient(0, top, 0, BASE);
  g.addColorStop(0, '#ffe7a8');
  g.addColorStop(0.55, '#ffc66a');
  g.addColorStop(1, '#c87a3a');
  c.fillStyle = g;
  c.fillRect(l, top, r - l, BASE - top);
  for (let row = 0; row < 4; row++) {
    const y0 = BASE - 50 + row * 14;
    for (let i = -6; i < 7; i++) {
      if ((i + row) % 2) continue;
      c.fillStyle = 'rgba(90,40,30,0.4)';
      c.fillRect(DOOR_X + i * (16 + row * 3), y0, 16 + row * 3, 14);
    }
  }
  glowAt(c, DOOR_X, top + 40, 70, 40, 0xffffff, 0.8);
  c.restore();
  // Frame: deep brass jambs and a stepped lintel with a sunburst fan.
  const fl = l - 16;
  const fr = r + 16;
  c.fillStyle = gold(c, fl, top - 30, fl + 30, BASE);
  rrect(c, fl, top - 22, 16, BASE - top + 22, 3);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.stroke();
  rrect(c, r, top - 22, 16, BASE - top + 22, 3);
  c.fillStyle = gold(c, r, top - 30, r + 30, BASE);
  c.fill();
  c.stroke();
  rrect(c, fl - 4, top - 30, fr - fl + 8, 16, 3);
  c.fillStyle = gold(c, fl, top - 30, fl + 80, top - 14);
  c.fill();
  c.stroke();
}

function paintCanopy(c: Ctx) {
  const { l, r, top, bottom } = CANOPY;
  // Shadow it casts on the wall.
  glowAt(c, DOOR_X, bottom + 10, (r - l) * 0.55, 18, 0x0a0410, 0.5);
  // Chains back to the façade.
  c.strokeStyle = gold(c, l, top - 60, l + 20, top);
  c.lineWidth = 3;
  for (const [x0, x1] of [[l + 20, l + 60], [r - 20, r - 60]]) {
    c.beginPath();
    c.moveTo(x0, top + 4);
    c.lineTo(x1, top - 48);
    c.stroke();
  }
  // Top face, seen a little from above.
  c.beginPath();
  c.moveTo(l + 14, top - 10);
  c.lineTo(r - 14, top - 10);
  c.lineTo(r, top + 2);
  c.lineTo(l, top + 2);
  c.closePath();
  c.fillStyle = '#8a2a40';
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.stroke();
  // Velvet front face with gold piping.
  rrect(c, l, top, r - l, bottom - top, 4);
  c.fillStyle = vg(c, top, bottom, 0x7a1a32, 0.25, 0.4);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.stroke();
  c.fillStyle = gold(c, l, top, l + 60, top + 6);
  c.fillRect(l + 2, top + 3, r - l - 4, 4);
  c.fillRect(l + 2, bottom - 8, r - l - 4, 3);
  c.font = '18px Bungee, Impact, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffe2a0';
  c.fillText('CASINO', DOOR_X, (top + bottom) / 2 + 1);
  // Valance scallops.
  for (let sx = l; sx < r - 1; sx += 23) {
    c.beginPath();
    c.arc(sx + 11.5, bottom, 11.5, 0, Math.PI);
    c.fillStyle = '#5a1024';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.8;
    c.stroke();
    c.beginPath();
    c.arc(sx + 11.5, bottom + 11, 2.2, 0, Math.PI * 2);
    c.fillStyle = '#e0b25a';
    c.fill();
  }
}

function paintPavement(c: Ctx) {
  // Wet stone pavement, seen from slightly above.
  const g = c.createLinearGradient(0, BASE, 0, CURB);
  g.addColorStop(0, '#2a2232');
  g.addColorStop(1, '#3e3446');
  c.fillStyle = g;
  c.fillRect(0, BASE, W, CURB - BASE);
  // Slab seams in perspective.
  c.strokeStyle = 'rgba(10,6,16,0.6)';
  c.lineWidth = 1.5;
  for (const y of [BASE + 22, BASE + 50, BASE + 84]) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  for (let x = -100; x < W + 200; x += 96) {
    c.beginPath();
    c.moveTo(x, BASE);
    c.lineTo(DOOR_X + (x - DOOR_X) * 1.22, CURB);
    c.stroke();
  }
  c.strokeStyle = 'rgba(255,230,240,0.06)';
  for (const y of [BASE + 23, BASE + 51, BASE + 85]) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  // Reflections of lit windows and the sign in the wet stone.
  for (const wx of [FACADE.x + 79, FACADE.x + 143, FACADE.x + FACADE.w - 79, FACADE.x + FACADE.w - 143]) glowAt(c, wx, BASE + 40, 26, 60, 0xffb860, 0.22, 'lighter');
  glowAt(c, DOOR_X, BASE + 30, 260, 40, 0xff5fa2, 0.12, 'lighter');
  glowAt(c, DOOR_X, BASE + 20, 160, 50, 0xffcf7a, 0.35, 'lighter');
  // Kerb: lit top edge and the face.
  c.fillStyle = '#6a5e70';
  c.fillRect(0, CURB, W, 5);
  c.fillStyle = vg(c, CURB + 5, ROAD, 0x3a3240, 0.1, 0.4);
  c.fillRect(0, CURB + 5, W, ROAD - CURB - 5);
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, CURB);
  c.lineTo(W, CURB);
  c.moveTo(0, ROAD);
  c.lineTo(W, ROAD);
  c.stroke();
}

function paintRoad(c: Ctx) {
  const g = c.createLinearGradient(0, ROAD, 0, H);
  g.addColorStop(0, '#16131e');
  g.addColorStop(0.5, '#1d1a28');
  g.addColorStop(1, '#121019');
  c.fillStyle = g;
  c.fillRect(0, ROAD, W, H - ROAD);
  // Gutter water.
  c.fillStyle = 'rgba(120,130,190,0.12)';
  c.fillRect(0, ROAD, W, 6);
  const r = seeded(31);
  for (let i = 0; i < 900; i++) {
    c.fillStyle = r() < 0.5 ? 'rgba(255,240,255,0.04)' : 'rgba(0,0,0,0.12)';
    c.fillRect(r() * W, ROAD + r() * (H - ROAD), 2, 1.5);
  }
  // Long wet reflections: neon pink from the sign, gold from the lamps and the door.
  glowAt(c, DOOR_X, ROAD + 70, 220, 110, 0xff5fa2, 0.14, 'lighter');
  for (let i = 0; i < 9; i++) {
    const x = SIGN.x + 40 + i * 65 + r() * 20;
    glowAt(c, x, ROAD + 80 + r() * 30, 9, 70 + r() * 30, i % 3 === 1 ? 0xffcf7a : 0xff5fa2, 0.22, 'lighter');
  }
  for (const lx of LAMPS) {
    glowAt(c, lx, ROAD + 80, 18, 110, 0xffcf7a, 0.35, 'lighter');
    glowAt(c, lx, ROAD + 50, 60, 40, 0xffcf7a, 0.12, 'lighter');
  }
  // Puddles catching the sky.
  for (const [x, y, rx, ry] of [[260, 790, 90, 12], [700, 864, 120, 14], [1310, 812, 80, 10], [1500, 876, 110, 13], [90, 880, 70, 10]]) {
    ellipse(c, x, y, rx, ry);
    const pg = c.createLinearGradient(0, y - ry, 0, y + ry);
    pg.addColorStop(0, 'rgba(40,40,90,0.75)');
    pg.addColorStop(1, 'rgba(90,60,120,0.55)');
    c.fillStyle = pg;
    c.fill();
    c.strokeStyle = 'rgba(200,190,255,0.18)';
    c.lineWidth = 1.5;
    c.stroke();
  }
  // Dashed centre line, larger towards the viewer.
  for (let x = 30; x < W; x += 150) {
    c.beginPath();
    c.moveTo(x, 846);
    c.lineTo(x + 80, 846);
    c.lineTo(x + 84, 853);
    c.lineTo(x - 4, 853);
    c.closePath();
    c.fillStyle = 'rgba(240,226,190,0.32)';
    c.fill();
  }
}

function paintCarpet(c: Ctx) {
  const t = BASE + 2;
  const quad = (inset: number) => {
    c.beginPath();
    c.moveTo(DOOR.l + 14 + inset, t);
    c.lineTo(DOOR.r - 14 - inset, t);
    c.lineTo(DOOR_X + 112 - inset * 1.2, CURB);
    c.lineTo(DOOR_X + 112 - inset * 1.2, ROAD - 2);
    c.lineTo(DOOR_X - 112 + inset * 1.2, ROAD - 2);
    c.lineTo(DOOR_X - 112 + inset * 1.2, CURB);
    c.closePath();
  };
  quad(0);
  const g = c.createLinearGradient(0, t, 0, ROAD);
  g.addColorStop(0, '#9a1830');
  g.addColorStop(0.8, '#c42a40');
  g.addColorStop(0.81, '#7a1024');
  g.addColorStop(1, '#5a0a1a');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.stroke();
  quad(8);
  c.strokeStyle = 'rgba(224,178,90,0.85)';
  c.lineWidth = 2;
  c.stroke();
  glowAt(c, DOOR_X, t + 20, 90, 40, 0xffcf7a, 0.35, 'lighter');
  // Brass stanchions with velvet ropes along both sides.
  for (const side of [-1, 1]) {
    const posts = [
      [DOOR_X + side * 104, BASE + 26],
      [DOOR_X + side * 122, CURB - 6],
    ];
    const [a, b] = posts;
    c.beginPath();
    c.moveTo(a[0], a[1] - 30);
    c.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 18, b[0], b[1] - 30);
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.stroke();
    c.strokeStyle = '#a01a34';
    c.lineWidth = 3.5;
    c.stroke();
    for (const [px, py] of posts) {
      ellipse(c, px, py, 9, 3.5);
      c.fillStyle = 'rgba(10,4,16,0.5)';
      c.fill();
      rrect(c, px - 2.5, py - 34, 5, 34, 2);
      c.fillStyle = gold(c, px - 3, 0, px + 3, 0);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 1.5;
      c.stroke();
      ellipse(c, px, py - 36, 5, 5);
      c.fillStyle = gold(c, px - 5, py - 41, px + 5, py - 31);
      c.fill();
      c.stroke();
    }
  }
  // Potted topiaries beside the door.
  for (const px of [DOOR.l - 64, DOOR.r + 64]) {
    ellipse(c, px, BASE + 6, 26, 7);
    c.fillStyle = 'rgba(10,4,16,0.55)';
    c.fill();
    c.beginPath();
    c.moveTo(px - 20, BASE - 34);
    c.lineTo(px + 20, BASE - 34);
    c.lineTo(px + 14, BASE + 4);
    c.lineTo(px - 14, BASE + 4);
    c.closePath();
    c.fillStyle = gold(c, px - 20, BASE - 34, px + 10, BASE + 4);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.stroke();
    for (const [oy, rr] of [[-60, 24], [-104, 19], [-138, 13]]) {
      ellipse(c, px, BASE + oy, rr, rr);
      const lg = c.createRadialGradient(px - rr * 0.4, BASE + oy - rr * 0.4, 2, px, BASE + oy, rr);
      lg.addColorStop(0, '#5aa86a');
      lg.addColorStop(1, '#14402a');
      c.fillStyle = lg;
      c.fill();
      c.strokeStyle = INK;
      c.stroke();
    }
    c.fillStyle = '#3a2416';
    c.fillRect(px - 2, BASE - 82, 4, 22);
  }
}

function paintLampPost(c: Ctx, x: number) {
  const foot = CURB - 6;
  ellipse(c, x, foot, 22, 6);
  c.fillStyle = 'rgba(10,4,16,0.55)';
  c.fill();
  // Fluted base, slim post, ornate head.
  c.beginPath();
  c.moveTo(x - 14, foot);
  c.lineTo(x + 14, foot);
  c.lineTo(x + 8, foot - 40);
  c.lineTo(x - 8, foot - 40);
  c.closePath();
  c.fillStyle = vg(c, foot - 40, foot, 0x26222e, 0.3, 0.3);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.stroke();
  rrect(c, x - 4, foot - 250, 8, 214, 3);
  const pg = c.createLinearGradient(x - 4, 0, x + 4, 0);
  pg.addColorStop(0, '#5a5468');
  pg.addColorStop(1, '#16141c');
  c.fillStyle = pg;
  c.fill();
  c.stroke();
  // Curled arms.
  c.strokeStyle = INK;
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(x, foot - 230);
  c.quadraticCurveTo(x - 26, foot - 236, x - 22, foot - 252);
  c.moveTo(x, foot - 230);
  c.quadraticCurveTo(x + 26, foot - 236, x + 22, foot - 252);
  c.stroke();
  // Lantern: a glass cage with a brass cap.
  const ly = foot - 278;
  c.beginPath();
  c.moveTo(x - 14, ly);
  c.lineTo(x + 14, ly);
  c.lineTo(x + 10, ly + 30);
  c.lineTo(x - 10, ly + 30);
  c.closePath();
  const gg = c.createLinearGradient(0, ly, 0, ly + 30);
  gg.addColorStop(0, '#fffbe6');
  gg.addColorStop(1, '#ffc870');
  c.fillStyle = gg;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.stroke();
  c.beginPath();
  c.moveTo(x - 20, ly);
  c.lineTo(x, ly - 18);
  c.lineTo(x + 20, ly);
  c.closePath();
  c.fillStyle = gold(c, x - 20, ly - 18, x + 10, ly);
  c.fill();
  c.stroke();
  rrect(c, x - 8, ly + 30, 16, 6, 2);
  c.fill();
  c.stroke();
}

function paintStreet() {
  return paint(W, H, (c) => {
    paintSkyline(c);
    paintNeighbours(c);
    paintFacade(c);
    paintDoorway(c);
    paintPavement(c);
    paintRoad(c);
    paintCarpet(c);
    paintCanopy(c);
    for (const lx of LAMPS) paintLampPost(c, lx);
  }, 1.5);
}

// ---- Cars ----------------------------------------------------------------------------------------

const carCache = new Map<string, Texture>();

/** A 1930s car from the side, facing right; (150, 130) is the ground point under its middle. */
function carTexture(paintCol: number, taxi: boolean) {
  const key = `${paintCol}|${taxi}`;
  let t = carCache.get(key);
  if (t) return t;
  t = paint(320, 160, (c) => {
    c.translate(160, 140);
    const ink = (w = 2.5) => {
      c.strokeStyle = INK;
      c.lineWidth = w;
      c.stroke();
    };
    // Cabin and windows.
    c.beginPath();
    c.moveTo(-104, -66);
    c.lineTo(-96, -108);
    c.quadraticCurveTo(-92, -120, -78, -120);
    c.lineTo(22, -120);
    c.quadraticCurveTo(34, -120, 42, -108);
    c.lineTo(66, -66);
    c.closePath();
    c.fillStyle = vg(c, -120, -66, paintCol, 0.3, 0.2);
    c.fill();
    ink();
    for (const [x0, x1, sl] of [[-90, -28, 6], [-20, 38, 22]]) {
      c.beginPath();
      c.moveTo(x0, -70);
      c.lineTo(x0 + 4, -108);
      c.lineTo(x1, -108);
      c.lineTo(x1 + sl, -70);
      c.closePath();
      const wg = c.createLinearGradient(x0, -108, x1, -70);
      wg.addColorStop(0, '#4a5a8a');
      wg.addColorStop(0.5, '#1a2040');
      wg.addColorStop(1, '#2a1a3a');
      c.fillStyle = wg;
      c.fill();
      ink(2);
      // Reflection streak.
      c.save();
      c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.22)';
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(x0 + 10, -66);
      c.lineTo(x0 + 34, -112);
      c.stroke();
      c.restore();
    }
    // Lower body with fenders.
    c.beginPath();
    c.moveTo(-142, -40);
    c.quadraticCurveTo(-146, -70, -110, -70);
    c.lineTo(70, -70);
    c.quadraticCurveTo(120, -70, 140, -56);
    c.quadraticCurveTo(152, -46, 146, -30);
    c.lineTo(-138, -24);
    c.closePath();
    c.fillStyle = vg(c, -72, -24, paintCol, 0.32, 0.4);
    c.fill();
    ink();
    for (const wx of [-88, 88]) {
      c.beginPath();
      c.arc(wx, -24, 34, Math.PI, 0);
      c.fillStyle = rgb(dark(paintCol, 0.25));
      c.fill();
      ink();
      c.beginPath();
      c.arc(wx, -22, 27, Math.PI, 0);
      c.fillStyle = '#0c0810';
      c.fill();
    }
    // Running board and bumpers.
    rrect(c, -60, -30, 116, 7, 3);
    c.fillStyle = '#1b1820';
    c.fill();
    ink(1.5);
    for (const [bx, bw] of [[-150, 18], [138, 18]]) {
      rrect(c, bx, -36, bw, 9, 4);
      c.fillStyle = gold(c, bx, -36, bx + bw, -27);
      c.fill();
      ink(1.5);
    }
    // Door seams and handles.
    c.strokeStyle = rgb(dark(paintCol, 0.5));
    c.lineWidth = 1.8;
    for (const dx of [-96, -24, 46]) {
      c.beginPath();
      c.moveTo(dx, -108);
      c.lineTo(dx - 2, -30);
      c.stroke();
    }
    for (const hx of [-40, 30]) {
      rrect(c, hx, -62, 10, 3, 1.5);
      c.fillStyle = '#e8e0d0';
      c.fill();
    }
    if (taxi) {
      // Checker band.
      for (let i = 0; i < 26; i++) {
        c.fillStyle = i % 2 ? '#1b1820' : '#f2e6c9';
        c.fillRect(-130 + i * 10, -56, 10, 5);
        c.fillStyle = i % 2 ? '#f2e6c9' : '#1b1820';
        c.fillRect(-130 + i * 10, -51, 10, 5);
      }
      // Roof sign.
      rrect(c, -36, -136, 52, 17, 5);
      const sg = c.createLinearGradient(0, -136, 0, -119);
      sg.addColorStop(0, '#fff6d8');
      sg.addColorStop(1, '#ffcf7a');
      c.fillStyle = sg;
      c.fill();
      ink(2);
      c.font = '12px Bungee, Impact, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#2a1020';
      c.fillText('TAXI', -10, -127);
    } else {
      c.fillStyle = gold(c, -130, -56, 130, -52);
      c.fillRect(-130, -55, 268, 3);
    }
    // Headlamp, tail light.
    ellipse(c, 136, -58, 8, 9);
    c.fillStyle = '#fff6d8';
    c.fill();
    ink(2);
    rrect(c, -146, -64, 8, 10, 3);
    c.fillStyle = '#d0243a';
    c.fill();
    ink(1.5);
    // Rim light along the roof and hood.
    c.beginPath();
    c.moveTo(-92, -118);
    c.lineTo(22, -118);
    c.moveTo(70, -68);
    c.quadraticCurveTo(118, -68, 138, -55);
    c.strokeStyle = 'rgba(255,244,220,0.45)';
    c.lineWidth = 2.5;
    c.stroke();
  }, 1.5);
  carCache.set(key, t);
  return t;
}

let wheelTex: Texture | null = null;
function wheelTexture() {
  return (wheelTex ??= paint(60, 60, (c) => {
    c.translate(30, 30);
    ellipse(c, 0, 0, 25, 25);
    c.fillStyle = '#121016';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.stroke();
    ellipse(c, 0, 0, 17, 17);
    c.strokeStyle = '#e8e0d0';
    c.lineWidth = 3;
    c.stroke();
    ellipse(c, 0, 0, 13, 13);
    c.fillStyle = gold(c, -13, -13, 13, 13);
    c.fill();
    c.strokeStyle = '#7a4e18';
    c.lineWidth = 1.8;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
      c.stroke();
    }
    ellipse(c, 0, 0, 4, 4);
    c.fillStyle = '#fff4c2';
    c.fill();
  }, 2));
}

interface Car {
  c: Container;
  body: Container;
  wheels: Sprite[];
  brake: Sprite;
  v: number;
}

// ---- Weather ----------------------------------------------------------------------------------

let dropTex: Texture | null = null;
function dropTexture() {
  return (dropTex ??= paint(4, 48, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, 'rgba(200,215,255,0)');
    g.addColorStop(1, 'rgba(225,235,255,0.9)');
    c.fillStyle = g;
    c.fillRect(1, 0, 2, 48);
  }, 1));
}
let rippleTex: Texture | null = null;
function rippleTexture() {
  return (rippleTex ??= paint(40, 14, (c) => {
    ellipse(c, 20, 7, 18, 5.5);
    c.strokeStyle = 'rgba(220,230,255,0.85)';
    c.lineWidth = 1.4;
    c.stroke();
  }, 2));
}
let mistTex: Texture | null = null;
function mistTexture() {
  return (mistTex ??= paint(512, 128, (c) => {
    const r = seeded(12);
    for (let i = 0; i < 9; i++) glowAt(c, 60 + r() * 392, 64 + (r() - 0.5) * 30, 90 + r() * 70, 26 + r() * 16, 0xb8a8d8, 0.28);
  }, 0.5));
}

interface Drop {
  s: Sprite;
  x: number;
  y: number;
  v: number;
}

// ---- The street ----------------------------------------------------------------------------------

export class Street {
  readonly view = new Container();
  private world = new Container();
  private chars = new Container();
  private traffic = new Container();
  private rainLayer = new Container();
  private bulbs: Sprite[] = [];
  private canopyBulbs: Sprite[] = [];
  private sign!: Sprite;
  private signGlow!: Sprite;
  private signReflection!: Sprite;
  private lampGlows: Sprite[] = [];
  private doorLight!: Sprite;
  private doorSpill!: Sprite;
  /** Both entrance doors, redrawn while they swing inwards (0 shut, 1 open). */
  private doors = new Graphics();
  private doorman!: Chibi;
  private doormanWrap = new Container();
  private puffs: { s: Sprite; vx: number; vy: number; life: number }[] = [];
  private exhaust: { x: number; y: number; c: Container } | null = null;
  private puffAcc = 0;
  private moths: { c: Container; wings: Sprite; base: number; cx: number; cy: number; ph: number; sp: number }[] = [];
  private cars: Car[] = [];
  private time = 0;
  private nextCar = 2;
  private chibis: { ch: Chibi; dir: () => number | null }[] = [];
  private drops: Drop[] = [];
  private ripples: { s: Sprite; life: number }[] = [];
  private rippleAcc = 0;
  private mists: { s: Sprite; v: number; x0: number }[] = [];
  private mood: StreetMood = 'drizzle';
  private moon!: Sprite;
  private screenW = 1280;
  private screenH = 800;
  /** Camera: zoom 1 shows the whole street; the arrival zooms into the door. */
  private cam = { x: W / 2 + 180, y: H / 2, zoom: 1 };

  constructor(mood: StreetMood = 'drizzle') {
    this.view.addChild(this.world, this.rainLayer);
    // Endless night around the scene, for screens with another shape.
    this.world.addChild(new Graphics().rect(-3000, -3000, W + 6000, 3000).fill(0x07071a).rect(-3000, ROAD, W + 6000, 3000).fill(0x121019));
    const sky = new Sprite(paint(W, 1500, paintSky, 0.5));
    sky.position.set(0, -900);
    this.moon = new Sprite(paint(180, 180, paintMoon, 1.5));
    this.moon.position.set(170, 40);
    this.world.addChild(sky, this.moon);
    // Mist between the skyline and the street houses.
    this.addMist(BASE - 130, 0.35, 3);
    this.world.addChild(new Sprite(paintStreet()));
    // Pavements left and right of the scene for wide screens.
    this.world.addChild(new Graphics().rect(-3000, BASE, 3000, CURB - BASE).fill(0x342a3c).rect(W, BASE, 3000, CURB - BASE).fill(0x342a3c));

    // Light inside the door and the spill on the pavement when it opens.
    this.doorLight = this.glow(DOOR_X, BASE - 80, 420, 360, COLORS.lamp, 0.25);
    this.world.addChild(this.doors);
    this.drawDoors(0);
    this.doorSpill = this.glow(DOOR_X, BASE + 40, 420, 120, COLORS.lamp, 0);

    // Neon sign with chasing bulbs and its reflection in the wet road.
    this.signGlow = this.glow(DOOR_X, SIGN.y + SIGN.h / 2, 820, 220, COLORS.neon, 0.3);
    for (let i = 0; i < 28; i++) {
      const bx = SIGN.x + 14 + (i % 14) * ((SIGN.w - 28) / 13);
      const by = i < 14 ? SIGN.y + 11 : SIGN.y + SIGN.h - 11;
      this.bulbs.push(this.bulb(bx, by, 5));
    }
    this.sign = glowText(HOUSE_CAPS, { fontFamily: FONT_DISPLAY, fontSize: 64, fill: 0xfff0f6, letterSpacing: 6 }, { color: COLORS.neon, distance: 22, outerStrength: 3.5, innerStrength: 0.6 });
    // The house name may change (src/core/brand.ts): a longer one shrinks to fit the sign.
    const signFit = (SIGN.w - 56) / Math.max(1, this.sign.width);
    if (signFit < 1) this.sign.scale.set(signFit);
    this.sign.position.set(DOOR_X, SIGN.y + SIGN.h / 2 + 2);
    this.world.addChild(this.sign);
    this.signReflection = this.glow(DOOR_X, ROAD + 90, 640, 150, COLORS.neon, 0.16);
    for (let i = 0; i < 16; i++) this.canopyBulbs.push(this.bulb(CANOPY.l + 12 + i * ((CANOPY.r - CANOPY.l - 24) / 15), CANOPY.bottom - 4, 4));

    // Street lamps with moths.
    for (const lx of LAMPS) {
      const g = this.glow(lx, CURB - 270, 300, 300, COLORS.lamp, 0.5);
      this.lampGlows.push(g);
      this.glow(lx, CURB - 4, 220, 50, COLORS.lamp, 0.22);
      for (let i = 0; i < 4; i++) this.addMoth(lx, CURB - 272);
    }
    for (let i = 0; i < 3; i++) this.addMoth(DOOR_X, SIGN.y + SIGN.h / 2);

    // People stand on the pavement; cars pass in front of them.
    this.world.addChild(this.chars, this.traffic);
    this.doorman = new Chibi(COLORS.brass, { jacket: 0x6b1a2e, skin: 0xc68a5e, hair: 0x1b1b22, hat: 'topHat', hatColor: 0x6b1a2e, accessory: 'bowTie' });
    this.doormanWrap.addChild(this.doorman.view);
    this.doormanWrap.position.set(DOOR.r + 116, BASE + 36);
    this.doormanWrap.scale.set(1.3);
    this.chars.addChild(this.doormanWrap);
    this.chibis.push({ ch: this.doorman, dir: () => null });

    // Low mist over the road.
    this.addMist(ROAD + 20, 0.22, 3);
    this.setMood(mood);
    if (import.meta.env.DEV) (window as unknown as { __street?: Street }).__street = this;
  }

  private glow(x: number, y: number, w: number, h: number, tint: number, alpha: number) {
    const s = new Sprite(glowTexture());
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.width = w;
    s.height = h;
    s.tint = tint;
    s.alpha = alpha;
    s.blendMode = 'add';
    this.world.addChild(s);
    return s;
  }

  private bulb(x: number, y: number, r: number) {
    const s = new Sprite(glowTexture());
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.width = s.height = r * 5;
    s.tint = 0xffe7a8;
    s.blendMode = 'add';
    this.world.addChild(s);
    const core = new Graphics().circle(x, y, r * 0.8).fill(0xfff6e0);
    this.world.addChild(core);
    (s as Sprite & { core?: Graphics }).core = core;
    return s;
  }

  private addMist(y: number, alpha: number, n: number) {
    for (let i = 0; i < n; i++) {
      const s = new Sprite(mistTexture());
      s.anchor.set(0.5);
      s.width = 900;
      s.height = 160;
      s.alpha = alpha;
      const x0 = (i / n) * (W + 900) - 450;
      s.position.set(x0, y + (i % 2) * 30);
      this.world.addChild(s);
      this.mists.push({ s, v: 8 + Math.random() * 8, x0 });
    }
  }

  /** Clear night, drizzle or rain. Reduced motion keeps a third of the drops. */
  setMood(mood: StreetMood) {
    this.mood = mood;
    for (const d of this.drops) d.s.destroy();
    this.drops = [];
    const base = mood === 'clear' ? 0 : mood === 'drizzle' ? 70 : 190;
    const n = reducedMotion() ? Math.ceil(base / 3) : base;
    const tex = dropTexture();
    for (let i = 0; i < n; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5, 1);
      s.rotation = 0.12;
      s.tint = 0xd8e0ff;
      const v = 900 + Math.random() * 500;
      s.alpha = (mood === 'rain' ? 0.3 : 0.22) + Math.random() * 0.2;
      s.scale.set(1, mood === 'rain' ? 1 : 0.7);
      this.rainLayer.addChild(s);
      this.drops.push({ s, x: Math.random() * this.screenW, y: Math.random() * this.screenH, v });
    }
    for (const m of this.mists) m.s.alpha = mood === 'rain' ? 0.38 : mood === 'drizzle' ? 0.26 : 0.16;
  }

  /** Inward-swinging double doors: each leaf turns away from the viewer around its hinge. */
  private drawDoors(k: number) {
    const g = this.doors.clear();
    const top = DOOR.top;
    const hh = BASE - top;
    const half = (DOOR.r - DOOR.l) / 2;
    const theta = k * (Math.PI * 0.45);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    for (const side of [-1, 1]) {
      const hx = DOOR_X + side * half; // hinge
      const fx = hx - side * half * cos; // free edge
      // The free edge moves away into the room, so it looks a little shorter and higher.
      const shrink = 1 - sin * 0.14;
      const ft = top + (hh * (1 - shrink)) * 0.35;
      const fb = top + hh * shrink + (hh * (1 - shrink)) * 0.35;
      const pt = (u: number, v: number) => {
        const x = hx + (fx - hx) * u;
        const t0 = top + (ft - top) * u;
        const b0 = BASE + (fb - BASE) * u;
        return [x, t0 + (b0 - t0) * v];
      };
      const quad = (u0: number, u1: number, v0: number, v1: number) => [...pt(u0, v0), ...pt(u1, v0), ...pt(u1, v1), ...pt(u0, v1)];
      const shade = mix(0x5a2414, 0x24100a, sin * 0.7);
      g.poly(quad(0, 1, 0, 1)).fill(shade).stroke({ color: 0x160a14, width: 2.5, alpha: 0.9 });
      // Glass panels glowing with the light inside.
      g.poly(quad(0.18, 0.82, 0.08, 0.62)).fill({ color: 0xffd890, alpha: 0.8 - sin * 0.3 });
      g.poly(quad(0.18, 0.82, 0.08, 0.62)).stroke({ color: COLORS.brass, width: 2 });
      g.poly(quad(0.18, 0.82, 0.7, 0.92)).stroke({ color: COLORS.brass, width: 1.5, alpha: 0.8 });
      // Moth etched into the glass.
      const [mx, my] = pt(0.5, 0.33);
      g.ellipse(mx - 6 * cos, my, 7 * cos, 5).fill({ color: 0xb07a2a, alpha: 0.55 });
      g.ellipse(mx + 6 * cos, my, 7 * cos, 5).fill({ color: 0xb07a2a, alpha: 0.55 });
      // Push bar.
      const [px, py] = pt(0.86, 0.6);
      g.roundRect(px - 2.5, py - 16, 5, 32, 2.5).fill(COLORS.brass).stroke({ color: 0x160a14, width: 1 });
      // Upper-left rim light.
      const [ax, ay] = pt(0, 0);
      const [bx, by] = pt(1, 0);
      g.moveTo(ax, ay + 1.5).lineTo(bx, by + 1.5).stroke({ color: 0xfff4dc, width: 1.5, alpha: 0.4 });
    }
  }

  /** Warm moths tumble out of the opened doors towards the street. */
  private mothBurst() {
    const n = reducedMotion() ? 5 : 14;
    for (let i = 0; i < n; i++) {
      const c = new Container();
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.width = glow.height = 36;
      glow.tint = COLORS.lamp;
      glow.alpha = 0.6;
      glow.blendMode = 'add';
      const m = new Sprite(emblemTexture());
      m.anchor.set(0.5);
      m.width = m.height = 16;
      m.tint = 0xfff1c4;
      c.addChild(glow, m);
      const sx = DOOR_X + (Math.random() - 0.5) * 120;
      const sy = BASE - 40 - Math.random() * 110;
      c.position.set(sx, sy);
      this.world.addChild(c);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const dist = 120 + Math.random() * 220;
      const base = 16 / m.texture.width;
      const ph = Math.random() * 10;
      void animate(1400 + Math.random() * 900, (k) => {
        if (c.destroyed) return;
        c.position.set(sx + Math.cos(ang) * dist * k + Math.sin(k * 9 + ph) * 14, sy + Math.sin(ang) * dist * k);
        c.scale.set(1 + k * 0.8);
        c.alpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        m.scale.x = base * (0.35 + 0.65 * Math.abs(Math.cos(k * 60 + ph)));
      }).then(() => !c.destroyed && c.destroy({ children: true }));
    }
  }

  private addMoth(cx: number, cy: number) {
    const c = new Container();
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.width = glow.height = 30;
    glow.tint = COLORS.lamp;
    glow.alpha = 0.5;
    glow.blendMode = 'add';
    const wings = new Sprite(emblemTexture());
    wings.anchor.set(0.5);
    wings.width = wings.height = 14;
    wings.tint = 0xfff1c4;
    c.addChild(glow, wings);
    this.world.addChild(c);
    this.moths.push({ c, wings, base: 14 / wings.texture.width, cx, cy, ph: Math.random() * 10, sp: 1 + Math.random() * 1.5 });
  }

  private makeCar(taxi: boolean, facing = 1): Car & { door: Container } {
    const c = new Container();
    // The body sits on its springs above the wheels, so it can dip when braking.
    const body = new Container();
    body.pivot.set(0, -20);
    body.position.set(0, -20);
    const shadow = new Sprite(glowTexture());
    shadow.anchor.set(0.5);
    shadow.tint = 0x05020a;
    shadow.width = 330;
    shadow.height = 30;
    shadow.alpha = 0.8;
    c.addChild(shadow);
    const col = taxi ? 0xe0a030 : [0x1d2a4a, 0x2a2a30, 0x5a1a2a, 0x1f4a3e][Math.floor(Math.random() * 4)];
    const s = new Sprite(carTexture(col, taxi));
    s.anchor.set(0.5, 140 / 160);
    body.addChild(s);
    // Head and tail lights.
    const beam = new Sprite(glowTexture());
    beam.anchor.set(0.08, 0.5);
    beam.position.set(136, -58);
    beam.width = 300;
    beam.height = 70;
    beam.tint = 0xfff1c4;
    beam.alpha = 0.35;
    beam.blendMode = 'add';
    const brake = new Sprite(glowTexture());
    brake.anchor.set(0.5);
    brake.position.set(-142, -59);
    brake.width = 90;
    brake.height = 50;
    brake.tint = 0xff2a3a;
    brake.alpha = 0.12;
    brake.blendMode = 'add';
    body.addChild(beam, brake);
    c.addChild(body);
    const wheels: Sprite[] = [];
    for (const wx of [-88, 88]) {
      const w = new Sprite(wheelTexture());
      w.anchor.set(0.5);
      w.position.set(wx, -24);
      w.scale.set(54 / 60);
      c.addChild(w);
      wheels.push(w);
    }
    c.scale.x = facing;
    this.traffic.addChild(c);
    return { c, body, wheels, brake, v: 0, door: body };
  }

  resize(w: number, h: number) {
    this.screenW = w;
    this.screenH = h;
    // Tall screens see the sky above the house instead of the left street: the moon moves there.
    this.moon?.position.set(...((h > w * 1.2 ? [1130, -330] : [170, 40]) as [number, number]));
    for (const d of this.drops) {
      d.x = Math.random() * w;
      d.y = Math.random() * h;
    }
    this.applyCam();
  }

  private applyCam() {
    // "Cover" the screen; on narrow screens keep the door in view.
    // Portrait screens: keep the whole sign in view and let the sky fill the space above.
    const base = Math.min(Math.max(this.screenW / W, this.screenH / H), this.screenW / 760);
    const z = base * this.cam.zoom;
    this.world.scale.set(z);
    let x = this.screenW / 2 - this.cam.x * z;
    let y = this.screenH / 2 - this.cam.y * z;
    x = Math.min(0, Math.max(this.screenW - W * z, x));
    if (H * z >= this.screenH) y = Math.min(0, Math.max(this.screenH - H * z, y));
    else y = Math.max(this.screenH - H * z - this.screenH * 0.12, Math.min(y, this.screenH * 0.35));
    this.world.position.set(x, y);
  }

  update(dtMs: number) {
    const dt = Math.min(dtMs, 100) / 1000;
    this.time += dt;
    this.bulbs.forEach((b, i) => {
      const on = Math.floor(this.time * 6 + i) % 3 === 0;
      b.alpha = on ? 0.9 : 0.25;
      (b as Sprite & { core?: Graphics }).core!.alpha = on ? 1 : 0.45;
    });
    this.canopyBulbs.forEach((b, i) => {
      const on = Math.floor(this.time * 4 - i) % 4 !== 0;
      b.alpha = on ? 0.8 : 0.2;
      (b as Sprite & { core?: Graphics }).core!.alpha = on ? 1 : 0.5;
    });
    const flick = Math.sin(this.time * 29) > 0.985 || (Math.sin(this.time * 0.7) > 0.995 && Math.sin(this.time * 41) > 0);
    this.sign.alpha = flick ? 0.55 : 1;
    this.signGlow.alpha = flick ? 0.12 : 0.28 + Math.sin(this.time * 2) * 0.03;
    this.signReflection.alpha = flick ? 0.06 : 0.16 + Math.sin(this.time * 2) * 0.02;
    this.lampGlows.forEach((g, i) => (g.alpha = 0.48 + Math.sin(this.time * 3.1 + i * 2) * 0.03));
    for (const m of this.moths) {
      const a = this.time * m.sp + m.ph;
      m.c.position.set(m.cx + Math.cos(a) * 34 + Math.sin(a * 2.3) * 10, m.cy + Math.sin(a * 1.4) * 22);
      m.wings.scale.x = m.base * (0.35 + 0.65 * Math.abs(Math.cos(this.time * 24 + m.ph)));
    }
    for (const m of this.mists) {
      m.s.x += m.v * dt;
      if (m.s.x > W + 500) m.s.x -= W + 1000;
    }
    this.updateWeather(dt);
    // Passing traffic in the near lane, driving to the left.
    this.nextCar -= dt;
    if (this.nextCar <= 0) {
      this.nextCar = 6 + Math.random() * 8;
      const car = this.makeCar(false, -1);
      car.c.position.set(W + 260, LANE_NEAR);
      car.v = -(380 + Math.random() * 160);
      this.cars.push(car);
    }
    for (const car of [...this.cars]) {
      car.c.x += car.v * dt;
      for (const w of car.wheels) w.rotation += Math.abs(car.v * dt) / 27;
      if (car.c.x < -300 || car.c.x > W + 300) {
        car.c.destroy({ children: true });
        this.cars.splice(this.cars.indexOf(car), 1);
      }
    }
    for (const ch of this.chibis) ch.ch.update(dtMs, ch.dir());
    // Exhaust from the taxi while its engine runs.
    if (this.exhaust) {
      this.puffAcc += dt;
      if (this.puffAcc > 0.09) {
        this.puffAcc = 0;
        const p = new Sprite(glowTexture());
        p.anchor.set(0.5);
        p.width = p.height = 26;
        p.tint = 0xbfb8c8;
        p.alpha = 0.35;
        const ex = this.exhaust;
        p.position.set(ex.c.x + ex.x, ex.c.y + ex.y);
        this.traffic.addChild(p);
        this.puffs.push({ s: p, vx: -40 - Math.random() * 30, vy: -18 - Math.random() * 12, life: 0 });
      }
    }
    for (const p of [...this.puffs]) {
      p.life += dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.width = p.s.height = 26 * (1 + p.life * 2.2);
      p.s.alpha = Math.max(0, 0.35 * (1 - p.life / 1.1));
      if (p.life > 1.1) {
        p.s.destroy();
        this.puffs.splice(this.puffs.indexOf(p), 1);
      }
    }
    this.applyCam();
  }

  private updateWeather(dt: number) {
    const sw = this.screenW;
    const sh = this.screenH;
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x += d.v * 0.12 * dt;
      if (d.y > sh + 40) {
        d.y = -Math.random() * 60;
        d.x = Math.random() * (sw + 100) - 100;
      }
      d.s.position.set(d.x, d.y);
    }
    if (this.mood === 'clear') return;
    // Rings on the wet pavement and the road.
    this.rippleAcc += dt * (this.mood === 'rain' ? 14 : 5) * (reducedMotion() ? 0.34 : 1);
    while (this.rippleAcc > 1) {
      this.rippleAcc -= 1;
      const s = new Sprite(rippleTexture());
      s.anchor.set(0.5);
      const y = BASE + 10 + Math.random() * (H - BASE - 10);
      s.position.set(Math.random() * W, y);
      const k = 0.6 + (y - BASE) / (H - BASE);
      s.scale.set(0.3 * k);
      s.alpha = 0.5;
      this.chars.addChildAt(s, 0);
      this.ripples.push({ s, life: 0 });
    }
    for (const r of [...this.ripples]) {
      r.life += dt;
      const k = r.life / 0.6;
      const sc = (0.6 + (r.s.y - BASE) / (H - BASE)) * (0.3 + k * 0.9);
      r.s.scale.set(sc);
      r.s.alpha = 0.5 * (1 - k);
      if (k >= 1) {
        r.s.destroy();
        this.ripples.splice(this.ripples.indexOf(r), 1);
      }
    }
  }

  /** The arrival: the taxi pulls up, you step onto the red carpet, the doors swing open. */
  async arrive(look: Look) {
    this.nextCar = 999;
    sfx.ignition();
    const engine = sfx.car();
    engine.set(0.75, 0.9, 0.4);
    const taxi = this.makeCar(true, 1);
    // The rear door stops right at the carpet.
    const stopX = DOOR_X + 62;
    taxi.c.position.set(-320, LANE_KERB);
    this.exhaust = { x: -150, y: -30, c: taxi.c };
    const startX = taxi.c.x;
    void tween(this.cam, { x: DOOR_X - 20, zoom: 1.12 }, 2400, ease.inOutCubic);
    let braking = false;
    await animate(2300, (k) => {
      const x = startX + (stopX - startX) * ease.outCubic(k);
      for (const w of taxi.wheels) w.rotation += (x - taxi.c.x) / 27;
      taxi.c.x = x;
      if (k > 0.55 && !braking) {
        braking = true;
        sfx.brake();
        engine.set(0.2, 0.3, 0.5);
      }
      // Nose dips while braking.
      taxi.body.rotation = braking ? Math.sin(Math.min(1, (k - 0.55) / 0.45) * Math.PI) * 0.03 : 0;
      taxi.brake.alpha = braking ? 0.85 : 0.12;
    });
    engine.set(0.12, 0, 0.3);
    sfx.handbrake();
    void animate(500, (k) => (taxi.body.rotation = -Math.sin(k * Math.PI * 2) * 0.01 * (1 - k)));
    void tween(taxi.brake, { alpha: 0.12 }, 500);
    await wait(300);
    // You get out on the kerb side: the car rocks as your weight leaves it and you rise into view behind it.
    sfx.carDoorOpen();
    void animate(400, (k) => (taxi.body.y = -20 + Math.sin(k * Math.PI) * 2.5));
    const you = new Chibi(look.color, look);
    const wrap = new Container();
    wrap.addChild(you.view);
    wrap.scale.set(1.35);
    wrap.position.set(DOOR_X, CURB + 26);
    wrap.alpha = 0;
    this.chars.addChild(wrap);
    let walkDir: number | null = null;
    this.chibis.push({ ch: you, dir: () => walkDir });
    you.faceTowards(Math.PI / 2);
    await tween(wrap, { alpha: 1, y: CURB + 6 }, 380, ease.outCubic);
    await wait(120);
    sfx.carDoor();
    void animate(250, (k) => (taxi.body.rotation = Math.sin(k * Math.PI * 3) * 0.006 * (1 - k)));
    sfx.horn();
    // The doorman turns to you and bows.
    this.doorman.faceTowards(Math.PI * 0.8);
    void animate(1100, (k) => {
      const b = Math.sin(Math.min(1, k * 1.3) * Math.PI);
      this.doormanWrap.rotation = b * 0.16;
      this.doormanWrap.scale.y = 1.3 * (1 - b * 0.05);
    }, ease.linear);
    // The taxi pulls away: revs, a gear change, revs again.
    engine.set(0.7, 0.4, 0.25);
    void wait(900).then(() => engine.set(0.4, 0.7, 0.12));
    void wait(1050).then(() => engine.set(0.8, 1, 0.35));
    void wait(1900).then(() => engine.stop());
    void animate(2200, (k) => {
      if (taxi.c.destroyed) return;
      const x = stopX + 1300 * k * k;
      for (const w of taxi.wheels) w.rotation += (x - taxi.c.x) / 27;
      taxi.c.x = x;
      taxi.body.rotation = -Math.sin(Math.min(1, k * 3) * Math.PI) * 0.02;
    }, ease.linear).then(() => {
      this.exhaust = null;
      if (!taxi.c.destroyed) taxi.c.destroy({ children: true });
    });
    await wait(350);
    // Up the carpet, away from the viewer.
    walkDir = -Math.PI / 2;
    void tween(this.cam, { x: DOOR_X, y: BASE - 110, zoom: 1.6 }, 2300, ease.inOutCubic);
    void wait(1200).then(() => {
      sfx.bigDoors();
      void animate(900, (k) => !this.doors.destroyed && this.drawDoors(k), ease.outCubic);
      void tween(this.doorLight, { alpha: 0.75, width: 760, height: 600 }, 900, ease.outCubic);
      void tween(this.doorSpill, { alpha: 0.7, width: 560, height: 180 }, 900, ease.outCubic);
      this.mothBurst();
    });
    // Further away means a little smaller.
    void tween(wrap.scale, { x: 1.18, y: 1.18 }, 2100, ease.linear);
    await tween(wrap, { y: BASE + 4 }, 2100, ease.linear);
    void tween(this.doormanWrap, { rotation: 0 }, 300);
    await wait(150);
    void tween(wrap, { y: BASE - 14, alpha: 0 }, 900, ease.inCubic);
    void tween(wrap.scale, { x: 1, y: 1 }, 900, ease.inCubic);
    await tween(this.cam, { zoom: 3.2, y: BASE - 80 }, 1000, ease.inCubic);
    walkDir = null;
  }

  destroy() {
    this.view.destroy({ children: true });
  }
}

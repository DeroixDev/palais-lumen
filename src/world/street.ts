// The street in front of the house at night, painted in the 3/4 look of the game: the art-deco
// grand hotel in night blue and brass, five lit floors in the colours of their light era
// (candle, moon, gas, neon and the dome), the glass dome with the moon lamp sweeping its two
// beams over the sky, the marquee sign, globe lamps and rising sparks. It is the backdrop of
// the start screen and the stage for the arrival: the taxi pulls up, you step onto the red
// carpet, the doorman bows and the doors swing open.

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS, glowTexture, reducedMotion } from '../core/fx';
import { animate, ease, tween, wait } from '../core/tween';
import { sfx } from '../core/audio';
import { Chibi } from './painted/chibi';
import type { PlayerLook } from './player';
import { INK, dark, ellipse, fillInk, glowAt, gold, light, mix, paint, rgb, rrect, seeded, shadow, type Ctx } from './painted/brush';

import { HOUSE_CAPS, HOUSE_TAGLINE } from '../core/brand';

/** World width: wide enough that landscape screens never run out of street. */
const W = 2600;
const H = 900;
/** Where the façade meets the pavement. */
const BASE = 600;
/** Front edge of the pavement (top of the kerb). */
const CURB = 702;
/** Where the road starts below the kerb. */
const ROAD = 720;
const DOOR_X = W / 2;
/** Façade scale: the house is drawn in its own units (0 at the door sill, up is negative). */
const FS = 1.2;
const fx = (u: number) => DOOR_X + u * FS;
const fy = (v: number) => BASE + v * FS;
/** The entrance in façade units, and in world units. */
const DW = 120;
const DH = 124;
const DOOR = { l: fx(-DW / 2), r: fx(DW / 2), top: fy(-DH) };
/** Lanes: the taxi stops at the kerb, other traffic passes in the near lane. */
const LANE_KERB = 800;
const LANE_NEAR = 884;
/** Globe lamps on the kerb, in façade units from the door. */
const LAMPS = [-360, -178, 178, 360];
/** What the title camera keeps in view (world units): the dome lantern down to the kerb. */
const FRAME = { top: fy(-860), bottom: CURB + 16, minW: 780 };
/** The painted façade layer: its own canvas around the house. */
const FAC = { x: DOOR_X - 640, y: fy(-870), w: 1280, h: ROAD + 2 - fy(-870) };

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

/** Five floors, five ages of light, from the candle hall up to the moon lamp under the dome. */
const FLOORS = [
  { col: 0xffb347, glassTop: 0xffe2a0, glassBot: 0xd0701e, kind: 'candle' },
  { col: 0xa8c8ff, glassTop: 0xeef4ff, glassBot: 0x5a78c0, kind: 'moon' },
  { col: 0xe6eca0, glassTop: 0xfafbd8, glassBot: 0x98a050, kind: 'gas' },
  { col: 0xff5fa2, glassTop: 0x3a0c3a, glassBot: 0x12061e, kind: 'neon' },
  { col: 0xfff2d0, glassTop: 0xffffff, glassBot: 0xe8c890, kind: 'dome' },
] as const;

interface Lit {
  x: number;
  y: number;
  w: number;
  h: number;
  floor: number;
  alt: boolean;
  ph: number;
}

/** Collected while the façade is painted: where the live glows go. */
interface Spots {
  windows: Lit[];
  bulbs: { x: number; y: number; canopy: boolean }[];
  lamps: { x: number; y: number }[];
  lens: { x: number; y: number };
}

// ---- Painting the backdrop ----------------------------------------------------------------------

/** Sky canvas: spans y -1100..600 and reaches past the street on both sides. */
const SKY = { x: -1200, y: -1100, w: W + 2400, h: 1700 };
function paintSky(c: Ctx) {
  c.translate(-SKY.x, -SKY.y);
  const g = c.createLinearGradient(0, SKY.y, 0, BASE);
  g.addColorStop(0, '#03040f');
  g.addColorStop(0.45, '#070b22');
  g.addColorStop(0.72, '#0e1638');
  g.addColorStop(0.9, '#1e2452');
  g.addColorStop(1, '#3a2c58');
  c.fillStyle = g;
  c.fillRect(SKY.x, SKY.y, SKY.w, SKY.h);
  const r = seeded(7);
  for (let i = 0; i < 900; i++) {
    const x = SKY.x + r() * SKY.w;
    const y = SKY.y + r() * (BASE - 120 - SKY.y);
    const a = (0.2 + r() * 0.6) * Math.min(1, (BASE - y) / 500);
    const sz = r() < 0.92 ? 1.6 : 2.8;
    c.fillStyle = `rgba(230,236,255,${a})`;
    c.fillRect(x, y, sz, sz);
  }
  // Veil clouds, lit by the moon.
  for (const [x, y, w, a] of [[0.3, -300, 0.4, 0.12], [0.75, -520, 0.32, 0.1], [0.6, -60, 0.5, 0.08], [0.15, 120, 0.3, 0.07]]) {
    glowAt(c, SKY.x + SKY.w * x, y, SKY.w * w * 0.5, 34, 0x8090c0, a);
  }
  // City glow at the horizon.
  glowAt(c, DOOR_X, BASE, 1600, 260, 0x4a3a80, 0.35);
}

function paintMoon(c: Ctx) {
  const m = 120;
  const mr = 52;
  glowAt(c, m, m, mr * 2.3, mr * 2.3, 0x8ea8ff, 0.2);
  glowAt(c, m, m, mr * 1.5, mr * 1.5, 0xdfe8ff, 0.3);
  const mg = c.createRadialGradient(m - mr * 0.35, m - mr * 0.35, mr * 0.1, m, m, mr);
  mg.addColorStop(0, '#fffdf2');
  mg.addColorStop(0.7, '#e6e8f0');
  mg.addColorStop(1, '#b8bfd6');
  c.beginPath();
  c.arc(m, m, mr, 0, Math.PI * 2);
  c.fillStyle = mg;
  c.fill();
  const r = seeded(3);
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * mr * 0.6;
    ellipse(c, m + Math.cos(a) * d, m + Math.sin(a) * d, mr * (0.08 + r() * 0.12), mr * (0.07 + r() * 0.1));
    c.fillStyle = 'rgba(150,160,190,0.35)';
    c.fill();
  }
}

/** The far city: two rows of houses with scattered lit windows, the back row hazier. */
const CITY = { y: BASE - 470 };
function paintCity(c: Ctx) {
  c.translate(0, -CITY.y);
  const r = seeded(11);
  for (const [depth, col, hmax] of [[0, 0x141a3a, 380], [1, 0x0c1028, 260]] as const) {
    let x = -20;
    while (x < W + 20) {
      const w = 70 + r() * 130;
      const h = 90 + r() * hmax;
      c.fillStyle = rgb(col);
      c.fillRect(x, BASE - h, w + 1, h);
      if (r() < 0.3) c.fillRect(x + w * 0.3, BASE - h - 22, w * 0.4, 22);
      else if (r() < 0.15) {
        c.beginPath();
        c.moveTo(x + w / 2 - 6, BASE - h);
        c.lineTo(x + w / 2, BASE - h - 50);
        c.lineTo(x + w / 2 + 6, BASE - h);
        c.fill();
      }
      for (let wy = BASE - h + 14; wy < BASE - 30; wy += 26)
        for (let wx = x + 9; wx < x + w - 12; wx += 19)
          if (r() < 0.22) {
            c.fillStyle = r() < 0.7 ? `rgba(255,200,120,${depth ? 0.55 : 0.35})` : `rgba(170,200,255,${depth ? 0.45 : 0.3})`;
            c.fillRect(wx, wy, 7, 11);
          }
      x += w + r() * 12;
    }
    const hz = c.createLinearGradient(0, BASE - 240, 0, BASE);
    hz.addColorStop(0, 'rgba(40,40,90,0)');
    hz.addColorStop(1, `rgba(60,46,96,${depth ? 0.5 : 0.35})`);
    c.fillStyle = hz;
    c.fillRect(0, BASE - 240, W, 240);
  }
}

// ---- The house ----------------------------------------------------------------------------------

const FACADE = 0x232c58;

function facadeFill(c: Ctx, x0: number, x1: number, y0: number, y1: number, col = FACADE) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgb(dark(col, 0.35)));
  g.addColorStop(0.7, rgb(col));
  g.addColorStop(1, rgb(light(col, 0.06)));
  c.fillStyle = g;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Vertical flutes, like brushed limestone in the night light.
  for (let x = x0 + 6; x < x1; x += 12) {
    c.fillStyle = 'rgba(255,255,255,0.025)';
    c.fillRect(x, y0, 2, y1 - y0);
  }
}

function brassBand(c: Ctx, x0: number, x1: number, y: number, h = 6) {
  c.fillStyle = gold(c, 0, y, 0, y + h);
  c.fillRect(x0, y, x1 - x0, h);
  c.fillStyle = 'rgba(6,6,16,0.6)';
  c.fillRect(x0, y + h, x1 - x0, 2);
}

/** Art-deco sunburst fan: rays from one point, alternately wide and narrow. */
function sunburst(c: Ctx, x: number, y: number, r: number, a0: number, a1: number, n: number, colA: string, colB: string, inner = 0) {
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    c.beginPath();
    c.moveTo(x + Math.cos(t0) * inner, y + Math.sin(t0) * inner);
    c.lineTo(x + Math.cos(t0) * r, y + Math.sin(t0) * r);
    c.lineTo(x + Math.cos(t1) * r, y + Math.sin(t1) * r);
    c.lineTo(x + Math.cos(t1) * inner, y + Math.sin(t1) * inner);
    c.closePath();
    c.fillStyle = i % 2 ? colB : colA;
    c.fill();
  }
}

/** A window lit in the colour of its floor's light era; the glow on top of it lives. */
function windowAt(c: Ctx, sp: Spots, x: number, y: number, w: number, h: number, floor: number, opts: { arch?: boolean; alt?: boolean } = {}) {
  const F = FLOORS[floor];
  const arch = !!opts.arch;
  const shape = (pad: number, bottomPad: number) => {
    c.beginPath();
    if (arch) {
      c.moveTo(x - w / 2 - pad, y + h + bottomPad);
      c.lineTo(x - w / 2 - pad, y + w / 2);
      c.arc(x, y + w / 2, w / 2 + pad, Math.PI, Math.PI * 2);
      c.lineTo(x + w / 2 + pad, y + h + bottomPad);
    } else c.rect(x - w / 2 - pad, y - pad, w + pad * 2, h + pad + bottomPad);
    c.closePath();
  };
  // Reveal.
  shape(4, 3);
  c.fillStyle = '#0a0c1e';
  c.fill();
  // Glass.
  shape(0, 0);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, rgb(F.glassTop));
  g.addColorStop(1, rgb(F.glassBot));
  c.fillStyle = g;
  c.fill();
  c.save();
  c.clip();
  // What one glimpses inside.
  if (F.kind === 'candle') {
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.moveTo(x + sx * (w / 2), y - 2);
      c.quadraticCurveTo(x + sx * (w * 0.2), y + h * 0.4, x + sx * (w * 0.38), y + h);
      c.lineTo(x + sx * (w / 2), y + h);
      c.closePath();
      c.fillStyle = 'rgba(120,20,40,0.85)';
      c.fill();
    }
    glowAt(c, x, y + h * 0.35, w * 0.4, w * 0.4, 0xfff0c0, 0.7);
    for (let k = -1; k <= 1; k++) {
      c.fillStyle = 'rgba(80,30,10,0.6)';
      c.fillRect(x + k * w * 0.18 - 1, y + h * 0.3, 2, 8);
    }
  } else if (F.kind === 'moon') {
    for (let k = 0; k < 4; k++) {
      const px = x - w / 2 + (k + 0.5) * (w / 4);
      ellipse(c, px, y + h * 0.85, w * 0.22, h * 0.32);
      c.fillStyle = 'rgba(30,60,70,0.55)';
      c.fill();
    }
    ellipse(c, x + w * 0.15, y + h * 0.25, w * 0.12, w * 0.12);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fill();
  } else if (F.kind === 'gas') {
    c.save();
    c.translate(x - w * 0.15, y + h * 0.65);
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = i % 2 ? w * 0.3 : w * 0.24;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    c.fillStyle = 'rgba(70,74,30,0.55)';
    c.fill();
    c.restore();
    c.fillStyle = 'rgba(70,74,30,0.5)';
    c.fillRect(x - w / 2, y + h * 0.18, w, 2);
  } else if (F.kind === 'neon') {
    const pink = opts.alt ? 0x5fe3ff : 0xff5fa2;
    c.strokeStyle = rgb(pink, 0.95);
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(x - w * 0.35, y + h * 0.3);
    c.lineTo(x + w * 0.35, y + h * 0.3);
    c.moveTo(x - w * 0.3, y + h * 0.55);
    c.lineTo(x, y + h * 0.42);
    c.lineTo(x + w * 0.3, y + h * 0.55);
    c.stroke();
    glowAt(c, x, y + h * 0.42, w * 0.7, h * 0.5, pink, 0.45, 'lighter');
  } else glowAt(c, x, y + h * 0.5, w, h, 0xffffff, 0.4);
  // Glazing bars.
  c.strokeStyle = 'rgba(10,12,30,0.85)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x, y + h);
  c.moveTo(x - w / 2, y + h * 0.62);
  c.lineTo(x + w / 2, y + h * 0.62);
  c.stroke();
  c.restore();
  // Brass frame and sill.
  shape(0, 0);
  c.strokeStyle = gold(c, x - w / 2, y, x + w / 2, y + h);
  c.lineWidth = 2;
  c.stroke();
  c.fillStyle = gold(c, 0, y + h, 0, y + h + 5);
  c.fillRect(x - w / 2 - 6, y + h + 1, w + 12, 4);
  sp.windows.push({ x: fx(x), y: fy(y + h * 0.5), w: w * FS, h: h * FS, floor, alt: !!opts.alt, ph: (x * 0.37 + y * 0.11) % 10 });
}

function wings(c: Ctx, sp: Spots) {
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -430 : 280;
    const x1 = sx < 0 ? -280 : 430;
    facadeFill(c, x0, x1, -300, 0, 0x1c2448);
    brassBand(c, x0, x1, -300, 5);
    // Balustrade.
    for (let x = x0 + 8; x < x1 - 4; x += 12) {
      c.fillStyle = 'rgba(200,170,110,0.5)';
      c.fillRect(x, -318, 4, 14);
    }
    c.fillStyle = gold(c, 0, -322, 0, -317);
    c.fillRect(x0, -322, x1 - x0, 4);
    brassBand(c, x0, x1, -150, 4);
    for (const x of sx < 0 ? [-395, -315] : [315, 395]) {
      windowAt(c, sp, x, -128, 40, 92, 0, { arch: true });
      windowAt(c, sp, x, -232, 34, 64, 1);
    }
    // Corner pier.
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(sx < 0 ? x1 - 6 : x0, -300, 6, 300);
  }
}

function mainBlock(c: Ctx, sp: Spots) {
  facadeFill(c, -280, 280, -440, 0);
  // Cornices between the floors.
  for (const y of [-150, -245, -340]) brassBand(c, -280, 280, y, 5);
  brassBand(c, -290, 290, -446, 8);
  for (let x = -286; x < 286; x += 10) {
    c.fillStyle = '#c9963e';
    c.fillRect(x, -437, 5, 4);
  }
  // Pilasters with gilded edges.
  for (const x of [-280, -205, -145, 145, 205, 280]) {
    const g = c.createLinearGradient(x - 9, 0, x + 9, 0);
    g.addColorStop(0, rgb(dark(FACADE, 0.35)));
    g.addColorStop(0.4, rgb(light(FACADE, 0.12)));
    g.addColorStop(1, rgb(dark(FACADE, 0.45)));
    c.fillStyle = g;
    c.fillRect(x - 9, -440, 18, 420);
    c.fillStyle = gold(c, x - 1, 0, x + 1, 0);
    c.fillRect(x - 1, -430, 2, 410);
  }
  // Floors 2 to 4 (moon garden, lantern works, club).
  const cols = [-243, -175, -112, 112, 175, 243];
  for (const [fl, y] of [[1, -232], [2, -327], [3, -422]] as const) cols.forEach((x, i) => windowAt(c, sp, x, y, 36, 66, fl, { alt: i % 2 === 1 }));
  // The light shaft in the middle: warm at the bottom, white at the top, with deco chevrons.
  const lg = c.createLinearGradient(0, -150, 0, -440);
  lg.addColorStop(0, '#ffb347');
  lg.addColorStop(0.35, '#c8d8ff');
  lg.addColorStop(0.65, '#e6eca0');
  lg.addColorStop(0.85, '#ff8ac0');
  lg.addColorStop(1, '#fff6e0');
  c.fillStyle = '#0a0c1e';
  c.fillRect(-46, -440, 92, 290);
  c.fillStyle = lg;
  c.fillRect(-38, -432, 76, 278);
  c.strokeStyle = 'rgba(10,12,30,0.75)';
  c.lineWidth = 3;
  for (let y = -420; y < -160; y += 22) {
    c.beginPath();
    c.moveTo(-38, y + 12);
    c.lineTo(0, y);
    c.lineTo(38, y + 12);
    c.stroke();
  }
  c.strokeStyle = gold(c, -46, 0, 46, 0);
  c.lineWidth = 4;
  c.strokeRect(-42, -436, 84, 282);
  // Ground floor: candle-hall windows in round arches, dark granite plinth.
  for (const x of cols) windowAt(c, sp, x, -136, 40, 100, 0, { arch: true });
  const pg = c.createLinearGradient(0, -22, 0, 0);
  pg.addColorStop(0, '#2a2438');
  pg.addColorStop(1, '#0c0a14');
  c.fillStyle = pg;
  c.fillRect(-292, -22, 584, 22);
  c.fillStyle = gold(c, 0, -24, 0, -20);
  c.fillRect(-292, -24, 584, 3);
}

function tower(c: Ctx, sp: Spots) {
  // Ziggurat steps with fans at the corners.
  for (const [hw, y0, y1] of [[250, -446, -470], [205, -470, -500]]) {
    facadeFill(c, -hw, hw, y1, y0, 0x1e2650);
    brassBand(c, -hw - 4, hw + 4, y1, 4);
  }
  for (const sx of [-1, 1]) sunburst(c, sx * 228, -446, 30, Math.PI, Math.PI * 2, 9, 'rgba(242,205,114,0.75)', 'rgba(168,116,31,0.55)', 4);
  facadeFill(c, -150, 150, -650, -500, 0x202a56);
  // Three tall windows of the dome floor.
  for (const x of [-95, 0, 95]) windowAt(c, sp, x, -638, 34, 72, 4, { arch: true });
  brassBand(c, -160, 160, -656, 7);
  for (const x of [-150, 150]) {
    c.fillStyle = gold(c, x - 3, 0, x + 3, 0);
    c.fillRect(x - 3, -650, 6, 150);
  }
}

function dome(c: Ctx, sp: Spots) {
  const cy = -656;
  const rx = 128;
  const ry = 90;
  facadeFill(c, -118, 118, cy - 8, cy, 0x1a2248);
  // Glass dome with brass ribs, lit warm white from inside.
  c.save();
  c.beginPath();
  c.ellipse(0, cy, rx, ry, 0, Math.PI, Math.PI * 2);
  c.closePath();
  const g = c.createRadialGradient(0, cy - 20, 10, 0, cy - 20, rx);
  g.addColorStop(0, '#fff8e0');
  g.addColorStop(0.45, '#b8c8f0');
  g.addColorStop(1, '#2a3870');
  c.fillStyle = g;
  c.fill();
  c.clip();
  for (let i = -6; i <= 6; i++) {
    const k = i / 6.5;
    c.beginPath();
    c.ellipse(0, cy, Math.abs(k) * rx, ry, 0, Math.PI, Math.PI * 2);
    c.strokeStyle = 'rgba(120,80,24,0.9)';
    c.lineWidth = 2.6;
    c.stroke();
  }
  for (const f of [0.35, 0.65, 0.88]) {
    const yy = cy - ry * f;
    const ww = rx * Math.sqrt(1 - f * f);
    c.beginPath();
    c.moveTo(-ww, yy);
    c.lineTo(ww, yy);
    c.strokeStyle = 'rgba(120,80,24,0.8)';
    c.lineWidth = 2;
    c.stroke();
  }
  c.restore();
  c.beginPath();
  c.ellipse(0, cy, rx, ry, 0, Math.PI, Math.PI * 2);
  c.strokeStyle = gold(c, -rx, cy - ry, rx, cy);
  c.lineWidth = 4;
  c.stroke();
  // The lantern on top: the moon lamp.
  const ly = cy - ry;
  rrect(c, -22, ly - 40, 44, 40, 4);
  fillInk(c, gold(c, -22, ly - 40, 22, ly), 2);
  rrect(c, -15, ly - 34, 30, 28, 3);
  c.fillStyle = '#fffdf0';
  c.fill();
  c.beginPath();
  c.moveTo(-26, ly - 40);
  c.lineTo(0, ly - 62);
  c.lineTo(26, ly - 40);
  c.closePath();
  fillInk(c, gold(c, -26, ly - 62, 26, ly - 40), 2);
  c.fillStyle = gold(c, -2, 0, 2, 0);
  c.fillRect(-2, ly - 78, 4, 18);
  ellipse(c, 0, ly - 80, 4.5, 4.5);
  fillInk(c, gold(c, -5, ly - 85, 5, ly - 75), 1.4);
  sp.lens = { x: fx(0), y: fy(ly - 20) };
}

/** The marquee: a stepped brass board with the house name, running bulbs and the tagline below. */
function sign(c: Ctx, sp: Spots) {
  const w = 500;
  const h = 78;
  const y = -548;
  c.save();
  c.translate(0, y);
  glowAt(c, 0, h / 2, w * 0.75, h * 1.6, 0xffb45a, 0.25);
  c.beginPath();
  c.moveTo(-w / 2 + 16, 0);
  c.lineTo(w / 2 - 16, 0);
  c.lineTo(w / 2, 16);
  c.lineTo(w / 2, h - 16);
  c.lineTo(w / 2 - 16, h);
  c.lineTo(-w / 2 + 16, h);
  c.lineTo(-w / 2, h - 16);
  c.lineTo(-w / 2, 16);
  c.closePath();
  c.fillStyle = gold(c, -w / 2, 0, w / 2, h);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.stroke();
  rrect(c, -w / 2 + 10, 10, w - 20, h - 20, 5);
  const ig = c.createLinearGradient(0, 10, 0, h - 10);
  ig.addColorStop(0, '#0a0e24');
  ig.addColorStop(1, '#1a2248');
  c.fillStyle = ig;
  c.fill();
  for (const sx of [-1, 1]) sunburst(c, sx * (w / 2 - 32), h - 12, 22, Math.PI, Math.PI * 2, 7, 'rgba(242,205,114,0.85)', 'rgba(242,205,114,0.25)', 3);
  // The house name (src/core/brand.ts); a longer one shrinks to fit the board.
  c.font = '400 44px Limelight, Cinzel, Georgia, serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const ls = 'letterSpacing' in c;
  if (ls) (c as Ctx & { letterSpacing: string }).letterSpacing = '6px';
  const tw = c.measureText(HOUSE_CAPS).width;
  const fit = Math.min(1, (w - 120) / Math.max(1, tw));
  c.save();
  c.translate(3, h / 2 + 3);
  c.scale(fit, fit);
  c.shadowColor = 'rgba(255,190,100,0.95)';
  c.shadowBlur = 16;
  c.fillStyle = '#fff2cc';
  c.fillText(HOUSE_CAPS, 0, 0);
  c.shadowBlur = 0;
  c.restore();
  if (ls) (c as Ctx & { letterSpacing: string }).letterSpacing = '0px';
  c.fillStyle = 'rgba(255,255,255,0.07)';
  c.fillRect(-w / 2 + 12, 12, w - 24, (h - 24) * 0.45);
  // Running bulbs all around.
  const per = (w + h) * 2;
  const n = 52;
  for (let i = 0; i < n; i++) {
    let d = (i / n) * per;
    let bx: number;
    let by: number;
    if (d < w) [bx, by] = [d - w / 2, 0];
    else if ((d -= w) < h) [bx, by] = [w / 2, d];
    else if ((d -= h) < w) [bx, by] = [w / 2 - d, h];
    else [bx, by] = [-w / 2, h - (d - w)];
    ellipse(c, bx, by, 2.6, 2.6);
    c.fillStyle = '#fff1c4';
    c.fill();
    c.strokeStyle = '#3a2008';
    c.lineWidth = 1;
    c.stroke();
    sp.bulbs.push({ x: fx(bx), y: fy(y + by), canopy: false });
  }
  c.restore();
  // The tagline plate under the sign.
  c.save();
  c.translate(0, y + h + 8);
  c.font = '700 11px Cinzel, Georgia, serif';
  if (ls) (c as Ctx & { letterSpacing: string }).letterSpacing = '4px';
  const tag = HOUSE_TAGLINE.toLocaleUpperCase('de-DE');
  const pw = Math.max(200, c.measureText(tag).width + 40);
  rrect(c, -pw / 2, 0, pw, 22, 3);
  fillInk(c, '#0a0e24', 1.6);
  c.strokeStyle = gold(c, -pw / 2, 0, pw / 2, 22);
  c.lineWidth = 1.5;
  rrect(c, -pw / 2 + 3, 3, pw - 6, 16, 2);
  c.stroke();
  c.fillStyle = '#f2cd72';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(tag, 2, 11.5);
  if (ls) (c as Ctx & { letterSpacing: string }).letterSpacing = '0px';
  c.restore();
}

/** Portal: tall dark recess, sunburst transom, the warm hall behind the doors, the marquee canopy. */
function entrance(c: Ctx, sp: Spots) {
  const dw = DW;
  const dh = DH;
  c.fillStyle = '#080a18';
  c.fillRect(-dw / 2 - 14, -dh - 70, dw + 28, dh + 70);
  // Sunburst transom.
  c.save();
  c.beginPath();
  c.arc(0, -dh, dw / 2, Math.PI, Math.PI * 2);
  c.closePath();
  const fg = c.createRadialGradient(0, -dh, 4, 0, -dh, dw / 2);
  fg.addColorStop(0, '#fff6d8');
  fg.addColorStop(1, '#e0962e');
  c.fillStyle = fg;
  c.fill();
  c.clip();
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    c.beginPath();
    c.moveTo(0, -dh);
    c.lineTo(Math.cos(a) * dw, -dh + Math.sin(a) * dw);
    c.strokeStyle = 'rgba(90,52,12,0.85)';
    c.lineWidth = 2;
    c.stroke();
  }
  c.beginPath();
  c.arc(0, -dh, 14, Math.PI, Math.PI * 2);
  c.fillStyle = '#c8913a';
  c.fill();
  c.restore();
  c.beginPath();
  c.arc(0, -dh, dw / 2, Math.PI, Math.PI * 2);
  c.strokeStyle = gold(c, -dw / 2, -dh - dw / 2, dw / 2, -dh);
  c.lineWidth = 5;
  c.stroke();
  // The hall behind the doors: chandelier light over a chequered floor (the doors open onto it).
  c.save();
  c.beginPath();
  c.rect(-dw / 2, -dh, dw, dh);
  c.clip();
  const hg = c.createLinearGradient(0, -dh, 0, 0);
  hg.addColorStop(0, '#ffe7b0');
  hg.addColorStop(0.55, '#ffc66a');
  hg.addColorStop(1, '#b8641c');
  c.fillStyle = hg;
  c.fillRect(-dw / 2, -dh, dw, dh);
  for (let row = 0; row < 3; row++) {
    const y0 = -34 + row * 11;
    for (let i = -6; i < 7; i++) {
      if ((i + row) % 2) continue;
      c.fillStyle = 'rgba(20,24,60,0.35)';
      c.fillRect(i * (12 + row * 2), y0, 12 + row * 2, 11);
    }
  }
  glowAt(c, 0, -dh + 26, 50, 28, 0xffffff, 0.8);
  c.restore();
  // Brass door frame and threshold.
  c.strokeStyle = gold(c, -dw / 2, 0, dw / 2, 0);
  c.lineWidth = 5;
  c.strokeRect(-dw / 2 - 2, -dh - 2, dw + 4, dh + 4);
  c.fillStyle = gold(c, 0, -3, 0, 2);
  c.fillRect(-dw / 2 - 8, -3, dw + 16, 4);
  // Marquee canopy with bulbs.
  c.beginPath();
  c.moveTo(-dw / 2 - 50, -dh - 6);
  c.lineTo(dw / 2 + 50, -dh - 6);
  c.lineTo(dw / 2 + 64, -dh + 10);
  c.lineTo(-dw / 2 - 64, -dh + 10);
  c.closePath();
  fillInk(c, gold(c, 0, -dh - 6, 0, -dh + 10), 2);
  c.fillStyle = '#7e1f36';
  c.fillRect(-dw / 2 - 64, -dh + 10, dw + 128, 10);
  c.strokeStyle = INK;
  c.lineWidth = 1.5;
  c.strokeRect(-dw / 2 - 64, -dh + 10, dw + 128, 10);
  for (let x = -dw / 2 - 56; x <= dw / 2 + 56; x += 14) {
    ellipse(c, x, -dh + 22, 2.4, 2.4);
    c.fillStyle = '#fff1c4';
    c.fill();
    sp.bulbs.push({ x: fx(x), y: fy(-dh + 22), canopy: true });
  }
}

/** Topiaries in brass tubs beside the door (painted in front of the façade). */
function topiaries(c: Ctx) {
  for (const sx of [-1, 1]) {
    c.save();
    c.translate(sx * 98, 0);
    shadow(c, 0, 2, 22, 6, 0.6);
    c.beginPath();
    c.moveTo(-13, -30);
    c.lineTo(13, -30);
    c.lineTo(10, 0);
    c.lineTo(-10, 0);
    c.closePath();
    fillInk(c, gold(c, -13, -30, 13, 0), 1.6);
    for (const [yy, rr] of [[-44, 15], [-70, 12], [-90, 9]]) {
      ellipse(c, 0, yy, rr, rr);
      const g = c.createRadialGradient(-rr * 0.4, yy - rr * 0.4, 1, 0, yy, rr);
      g.addColorStop(0, '#5aa86a');
      g.addColorStop(1, '#14402a');
      fillInk(c, g, 1.6);
    }
    c.restore();
  }
}

/** Red carpet from the door to the kerb, with brass stanchions and velvet ropes (world units). */
function carpet(c: Ctx) {
  const t = BASE + 1;
  const quad = (inset: number) => {
    c.beginPath();
    c.moveTo(DOOR.l + 6 + inset, t);
    c.lineTo(DOOR.r - 6 - inset, t);
    c.lineTo(DOOR_X + 96 - inset * 1.2, CURB);
    c.lineTo(DOOR_X + 96 - inset * 1.2, ROAD - 2);
    c.lineTo(DOOR_X - 96 + inset * 1.2, ROAD - 2);
    c.lineTo(DOOR_X - 96 + inset * 1.2, CURB);
    c.closePath();
  };
  quad(0);
  const g = c.createLinearGradient(DOOR_X - 96, 0, DOOR_X + 96, 0);
  g.addColorStop(0, '#4a0f20');
  g.addColorStop(0.5, '#8e2440');
  g.addColorStop(1, '#4a0f20');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.stroke();
  quad(7);
  c.strokeStyle = 'rgba(224,178,90,0.85)';
  c.lineWidth = 2;
  c.stroke();
  // Small sunburst inlay at the kerb end.
  c.save();
  c.translate(DOOR_X, ROAD - 4);
  c.scale(1, 0.4);
  sunburst(c, 0, 0, 60, Math.PI, Math.PI * 2, 11, 'rgba(242,205,114,0.75)', 'rgba(242,205,114,0.2)', 6);
  c.restore();
  glowAt(c, DOOR_X, t + 20, 90, 40, 0xffcf7a, 0.35, 'lighter');
  for (const side of [-1, 1]) {
    const posts = [
      [DOOR_X + side * 92, BASE + 30],
      [DOOR_X + side * 108, CURB - 6],
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
      c.fillStyle = 'rgba(4,6,16,0.5)';
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
}

/** Art-deco globe lamp on the kerb: brass post, two curled arms, three milk-glass globes (world units). */
function lampPost(c: Ctx, sp: Spots, x: number) {
  const foot = CURB - 6;
  c.save();
  c.translate(x, foot);
  c.scale(FS, FS);
  shadow(c, 0, 0, 22, 6, 0.6);
  c.fillStyle = gold(c, -4, 0, 4, 0);
  c.fillRect(-3, -150, 6, 150);
  rrect(c, -9, -16, 18, 16, 3);
  fillInk(c, gold(c, -9, -16, 9, 0), 1.4);
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.moveTo(0, -140);
    c.quadraticCurveTo(sx * 24, -150, sx * 28, -136);
    c.strokeStyle = '#c8913a';
    c.lineWidth = 3;
    c.stroke();
    ellipse(c, sx * 28, -128, 9, 10);
    c.fillStyle = '#fff4d8';
    c.fill();
    sp.lamps.push({ x: x + sx * 28 * FS, y: foot - 128 * FS });
  }
  ellipse(c, 0, -160, 11, 12);
  c.fillStyle = '#fff4d8';
  c.fill();
  sp.lamps.push({ x, y: foot - 160 * FS });
  c.restore();
}

/** The painted house layer (façade, entrance, carpet, lamps), in its own canvas around the door. */
function paintHouse(sp: Spots) {
  return paint(FAC.w, FAC.h, (c) => {
    c.translate(-FAC.x, -FAC.y);
    c.save();
    c.translate(DOOR_X, BASE);
    c.scale(FS, FS);
    wings(c, sp);
    mainBlock(c, sp);
    tower(c, sp);
    dome(c, sp);
    sign(c, sp);
    entrance(c, sp);
    c.restore();
    carpet(c);
    c.save();
    c.translate(DOOR_X, BASE);
    c.scale(FS, FS);
    topiaries(c);
    c.restore();
    for (const u of LAMPS) lampPost(c, sp, fx(u));
  }, 1.5);
}

/** Pavement and wet road with the house mirrored in it (world units, y BASE..H). */
function paintGround(sp: Spots) {
  return paint(W, H - BASE, (c) => {
    c.translate(0, -BASE);
    // Pavement: dark stone slabs.
    const g = c.createLinearGradient(0, BASE, 0, CURB);
    g.addColorStop(0, '#3a3450');
    g.addColorStop(1, '#221e34');
    c.fillStyle = g;
    c.fillRect(0, BASE, W, CURB - BASE);
    c.strokeStyle = 'rgba(6,6,16,0.5)';
    c.lineWidth = 1.5;
    for (const y of [BASE + 26, BASE + 58]) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    for (let x = DOOR_X % 72; x < W; x += 72) {
      c.beginPath();
      c.moveTo(x, BASE);
      c.lineTo(DOOR_X + (x - DOOR_X) * 1.18, CURB);
      c.stroke();
    }
    c.strokeStyle = 'rgba(220,226,255,0.05)';
    for (const y of [BASE + 27, BASE + 59]) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    // Kerb.
    c.fillStyle = '#5a5070';
    c.fillRect(0, CURB, W, 5);
    c.fillStyle = vg(c, CURB + 5, ROAD, 0x2a2840, 0.1, 0.4);
    c.fillRect(0, CURB + 5, W, ROAD - CURB - 5);
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, CURB);
    c.lineTo(W, CURB);
    c.moveTo(0, ROAD);
    c.lineTo(W, ROAD);
    c.stroke();
    // Wet road.
    const rg = c.createLinearGradient(0, ROAD, 0, H);
    rg.addColorStop(0, '#141228');
    rg.addColorStop(1, '#06060e');
    c.fillStyle = rg;
    c.fillRect(0, ROAD, W, H - ROAD);
    const r = seeded(31);
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = r() < 0.5 ? 'rgba(220,230,255,0.035)' : 'rgba(0,0,0,0.12)';
      c.fillRect(r() * W, ROAD + r() * (H - ROAD), 2, 1.5);
    }
    // The house in the wet stone and the road: windows of the lower floors, the door, the lamps.
    c.globalCompositeOperation = 'lighter';
    for (const w of sp.windows) {
      if (w.floor > 1 || w.y < BASE - 400) continue;
      glowAt(c, w.x, BASE + 30 + (BASE - w.y) * 0.18, w.w * 0.45, 26, FLOORS[w.floor].col, 0.14);
      glowAt(c, w.x, ROAD + 60 + (BASE - w.y) * 0.2, w.w * 0.35, 50, FLOORS[w.floor].col, 0.08);
    }
    glowAt(c, DOOR_X, BASE + 26, 150, 40, 0xffb347, 0.3);
    glowAt(c, DOOR_X, ROAD + 80, 120, 90, 0xffb347, 0.18);
    for (const u of LAMPS) {
      glowAt(c, fx(u), ROAD + 80, 18, 110, 0xffcf7a, 0.3);
      glowAt(c, fx(u), CURB - 6, 90, 22, 0xffcf7a, 0.25);
    }
    c.globalCompositeOperation = 'source-over';
    // Puddles catching the sky.
    for (const [x, y, rx, ry] of [[DOOR_X - 900, 790, 90, 12], [DOOR_X - 420, 868, 120, 14], [DOOR_X + 330, 812, 80, 10], [DOOR_X + 760, 876, 110, 13], [DOOR_X - 1180, 880, 70, 10], [DOOR_X + 1150, 800, 90, 11]]) {
      ellipse(c, x, y, rx, ry);
      const pg = c.createLinearGradient(0, y - ry, 0, y + ry);
      pg.addColorStop(0, 'rgba(30,40,90,0.75)');
      pg.addColorStop(1, 'rgba(60,56,120,0.55)');
      c.fillStyle = pg;
      c.fill();
      c.strokeStyle = 'rgba(200,210,255,0.16)';
      c.lineWidth = 1.5;
      c.stroke();
    }
    // Dashed centre line.
    for (let x = 30; x < W; x += 150) {
      c.beginPath();
      c.moveTo(x, 846);
      c.lineTo(x + 80, 846);
      c.lineTo(x + 84, 853);
      c.lineTo(x - 4, 853);
      c.closePath();
      c.fillStyle = 'rgba(240,226,190,0.26)';
      c.fill();
    }
  }, 1);
}

/** Vertical gradient that keeps dark paint readable. */
function vg(c: Ctx, y0: number, y1: number, col: number, top = 0.18, bottom = 0.35) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgb(light(col, top)));
  g.addColorStop(0.5, rgb(col));
  g.addColorStop(1, rgb(dark(col, bottom)));
  return g;
}

/** A soft beam of light: bright at the apex on the left, fading to the right. */
let beamTex: Texture | null = null;
function beamTexture() {
  return (beamTex ??= paint(512, 64, (c) => {
    const g = c.createLinearGradient(0, 0, 512, 0);
    g.addColorStop(0, 'rgba(255,246,220,1)');
    g.addColorStop(0.45, 'rgba(200,215,255,0.32)');
    g.addColorStop(1, 'rgba(200,215,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 30);
    c.lineTo(512, 0);
    c.lineTo(512, 64);
    c.lineTo(0, 34);
    c.closePath();
    c.fill();
  }, 1));
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
      c.font = '700 12px Cinzel, Georgia, serif';
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
    for (let i = 0; i < 9; i++) glowAt(c, 60 + r() * 392, 64 + (r() - 0.5) * 30, 90 + r() * 70, 26 + r() * 16, 0x8a98c8, 0.26);
  }, 0.5));
}

interface Drop {
  s: Sprite;
  x: number;
  y: number;
  v: number;
}

// ---- The street ----------------------------------------------------------------------------------

interface Spark {
  s: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  sz: number;
  ph: number;
}

export class Street {
  readonly view = new Container();
  private world = new Container();
  private chars = new Container();
  private traffic = new Container();
  private rainLayer = new Container();
  private glowLayer = new Container();
  private sparkLayer = new Container();
  private spots: Spots = { windows: [], bulbs: [], lamps: [], lens: { x: DOOR_X, y: fy(-766) } };
  private windowGlows: Sprite[] = [];
  private bulbGlows: Sprite[] = [];
  private lampGlows: Sprite[] = [];
  private beams: Sprite[] = [];
  private lensGlow!: Sprite;
  private lensCore!: Sprite;
  private signGlow!: Sprite;
  private doorLight!: Sprite;
  private doorSpill!: Sprite;
  /** Both entrance doors, redrawn while they swing inwards (0 shut, 1 open). */
  private doors = new Graphics();
  private doorman!: Chibi;
  private doormanWrap = new Container();
  private puffs: { s: Sprite; vx: number; vy: number; life: number }[] = [];
  private exhaust: { x: number; y: number; c: Container } | null = null;
  private puffAcc = 0;
  private sparks: Spark[] = [];
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
  private calm = reducedMotion();
  private measureAcc = 0;
  /**
   * Camera. `zoom` 1 and `inset` = height of the start menu show the whole house above the
   * menu; the arrival lowers the inset to 0 and zooms towards the door.
   */
  private cam = { x: DOOR_X, y: (FRAME.top + FRAME.bottom) / 2, zoom: 1, inset: 0 };
  /** False once the arrival takes the camera over: then the menu height no longer counts. */
  private followMenu = true;

  constructor(mood: StreetMood = 'drizzle') {
    this.view.addChild(this.world, this.rainLayer);
    // Paint the house first: it tells where the windows, bulbs, lamps and the lens are.
    const house = paintHouse(this.spots);
    // Endless night around the scene, for screens with another shape.
    this.world.addChild(new Graphics().rect(-4000, -4000, W + 8000, 4000 + BASE).fill(0x03040f).rect(-4000, ROAD, W + 8000, 4000).fill(0x06060e));
    const sky = new Sprite(paint(SKY.w, SKY.h, paintSky, 0.5));
    sky.position.set(SKY.x, SKY.y);
    this.moon = new Sprite(paint(240, 240, paintMoon, 1.5));
    this.world.addChild(sky, this.moon);
    // The moon lamp's two beams sweep the sky behind the house.
    for (const a of [0.24, 0.14]) {
      const b = new Sprite(beamTexture());
      b.anchor.set(0, 0.5);
      b.blendMode = 'add';
      b.alpha = a;
      b.position.set(this.spots.lens.x, this.spots.lens.y);
      this.beams.push(b);
      this.world.addChild(b);
    }
    const city = new Sprite(paint(W, BASE - CITY.y, paintCity, 1));
    city.position.set(0, CITY.y);
    this.world.addChild(city);
    this.addMist(BASE - 150, 0.3, 4);
    // Wide pavements and road beyond the painted strip.
    this.world.addChild(new Graphics().rect(-4000, BASE, 4000, CURB - BASE).fill(0x2e2942).rect(W, BASE, 4000, CURB - BASE).fill(0x2e2942).rect(-4000, ROAD, 4000, H - ROAD).fill(0x0e0d1c).rect(W, ROAD, 4000, H - ROAD).fill(0x0e0d1c));
    const ground = new Sprite(paintGround(this.spots));
    ground.position.set(0, BASE);
    this.world.addChild(ground);
    const houseSprite = new Sprite(house);
    houseSprite.position.set(FAC.x, FAC.y);
    this.world.addChild(houseSprite);
    // Light inside the door and the spill on the pavement when it opens.
    this.doorLight = this.glow(DOOR_X, BASE - 70, 380, 320, COLORS.lamp, 0.22);
    this.world.addChild(this.doors);
    this.drawDoors(0);
    this.doorSpill = this.glow(DOOR_X, BASE + 40, 380, 110, COLORS.lamp, 0);
    // Live light on top of the painted house: windows breathing, bulbs, lamps, the lens.
    this.world.addChild(this.glowLayer);
    for (const w of this.spots.windows) this.windowGlows.push(this.glow(w.x, w.y, w.w * 2.6, w.h * 1.8, FLOORS[w.floor].col, 0.2, this.glowLayer));
    for (const b of this.spots.bulbs) this.bulbGlows.push(this.glow(b.x, b.y, 22, 22, 0xffcf7a, 0.6, this.glowLayer));
    for (const l of this.spots.lamps) this.lampGlows.push(this.glow(l.x, l.y, 150, 150, 0xffcf7a, 0.42, this.glowLayer));
    this.signGlow = this.glow(DOOR_X, fy(-509), 760, 200, 0xffb45a, 0.16, this.glowLayer);
    this.lensGlow = this.glow(this.spots.lens.x, this.spots.lens.y, 300, 300, 0xfff0d0, 0.6, this.glowLayer);
    this.lensCore = this.glow(this.spots.lens.x, this.spots.lens.y, 84, 84, 0xffffff, 0.9, this.glowLayer);
    // People stand on the pavement; cars pass in front of them; sparks rise over everything.
    this.world.addChild(this.chars, this.traffic, this.sparkLayer);
    this.doorman = new Chibi(COLORS.brass, { jacket: 0x7e1f36, skin: 0xc68a5e, hair: 0x1b1b22, hat: 'topHat', hatColor: 0x7e1f36, accessory: 'bowTie' });
    this.doormanWrap.addChild(this.doorman.view);
    this.doormanWrap.position.set(DOOR.r + 70, BASE + 34);
    this.doormanWrap.scale.set(1.15);
    this.doorman.faceTowards(Math.PI / 2);
    this.chars.addChild(this.doormanWrap);
    this.chibis.push({ ch: this.doorman, dir: () => null });
    this.resetSparks();
    // Low mist over the road.
    this.addMist(ROAD + 20, 0.2, 4);
    this.setMood(mood);
    if (import.meta.env.DEV) (window as unknown as { __street?: Street }).__street = this;
  }

  private glow(x: number, y: number, w: number, h: number, tint: number, alpha: number, layer: Container = this.world) {
    const s = new Sprite(glowTexture());
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.width = w;
    s.height = h;
    s.tint = tint;
    s.alpha = alpha;
    s.blendMode = 'add';
    layer.addChild(s);
    return s;
  }

  private addMist(y: number, alpha: number, n: number) {
    for (let i = 0; i < n; i++) {
      const s = new Sprite(mistTexture());
      s.anchor.set(0.5);
      s.width = 1100;
      s.height = 170;
      s.alpha = alpha;
      const x0 = (i / n) * (W + 1100) - 550;
      s.position.set(x0, y + (i % 2) * 30);
      this.world.addChild(s);
      this.mists.push({ s, v: 8 + Math.random() * 8, x0 });
    }
  }

  // ---- Sparks: points of light rising from the lamps, the portal and the dome. ----------------

  private newSpark(s: Sprite | null, init: boolean): Spark {
    const sp = this.spots;
    const src = Math.random();
    let x: number;
    let y: number;
    if (src < 0.45 && sp.lamps.length) {
      const l = sp.lamps[(Math.random() * sp.lamps.length) | 0];
      x = l.x + (Math.random() - 0.5) * 12;
      y = l.y;
    } else if (src < 0.7) {
      x = sp.lens.x + (Math.random() - 0.5) * 36;
      y = sp.lens.y;
    } else {
      x = DOOR_X + (Math.random() - 0.5) * 170;
      y = fy(-130);
    }
    if (!s) {
      s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = 'add';
      this.sparkLayer.addChild(s);
    }
    const warm = Math.random() < 0.8;
    s.tint = warm ? 0xffc870 : 0xcfe0ff;
    const life = 3 + Math.random() * 4;
    return { s, x, y, vx: (Math.random() - 0.5) * 12, vy: -(17 + Math.random() * 30), life, age: init ? Math.random() * life : 0, sz: 7 + Math.random() * 9, ph: Math.random() * 10 };
  }

  private resetSparks() {
    for (const p of this.sparks) p.s.destroy();
    this.sparks = [];
    const n = this.calm ? 22 : 80;
    for (let i = 0; i < n; i++) this.sparks.push(this.newSpark(null, true));
  }

  /** Clear night, drizzle or rain. Reduced motion keeps a third of the drops. */
  setMood(mood: StreetMood) {
    this.mood = mood;
    for (const d of this.drops) d.s.destroy();
    this.drops = [];
    const base = mood === 'clear' ? 0 : mood === 'drizzle' ? 40 : 170;
    const n = reducedMotion() ? Math.ceil(base / 3) : base;
    const tex = dropTexture();
    for (let i = 0; i < n; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5, 1);
      s.rotation = 0.12;
      s.tint = 0xd8e0ff;
      const v = 900 + Math.random() * 500;
      s.alpha = (mood === 'rain' ? 0.28 : 0.14) + Math.random() * 0.16;
      s.scale.set(1, mood === 'rain' ? 1 : 0.6);
      this.rainLayer.addChild(s);
      this.drops.push({ s, x: Math.random() * this.screenW, y: Math.random() * this.screenH, v });
    }
    for (const m of this.mists) m.s.alpha = mood === 'rain' ? 0.34 : mood === 'drizzle' ? 0.22 : 0.15;
  }

  /** Inward-swinging glass doors in brass: each leaf turns away from the viewer around its hinge. */
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
      const fxe = hx - side * half * cos; // free edge
      // The free edge moves away into the hall, so it looks a little shorter and higher.
      const shrink = 1 - sin * 0.14;
      const ft = top + hh * (1 - shrink) * 0.35;
      const fb = top + hh * shrink + hh * (1 - shrink) * 0.35;
      const pt = (u: number, v: number) => {
        const x = hx + (fxe - hx) * u;
        const t0 = top + (ft - top) * u;
        const b0 = BASE + (fb - BASE) * u;
        return [x, t0 + (b0 - t0) * v];
      };
      const quad = (u0: number, u1: number, v0: number, v1: number) => [...pt(u0, v0), ...pt(u1, v0), ...pt(u1, v1), ...pt(u0, v1)];
      // Brass leaf with a big pane of warm glass.
      g.poly(quad(0, 1, 0, 1)).fill(mix(0xc8913a, 0x6e4614, sin * 0.6)).stroke({ color: 0x0e0a18, width: 2.5, alpha: 0.9 });
      g.poly(quad(0.12, 0.88, 0.05, 0.86)).fill({ color: 0xffd890, alpha: 0.85 - sin * 0.35 });
      g.poly(quad(0.12, 0.88, 0.05, 0.86)).stroke({ color: 0x7a4e18, width: 1.5 });
      // Glazing bar and a little etched fan in the glass.
      const [m0x, m0y] = pt(0.5, 0.05);
      const [m1x, m1y] = pt(0.5, 0.86);
      g.moveTo(m0x, m0y).lineTo(m1x, m1y).stroke({ color: 0xb07a2a, width: 2, alpha: 0.8 });
      const [ax0, ay0] = pt(0.5, 0.3);
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + ((i + 0.5) / 5) * Math.PI;
        g.moveTo(ax0, ay0).lineTo(ax0 + Math.cos(a) * 14 * cos, ay0 + Math.sin(a) * 12).stroke({ color: 0xb07a2a, width: 1.2, alpha: 0.6 });
      }
      // Kick plate and push bar.
      g.poly(quad(0.06, 0.94, 0.89, 0.97)).fill({ color: 0x7a4e18, alpha: 0.9 });
      const [px, py] = pt(0.82, 0.55);
      g.roundRect(px - 2.5, py - 14, 5, 28, 2.5).fill(0xfff2c0).stroke({ color: 0x0e0a18, width: 1 });
      // Upper-left rim light.
      const [ax, ay] = pt(0, 0);
      const [bx, by] = pt(1, 0);
      g.moveTo(ax, ay + 1.5).lineTo(bx, by + 1.5).stroke({ color: 0xfff4dc, width: 1.5, alpha: 0.5 });
    }
  }

  /** Warm sparks tumble out of the opened doors towards the street. */
  private sparkBurst() {
    const n = reducedMotion() ? 6 : 18;
    for (let i = 0; i < n; i++) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = Math.random() < 0.8 ? 0xffc870 : 0xfff6e0;
      const sx = DOOR_X + (Math.random() - 0.5) * 110;
      const sy = BASE - 30 - Math.random() * 100;
      s.position.set(sx, sy);
      const size = 14 + Math.random() * 14;
      s.width = s.height = size;
      this.sparkLayer.addChild(s);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const dist = 120 + Math.random() * 220;
      const ph = Math.random() * 10;
      void animate(1400 + Math.random() * 900, (k) => {
        if (s.destroyed) return;
        s.position.set(sx + Math.cos(ang) * dist * k + Math.sin(k * 9 + ph) * 14, sy + Math.sin(ang) * dist * k);
        s.alpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      }).then(() => !s.destroyed && s.destroy());
    }
  }

  private makeCar(taxi: boolean, facing = 1): Car & { door: Container } {
    const c = new Container();
    // The body sits on its springs above the wheels, so it can dip when braking.
    const body = new Container();
    body.pivot.set(0, -20);
    body.position.set(0, -20);
    const shadowS = new Sprite(glowTexture());
    shadowS.anchor.set(0.5);
    shadowS.tint = 0x02030a;
    shadowS.width = 330;
    shadowS.height = 30;
    shadowS.alpha = 0.8;
    c.addChild(shadowS);
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
    // Tall screens see the moon above the house, wide ones beside it.
    const tall = h > w * 1.1;
    this.moon.position.set(tall ? DOOR_X - 380 : DOOR_X - 1000, tall ? FRAME.top - 260 : FRAME.top + 40);
    for (const d of this.drops) {
      d.x = Math.random() * w;
      d.y = Math.random() * h;
    }
    this.measureMenu();
    this.applyCam();
  }

  /** How much of the screen bottom the start menu covers (the house stands above it). */
  private measureMenu() {
    if (!this.followMenu) return;
    const rail = document.querySelector<HTMLElement>('#menu-main:not([hidden]) .menu-btns');
    const title = document.getElementById('title');
    let inset = 0;
    if (rail && title && !title.hidden && !title.classList.contains('out') && !title.classList.contains('arriving')) {
      const r = rail.getBoundingClientRect();
      if (r.height > 0) inset = Math.max(0, this.screenH - r.top + 10);
    }
    this.cam.inset = Math.min(this.screenH * 0.6, inset);
  }

  /** Scale at zoom 1: the whole house (dome to kerb) above the menu; narrow screens keep the main block. */
  private baseScale(inset = this.cam.inset) {
    const free = Math.max(120, this.screenH - inset);
    return Math.max(this.screenW / (W + 1600), Math.min(free / (FRAME.bottom - FRAME.top), this.screenW / FRAME.minW));
  }

  /** The zoom (relative to the base scale) at which the arrival shows the street and the taxi. */
  private streetZoom() {
    const zs = Math.min(this.screenH / 780, this.screenW / 660);
    return Math.max(1, zs / this.baseScale(0));
  }

  private applyCam() {
    const z = this.baseScale() * this.cam.zoom;
    this.world.scale.set(z);
    const sw = this.screenW;
    const freeH = this.screenH - this.cam.inset;
    let x = sw / 2 - this.cam.x * z;
    let y = freeH / 2 - this.cam.y * z;
    // Stay on the painted strip when it covers the screen. Below the road the night goes on
    // (on the title screen the menu sits there anyway).
    if (W * z >= sw) x = Math.min(0, Math.max(sw - W * z, x));
    if (this.cam.inset < 1) y = Math.max(y, this.screenH - (H + 160) * z);
    this.world.position.set(x, y);
  }

  update(dtMs: number) {
    const dt = Math.min(dtMs, 100) / 1000;
    this.time += dt;
    const calm = reducedMotion();
    if (calm !== this.calm) {
      this.calm = calm;
      this.resetSparks();
    }
    const tt = calm ? this.time * 0.35 : this.time;
    // The moon lamp: two beams sweep slowly over the sky.
    this.beams.forEach((b, i) => {
      const ang = -Math.PI / 2 + Math.sin(tt * 0.32 + i * Math.PI) * 1.15;
      b.rotation = ang;
      b.width = 2400;
      b.height = 2400 * 0.15;
    });
    const pulse = 1 + Math.sin(tt * 1.6) * 0.08;
    this.lensGlow.width = this.lensGlow.height = 300 * pulse;
    this.lensCore.alpha = 0.85 + Math.sin(tt * 2.3) * 0.08;
    // Windows breathe in the manner of their light.
    this.spots.windows.forEach((w, i) => {
      const g = this.windowGlows[i];
      const F = FLOORS[w.floor];
      let a = 0.18;
      if (F.kind === 'candle') a = 0.26 + Math.sin(tt * 9 + w.ph) * 0.04 + Math.sin(tt * 23 + w.ph) * 0.03;
      else if (F.kind === 'moon') a = 0.16 + Math.sin(tt * 0.8 + w.ph) * 0.05;
      else if (F.kind === 'gas') a = 0.18 + Math.sin(tt * 3 + w.ph) * 0.015;
      else if (F.kind === 'neon') {
        g.tint = w.alt ? 0x5fe3ff : 0xff5fa2;
        a = 0.2 + (Math.sin(tt * 2.2 + w.ph) > 0.92 ? -0.12 : 0.06);
      } else a = 0.3;
      g.alpha = a;
    });
    this.spots.bulbs.forEach((b, i) => {
      const k = b.canopy ? 0.6 + 0.4 * Math.sin(tt * 3 + i) : 0.3 + 0.7 * Math.max(0, Math.sin(tt * 4 - i * 0.5));
      this.bulbGlows[i].alpha = k * 0.9;
    });
    this.lampGlows.forEach((g, i) => (g.alpha = (0.55 + Math.sin(tt * 2 + i) * 0.04) * 0.75));
    this.signGlow.alpha = 0.16 + Math.sin(tt * 1.3) * 0.03;
    // Sparks rise and fade.
    const step = calm ? dt * 0.4 : dt;
    for (let i = 0; i < this.sparks.length; i++) {
      const p = this.sparks[i];
      p.age += step;
      if (p.age > p.life) {
        this.sparks[i] = this.newSpark(p.s, false);
        continue;
      }
      p.x += (p.vx + Math.sin(this.time * 1.3 + p.ph) * 9) * step;
      p.y += p.vy * step;
      const k = p.age / p.life;
      p.s.position.set(p.x, p.y);
      p.s.width = p.s.height = p.sz;
      p.s.alpha = Math.sin(k * Math.PI) * (0.6 + 0.4 * Math.sin(this.time * 7 + p.ph));
    }
    for (const m of this.mists) {
      m.s.x += m.v * dt;
      if (m.s.x > W + 600) m.s.x -= W + 1200;
    }
    this.updateWeather(dt);
    // Passing traffic in the near lane, driving to the left.
    this.nextCar -= dt;
    if (this.nextCar <= 0) {
      this.nextCar = 6 + Math.random() * 8;
      const car = this.makeCar(false, -1);
      car.c.position.set(DOOR_X + 1500, LANE_NEAR);
      car.v = -(380 + Math.random() * 160);
      this.cars.push(car);
    }
    for (const car of [...this.cars]) {
      car.c.x += car.v * dt;
      for (const w of car.wheels) w.rotation += Math.abs(car.v * dt) / 27;
      if (car.c.x < DOOR_X - 1600 || car.c.x > DOOR_X + 1700) {
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
        p.tint = 0xb8bccc;
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
    // The menu can change height (fonts, a hidden key): look again now and then.
    this.measureAcc += dt;
    if (this.measureAcc > 0.4) {
      this.measureAcc = 0;
      this.measureMenu();
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
    this.rippleAcc += dt * (this.mood === 'rain' ? 14 : 4) * (reducedMotion() ? 0.34 : 1);
    while (this.rippleAcc > 1) {
      this.rippleAcc -= 1;
      const s = new Sprite(rippleTexture());
      s.anchor.set(0.5);
      const y = BASE + 10 + Math.random() * (H - BASE - 10);
      s.position.set(DOOR_X - 1300 + Math.random() * 2600, y);
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
    this.followMenu = false;
    sfx.ignition();
    const engine = sfx.car();
    engine.set(0.75, 0.9, 0.4);
    const taxi = this.makeCar(true, 1);
    // The rear door stops right at the carpet.
    const stopX = DOOR_X + 62;
    taxi.c.position.set(DOOR_X - 1500, LANE_KERB);
    this.exhaust = { x: -150, y: -30, c: taxi.c };
    const startX = taxi.c.x;
    const sz = this.streetZoom();
    void tween(this.cam, { x: DOOR_X - 20, y: 470, zoom: sz, inset: 0 }, 2400, ease.inOutCubic);
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
    wrap.scale.set(1.2);
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
      this.doormanWrap.scale.y = 1.15 * (1 - b * 0.05);
    }, ease.linear);
    // The taxi pulls away: revs, a gear change, revs again.
    engine.set(0.7, 0.4, 0.25);
    void wait(900).then(() => engine.set(0.4, 0.7, 0.12));
    void wait(1050).then(() => engine.set(0.8, 1, 0.35));
    void wait(1900).then(() => engine.stop());
    void animate(2200, (k) => {
      if (taxi.c.destroyed) return;
      const x = stopX + 1500 * k * k;
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
    void tween(this.cam, { x: DOOR_X, y: BASE - 90, zoom: sz * 1.45 }, 2300, ease.inOutCubic);
    void wait(1200).then(() => {
      sfx.bigDoors();
      void animate(900, (k) => !this.doors.destroyed && this.drawDoors(k), ease.outCubic);
      void tween(this.doorLight, { alpha: 0.75, width: 680, height: 540 }, 900, ease.outCubic);
      void tween(this.doorSpill, { alpha: 0.7, width: 500, height: 160 }, 900, ease.outCubic);
      this.sparkBurst();
    });
    // Further away means a little smaller.
    void tween(wrap.scale, { x: 1.05, y: 1.05 }, 2100, ease.linear);
    await tween(wrap, { y: BASE + 4 }, 2100, ease.linear);
    void tween(this.doormanWrap, { rotation: 0 }, 300);
    await wait(150);
    void tween(wrap, { y: BASE - 14, alpha: 0 }, 900, ease.inCubic);
    void tween(wrap.scale, { x: 0.9, y: 0.9 }, 900, ease.inCubic);
    await tween(this.cam, { zoom: sz * 2.9, y: BASE - 70 }, 1000, ease.inCubic);
    walkDir = null;
  }

  destroy() {
    this.view.destroy({ children: true });
  }
}

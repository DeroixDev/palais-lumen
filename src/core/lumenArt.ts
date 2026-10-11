// The house's own pictures in the "Haus des Lichts" look: the Lumen coin and chips with the
// sunburst emblem and the rim legend, the half-sun emblem itself, the chandelier that lights up
// for a jackpot, a wall sconce and the spark of the "Funkenflug". All plain Canvas 2D (no
// ctx.filter), painted once and baked into textures by the callers. Ported from the approved
// sample piece (night blue, brass, moon silver, art-deco sunbursts).

import { INK, dark, ellipse, fillInk, glowAt, gold, light, mix, rgb, rrect, type Ctx } from '../world/painted/brush';
import { HOUSE_CAPS, HOUSE_TAGLINE } from './brand';

const TAU = Math.PI * 2;
/** The serif for coins and plaques (falls back to Georgia; nothing to load). */
export const SERIF = 'Georgia, "Times New Roman", serif';
/** Rim legend on every coin: a small visible protection detail. */
export const RIM_TEXT = 'SPIELMARKE · OHNE GELDWERT · ';
const RIM_BACK = `${HOUSE_CAPS} · ${HOUSE_TAGLINE.toLocaleUpperCase('de-DE')} · `;

/** House colours of the new look. */
export const LUMEN = {
  night: 0x141c40,
  nightDeep: 0x0a0e24,
  nightLight: 0x2a3a7a,
  brass: 0xe0b25a,
  brassLight: 0xf2cd72,
  brassDark: 0xa8741f,
  moon: 0xdfe6f5,
  moonDark: 0x8a96b4,
  flame: 0xffc870,
  flameCore: 0xfff6e0,
  bordeaux: 0x7e1f36,
  cream: 0xf4e8cc,
};

/** An art-deco sunburst: rays from one point, alternating colours. */
export function sunburst(c: Ctx, x: number, y: number, r: number, a0: number, a1: number, n: number, colA: string, colB: string, inner = 0) {
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

/** Writes text evenly around a circle, starting at the top, clockwise. */
export function circleText(c: Ctx, text: string, r: number, size: number, fill: string, emboss = true) {
  c.save();
  c.font = `700 ${size}px ${SERIF}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const chars = [...text];
  const widths = chars.map((ch) => c.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = TAU / (total / r);
  let a = -Math.PI / 2;
  chars.forEach((ch, i) => {
    const da = (widths[i] / r) * scale;
    const m = a + da / 2;
    c.save();
    c.translate(Math.cos(m) * r, Math.sin(m) * r);
    c.rotate(m + Math.PI / 2);
    if (emboss) {
      c.fillStyle = 'rgba(255,248,225,0.55)';
      c.fillText(ch, 0.6, 0.9);
    }
    c.fillStyle = fill;
    c.fillText(ch, 0, 0);
    c.restore();
    a += da;
  });
  c.restore();
}

/** Text stamped into metal: dark lower shadow, light upper edge, then the face. */
export function embossText(c: Ctx, text: string, x: number, y: number, font: string, fill: string, lightA = 0.6, darkA = 0.55) {
  c.font = font;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = `rgba(40,20,4,${darkA})`;
  c.fillText(text, x + 1.4, y + 1.8);
  c.fillStyle = `rgba(255,250,230,${lightA})`;
  c.fillText(text, x - 0.8, y - 0.9);
  c.fillStyle = fill;
  c.fillText(text, x, y);
}

/** Matt brushed brass, lit from the upper left. */
export function brassDisc(c: Ctx, r: number, k = 0) {
  const g = c.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.05, 0, 0, r * 1.05);
  g.addColorStop(0, rgb(light(0xf2cd72, 0.55 - k)));
  g.addColorStop(0.45, rgb(dark(0xd9a64a, k)));
  g.addColorStop(0.85, rgb(dark(0xa8741f, k)));
  g.addColorStop(1, rgb(dark(0x7a4e18, k)));
  return g;
}

/** The house emblem as a fan: rays from a half disc on the base line. */
export function emblemFan(c: Ctx, cx: number, cy: number, r: number, colA: string, colB: string, disc: string, rays = 13) {
  c.save();
  sunburst(c, cx, cy, r, Math.PI, TAU, rays, colA, colB, r * 0.28);
  c.beginPath();
  c.arc(cx, cy, r * 0.26, Math.PI, TAU);
  c.closePath();
  c.fillStyle = disc;
  c.fill();
  c.restore();
}

/**
 * The house emblem, a rising half sun with seven rays over a base line, sized like the old
 * crest: centred on (cx, cy), about `s` wide. `fill` paints the rays and the sun, `detail` the
 * base line and the sun's rim, `hi` an optional bright core. Draw it twice (dark, offset; then
 * light) for an embossed look.
 */
export function drawSunEmblem(c: Ctx, cx: number, cy: number, s: number, fill: string | CanvasGradient, detail: string | CanvasGradient, hi?: string) {
  const by = cy + 0.2 * s;
  const R = 0.5 * s;
  c.save();
  c.fillStyle = fill;
  // Seven tapered rays, the middle one longest.
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + ((i + 0.5) / n) * Math.PI;
    const len = R * (i === 3 ? 1 : i % 2 ? 0.86 : 0.94);
    const w = 0.105;
    c.beginPath();
    c.moveTo(cx + Math.cos(a - w) * R * 0.36, by + Math.sin(a - w) * R * 0.36);
    c.lineTo(cx + Math.cos(a) * len, by + Math.sin(a) * len);
    c.lineTo(cx + Math.cos(a + w) * R * 0.36, by + Math.sin(a + w) * R * 0.36);
    c.closePath();
    c.fill();
  }
  // The half sun.
  c.beginPath();
  c.arc(cx, by, R * 0.3, Math.PI, TAU);
  c.closePath();
  c.fill();
  c.strokeStyle = detail;
  c.lineWidth = Math.max(0.8, 0.035 * s);
  c.stroke();
  if (hi) {
    c.beginPath();
    c.arc(cx, by, R * 0.15, Math.PI, TAU);
    c.closePath();
    c.fillStyle = hi;
    c.fill();
  }
  // Base line with a small step under the sun.
  c.fillStyle = detail;
  c.fillRect(cx - R * 0.95, by, R * 1.9, Math.max(1, 0.05 * s));
  c.fillRect(cx - R * 0.5, by + 0.075 * s, R, Math.max(0.8, 0.035 * s));
  c.restore();
}

/** Crescent moon with a four-point star: the back of every coin (Selene's house). */
export function moonEmblem(c: Ctx, r: number, col: string, colDark: string, star: string) {
  c.save();
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.arc(r * 0.42, -r * 0.18, r * 0.86, 0, TAU, true);
  c.fillStyle = col;
  c.fill('evenodd');
  c.strokeStyle = colDark;
  c.lineWidth = Math.max(1, r * 0.04);
  c.stroke();
  fourStar(c, r * 0.32, -r * 0.08, r * 0.42, star);
  c.restore();
}

/** A four-point star (twinkle). */
export function fourStar(c: Ctx, x: number, y: number, s: number, fill: string) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const rr = i % 2 ? s * 0.22 : s;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

/**
 * The Lumen coin, centred on (0, 0) with radius r: brushed brass, milled edge, the rim legend
 * "SPIELMARKE · OHNE GELDWERT" (from r ≥ 36; smaller coins get a bead ring) and the sunburst
 * on the field. `back` shows the moon side.
 */
export function paintLumenCoin(c: Ctx, r: number, back = false, silver = false) {
  c.save();
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.fillStyle = brassDisc(c, r);
  c.fill();
  const n = r > 30 ? 120 : 60;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    c.beginPath();
    c.moveTo(Math.cos(a) * r * 0.955, Math.sin(a) * r * 0.955);
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    c.strokeStyle = i % 2 ? 'rgba(90,52,12,0.5)' : 'rgba(255,240,190,0.35)';
    c.lineWidth = Math.max(0.8, r * 0.012);
    c.stroke();
  }
  c.beginPath();
  c.arc(0, 0, r * 0.95, 0, TAU);
  c.strokeStyle = 'rgba(60,34,6,0.7)';
  c.lineWidth = Math.max(0.8, r * 0.012);
  c.stroke();
  const big = r >= 36;
  const fr = r * (big ? 0.72 : 0.78);
  c.beginPath();
  c.arc(0, 0, fr, 0, TAU);
  if (silver) {
    const g = c.createRadialGradient(-fr * 0.4, -fr * 0.5, fr * 0.05, 0, 0, fr * 1.05);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, '#cfd6e4');
    g.addColorStop(1, '#7c86a0');
    c.fillStyle = g;
  } else c.fillStyle = brassDisc(c, fr, 0.12);
  c.fill();
  c.strokeStyle = 'rgba(60,34,6,0.75)';
  c.lineWidth = Math.max(1, r * 0.02);
  c.stroke();
  c.beginPath();
  c.arc(0, 0, fr + r * 0.015, Math.PI * 0.9, Math.PI * 1.6);
  c.strokeStyle = 'rgba(255,248,220,0.7)';
  c.lineWidth = Math.max(0.8, r * 0.014);
  c.stroke();
  if (big) {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      ellipse(c, Math.cos(a) * r * 0.765, Math.sin(a) * r * 0.765, r * 0.014, r * 0.014);
      c.fillStyle = 'rgba(70,40,8,0.7)';
      c.fill();
    }
    circleText(c, back ? RIM_BACK : RIM_TEXT, r * 0.855, r * 0.1, '#6e4614');
  } else {
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      ellipse(c, Math.cos(a) * r * 0.87, Math.sin(a) * r * 0.87, r * 0.03, r * 0.03);
      c.fillStyle = i % 2 ? 'rgba(70,40,8,0.55)' : 'rgba(255,240,190,0.45)';
      c.fill();
    }
  }
  c.save();
  c.beginPath();
  c.arc(0, 0, fr * 0.97, 0, TAU);
  c.clip();
  const fieldDark = silver ? 'rgba(60,70,100,0.4)' : 'rgba(110,70,20,0.42)';
  const fieldLight = silver ? 'rgba(255,255,255,0.4)' : 'rgba(255,240,190,0.38)';
  if (!back) {
    // Sunburst rising from the lower third, the house word stamped under it.
    emblemFan(c, 0, fr * 0.34, fr * 1.12, fieldLight, fieldDark, silver ? 'rgba(255,255,255,0.7)' : 'rgba(255,236,170,0.85)', 13);
    c.beginPath();
    c.arc(0, fr * 0.34, fr * 0.29, Math.PI, TAU);
    c.strokeStyle = silver ? 'rgba(60,70,100,0.55)' : 'rgba(110,66,14,0.6)';
    c.lineWidth = Math.max(1, fr * 0.04);
    c.stroke();
    c.fillStyle = silver ? 'rgba(60,70,100,0.5)' : 'rgba(110,66,14,0.55)';
    c.fillRect(-fr, fr * 0.34, fr * 2, Math.max(1, fr * 0.05));
    if (big) embossText(c, 'LUMEN', 0, fr * 0.62, `700 ${fr * 0.22}px ${SERIF}`, silver ? '#7c86a0' : '#a8741f', 0.5, 0.45);
  } else {
    sunburst(c, 0, 0, fr, 0, TAU, 24, fieldLight, 'rgba(0,0,0,0)', fr * 0.55);
    moonEmblem(c, fr * 0.56, silver ? '#e6ebf5' : '#e7bd62', 'rgba(70,40,8,0.6)', silver ? '#ffffff' : '#fff2c0');
  }
  c.restore();
  // Thin ink edge for the painted look.
  c.beginPath();
  c.arc(0, 0, r - 0.5, 0, TAU);
  c.strokeStyle = 'rgba(14,10,24,0.6)';
  c.lineWidth = Math.max(1, r * 0.03);
  c.stroke();
  c.restore();
}

export interface ChipDesign {
  base: number;
  inlay: number;
  field: number;
  ink: number;
  pearl?: boolean;
}

/** Lacquer chips of the sample: six inlays with deco steps, brass ring, rim legend, sunburst field. */
export const CHIP_DESIGNS: Record<string, ChipDesign> = {
  bordeaux: { base: 0x7e1f36, inlay: 0xf4e8cc, field: 0xf4e8cc, ink: 0x5a1024 },
  night: { base: 0x22306a, inlay: 0xf2cd72, field: 0x10173a, ink: 0xffd98a },
  moonglass: { base: 0xcfd8f0, inlay: 0x5fb8d8, field: 0x141c40, ink: 0xd8f4ff, pearl: true },
};

/** A lacquer chip centred on (0, 0). `label` is the value in the middle ('' for none). */
export function paintLumenChip(c: Ctx, r: number, d: ChipDesign, label = '') {
  const base = d.base;
  c.save();
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.05);
  g.addColorStop(0, rgb(light(base, d.pearl ? 0.6 : 0.3)));
  g.addColorStop(0.6, rgb(base));
  g.addColorStop(1, rgb(dark(base, d.pearl ? 0.35 : 0.45)));
  c.fillStyle = g;
  c.fill();
  if (d.pearl) {
    for (const [x, y, col] of [[-0.3, -0.2, 0xffd6f0], [0.35, 0.1, 0xb8f0ff], [0, 0.45, 0xfff0c0]] as const) glowAt(c, x * r, y * r, r * 0.6, r * 0.5, col, 0.35);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - Math.PI / 2;
    const w = 0.2;
    c.beginPath();
    c.arc(0, 0, r * 0.985, a - w, a + w);
    c.arc(0, 0, r * 0.8, a + w * 0.92, a - w * 0.92, true);
    c.closePath();
    c.fillStyle = rgb(d.inlay);
    c.fill();
    c.strokeStyle = 'rgba(20,10,20,0.35)';
    c.lineWidth = r * 0.012;
    c.stroke();
    for (const k of [0.4, 0.75]) {
      c.beginPath();
      c.arc(0, 0, r * (0.8 + 0.185 * k), a - w * k, a + w * k);
      c.strokeStyle = rgb(dark(d.inlay, 0.35), 0.55);
      c.lineWidth = Math.max(0.8, r * 0.012);
      c.stroke();
    }
  }
  c.beginPath();
  c.arc(0, 0, r * 0.79, 0, TAU);
  c.lineWidth = r * 0.03;
  c.strokeStyle = gold(c, -r, -r, r, r);
  c.stroke();
  c.beginPath();
  c.arc(0, 0, r * 0.775, 0, TAU);
  c.arc(0, 0, r * 0.6, 0, TAU, true);
  c.fillStyle = rgb(dark(base, 0.55), 0.85);
  c.fill('evenodd');
  if (r >= 30) circleText(c, RIM_TEXT, r * 0.69, r * 0.085, '#f2cd72', false);
  const fr = r * 0.585;
  c.beginPath();
  c.arc(0, 0, fr, 0, TAU);
  c.lineWidth = r * 0.035;
  c.strokeStyle = gold(c, -fr, -fr, fr, fr);
  c.stroke();
  const fg = c.createRadialGradient(-fr * 0.4, -fr * 0.4, 1, 0, 0, fr);
  fg.addColorStop(0, rgb(light(d.field, 0.18)));
  fg.addColorStop(1, rgb(dark(d.field, 0.15)));
  c.fillStyle = fg;
  c.fill();
  c.save();
  c.beginPath();
  c.arc(0, 0, fr * 0.97, 0, TAU);
  c.clip();
  const onLight = d.field === 0xf4e8cc;
  emblemFan(c, 0, fr * (label ? 0.66 : 0.34), fr * 1.2, onLight ? 'rgba(200,145,58,0.45)' : 'rgba(242,205,114,0.28)', 'rgba(0,0,0,0)', onLight ? 'rgba(200,145,58,0.7)' : 'rgba(242,205,114,0.55)');
  if (label) {
    const sz = label.length > 3 ? fr * 0.5 : fr * 0.72;
    c.font = `800 ${sz}px ${SERIF}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = onLight ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)';
    c.fillText(label, 1, -fr * 0.06 + 2);
    c.fillStyle = rgb(d.ink);
    c.fillText(label, 0, -fr * 0.06);
  }
  c.restore();
  c.beginPath();
  c.arc(0, 0, r - 0.5, 0, TAU);
  c.strokeStyle = 'rgba(14,10,24,0.55)';
  c.lineWidth = Math.max(1, r * 0.02);
  c.stroke();
  c.restore();
}

// ---- Chandelier and sconce ---------------------------------------------------------------------

/** Arm tips of the front-view chandelier (six arms on an ellipse), relative to its crown. */
export function chandelierArm(i: number) {
  const a = (i / 6) * TAU + Math.PI / 6;
  return { x: Math.cos(a) * 120, y: 70 + Math.sin(a) * 26, back: Math.sin(a) < 0 };
}

/**
 * The house chandelier in front view, crown at (0, 0), about 340×230 (x −170…170, y −60…170).
 * Candle tips are left unlit (cream); the caller adds the flames as glows.
 */
export function paintChandelier(c: Ctx) {
  c.fillStyle = gold(c, -3, 0, 3, 0);
  c.fillRect(-3, -60, 6, 140);
  for (let i = 0; i < 3; i++) {
    const ww = 34 - i * 9;
    rrect(c, -ww, -10 - i * 12, ww * 2, 10, 3);
    fillInk(c, gold(c, -ww, -10 - i * 12, ww, -i * 12), 1.4);
  }
  const drawArm = (i: number) => {
    const p = chandelierArm(i);
    c.beginPath();
    c.moveTo(0, 86);
    c.bezierCurveTo(p.x * 0.3, 120, p.x * 0.9, 110, p.x, p.y + 8);
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.stroke();
    c.strokeStyle = gold(c, -120, 60, 120, 120);
    c.lineWidth = 3.6;
    c.stroke();
    ellipse(c, p.x, p.y + 8, 10, 3.6);
    fillInk(c, gold(c, p.x - 10, p.y + 4, p.x + 10, p.y + 12), 1.2);
    rrect(c, p.x - 3.5, p.y - 12, 7, 20, 2);
    fillInk(c, '#fff6e6', 1.2);
  };
  for (let i = 0; i < 6; i++) if (chandelierArm(i).back) drawArm(i);
  c.beginPath();
  c.moveTo(-26, 76);
  c.lineTo(26, 76);
  c.lineTo(0, 150);
  c.closePath();
  const g = c.createLinearGradient(-26, 76, 26, 150);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#bfe6ff');
  g.addColorStop(1, '#7aa8d0');
  fillInk(c, g, 1.6);
  ellipse(c, 0, 80, 30, 8);
  fillInk(c, gold(c, -30, 72, 30, 88), 1.6);
  for (let i = 0; i < 11; i++) {
    const px = -100 + i * 20;
    const py = 102 + Math.abs(i - 5) * -3;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px - 3, py + 8);
    c.lineTo(px, py + 15);
    c.lineTo(px + 3, py + 8);
    c.closePath();
    c.fillStyle = '#e6f6ff';
    c.fill();
    c.strokeStyle = 'rgba(90,120,150,0.6)';
    c.lineWidth = 0.8;
    c.stroke();
  }
  for (let i = 0; i < 6; i++) if (!chandelierArm(i).back) drawArm(i);
}

/** A brass wall sconce with three candles, centred on its plate; about 70×60 (y −22…30). */
export function paintSconce(c: Ctx) {
  c.beginPath();
  c.moveTo(-16, 30);
  c.lineTo(-10, -20);
  c.lineTo(10, -20);
  c.lineTo(16, 30);
  c.closePath();
  fillInk(c, gold(c, -16, -20, 16, 30), 1.6);
  sunburst(c, 0, 30, 15, Math.PI, TAU, 7, 'rgba(90,52,12,0.6)', 'rgba(0,0,0,0)', 3);
  for (const dx of [-26, 0, 26]) {
    c.beginPath();
    c.moveTo(0, 10);
    c.quadraticCurveTo(dx, 18, dx, -2);
    c.strokeStyle = '#c8913a';
    c.lineWidth = 3;
    c.stroke();
    ellipse(c, dx, -2, 7, 2.5);
    fillInk(c, gold(c, dx - 7, -4, dx + 7, 0), 1.2);
    rrect(c, dx - 3, -20, 6, 18, 2);
    fillInk(c, '#fff6e6', 1.2);
  }
}

/** A spark seen in flight: a bright round head with a tapering tail to the left; white, tint it. 64×16. */
export function paintSparkStreak(c: Ctx) {
  const g = c.createLinearGradient(0, 0, 56, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0.95)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, 8);
  c.quadraticCurveTo(40, 4.5, 54, 4.5);
  c.lineTo(54, 11.5);
  c.quadraticCurveTo(40, 11.5, 0, 8);
  c.fill();
  const h = c.createRadialGradient(54, 8, 0, 54, 8, 8);
  h.addColorStop(0, 'rgba(255,255,255,1)');
  h.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = h;
  c.fillRect(44, 0, 20, 16);
}

/**
 * A small light that floats (companions, the swarm in rooms): a soft halo, a glass bead and a
 * four-point twinkle; white, tint it. 64×64, centred.
 */
export function paintLightMote(c: Ctx) {
  const h = c.createRadialGradient(32, 32, 0, 32, 32, 30);
  h.addColorStop(0, 'rgba(255,255,255,0.95)');
  h.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  h.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = h;
  c.fillRect(0, 0, 64, 64);
  c.save();
  c.translate(32, 32);
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const rr = i % 2 ? 3.2 : i % 4 === 0 ? 27 : 18;
    c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.fill();
  c.beginPath();
  c.arc(0, 0, 6.5, 0, TAU);
  c.fillStyle = '#ffffff';
  c.fill();
  c.restore();
}

/** Night-blue to brass colour for the deco rays behind trophies and plaques. */
export const deco = (k: number) => mix(LUMEN.night, LUMEN.brass, k);

/**
 * A small hand lantern centred on (x, y), about s high: ring, stepped brass cap, glowing glass
 * with a flame, brass foot. Lit from inside.
 */
export function paintMiniLantern(c: Ctx, x: number, y: number, s: number, glass = 0xffd76e) {
  const k = s / 100;
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  glowAt(c, 0, 6, 62, 62, 0xffc864, 0.55, 'lighter');
  c.beginPath();
  c.arc(0, -42, 9, Math.PI * 0.95, Math.PI * 2.05);
  c.strokeStyle = INK;
  c.lineWidth = 8;
  c.stroke();
  c.strokeStyle = gold(c, -9, -52, 9, -36);
  c.lineWidth = 3.5;
  c.stroke();
  c.beginPath();
  c.moveTo(-28, -22);
  c.lineTo(28, -22);
  c.lineTo(16, -36);
  c.lineTo(-16, -36);
  c.closePath();
  fillInk(c, gold(c, -28, -40, 28, -20), 3.5);
  c.beginPath();
  c.moveTo(-22, -22);
  c.lineTo(22, -22);
  c.lineTo(18, 30);
  c.lineTo(-18, 30);
  c.closePath();
  const gl = c.createRadialGradient(-2, 6, 3, 0, 4, 34);
  gl.addColorStop(0, '#fffef0');
  gl.addColorStop(0.45, rgb(glass));
  gl.addColorStop(1, rgb(dark(glass, 0.45)));
  fillInk(c, gl, 3.5);
  c.beginPath();
  c.moveTo(0, -8);
  c.bezierCurveTo(8, 2, 7, 14, 0, 16);
  c.bezierCurveTo(-7, 14, -8, 2, 0, -8);
  c.fillStyle = '#fffbe6';
  c.fill();
  c.strokeStyle = 'rgba(232,115,31,0.8)';
  c.lineWidth = 2;
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.fillRect(-17, -18, 5, 44);
  c.beginPath();
  c.moveTo(-26, 28);
  c.lineTo(26, 28);
  c.lineTo(22, 40);
  c.lineTo(-22, 40);
  c.closePath();
  fillInk(c, gold(c, -26, 28, 26, 42), 3.5);
  c.restore();
}

/** A glowing ember centred on (x, y), radius r: white core, warm halo, four-point twinkle. */
export function paintEmber(c: Ctx, x: number, y: number, r: number, halo = 0xffb347) {
  glowAt(c, x, y, r, r, halo, 0.7, 'lighter');
  glowAt(c, x, y, r * 0.55, r * 0.55, 0xffe6a0, 0.9, 'lighter');
  fourStar(c, x, y, r * 0.9, 'rgba(255,240,200,0.9)');
  const g = c.createRadialGradient(x - r * 0.1, y - r * 0.1, 0.5, x, y, r * 0.34);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#fff6d8');
  g.addColorStop(1, '#ffc870');
  ellipse(c, x, y, r * 0.32, r * 0.32);
  c.fillStyle = g;
  c.fill();
}

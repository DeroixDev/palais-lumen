// Painted lamps for the Lampenbuch. Every entry is built from a kit: a body (candle, lantern,
// glass, tube, lens, chandelier …) in one of its forms, a pattern on its glass or wax, its
// colours (metal, glass, flame, pattern) and an optional glow. Drawn once with Canvas 2D (soft
// gradients, ink outline, rim light) and cached; the same painting serves the floating light,
// the album page and the dark silhouette of a missing entry.

import type { Texture } from 'pixi.js';
import type { LampArt, LampSpecies } from '../../core/album';
import { chandelierArm, fourStar, paintChandelier } from '../../core/lumenArt';
import { INK, dark, ellipse, fillInk, glowAt, light, mix, paint, rgb, rrect, seeded, type Ctx } from './brush';

type Rnd = () => number;

/** True while painting a silhouette: no light halos, so the dark shape stays crisp. */
let quiet = false;

const lw = (u: number) => Math.max(1, u * 0.028);

/** Left-lit cylinder shading across x0..x1. */
function shade(c: Ctx, x0: number, x1: number, col: number, k = 0.35) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, rgb(dark(col, k * 0.6)));
  g.addColorStop(0.28, rgb(light(col, k)));
  g.addColorStop(0.55, rgb(col));
  g.addColorStop(1, rgb(dark(col, k)));
  return g;
}

/** Polished metal: a brighter, harder version of shade(). */
function metalFill(c: Ctx, x0: number, x1: number, col: number) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, rgb(dark(col, 0.35)));
  g.addColorStop(0.25, rgb(light(col, 0.55)));
  g.addColorStop(0.45, rgb(col));
  g.addColorStop(0.8, rgb(dark(col, 0.3)));
  g.addColorStop(1, rgb(dark(col, 0.5)));
  return g;
}

/** A soft white streak down the left side of glass. */
function sheen(c: Ctx, x: number, y0: number, y1: number, w: number, a = 0.55) {
  c.save();
  c.strokeStyle = `rgba(255,255,255,${a})`;
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(x, y0);
  c.quadraticCurveTo(x - w * 0.6, (y0 + y1) / 2, x, y1);
  c.stroke();
  c.restore();
}

/** A candle flame standing on (x, y), `s` = width unit (height ≈ 2.6 s). */
function flame(c: Ctx, x: number, y: number, s: number, col: number) {
  if (!quiet) glowAt(c, x, y - s * 1.1, s * 3.4, s * 3.4, col, 0.5, 'lighter');
  c.beginPath();
  c.moveTo(x, y - s * 2.6);
  c.bezierCurveTo(x + s * 0.35, y - s * 1.7, x + s * 0.95, y - s * 0.9, x + s * 0.7, y - s * 0.3);
  c.quadraticCurveTo(x, y + s * 0.45, x - s * 0.7, y - s * 0.3);
  c.bezierCurveTo(x - s * 0.95, y - s * 0.9, x - s * 0.35, y - s * 1.7, x, y - s * 2.6);
  const g = c.createRadialGradient(x, y - s * 0.7, 0, x, y - s * 0.9, s * 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, rgb(light(col, 0.6)));
  g.addColorStop(0.75, rgb(col));
  g.addColorStop(1, rgb(dark(col, 0.25)));
  c.fillStyle = g;
  c.fill();
  c.beginPath();
  c.ellipse(x, y - s * 0.25, s * 0.22, s * 0.35, 0, 0, Math.PI * 2);
  c.fillStyle = 'rgba(120,170,255,0.55)';
  c.fill();
}

/** A bright point of light with a soft halo (bulbs, fireflies, sparks). */
function bead(c: Ctx, x: number, y: number, r: number, col: number, a = 1) {
  if (!quiet) glowAt(c, x, y, r * 3.5, r * 3.5, col, 0.55 * a, 'lighter');
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(1, rgb(col, a));
  c.fillStyle = g;
  c.fill();
}

/** A thick stroked line with an ink edge: arms, rods, wire. */
function rod(c: Ctx, path: () => void, w: number, col: string | CanvasGradient) {
  c.save();
  path();
  c.strokeStyle = INK;
  c.lineWidth = w + 2.4;
  c.stroke();
  path();
  c.strokeStyle = col;
  c.lineWidth = w;
  c.stroke();
  c.restore();
}

function gear(c: Ctx, x: number, y: number, r: number, col: string) {
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? r * 0.78 : r;
    c.arc(x, y, rr, a0, a0 + Math.PI / 8);
  }
  c.closePath();
  c.moveTo(x + r * 0.32, y);
  c.arc(x, y, r * 0.32, 0, Math.PI * 2, true);
  c.fillStyle = col;
  c.fill('evenodd');
}

function hex(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  c.closePath();
}

let scratch: CanvasRenderingContext2D | null = null;

/**
 * Runs `draw` on a scratch canvas with the same transform and composites the result onto `c`.
 * Drawing that way keeps `c`'s current path (so the caller can still ink the outline it
 * clipped to) and honours `c`'s clip.
 */
function aside(c: Ctx, draw: (o: Ctx) => void) {
  const W = c.canvas.width;
  const H = c.canvas.height;
  if (!scratch) scratch = document.createElement('canvas').getContext('2d')!;
  const o = scratch;
  if (o.canvas.width < W || o.canvas.height < H) {
    o.canvas.width = Math.max(o.canvas.width, W);
    o.canvas.height = Math.max(o.canvas.height, H);
  }
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = 'source-over';
  o.globalAlpha = 1;
  o.clearRect(0, 0, W, H);
  o.setTransform(c.getTransform());
  o.lineJoin = 'round';
  o.lineCap = 'round';
  draw(o);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.drawImage(o.canvas, 0, 0, W, H, 0, 0, W, H);
  c.restore();
}

/**
 * The entry's pattern over the box (x, y, w, h). The caller has clipped to the surface it
 * belongs on (wax, glass, paper, clay …); the current path survives for the outline.
 */
function pattern(c: Ctx, a: LampArt, x: number, y: number, w: number, h: number, u: number, r: Rnd) {
  aside(c, (o) => patternOn(o, a, x, y, w, h, u, r));
}

function patternOn(c: Ctx, a: LampArt, x: number, y: number, w: number, h: number, u: number, r: Rnd) {
  const m = a.mark;
  const cx = x + w / 2;
  const cy = y + h / 2;
  c.save();
  switch (a.pattern) {
    case 'drips':
      c.fillStyle = rgb(light(m, 0.2), 0.85);
      for (let i = 0; i < 5; i++) {
        const dx = x + w * (0.08 + i * 0.21 + (r() - 0.5) * 0.06);
        const len = h * (0.12 + r() * 0.3);
        const dw = w * 0.07;
        c.beginPath();
        c.moveTo(dx - dw, y - 2);
        c.lineTo(dx - dw, y + len);
        c.arc(dx, y + len, dw, Math.PI, 0, true);
        c.lineTo(dx + dw, y - 2);
        c.fill();
      }
      break;
    case 'cells':
      c.strokeStyle = rgb(m, 0.45);
      c.lineWidth = Math.max(0.8, u * 0.016);
      for (let yy = y; yy < y + h + u * 0.1; yy += u * 0.1) {
        const odd = Math.round((yy - y) / (u * 0.1)) % 2;
        for (let xx = x + (odd ? u * 0.058 : 0); xx < x + w + u * 0.1; xx += u * 0.116) {
          hex(c, xx, yy, u * 0.064);
          c.stroke();
        }
      }
      break;
    case 'bands':
      c.fillStyle = rgb(m, 0.55);
      for (const k of [0.18, 0.5, 0.82]) c.fillRect(x, y + h * k - u * 0.025, w, u * 0.05);
      c.fillStyle = 'rgba(255,244,220,0.35)';
      for (const k of [0.18, 0.5, 0.82]) c.fillRect(x, y + h * k - u * 0.025, w, u * 0.012);
      break;
    case 'dots':
      for (let i = 0; i < 9; i++) bead(c, x + w * (0.12 + r() * 0.76), y + h * (0.12 + r() * 0.76), u * (0.025 + r() * 0.025), m, 0.9);
      break;
    case 'stars':
      for (let i = 0; i < 7; i++) fourStar(c, x + w * (0.1 + r() * 0.8), y + h * (0.1 + r() * 0.8), u * (0.05 + r() * 0.05), rgb(m, 0.9));
      break;
    case 'zigzag':
      c.strokeStyle = rgb(m, 0.85);
      c.lineWidth = u * 0.05;
      for (const k of [0.3, 0.7]) {
        c.beginPath();
        for (let i = 0; i <= 10; i++) c.lineTo(x + (w * i) / 10, y + h * k + (i % 2 ? -1 : 1) * u * 0.06);
        c.stroke();
      }
      break;
    case 'mesh':
      c.strokeStyle = rgb(m, 0.6);
      c.lineWidth = Math.max(0.6, u * 0.012);
      for (let t = -h; t < w + h; t += u * 0.07) {
        c.beginPath();
        c.moveTo(x + t, y);
        c.lineTo(x + t + h * 0.6, y + h);
        c.moveTo(x + t, y);
        c.lineTo(x + t - h * 0.6, y + h);
        c.stroke();
      }
      break;
    case 'gears':
      gear(c, cx - w * 0.14, cy + h * 0.06, Math.min(w, h) * 0.22, rgb(m, 0.75));
      gear(c, cx + w * 0.2, cy - h * 0.14, Math.min(w, h) * 0.14, rgb(m, 0.65));
      break;
    case 'rings':
      c.strokeStyle = rgb(m, 0.55);
      for (let i = 1; i <= 5; i++) {
        c.lineWidth = Math.max(0.8, u * (0.03 - i * 0.003));
        c.beginPath();
        c.ellipse(cx, cy, (w / 2) * (i / 5.4), (h / 2) * (i / 5.4), 0, 0, Math.PI * 2);
        c.stroke();
      }
      break;
    case 'rays':
      c.fillStyle = rgb(m, 0.35);
      for (let i = 0; i < 12; i++) {
        const t = (i / 12) * Math.PI * 2;
        c.beginPath();
        c.moveTo(cx, cy);
        c.arc(cx, cy, Math.max(w, h), t, t + Math.PI / 18);
        c.closePath();
        c.fill();
      }
      break;
    case 'crescent': {
      const rr = Math.min(w, h) * 0.26;
      c.beginPath();
      c.arc(cx, cy, rr, 0, Math.PI * 2);
      c.arc(cx + rr * 0.42, cy - rr * 0.2, rr * 0.86, 0, Math.PI * 2, true);
      c.fillStyle = rgb(m, 0.85);
      c.fill('evenodd');
      fourStar(c, cx + rr * 0.9, cy + rr * 0.55, rr * 0.3, rgb(m, 0.9));
      break;
    }
    case 'coins':
      for (let i = 0; i < 6; i++) {
        const px = x + w * (0.15 + r() * 0.7);
        const py = y + h * (0.55 + r() * 0.35);
        c.beginPath();
        c.ellipse(px, py, u * 0.07, u * 0.035, 0, 0, Math.PI * 2);
        c.fillStyle = rgb(m);
        c.fill();
        c.strokeStyle = rgb(dark(m, 0.5), 0.8);
        c.lineWidth = Math.max(0.6, u * 0.012);
        c.stroke();
      }
      break;
    case 'zero':
      c.font = `700 ${Math.round(h * 0.62)}px Georgia, serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (!quiet) {
        c.shadowColor = rgb(a.flame);
        c.shadowBlur = u * 0.2;
      }
      c.fillStyle = rgb(m, 0.95);
      c.fillText('0', cx, cy + h * 0.03);
      break;
    case 'facets': {
      // Mirror tiles, smaller towards the rim.
      const rows = 9;
      for (let i = 0; i < rows; i++) {
        const v0 = -1 + (2 * i) / rows;
        const v1 = v0 + 2 / rows;
        const yy0 = cy + (h / 2) * v0;
        const yy1 = cy + (h / 2) * v1;
        const half = (w / 2) * Math.sqrt(Math.max(0, 1 - ((v0 + v1) / 2) ** 2));
        const cols = Math.max(2, Math.round((half * 2) / (u * 0.13)));
        for (let j = 0; j < cols; j++) {
          const xx0 = cx - half + (2 * half * j) / cols;
          const k = r();
          c.fillStyle = k > 0.88 ? 'rgba(255,255,255,0.95)' : rgb(mix(dark(a.glass, 0.4), light(a.glass, 0.6), k), 0.95);
          c.fillRect(xx0 + 0.6, yy0 + 0.6, (2 * half) / cols - 1.2, yy1 - yy0 - 1.2);
        }
      }
      break;
    }
    default:
      break;
  }
  c.restore();
}

// ---- Bodies ----------------------------------------------------------------------------------------
// Each paints the lamp centred on (0, 0), from about -u (top) to +u (bottom).

function candle(c: Ctx, a: LampArt, u: number, r: Rnd) {
  const s = a.size ?? 1;
  const bw = u * (0.2 + 0.16 * (1.2 - s));
  const H = u * 1.05 * s;
  const yb = u * 0.74;
  const yt = yb - H;
  // Dish with a ring handle.
  c.beginPath();
  c.arc(u * 0.62, u * 0.7, u * 0.13, 0, Math.PI * 2);
  c.lineWidth = u * 0.07;
  c.strokeStyle = INK;
  c.stroke();
  c.lineWidth = u * 0.045;
  c.strokeStyle = rgb(a.metal);
  c.stroke();
  ellipse(c, 0, u * 0.82, u * 0.66, u * 0.15);
  fillInk(c, metalFill(c, -u * 0.66, u * 0.66, a.metal), lw(u));
  ellipse(c, 0, u * 0.78, u * 0.5, u * 0.09);
  c.fillStyle = rgb(dark(a.metal, 0.35));
  c.fill();
  rrect(c, -bw * 0.75, yb - u * 0.04, bw * 1.5, u * 0.1, u * 0.03);
  fillInk(c, metalFill(c, -bw, bw, a.metal), lw(u));
  // The candle.
  c.beginPath();
  c.moveTo(-bw / 2, yb);
  c.lineTo(-bw / 2, yt);
  c.ellipse(0, yt, bw / 2, bw * 0.18, 0, Math.PI, 0);
  c.lineTo(bw / 2, yb);
  c.closePath();
  c.save();
  c.fillStyle = shade(c, -bw / 2, bw / 2, a.glass, 0.3);
  c.fill();
  c.clip();
  pattern(c, a, -bw / 2, yt, bw, H, u, r);
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  ellipse(c, 0, yt, bw * 0.38, bw * 0.12);
  c.fillStyle = rgb(light(a.glass, 0.35));
  c.fill();
  c.strokeStyle = '#2a1a10';
  c.lineWidth = Math.max(1, u * 0.02);
  c.beginPath();
  c.moveTo(0, yt);
  c.lineTo(u * 0.01, yt - u * 0.06);
  c.stroke();
  flame(c, u * 0.01, yt - u * 0.03, u * (0.07 + 0.03 * s), a.flame);
}

function candelabra(c: Ctx, a: LampArt, u: number, r: Rnd) {
  const n = a.n ?? 3;
  const gm = (x0: number, x1: number) => metalFill(c, x0, x1, a.metal);
  // Foot.
  c.beginPath();
  c.moveTo(-u * 0.42, u * 0.92);
  c.quadraticCurveTo(-u * 0.36, u * 0.7, -u * 0.08, u * 0.62);
  c.lineTo(u * 0.08, u * 0.62);
  c.quadraticCurveTo(u * 0.36, u * 0.7, u * 0.42, u * 0.92);
  c.closePath();
  c.save();
  c.fillStyle = gm(-u * 0.42, u * 0.42);
  c.fill();
  c.clip();
  pattern(c, a, -u * 0.42, u * 0.62, u * 0.84, u * 0.3, u, r);
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  // Stem with knops.
  rrect(c, -u * 0.05, -u * 0.1, u * 0.1, u * 0.74, u * 0.04);
  fillInk(c, gm(-u * 0.05, u * 0.05), lw(u));
  for (const ky of [u * 0.5, u * 0.22]) {
    ellipse(c, 0, ky, u * 0.11, u * 0.06);
    fillInk(c, gm(-u * 0.11, u * 0.11), lw(u));
  }
  // Arms and cups.
  const span = n >= 5 ? 0.82 : 0.66;
  const cups: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const x = t * 2 * u * span;
    const y = -u * 0.12 - (1 - Math.abs(t) * 2) * u * 0.16;
    cups.push([x, y]);
    if (Math.abs(x) < 1) continue;
    rod(
      c,
      () => {
        c.beginPath();
        c.moveTo(0, u * 0.12);
        c.bezierCurveTo(x * 0.3, u * 0.32, x, u * 0.22, x, y + u * 0.06);
      },
      u * 0.06,
      gm(-u, u),
    );
  }
  for (const [x, y] of cups) {
    c.beginPath();
    c.moveTo(x - u * 0.11, y);
    c.lineTo(x + u * 0.11, y);
    c.lineTo(x + u * 0.05, y + u * 0.08);
    c.lineTo(x - u * 0.05, y + u * 0.08);
    c.closePath();
    fillInk(c, gm(x - u * 0.11, x + u * 0.11), lw(u));
    const ch = u * 0.3;
    rrect(c, x - u * 0.045, y - ch, u * 0.09, ch, u * 0.02);
    fillInk(c, shade(c, x - u * 0.045, x + u * 0.045, a.glass, 0.25), lw(u) * 0.8);
    flame(c, x, y - ch - u * 0.01, u * 0.06, a.flame);
  }
}

function oil(c: Ctx, a: LampArt, u: number, r: Rnd) {
  const cy = u * 0.42;
  // Foot.
  ellipse(c, 0, cy + u * 0.3, u * 0.32, u * 0.08);
  fillInk(c, rgb(dark(a.glass, 0.3)), lw(u));
  // Ring handle.
  c.beginPath();
  c.arc(-u * 0.78, cy - u * 0.06, u * 0.14, 0, Math.PI * 2);
  c.lineWidth = u * 0.11;
  c.strokeStyle = INK;
  c.stroke();
  c.lineWidth = u * 0.07;
  c.strokeStyle = rgb(a.metal);
  c.stroke();
  // Body and spout.
  c.beginPath();
  c.moveTo(-u * 0.7, cy);
  c.bezierCurveTo(-u * 0.7, cy - u * 0.36, u * 0.3, cy - u * 0.36, u * 0.5, cy - u * 0.14);
  c.lineTo(u * 0.96, cy - u * 0.2);
  c.quadraticCurveTo(u * 1.08, cy - u * 0.08, u * 0.94, cy + u * 0.02);
  c.lineTo(u * 0.5, cy + u * 0.14);
  c.bezierCurveTo(u * 0.3, cy + u * 0.34, -u * 0.7, cy + u * 0.36, -u * 0.7, cy);
  c.closePath();
  c.save();
  const g = c.createLinearGradient(0, cy - u * 0.3, 0, cy + u * 0.3);
  g.addColorStop(0, rgb(light(a.glass, 0.35)));
  g.addColorStop(0.5, rgb(a.glass));
  g.addColorStop(1, rgb(dark(a.glass, 0.4)));
  c.fillStyle = g;
  c.fill();
  c.clip();
  pattern(c, a, -u * 0.7, cy - u * 0.3, u * 1.2, u * 0.6, u, r);
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  // Filling hole.
  ellipse(c, -u * 0.12, cy - u * 0.2, u * 0.13, u * 0.05);
  fillInk(c, rgb(dark(a.glass, 0.6)), lw(u) * 0.8);
  flame(c, u * 0.96, cy - u * 0.12, u * 0.15, a.flame);
}

function chimney(c: Ctx, a: LampArt, u: number, r: Rnd) {
  const petro = a.form === 'petroleum';
  const gm = (x0: number, x1: number) => metalFill(c, x0, x1, a.metal);
  // Foot.
  c.beginPath();
  c.moveTo(-u * 0.4, u * 0.94);
  c.quadraticCurveTo(-u * 0.34, u * 0.74, -u * 0.08, u * 0.7);
  c.lineTo(u * 0.08, u * 0.7);
  c.quadraticCurveTo(u * 0.34, u * 0.74, u * 0.4, u * 0.94);
  c.closePath();
  c.save();
  c.fillStyle = gm(-u * 0.4, u * 0.4);
  c.fill();
  c.clip();
  if (!petro) pattern(c, a, -u * 0.4, u * 0.7, u * 0.8, u * 0.24, u, r);
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  let burner: number;
  if (petro) {
    // Glass font full of oil on a short stem.
    rrect(c, -u * 0.07, u * 0.5, u * 0.14, u * 0.22, u * 0.03);
    fillInk(c, gm(-u * 0.07, u * 0.07), lw(u));
    ellipse(c, 0, u * 0.32, u * 0.36, u * 0.22);
    c.save();
    c.fillStyle = shade(c, -u * 0.36, u * 0.36, a.glass, 0.35);
    c.fill();
    c.clip();
    pattern(c, a, -u * 0.36, u * 0.1, u * 0.72, u * 0.44, u, r);
    c.restore();
    c.strokeStyle = INK;
    c.lineWidth = lw(u);
    c.stroke();
    sheen(c, -u * 0.2, u * 0.2, u * 0.42, u * 0.04, 0.5);
    burner = u * 0.06;
  } else {
    // Slim column and a ring-shaped reservoir.
    rrect(c, -u * 0.05, u * 0.12, u * 0.1, u * 0.6, u * 0.03);
    fillInk(c, gm(-u * 0.05, u * 0.05), lw(u));
    ellipse(c, 0, u * 0.12, u * 0.24, u * 0.09);
    fillInk(c, gm(-u * 0.24, u * 0.24), lw(u));
    burner = u * 0.02;
  }
  // Burner gallery.
  rrect(c, -u * 0.17, burner - u * 0.06, u * 0.34, u * 0.08, u * 0.02);
  fillInk(c, gm(-u * 0.17, u * 0.17), lw(u));
  // Flame, then the chimney glass over it.
  flame(c, 0, burner - u * 0.07, u * 0.12, a.flame);
  c.beginPath();
  if (petro) {
    c.moveTo(-u * 0.14, burner - u * 0.07);
    c.bezierCurveTo(-u * 0.32, burner - u * 0.2, -u * 0.26, burner - u * 0.42, -u * 0.12, burner - u * 0.5);
    c.lineTo(-u * 0.12, -u * 0.92);
    c.lineTo(u * 0.12, -u * 0.92);
    c.lineTo(u * 0.12, burner - u * 0.5);
    c.bezierCurveTo(u * 0.26, burner - u * 0.42, u * 0.32, burner - u * 0.2, u * 0.14, burner - u * 0.07);
  } else {
    c.moveTo(-u * 0.13, burner - u * 0.07);
    c.lineTo(-u * 0.13, -u * 0.88);
    c.lineTo(u * 0.13, -u * 0.88);
    c.lineTo(u * 0.13, burner - u * 0.07);
  }
  c.closePath();
  c.fillStyle = rgb(light(a.flame, 0.6), 0.22);
  c.fill();
  c.strokeStyle = rgb(dark(a.glass, 0.5), 0.9);
  c.lineWidth = lw(u) * 0.9;
  c.stroke();
  sheen(c, -u * 0.07, -u * 0.82, burner - u * 0.15, u * 0.035, 0.6);
  ellipse(c, 0, petro ? -u * 0.92 : -u * 0.88, u * (petro ? 0.12 : 0.13), u * 0.03);
  c.strokeStyle = rgb(dark(a.glass, 0.5), 0.9);
  c.stroke();
}

function lantern(c: Ctx, a: LampArt, u: number, r: Rnd) {
  const gm = (x0: number, x1: number) => metalFill(c, x0, x1, a.metal);
  const glassFill = (x: number, y: number, rr: number) => {
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, rgb(light(a.flame, 0.7), 0.95));
    g.addColorStop(0.5, rgb(mix(a.glass, a.flame, 0.4), 0.8));
    g.addColorStop(1, rgb(dark(a.glass, 0.25), 0.75));
    return g;
  };
  const form = a.form ?? 'street';
  if (form === 'bike') {
    // A round bicycle lamp seen from the front, on its bracket.
    rod(c, () => { c.beginPath(); c.moveTo(0, u * 0.4); c.lineTo(0, u * 0.9); c.moveTo(-u * 0.22, u * 0.9); c.lineTo(u * 0.22, u * 0.9); }, u * 0.08, gm(-u * 0.1, u * 0.1));
    c.beginPath();
    c.arc(0, -u * 0.02, u * 0.56, 0, Math.PI * 2);
    fillInk(c, gm(-u * 0.56, u * 0.56), lw(u));
    c.beginPath();
    c.arc(0, -u * 0.02, u * 0.42, 0, Math.PI * 2);
    c.save();
    c.fillStyle = glassFill(-u * 0.05, -u * 0.06, u * 0.44);
    c.fill();
    c.clip();
    pattern(c, a, -u * 0.42, -u * 0.44, u * 0.84, u * 0.84, u, r);
    c.restore();
    c.strokeStyle = INK;
    c.lineWidth = lw(u);
    c.stroke();
    bead(c, 0, -u * 0.02, u * 0.08, a.flame);
    sheen(c, -u * 0.24, -u * 0.28, u * 0.12, u * 0.05, 0.5);
    rrect(c, -u * 0.14, -u * 0.72, u * 0.28, u * 0.16, u * 0.04);
    fillInk(c, gm(-u * 0.14, u * 0.14), lw(u));
    return;
  }
  if (form === 'storm') {
    // Hurricane lantern: tank, glass globe, wire guards, side tubes and a bail.
    c.beginPath();
    c.arc(0, -u * 0.42, u * 0.5, Math.PI * 1.05, Math.PI * 1.95);
    c.lineWidth = u * 0.06;
    c.strokeStyle = INK;
    c.stroke();
    c.lineWidth = u * 0.03;
    c.strokeStyle = rgb(light(a.metal, 0.2));
    c.stroke();
    for (const s of [-1, 1]) {
      rrect(c, s * u * 0.56 - u * 0.045, -u * 0.5, u * 0.09, u * 1.12, u * 0.04);
      fillInk(c, gm(s * u * 0.56 - u * 0.045, s * u * 0.56 + u * 0.045), lw(u));
    }
    rrect(c, -u * 0.6, -u * 0.56, u * 1.2, u * 0.14, u * 0.06);
    fillInk(c, gm(-u * 0.6, u * 0.6), lw(u));
    ellipse(c, 0, u * 0.08, u * 0.4, u * 0.46);
    c.save();
    c.fillStyle = glassFill(0, u * 0.12, u * 0.46);
    c.fill();
    c.clip();
    pattern(c, a, -u * 0.4, -u * 0.38, u * 0.8, u * 0.92, u, r);
    c.restore();
    c.strokeStyle = INK;
    c.lineWidth = lw(u);
    c.stroke();
    flame(c, 0, u * 0.3, u * 0.12, a.flame);
    sheen(c, -u * 0.24, -u * 0.12, u * 0.3, u * 0.05, 0.5);
    c.strokeStyle = rgb(dark(a.metal, 0.3));
    c.lineWidth = Math.max(1, u * 0.025);
    for (const k of [-0.22, 0.22]) {
      c.beginPath();
      c.moveTo(k * u, -u * 0.38);
      c.quadraticCurveTo(k * u * 2.1, u * 0.08, k * u, u * 0.52);
      c.stroke();
    }
    rrect(c, -u * 0.62, u * 0.52, u * 1.24, u * 0.38, u * 0.12);
    fillInk(c, gm(-u * 0.62, u * 0.62), lw(u));
    return;
  }
  if (form === 'davy') {
    // Miner's safety lamp: brass base, a short glass, the gauze cylinder, cap and hook.
    c.beginPath();
    c.arc(0, -u * 0.86, u * 0.1, 0, Math.PI * 2);
    c.lineWidth = u * 0.06;
    c.strokeStyle = INK;
    c.stroke();
    c.lineWidth = u * 0.035;
    c.strokeStyle = rgb(a.metal);
    c.stroke();
    rrect(c, -u * 0.26, -u * 0.62, u * 0.52, u * 0.14, u * 0.05);
    fillInk(c, gm(-u * 0.26, u * 0.26), lw(u));
    rrect(c, -u * 0.22, -u * 0.5, u * 0.44, u * 0.72, u * 0.02);
    c.save();
    c.fillStyle = rgb(dark(a.metal, 0.55), 0.85);
    c.fill();
    c.clip();
    aside(c, (c) => {
      if (!quiet) glowAt(c, 0, u * 0.1, u * 0.4, u * 0.6, a.flame, 0.6);
    });
    pattern(c, a, -u * 0.22, -u * 0.5, u * 0.44, u * 0.72, u, r);
    c.restore();
    c.strokeStyle = INK;
    c.lineWidth = lw(u);
    c.stroke();
    for (const s of [-1, 1]) {
      rrect(c, s * u * 0.25 - u * 0.03, -u * 0.5, u * 0.06, u * 1.0, u * 0.02);
      fillInk(c, gm(s * u * 0.25 - u * 0.03, s * u * 0.25 + u * 0.03), lw(u) * 0.8);
    }
    rrect(c, -u * 0.22, u * 0.2, u * 0.44, u * 0.3, u * 0.02);
    c.fillStyle = rgb(light(a.flame, 0.5), 0.5);
    c.fill();
    c.strokeStyle = INK;
    c.stroke();
    flame(c, 0, u * 0.44, u * 0.08, a.flame);
    rrect(c, -u * 0.3, u * 0.5, u * 0.6, u * 0.4, u * 0.06);
    fillInk(c, gm(-u * 0.3, u * 0.3), lw(u));
    return;
  }
  // Street gas lantern on a stub bracket.
  c.beginPath();
  c.arc(0, -u * 0.88, u * 0.08, 0, Math.PI * 2);
  c.lineWidth = u * 0.05;
  c.strokeStyle = INK;
  c.stroke();
  c.lineWidth = u * 0.03;
  c.strokeStyle = rgb(light(a.metal, 0.2));
  c.stroke();
  c.beginPath();
  c.moveTo(0, -u * 0.8);
  c.lineTo(u * 0.5, -u * 0.46);
  c.lineTo(-u * 0.5, -u * 0.46);
  c.closePath();
  fillInk(c, gm(-u * 0.5, u * 0.5), lw(u));
  rrect(c, -u * 0.52, -u * 0.5, u * 1.04, u * 0.1, u * 0.03);
  fillInk(c, gm(-u * 0.52, u * 0.52), lw(u));
  c.beginPath();
  c.moveTo(-u * 0.44, -u * 0.4);
  c.lineTo(u * 0.44, -u * 0.4);
  c.lineTo(u * 0.28, u * 0.42);
  c.lineTo(-u * 0.28, u * 0.42);
  c.closePath();
  c.save();
  c.fillStyle = glassFill(0, u * 0.05, u * 0.55);
  c.fill();
  c.clip();
  pattern(c, a, -u * 0.44, -u * 0.4, u * 0.88, u * 0.82, u, r);
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  flame(c, 0, u * 0.18, u * 0.1, a.flame);
  rod(c, () => { c.beginPath(); c.moveTo(0, -u * 0.4); c.lineTo(0, u * 0.42); c.moveTo(-u * 0.36, -u * 0.02); c.lineTo(u * 0.36, -u * 0.02); }, u * 0.035, rgb(a.metal));
  sheen(c, -u * 0.3, -u * 0.32, u * 0.2, u * 0.04, 0.4);
  c.beginPath();
  c.moveTo(-u * 0.32, u * 0.4);
  c.lineTo(u * 0.32, u * 0.4);
  c.lineTo(u * 0.12, u * 0.6);
  c.lineTo(-u * 0.12, u * 0.6);
  c.closePath();
  fillInk(c, gm(-u * 0.32, u * 0.32), lw(u));
  rrect(c, -u * 0.07, u * 0.58, u * 0.14, u * 0.36, u * 0.03);
  fillInk(c, gm(-u * 0.07, u * 0.07), lw(u));
}

function paper(c: Ctx, a: LampArt, u: number, r: Rnd) {
  const long = a.form === 'long';
  const rx = long ? u * 0.44 : u * 0.6;
  const ry = long ? u * 0.62 : u * 0.52;
  const cy = long ? 0 : u * 0.02;
  c.strokeStyle = 'rgba(40,24,16,0.9)';
  c.lineWidth = Math.max(1, u * 0.02);
  c.beginPath();
  c.moveTo(0, -u);
  c.lineTo(0, cy - ry);
  c.stroke();
  // Tassel.
  c.beginPath();
  c.moveTo(-u * 0.06, cy + ry + u * 0.08);
  c.lineTo(u * 0.06, cy + ry + u * 0.08);
  c.lineTo(u * 0.1, cy + ry + u * 0.36);
  c.lineTo(-u * 0.1, cy + ry + u * 0.36);
  c.closePath();
  fillInk(c, shade(c, -u * 0.1, u * 0.1, a.mark, 0.3), lw(u) * 0.8);
  ellipse(c, 0, cy, rx, ry);
  c.save();
  const g = c.createRadialGradient(-rx * 0.15, cy - ry * 0.05, 0, 0, cy, Math.max(rx, ry));
  g.addColorStop(0, rgb(light(a.flame, 0.6)));
  g.addColorStop(0.45, rgb(light(a.glass, 0.25)));
  g.addColorStop(1, rgb(dark(a.glass, 0.35)));
  c.fillStyle = g;
  c.fill();
  c.clip();
  pattern(c, a, -rx, cy - ry, rx * 2, ry * 2, u, r);
  // Paper ribs.
  aside(c, (c) => {
    c.strokeStyle = rgb(dark(a.glass, 0.45), 0.5);
    c.lineWidth = Math.max(0.8, u * 0.015);
    for (let i = 1; i < 8; i++) {
      const y = cy - ry + (2 * ry * i) / 8;
      const half = rx * Math.sqrt(1 - ((y - cy) / ry) ** 2);
      c.beginPath();
      c.moveTo(-half, y);
      c.quadraticCurveTo(0, y + u * 0.05, half, y);
      c.stroke();
    }
  });
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  for (const [y, w] of [[cy - ry, long ? 0.24 : 0.3], [cy + ry, long ? 0.2 : 0.26]] as [number, number][]) {
    rrect(c, -u * w, y - u * 0.05, u * w * 2, u * 0.1, u * 0.03);
    fillInk(c, metalFill(c, -u * w, u * w, a.metal), lw(u));
  }
}

function torch(c: Ctx, a: LampArt, u: number, r: Rnd) {
  c.save();
  c.rotate(0.12);
  rrect(c, -u * 0.07, -u * 0.22, u * 0.14, u * 1.18, u * 0.05);
  c.save();
  c.fillStyle = shade(c, -u * 0.07, u * 0.07, a.metal, 0.3);
  c.fill();
  c.clip();
  pattern(c, a, -u * 0.07, -u * 0.22, u * 0.14, u * 1.18, u, r);
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  // Wrapped head.
  c.beginPath();
  c.moveTo(-u * 0.13, -u * 0.18);
  c.lineTo(-u * 0.17, -u * 0.44);
  c.lineTo(u * 0.17, -u * 0.44);
  c.lineTo(u * 0.13, -u * 0.18);
  c.closePath();
  c.save();
  c.fillStyle = shade(c, -u * 0.17, u * 0.17, a.glass, 0.3);
  c.fill();
  c.clip();
  aside(c, (c) => {
    c.strokeStyle = rgb(dark(a.glass, 0.5), 0.8);
    c.lineWidth = Math.max(1, u * 0.02);
    for (let y = -u * 0.44; y < -u * 0.14; y += u * 0.06) {
      c.beginPath();
      c.moveTo(-u * 0.2, y + u * 0.05);
      c.lineTo(u * 0.2, y - u * 0.02);
      c.stroke();
    }
  });
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  flame(c, 0, -u * 0.38, u * 0.2, a.flame);
  flame(c, -u * 0.08, -u * 0.4, u * 0.1, light(a.flame, 0.2));
  c.restore();
}

function jar(c: Ctx, a: LampArt, u: number, r: Rnd) {
  // Wire handle and lid.
  c.beginPath();
  c.arc(0, -u * 0.62, u * 0.32, Math.PI * 1.1, Math.PI * 1.9);
  c.lineWidth = u * 0.05;
  c.strokeStyle = INK;
  c.stroke();
  c.lineWidth = u * 0.025;
  c.strokeStyle = rgb(light(a.metal, 0.2));
  c.stroke();
  const body = () => {
    c.beginPath();
    c.moveTo(-u * 0.2, -u * 0.5);
    c.lineTo(-u * 0.2, -u * 0.42);
    c.quadraticCurveTo(-u * 0.46, -u * 0.4, -u * 0.46, -u * 0.2);
    c.lineTo(-u * 0.46, u * 0.78);
    c.quadraticCurveTo(-u * 0.46, u * 0.9, -u * 0.34, u * 0.9);
    c.lineTo(u * 0.34, u * 0.9);
    c.quadraticCurveTo(u * 0.46, u * 0.9, u * 0.46, u * 0.78);
    c.lineTo(u * 0.46, -u * 0.2);
    c.quadraticCurveTo(u * 0.46, -u * 0.4, u * 0.2, -u * 0.42);
    c.lineTo(u * 0.2, -u * 0.5);
    c.closePath();
  };
  body();
  c.save();
  c.fillStyle = rgb(dark(a.glass, 0.45), 0.55);
  c.fill();
  c.clip();
  if (!quiet) glowAt(c, 0, u * 0.3, u * 0.55, u * 0.6, a.flame, 0.45);
  if (a.form === 'candle') {
    rrect(c, -u * 0.18, u * 0.6, u * 0.36, u * 0.3, u * 0.04);
    fillInk(c, shade(c, -u * 0.18, u * 0.18, light(a.glass, 0.5), 0.25), lw(u) * 0.8);
    flame(c, 0, u * 0.6, u * 0.1, a.flame);
  }
  pattern(c, a, -u * 0.46, -u * 0.42, u * 0.92, u * 1.32, u, r);
  c.fillStyle = rgb(a.glass, 0.18);
  c.fillRect(-u, -u, u * 2, u * 2);
  c.restore();
  body();
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  sheen(c, -u * 0.32, -u * 0.22, u * 0.66, u * 0.06, 0.45);
  rrect(c, -u * 0.26, -u * 0.62, u * 0.52, u * 0.14, u * 0.04);
  fillInk(c, metalFill(c, -u * 0.26, u * 0.26, a.metal), lw(u));
}

function bulb(c: Ctx, a: LampArt, u: number, r: Rnd) {
  const shape = () => {
    c.beginPath();
    c.moveTo(-u * 0.16, u * 0.36);
    c.bezierCurveTo(-u * 0.18, u * 0.14, -u * 0.56, -u * 0.04, -u * 0.56, -u * 0.38);
    c.bezierCurveTo(-u * 0.56, -u * 0.72, -u * 0.3, -u * 0.94, 0, -u * 0.94);
    c.bezierCurveTo(u * 0.3, -u * 0.94, u * 0.56, -u * 0.72, u * 0.56, -u * 0.38);
    c.bezierCurveTo(u * 0.56, -u * 0.04, u * 0.18, u * 0.14, u * 0.16, u * 0.36);
    c.closePath();
  };
  // Screw base.
  rrect(c, -u * 0.19, u * 0.34, u * 0.38, u * 0.44, u * 0.06);
  c.save();
  c.fillStyle = metalFill(c, -u * 0.19, u * 0.19, a.metal);
  c.fill();
  c.clip();
  aside(c, (c) => {
    c.strokeStyle = rgb(dark(a.metal, 0.5), 0.8);
    c.lineWidth = Math.max(1, u * 0.025);
    for (let y = u * 0.42; y < u * 0.78; y += u * 0.08) {
      c.beginPath();
      c.moveTo(-u * 0.2, y);
      c.lineTo(u * 0.2, y + u * 0.03);
      c.stroke();
    }
  });
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  c.beginPath();
  c.moveTo(-u * 0.12, u * 0.78);
  c.lineTo(u * 0.12, u * 0.78);
  c.lineTo(u * 0.05, u * 0.92);
  c.lineTo(-u * 0.05, u * 0.92);
  c.closePath();
  fillInk(c, '#2a2026', lw(u));
  // Glass.
  shape();
  c.save();
  const g = c.createRadialGradient(0, -u * 0.36, 0, 0, -u * 0.36, u * 0.62);
  g.addColorStop(0, rgb(light(a.flame, 0.6), 0.8));
  g.addColorStop(0.55, rgb(a.glass, 0.45));
  g.addColorStop(1, rgb(dark(a.glass, 0.2), 0.55));
  c.fillStyle = g;
  c.fill();
  c.clip();
  // Stem and lead wires.
  c.strokeStyle = 'rgba(80,60,40,0.7)';
  c.lineWidth = Math.max(1, u * 0.02);
  c.beginPath();
  c.moveTo(-u * 0.06, u * 0.36);
  c.lineTo(-u * 0.12, -u * 0.32);
  c.moveTo(u * 0.06, u * 0.36);
  c.lineTo(u * 0.12, -u * 0.32);
  c.stroke();
  if (a.pattern === 'filament') {
    if (!quiet) glowAt(c, 0, -u * 0.42, u * 0.4, u * 0.3, a.flame, 0.6, 'lighter');
    c.strokeStyle = rgb(light(a.flame, 0.5));
    c.lineWidth = Math.max(1.2, u * 0.03);
    c.beginPath();
    c.moveTo(-u * 0.12, -u * 0.32);
    c.bezierCurveTo(-u * 0.22, -u * 0.72, u * 0.22, -u * 0.72, u * 0.12, -u * 0.32);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = Math.max(0.6, u * 0.012);
    c.stroke();
  } else {
    pattern(c, a, -u * 0.5, -u * 0.86, u, u * 0.9, u, r);
    if (!quiet) glowAt(c, 0, -u * 0.4, u * 0.35, u * 0.3, a.flame, 0.45, 'lighter');
  }
  c.restore();
  shape();
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  sheen(c, -u * 0.36, -u * 0.66, -u * 0.2, u * 0.06, 0.55);
}

function globe(c: Ctx, a: LampArt, u: number, r: Rnd) {
  const form = a.form ?? '';
  const clear = form.includes('clear');
  const stand = form.includes('stand');
  const cy = stand ? -u * 0.12 : u * 0.1;
  const R = u * 0.56;
  const gm = (x0: number, x1: number) => metalFill(c, x0, x1, a.metal);
  if (stand) {
    c.beginPath();
    c.moveTo(-u * 0.44, u * 0.94);
    c.quadraticCurveTo(-u * 0.3, u * 0.66, -u * 0.08, u * 0.56);
    c.lineTo(u * 0.08, u * 0.56);
    c.quadraticCurveTo(u * 0.3, u * 0.66, u * 0.44, u * 0.94);
    c.closePath();
    fillInk(c, gm(-u * 0.44, u * 0.44), lw(u));
    rrect(c, -u * 0.18, cy + R - u * 0.06, u * 0.36, u * 0.12, u * 0.04);
    fillInk(c, gm(-u * 0.18, u * 0.18), lw(u));
  } else {
    // Chain and ceiling cap.
    c.strokeStyle = rgb(dark(a.metal, 0.2));
    c.lineWidth = Math.max(1, u * 0.03);
    for (let y = -u; y < cy - R - u * 0.08; y += u * 0.1) {
      c.beginPath();
      c.ellipse(0, y + u * 0.05, u * 0.03, u * 0.05, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(-u * 0.16, cy - R + u * 0.04);
    c.quadraticCurveTo(0, cy - R - u * 0.16, u * 0.16, cy - R + u * 0.04);
    c.closePath();
    fillInk(c, gm(-u * 0.16, u * 0.16), lw(u));
  }
  c.beginPath();
  c.arc(0, cy, R, 0, Math.PI * 2);
  c.save();
  if (clear) {
    const g = c.createRadialGradient(-R * 0.2, cy - R * 0.2, 0, 0, cy, R);
    g.addColorStop(0, rgb(light(a.glass, 0.6), 0.55));
    g.addColorStop(0.7, rgb(a.glass, 0.4));
    g.addColorStop(1, rgb(dark(a.glass, 0.3), 0.6));
    c.fillStyle = g;
  } else {
    const g = c.createRadialGradient(-R * 0.35, cy - R * 0.35, 0, 0, cy, R * 1.05);
    g.addColorStop(0, rgb(light(a.glass, 0.7)));
    g.addColorStop(0.55, rgb(a.glass));
    g.addColorStop(1, rgb(dark(a.glass, 0.45)));
    c.fillStyle = g;
  }
  c.fill();
  c.clip();
  if (a.pattern === 'arc') {
    // Two carbon rods with the arc jumping between them.
    for (const s of [-1, 1]) {
      rrect(c, -u * 0.035, s < 0 ? cy - R : cy + u * 0.07, u * 0.07, R - u * 0.07, u * 0.02);
      c.fillStyle = '#2a2a30';
      c.fill();
    }
    if (!quiet) glowAt(c, 0, cy, R * 0.9, R * 0.9, a.flame, 0.8, 'lighter');
    c.strokeStyle = '#ffffff';
    c.lineWidth = Math.max(1, u * 0.025);
    c.beginPath();
    c.moveTo(0, cy - u * 0.07);
    c.lineTo(u * 0.04, cy - u * 0.02);
    c.lineTo(-u * 0.03, cy + u * 0.02);
    c.lineTo(0, cy + u * 0.07);
    c.stroke();
  } else if (a.pattern === 'mesh') {
    // The glowing mantle hanging inside the glass.
    if (!quiet) glowAt(c, 0, cy + u * 0.04, R * 0.8, R * 0.8, a.flame, 0.7, 'lighter');
    c.beginPath();
    c.moveTo(-u * 0.08, cy - u * 0.3);
    c.bezierCurveTo(-u * 0.3, cy - u * 0.2, -u * 0.26, cy + u * 0.24, -u * 0.12, cy + u * 0.3);
    c.lineTo(u * 0.12, cy + u * 0.3);
    c.bezierCurveTo(u * 0.26, cy + u * 0.24, u * 0.3, cy - u * 0.2, u * 0.08, cy - u * 0.3);
    c.closePath();
    c.save();
    c.fillStyle = rgb(light(a.flame, 0.5), 0.95);
    c.fill();
    c.clip();
    pattern(c, a, -u * 0.3, cy - u * 0.3, u * 0.6, u * 0.6, u, r);
    c.restore();
    rrect(c, -u * 0.1, cy + u * 0.3, u * 0.2, R, u * 0.03);
    c.fillStyle = rgb(dark(a.metal, 0.2));
    c.fill();
  } else {
    if (clear && !quiet) glowAt(c, 0, cy, R * 0.8, R * 0.8, a.flame, 0.6, 'lighter');
    pattern(c, a, -R, cy - R, R * 2, R * 2, u, r);
  }
  // Shading over the pattern keeps it round.
  const sh = c.createRadialGradient(-R * 0.3, cy - R * 0.3, R * 0.4, 0, cy, R * 1.05);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(10,6,20,0.45)');
  c.fillStyle = sh;
  c.fillRect(-R, cy - R, R * 2, R * 2);
  c.restore();
  c.beginPath();
  c.arc(0, cy, R, 0, Math.PI * 2);
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  c.beginPath();
  c.ellipse(-R * 0.38, cy - R * 0.42, R * 0.18, R * 0.1, -0.7, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.fill();
}

function tube(c: Ctx, a: LampArt, u: number, r: Rnd) {
  const form = a.form ?? 'bent';
  if (form === 'organ') {
    // A light organ: a dark box with three coloured lamps behind a grille.
    rrect(c, -u * 0.86, -u * 0.5, u * 1.72, u * 1.02, u * 0.1);
    fillInk(c, shade(c, -u * 0.86, u * 0.86, a.metal, 0.4), lw(u));
    rrect(c, -u * 0.76, -u * 0.4, u * 1.52, u * 0.66, u * 0.06);
    c.fillStyle = '#0a0610';
    c.fill();
    const cols = [a.glass, a.flame, a.mark];
    cols.forEach((col, i) => {
      const x = (i - 1) * u * 0.5;
      if (!quiet) glowAt(c, x, -u * 0.07, u * 0.42, u * 0.42, col, 0.7, 'lighter');
      c.beginPath();
      c.arc(x, -u * 0.07, u * 0.2, 0, Math.PI * 2);
      const g = c.createRadialGradient(x - u * 0.05, -u * 0.12, 0, x, -u * 0.07, u * 0.2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, rgb(light(col, 0.3)));
      g.addColorStop(1, rgb(dark(col, 0.2)));
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = lw(u);
      c.stroke();
    });
    c.strokeStyle = 'rgba(30,20,40,0.6)';
    c.lineWidth = Math.max(1, u * 0.02);
    for (let x = -u * 0.7; x < u * 0.76; x += u * 0.1) {
      c.beginPath();
      c.moveTo(x, -u * 0.4);
      c.lineTo(x, u * 0.26);
      c.stroke();
    }
    // Knobs and feet.
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.arc(-u * 0.45 + i * u * 0.3, u * 0.38, u * 0.06, 0, Math.PI * 2);
      fillInk(c, rgb(light(a.metal, 0.4)), lw(u) * 0.8);
    }
    for (const s of [-1, 1]) {
      rrect(c, s * u * 0.62 - u * 0.1, u * 0.5, u * 0.2, u * 0.14, u * 0.03);
      fillInk(c, '#1a1420', lw(u) * 0.8);
    }
    return;
  }
  if (form === 'bar') {
    // A black-light fixture: dark housing, violet tube, fluorescent specks below.
    c.strokeStyle = 'rgba(40,30,50,0.9)';
    c.lineWidth = Math.max(1, u * 0.02);
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * u * 0.6, -u * 0.95);
      c.lineTo(s * u * 0.6, -u * 0.36);
      c.stroke();
    }
    if (!quiet) {
      c.save();
      c.beginPath();
      c.moveTo(-u * 0.8, -u * 0.1);
      c.lineTo(u * 0.8, -u * 0.1);
      c.lineTo(u * 1.1, u * 0.95);
      c.lineTo(-u * 1.1, u * 0.95);
      c.closePath();
      const g = c.createLinearGradient(0, -u * 0.1, 0, u * 0.95);
      g.addColorStop(0, rgb(a.glass, 0.45));
      g.addColorStop(1, rgb(a.glass, 0));
      c.fillStyle = g;
      c.fill();
      c.clip();
      pattern(c, a, -u * 1.1, u * 0.15, u * 2.2, u * 0.8, u, r);
      c.restore();
    }
    rrect(c, -u * 0.9, -u * 0.4, u * 1.8, u * 0.36, u * 0.08);
    fillInk(c, shade(c, -u * 0.9, u * 0.9, a.metal, 0.5), lw(u));
    if (!quiet) glowAt(c, 0, -u * 0.12, u * 0.9, u * 0.2, a.glass, 0.8, 'lighter');
    rrect(c, -u * 0.78, -u * 0.2, u * 1.56, u * 0.14, u * 0.07);
    const g2 = c.createLinearGradient(0, -u * 0.2, 0, -u * 0.06);
    g2.addColorStop(0, rgb(light(a.glass, 0.5)));
    g2.addColorStop(0.5, '#ffffff');
    g2.addColorStop(1, rgb(a.glass));
    fillInk(c, g2, lw(u) * 0.8);
    return;
  }
  // A bent neon tube on its little stand-offs.
  const path = () => {
    c.beginPath();
    if (a.pattern === 'zigzag') {
      c.moveTo(-u * 0.6, -u * 0.72);
      c.lineTo(u * 0.36, -u * 0.72);
      c.lineTo(-u * 0.3, u * 0.0);
      c.lineTo(u * 0.5, u * 0.0);
      c.lineTo(-u * 0.2, u * 0.76);
    } else {
      c.moveTo(-u * 0.7, -u * 0.4);
      c.bezierCurveTo(-u * 0.3, -u * 1.0, u * 0.3, u * 0.2, u * 0.7, -u * 0.4);
    }
  };
  c.lineJoin = 'round';
  if (!quiet) {
    path();
    c.strokeStyle = rgb(a.glass, 0.28);
    c.lineWidth = u * 0.34;
    c.stroke();
  }
  path();
  c.strokeStyle = INK;
  c.lineWidth = u * 0.17;
  c.stroke();
  path();
  c.strokeStyle = rgb(a.glass);
  c.lineWidth = u * 0.12;
  c.stroke();
  path();
  c.strokeStyle = rgb(a.flame);
  c.lineWidth = u * 0.045;
  c.stroke();
  for (const [x, y] of [[-u * 0.4, -u * 0.72], [u * 0.1, u * 0.0], [-u * 0.05, u * 0.5]] as [number, number][]) {
    rrect(c, x - u * 0.05, y - u * 0.1, u * 0.1, u * 0.2, u * 0.03);
    fillInk(c, shade(c, x - u * 0.05, x + u * 0.05, 0x9aa0aa, 0.3), lw(u) * 0.7);
  }
  // The transformer box it hangs from.
  rrect(c, u * 0.34, u * 0.6, u * 0.46, u * 0.3, u * 0.05);
  fillInk(c, shade(c, u * 0.34, u * 0.8, a.metal, 0.4), lw(u));
}

function lens(c: Ctx, a: LampArt, u: number, r: Rnd) {
  const form = a.form ?? 'fresnel';
  const gm = (x0: number, x1: number) => metalFill(c, x0, x1, a.metal);
  const glass = (cx: number, cy: number, rx: number, ry: number) => {
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    c.save();
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, rgb(light(a.flame, 0.5)));
    g.addColorStop(1, rgb(dark(a.glass, 0.2), 0.9));
    c.fillStyle = g;
    c.fill();
    c.clip();
    pattern(c, a, cx - rx, cy - ry, rx * 2, ry * 2, u, r);
    c.restore();
    c.strokeStyle = INK;
    c.lineWidth = lw(u);
    c.stroke();
  };
  if (form === 'signal') {
    // Signal lamp from the side: the barrel, the shuttered front glass, a grip and a sight.
    if (!quiet) glowAt(c, u * 0.7, -u * 0.12, u * 0.6, u * 0.5, a.flame, 0.5, 'lighter');
    rrect(c, -u * 0.04, u * 0.16, u * 0.16, u * 0.62, u * 0.05);
    fillInk(c, shade(c, -u * 0.04, u * 0.12, 0x5a3a24, 0.3), lw(u));
    rrect(c, -u * 0.66, -u * 0.44, u * 1.12, u * 0.62, u * 0.12);
    fillInk(c, shade(c, -u * 0.66, u * 0.46, a.metal, 0.3), lw(u));
    rrect(c, -u * 0.3, -u * 0.6, u * 0.4, u * 0.1, u * 0.03);
    fillInk(c, gm(-u * 0.3, u * 0.1), lw(u));
    c.beginPath();
    c.moveTo(u * 0.42, -u * 0.52);
    c.lineTo(u * 0.62, -u * 0.6);
    c.lineTo(u * 0.62, u * 0.36);
    c.lineTo(u * 0.42, u * 0.26);
    c.closePath();
    fillInk(c, gm(u * 0.42, u * 0.62), lw(u));
    glass(u * 0.66, -u * 0.12, u * 0.16, u * 0.44);
    return;
  }
  if (form === 'strobe') {
    // A stage strobe: a dark box with a big white reflector and its yoke.
    rod(c, () => { c.beginPath(); c.moveTo(-u * 0.7, -u * 0.05); c.lineTo(-u * 0.7, u * 0.62); c.lineTo(u * 0.7, u * 0.62); c.lineTo(u * 0.7, -u * 0.05); }, u * 0.07, gm(-u, u));
    rrect(c, -u * 0.3, u * 0.62, u * 0.6, u * 0.3, u * 0.05);
    fillInk(c, shade(c, -u * 0.3, u * 0.3, a.metal, 0.4), lw(u));
    rrect(c, -u * 0.62, -u * 0.52, u * 1.24, u * 0.9, u * 0.1);
    fillInk(c, shade(c, -u * 0.62, u * 0.62, a.metal, 0.4), lw(u));
    glass(0, -u * 0.07, u * 0.5, u * 0.36);
    if (!quiet) glowAt(c, 0, -u * 0.07, u * 0.8, u * 0.6, a.flame, 0.6, 'lighter');
    fourStar(c, 0, -u * 0.07, u * 0.3, 'rgba(255,255,255,0.95)');
    return;
  }
  if (form === 'disc') {
    // Crown glass: a spun disc with the thick bull's-eye left in the middle, on a little stand.
    c.beginPath();
    c.moveTo(-u * 0.36, u * 0.94);
    c.quadraticCurveTo(-u * 0.2, u * 0.72, -u * 0.05, u * 0.68);
    c.lineTo(u * 0.05, u * 0.68);
    c.quadraticCurveTo(u * 0.2, u * 0.72, u * 0.36, u * 0.94);
    c.closePath();
    fillInk(c, gm(-u * 0.36, u * 0.36), lw(u));
    rrect(c, -u * 0.04, u * 0.5, u * 0.08, u * 0.2, u * 0.02);
    fillInk(c, gm(-u * 0.04, u * 0.04), lw(u));
    c.beginPath();
    c.arc(0, -u * 0.1, u * 0.66, 0, Math.PI * 2);
    c.lineWidth = u * 0.1;
    c.strokeStyle = INK;
    c.stroke();
    c.lineWidth = u * 0.06;
    c.strokeStyle = gm(-u * 0.66, u * 0.66);
    c.stroke();
    c.beginPath();
    c.arc(0, -u * 0.1, u * 0.62, 0, Math.PI * 2);
    c.save();
    const g = c.createRadialGradient(-u * 0.15, -u * 0.25, 0, 0, -u * 0.1, u * 0.62);
    g.addColorStop(0, rgb(light(a.glass, 0.7), 0.85));
    g.addColorStop(1, rgb(a.glass, 0.55));
    c.fillStyle = g;
    c.fill();
    c.clip();
    pattern(c, a, -u * 0.62, -u * 0.72, u * 1.24, u * 1.24, u, r);
    c.restore();
    c.beginPath();
    c.arc(0, -u * 0.1, u * 0.14, 0, Math.PI * 2);
    const b = c.createRadialGradient(-u * 0.04, -u * 0.14, 0, 0, -u * 0.1, u * 0.14);
    b.addColorStop(0, '#ffffff');
    b.addColorStop(1, rgb(dark(a.glass, 0.2)));
    fillInk(c, b, lw(u) * 0.8);
    sheen(c, -u * 0.38, -u * 0.5, -u * 0.1, u * 0.05, 0.6);
    return;
  }
  // Fresnel lens: stepped rings in a brass ring on a yoke.
  rod(c, () => { c.beginPath(); c.moveTo(-u * 0.72, -u * 0.1); c.quadraticCurveTo(-u * 0.72, u * 0.7, 0, u * 0.7); c.quadraticCurveTo(u * 0.72, u * 0.7, u * 0.72, -u * 0.1); }, u * 0.08, gm(-u, u));
  c.beginPath();
  c.moveTo(-u * 0.4, u * 0.94);
  c.quadraticCurveTo(-u * 0.2, u * 0.72, 0, u * 0.7);
  c.quadraticCurveTo(u * 0.2, u * 0.72, u * 0.4, u * 0.94);
  c.closePath();
  fillInk(c, gm(-u * 0.4, u * 0.4), lw(u));
  if (!quiet) glowAt(c, 0, -u * 0.1, u * 0.95, u * 0.95, a.flame, 0.35, 'lighter');
  c.beginPath();
  c.arc(0, -u * 0.1, u * 0.66, 0, Math.PI * 2);
  fillInk(c, gm(-u * 0.66, u * 0.66), lw(u));
  glass(0, -u * 0.1, u * 0.56, u * 0.56);
  c.beginPath();
  c.arc(0, -u * 0.1, u * 0.16, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.fill();
  for (const s of [-1, 1]) {
    c.beginPath();
    c.arc(s * u * 0.68, -u * 0.1, u * 0.07, 0, Math.PI * 2);
    fillInk(c, gm(-u * 0.07 + s * u * 0.68, u * 0.07 + s * u * 0.68), lw(u) * 0.8);
  }
}

function shard(c: Ctx, a: LampArt, u: number, r: Rnd) {
  if (a.form === 'jagged') {
    // A splinter of moon glass, floating, with a cold light of its own.
    if (!quiet) glowAt(c, 0, 0, u * 0.8, u * 0.9, a.glass, 0.45, 'lighter');
    const pts: [number, number][] = [[-0.1, -0.92], [0.22, -0.5], [0.46, -0.56], [0.36, 0.0], [0.5, 0.36], [0.06, 0.9], [-0.14, 0.44], [-0.44, 0.5], [-0.3, -0.04], [-0.48, -0.3]];
    c.beginPath();
    for (const [x, y] of pts) c.lineTo(x * u, y * u);
    c.closePath();
    c.save();
    const g = c.createLinearGradient(-u * 0.5, -u, u * 0.5, u);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, rgb(light(a.glass, 0.4)));
    g.addColorStop(1, rgb(dark(a.glass, 0.35)));
    c.fillStyle = g;
    c.fill();
    c.clip();
    aside(c, (c) => {
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.lineWidth = Math.max(0.8, u * 0.015);
      for (const [x, y] of pts) {
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(x * u, y * u);
        c.stroke();
      }
    });
    pattern(c, a, -u * 0.5, -u * 0.5, u, u, u, r);
    c.restore();
    c.strokeStyle = INK;
    c.lineWidth = lw(u);
    c.stroke();
    for (let i = 0; i < 5; i++) fourStar(c, (r() - 0.5) * u * 1.6, (r() - 0.5) * u * 1.7, u * (0.04 + r() * 0.05), rgb(a.mark, 0.9));
    return;
  }
  // A chandelier prism: brass pin, a bead, then the cut drop.
  c.beginPath();
  c.arc(0, -u * 0.88, u * 0.07, 0, Math.PI * 2);
  c.lineWidth = u * 0.05;
  c.strokeStyle = INK;
  c.stroke();
  c.lineWidth = u * 0.03;
  c.strokeStyle = rgb(a.metal);
  c.stroke();
  c.beginPath();
  c.arc(0, -u * 0.7, u * 0.08, 0, Math.PI * 2);
  fillInk(c, rgb(light(a.glass, 0.4)), lw(u) * 0.8);
  const P: [number, number][] = [[0, -0.6], [0.24, -0.38], [0.38, 0.06], [0.22, 0.56], [0, 0.92], [-0.22, 0.56], [-0.38, 0.06], [-0.24, -0.38]];
  const centre: [number, number] = [0, 0.1];
  for (let i = 0; i < P.length; i++) {
    const p0 = P[i];
    const p1 = P[(i + 1) % P.length];
    c.beginPath();
    c.moveTo(centre[0] * u, centre[1] * u);
    c.lineTo(p0[0] * u, p0[1] * u);
    c.lineTo(p1[0] * u, p1[1] * u);
    c.closePath();
    const k = 0.5 + 0.5 * Math.sin(i * 1.9 + 0.6);
    c.fillStyle = rgb(mix(dark(a.glass, 0.3), light(a.glass, 0.8), k), 0.92);
    c.fill();
  }
  c.beginPath();
  for (const [x, y] of P) c.lineTo(x * u, y * u);
  c.closePath();
  c.save();
  c.clip();
  pattern(c, a, -u * 0.38, -u * 0.6, u * 0.76, u * 1.52, u, r);
  // Spectral glints.
  const spec = ['#ff6a6a', '#ffd25a', '#7aff8a', '#6ac8ff', '#b07aff'];
  spec.forEach((col, i) => {
    c.strokeStyle = col;
    c.globalAlpha = 0.55;
    c.lineWidth = u * 0.035;
    c.beginPath();
    c.moveTo(-u * 0.3 + i * u * 0.04, u * 0.3 + i * u * 0.04);
    c.lineTo(u * 0.1 + i * u * 0.04, -u * 0.1 + i * u * 0.04);
    c.stroke();
  });
  c.restore();
  c.beginPath();
  for (const [x, y] of P) c.lineTo(x * u, y * u);
  c.closePath();
  c.strokeStyle = INK;
  c.lineWidth = lw(u);
  c.stroke();
  fourStar(c, -u * 0.14, -u * 0.22, u * 0.12, 'rgba(255,255,255,0.95)');
}

function pole(c: Ctx, a: LampArt, u: number) {
  // A lamplighter's pole: long shaft with brass bands, a hook and a little flame in a cup.
  const x0 = -u * 0.62;
  const y0 = u * 0.95;
  const x1 = u * 0.36;
  const y1 = -u * 0.5;
  rod(c, () => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); }, u * 0.09, rgb(a.metal));
  c.save();
  c.strokeStyle = 'rgba(255,244,220,0.3)';
  c.lineWidth = u * 0.025;
  c.beginPath();
  c.moveTo(x0 - u * 0.02, y0 - u * 0.02);
  c.lineTo(x1 - u * 0.02, y1 - u * 0.02);
  c.stroke();
  c.restore();
  for (const t of [0.2, 0.45, 0.7, 0.96]) {
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    c.save();
    c.translate(x, y);
    c.rotate(Math.atan2(y1 - y0, x1 - x0));
    rrect(c, -u * 0.04, -u * 0.07, u * 0.08, u * 0.14, u * 0.02);
    fillInk(c, metalFill(c, -u * 0.04, u * 0.04, a.mark), lw(u) * 0.7);
    c.restore();
  }
  // Hook.
  c.save();
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x1 + u * 0.12, y1 - u * 0.22);
  c.arc(x1 + u * 0.22, y1 - u * 0.28, u * 0.11, Math.PI * 0.85, Math.PI * 2.3);
  c.lineWidth = u * 0.07;
  c.strokeStyle = INK;
  c.stroke();
  c.lineWidth = u * 0.04;
  c.strokeStyle = rgb(a.mark);
  c.stroke();
  c.restore();
  // Flame cup on a short arm.
  c.beginPath();
  c.moveTo(x1 - u * 0.04, y1 + u * 0.06);
  c.lineTo(x1 - u * 0.24, y1 + u * 0.02);
  c.lineWidth = u * 0.05;
  c.strokeStyle = rgb(a.mark);
  c.stroke();
  c.beginPath();
  c.moveTo(x1 - u * 0.36, y1 - u * 0.04);
  c.lineTo(x1 - u * 0.16, y1 - u * 0.04);
  c.lineTo(x1 - u * 0.2, y1 + u * 0.06);
  c.lineTo(x1 - u * 0.32, y1 + u * 0.06);
  c.closePath();
  fillInk(c, metalFill(c, x1 - u * 0.36, x1 - u * 0.16, a.mark), lw(u) * 0.8);
  flame(c, x1 - u * 0.26, y1 - u * 0.04, u * 0.09, a.flame);
}

function chandelier(c: Ctx, a: LampArt, u: number) {
  // The house chandelier from the win effect, at album size, every arm lit.
  const k = (u * 2.7) / 340;
  c.save();
  c.translate(0, -55 * k);
  c.scale(k, k);
  if (!quiet) glowAt(c, 0, 70, 200, 140, a.flame, 0.4, 'lighter');
  paintChandelier(c);
  for (let i = 0; i < 6; i++) {
    const p = chandelierArm(i);
    flame(c, p.x, p.y - 14, 9, a.flame);
  }
  c.restore();
}

function star(c: Ctx, a: LampArt, u: number, r: Rnd) {
  // A shooting star: a bright five-point star with a long tail.
  const sx = u * 0.28;
  const sy = -u * 0.3;
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * u * 0.1;
    c.beginPath();
    c.moveTo(sx + off * 0.7, sy - off * 0.7);
    c.lineTo(-u * 0.9 + off, u * 0.86 - off * 0.2);
    const g = c.createLinearGradient(sx, sy, -u * 0.9, u * 0.86);
    g.addColorStop(0, rgb(i === 1 ? a.flame : a.mark, 0.85));
    g.addColorStop(1, rgb(a.mark, 0));
    c.strokeStyle = g;
    c.lineWidth = u * (i === 1 ? 0.22 : 0.09);
    c.stroke();
  }
  if (!quiet) glowAt(c, sx, sy, u * 0.6, u * 0.6, a.flame, 0.6, 'lighter');
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? u * 0.22 : u * 0.54;
    c.lineTo(sx + Math.cos(t) * rr, sy + Math.sin(t) * rr);
  }
  c.closePath();
  const g = c.createRadialGradient(sx - u * 0.08, sy - u * 0.08, 0, sx, sy, u * 0.54);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, rgb(light(a.glass, 0.2)));
  g.addColorStop(1, rgb(a.flame));
  fillInk(c, g, lw(u));
  if (a.pattern === 'stars') for (let i = 0; i < 6; i++) fourStar(c, -u * 0.8 + r() * u * 1.2, -u * 0.1 + r() * u * 0.9, u * (0.04 + r() * 0.05), rgb(light(a.mark, 0.4), 0.9));
}

/** Paints a lamp centred on (cx, cy), `span` across (about as tall as it is wide). */
export function drawSpecies(c: Ctx, m: LampSpecies, cx: number, cy: number, span: number) {
  const a = m.art;
  const u = span / 2;
  let seed = 7;
  for (const ch of m.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const r = seeded(seed);
  c.save();
  c.translate(cx, cy);
  if (a.glow && !quiet) {
    glowAt(c, 0, -u * 0.1, u * 1.2, u * 1.1, a.glow, 0.38);
    glowAt(c, 0, -u * 0.1, u * 0.6, u * 0.55, a.glow, 0.28);
  }
  switch (a.body) {
    case 'candle': candle(c, a, u, r); break;
    case 'candelabra': candelabra(c, a, u, r); break;
    case 'oil': oil(c, a, u, r); break;
    case 'chimney': chimney(c, a, u, r); break;
    case 'lantern': lantern(c, a, u, r); break;
    case 'paper': paper(c, a, u, r); break;
    case 'torch': torch(c, a, u, r); break;
    case 'jar': jar(c, a, u, r); break;
    case 'bulb': bulb(c, a, u, r); break;
    case 'globe': globe(c, a, u, r); break;
    case 'tube': tube(c, a, u, r); break;
    case 'lens': lens(c, a, u, r); break;
    case 'shard': shard(c, a, u, r); break;
    case 'pole': pole(c, a, u); break;
    case 'chandelier': chandelier(c, a, u); break;
    case 'star': star(c, a, u, r); break;
  }
  if (m.rarity === 'legendary' && !quiet) {
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) fourStar(c, (r() - 0.5) * u * 2, (r() - 0.5) * u * 1.9, u * (0.035 + r() * 0.05), `rgba(255,248,220,${0.5 + r() * 0.5})`);
  }
  c.restore();
}

const cache = new Map<string, Texture>();

/** Canvas size for a lamp of this span, with room for halos; cy is the lamp's centre. */
export const lampBox = (span: number) => ({ w: Math.ceil(span * 1.3), h: Math.ceil(span * 1.12), cy: Math.ceil(span * 0.56) });

/**
 * The entry as a texture, anchor (0.5, cy/h). `kind` 'dark' is the silhouette of a missing
 * lamp (same outline without its light, filled with ink).
 */
export function speciesTexture(m: LampSpecies, span: number, kind: 'color' | 'dark' = 'color') {
  const key = `${m.id}-${span}-${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const b = lampBox(span);
  const inner = span * 0.94;
  const tex = paint(b.w, b.h, (c) => {
    if (kind === 'dark') {
      quiet = true;
      try {
        drawSpecies(c, m, b.w / 2, b.cy, inner);
      } finally {
        quiet = false;
      }
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = 'rgba(58,36,30,0.55)';
      c.fillRect(0, 0, b.w, b.h);
      return;
    }
    drawSpecies(c, m, b.w / 2, b.cy, inner);
  }, 2);
  cache.set(key, tex);
  return tex;
}

/** Anchor y for a texture from speciesTexture. */
export const speciesAnchorY = (span: number) => lampBox(span).cy / lampBox(span).h;

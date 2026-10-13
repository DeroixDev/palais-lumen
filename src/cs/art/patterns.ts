/**
 * Procedural skin patterns. Each generator paints a square texture in a 1000 x 1000 unit space
 * (the context is pre-scaled), deterministic per skin. The item seed later picks which window of
 * this texture lands on the weapon (like a real paint seed offset), so one texture serves all seeds.
 */
import type { PatternRecipe } from '../contract';
import { Noise, Rng, rng, hex, rgb, ramp, mix, clamp, smooth, lerp } from './noise';

type RGB = [number, number, number];

export interface PatternCtx {
  ctx: CanvasRenderingContext2D;
  /** Texture size in device pixels (the ctx is scaled so 1000 units = S). */
  S: number;
  colors: string[];
  pal: RGB[];
  p: Record<string, number | string>;
  r: Rng;
  n: Noise;
  n2: Noise;
}

type Gen = (g: PatternCtx) => void;

const num = (g: PatternCtx, k: string, d: number) => (typeof g.p[k] === 'number' ? (g.p[k] as number) : d);
const col = (g: PatternCtx, i: number) => g.colors[i % g.colors.length];
const pc = (g: PatternCtx, i: number) => g.pal[i % g.pal.length];

/** Per-pixel field at reduced resolution, scaled up smoothly. fn gets units 0..1000. */
function field(g: PatternCtx, res: number, fn: (x: number, y: number) => RGB | [number, number, number, number]) {
  const R = Math.max(16, Math.min(res, g.S));
  const c = document.createElement('canvas');
  c.width = c.height = R;
  const cx = c.getContext('2d')!;
  const img = cx.createImageData(R, R);
  const d = img.data;
  const k = 1000 / R;
  for (let y = 0, i = 0; y < R; y++) {
    for (let x = 0; x < R; x++, i += 4) {
      const v = fn((x + 0.5) * k, (y + 0.5) * k);
      d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = v.length > 3 ? (v as number[])[3] : 255;
    }
  }
  cx.putImageData(img, 0, 0);
  const ctx = g.ctx;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, 1000, 1000);
  ctx.restore();
}

function fillAll(g: PatternCtx, style: string | CanvasGradient | CanvasPattern) {
  g.ctx.fillStyle = style;
  g.ctx.fillRect(0, 0, 1000, 1000);
}

/** Fine grain / film so flat areas look like paint, not vector. */
function grain(g: PatternCtx, amt = 0.06) {
  const s = Math.min(256, g.S);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const cx = c.getContext('2d')!;
  const img = cx.createImageData(s, s);
  const r = rng(77);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255 * amt;
  }
  cx.putImageData(img, 0, 0);
  const ctx = g.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  const pat = ctx.createPattern(c, 'repeat')!;
  pat.setTransform(new DOMMatrix().scale(1000 / g.S * 1.5));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, 1000, 1000);
  ctx.restore();
}

function linGrad(g: PatternCtx, x0: number, y0: number, x1: number, y1: number, cols: string[]) {
  const gr = g.ctx.createLinearGradient(x0, y0, x1, y1);
  cols.forEach((c, i) => gr.addColorStop(i / Math.max(1, cols.length - 1), c));
  return gr;
}

// ------------------------------------------------------------------------------------------------
// Generators
// ------------------------------------------------------------------------------------------------

const fade: Gen = (g) => {
  const ang = num(g, 'angle', 20) * Math.PI / 180;
  const cx = 500, cy = 500, L = 520;
  const dx = Math.cos(ang) * L, dy = Math.sin(ang) * L;
  fillAll(g, linGrad(g, cx - dx, cy - dy, cx + dx, cy + dy, g.colors));
  // soft mottling so the sweep looks airbrushed
  field(g, 128, (x, y) => {
    const v = g.n.fbm(x / 260, y / 260, 3);
    const a = Math.abs(v - 0.5) * 70;
    return v > 0.5 ? [255, 255, 255, a] : [0, 0, 0, a];
  });
  // metallic sheen
  const sh = linGrad(g, 0, 0, 1000, 1000, ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']);
  fillAll(g, sh);
  grain(g, 0.05);
};

const anodized: Gen = (g) => {
  const a = pc(g, 0), b = pc(g, 1);
  field(g, 256, (x, y) => {
    const t = clamp(y / 1000 + (g.n.fbm(x / 400, y / 400, 3) - 0.5) * 0.35);
    const c = mix(a, b, smooth(0.15, 0.85, t));
    // brushed streaks
    const s = (g.n2.v(x / 900, y / 3) - 0.5) * 26;
    return [c[0] + s, c[1] + s, c[2] + s];
  });
  fillAll(g, linGrad(g, 0, 0, 1000, 0, ['rgba(255,255,255,0.0)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.0)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']));
};

const solid: Gen = (g) => {
  const a = pc(g, 0);
  const b = g.pal[1] ?? mix(a, [0, 0, 0], 0.3);
  field(g, 128, (x, y) => {
    const t = g.n.fbm(x / 300, y / 300, 4);
    return mix(a, b, smooth(0.3, 0.75, t) * 0.6);
  });
  grain(g, 0.08);
};

/** Woodland camo: 3-4 colour blobs, threshold on fbm with offsets per layer. */
const camo: Gen = (g) => {
  const sc = num(g, 'scale', 1);
  const P = g.pal;
  field(g, 384, (x, y) => {
    let c = P[0];
    const wx = x + (g.n2.fbm(x / 120, y / 120, 2) - 0.5) * 60;
    const wy = y + (g.n2.fbm(x / 120 + 9, y / 120, 2) - 0.5) * 60;
    for (let i = 1; i < P.length; i++) {
      const v = g.n.fbm(wx / (210 * sc) + i * 13.1, wy / (150 * sc) - i * 7.7, 4);
      if (v > 0.52 + i * 0.015) c = P[i];
    }
    return c;
  });
  grain(g, 0.07);
};

/** Digital / pixel camo: noise quantised to a square grid. */
const digital: Gen = (g) => {
  const cell = num(g, 'cell', 22);
  const P = g.pal;
  const ctx = g.ctx;
  for (let y = 0; y < 1000; y += cell) {
    for (let x = 0; x < 1000; x += cell) {
      let c = P[0];
      for (let i = 1; i < P.length; i++) {
        const v = g.n.fbm(x / 230 + i * 11.3, y / 180 - i * 4.1, 3) + (g.n2.v(x / cell, y / cell) - 0.5) * 0.12;
        if (v > 0.5 + i * 0.012) c = P[i];
      }
      ctx.fillStyle = rgb(c);
      ctx.fillRect(x, y, cell + 0.6, cell + 0.6);
    }
  }
  grain(g, 0.06);
};

/** Tiger stripes: warped sine bands thresholded. */
const tiger: Gen = (g) => {
  const a = pc(g, 0), b = pc(g, 1), c2 = g.pal[2] ?? mix(a, [255, 255, 255], 0.25);
  const freq = num(g, 'freq', 1);
  field(g, 512, (x, y) => {
    const w = g.n.fbm(x / 160, y / 260, 4);
    const band = Math.sin((x / 1000) * 34 * freq + w * 9 + g.n2.fbm(x / 70, y / 70, 2) * 2.5);
    const t = smooth(0.35, 0.55, band) * smooth(0.25, 0.6, g.n.fbm(x / 90 + 40, y / 140, 3));
    const base = mix(a, c2, smooth(0.2, 0.8, g.n2.fbm(x / 400, y / 400, 2)));
    return mix(base, b, t);
  });
  grain(g, 0.05);
};

/** Doppler: dark galaxy base with swirling metallic colour clouds and sparkles. */
const doppler: Gen = (g) => {
  const P = g.pal;
  const dark = mix(P[0], [0, 0, 0], 0.7);
  field(g, 384, (x, y) => {
    const qx = g.n.fbm(x / 260, y / 260, 4), qy = g.n.fbm(x / 260 + 5.2, y / 260 + 1.3, 4);
    const v = g.n2.fbm(x / 220 + qx * 4, y / 220 + qy * 4, 5);
    const t = smooth(0.3, 0.75, v);
    let c = t < 0.5 ? mix(dark, P[0], t * 2) : mix(P[0], P[1] ?? P[0], (t - 0.5) * 2);
    const hi = smooth(0.62, 0.8, v);
    c = mix(c, P[2] ?? [255, 255, 255], hi * 0.55);
    return c;
  });
  // sparkle stars
  const ctx = g.ctx;
  const count = num(g, 'stars', 260);
  for (let i = 0; i < count; i++) {
    const x = g.r() * 1000, y = g.r() * 1000, s = g.r() * g.r() * 2.6 + 0.4;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + g.r() * 0.6})`;
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
  }
  fillAll(g, linGrad(g, 0, 0, 1000, 1000, ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.14)']));
};

export const PATTERNS: Record<string, Gen> = {
  fade, anodized, solid, camo, digital, tiger, doppler,
};

export const PATTERN_KINDS = () => Object.keys(PATTERNS);

/** Paint `recipe` into a fresh S x S canvas. */
export function paintPattern(recipe: PatternRecipe, S: number, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.scale(S / 1000, S / 1000);
  const colors = recipe.colors.length ? recipe.colors : ['#888888'];
  const g: PatternCtx = {
    ctx, S, colors, pal: colors.map(hex), p: recipe.params ?? {},
    r: rng(seed), n: new Noise(seed), n2: new Noise(seed * 7 + 3),
  };
  const gen = PATTERNS[recipe.kind] ?? solid;
  ctx.save();
  gen(g);
  ctx.restore();
  return c;
}

// keep helpers referenced for generators added later
void col; void ramp; void lerp;

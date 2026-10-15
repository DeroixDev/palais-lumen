/**
 * Procedural skin patterns. Each generator paints a square texture in a 1000 x 1000 unit space
 * (the context is pre-scaled), deterministic per skin. The item seed later picks which window of
 * this texture lands on the weapon (like a real paint seed offset), so one texture serves all seeds.
 *
 * Kinds: fade, doppler, marble, casehardened, tiger, camo, digital, hex, carbon, damascus, web,
 * blotch, graffiti, circuit, dragon, waves, splatter, anodized, topo, tiles, flames, lightning,
 * holo, galaxy, wood, snake, stripes, solid, acid, scales (alias of snake).
 */
import type { PatternRecipe } from '../contract';
import { Noise, Rng, rng, hex, rgb, ramp, mix, clamp, smooth } from './noise';
import { mkCanvas } from './canvas';

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
const pc = (g: PatternCtx, i: number): RGB => g.pal[i % g.pal.length];
const TAU = Math.PI * 2;
const fract = (v: number) => v - Math.floor(v);

/** Per-pixel field, resolution given for a 1024 texture (scaled with S), upscaled smoothly. fn gets units 0..1000. */
function field(g: PatternCtx, res: number, fn: (x: number, y: number) => RGB | number[], alpha = false) {
  const R = Math.max(32, Math.round((res * g.S) / 1024));
  const c = mkCanvas(R, R);
  const cx = c.getContext('2d')!;
  const img = cx.createImageData(R, R);
  const d = img.data;
  const k = 1000 / R;
  for (let y = 0, i = 0; y < R; y++) {
    for (let x = 0; x < R; x++, i += 4) {
      const v = fn((x + 0.5) * k, (y + 0.5) * k);
      d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = alpha ? v[3] : 255;
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

let grainTile: HTMLCanvasElement | null = null;
/** Fine grain so flat areas look like paint, not vector. */
function grain(g: PatternCtx, amt = 0.06) {
  if (!grainTile) {
    grainTile = mkCanvas(128, 128);
    const cx = grainTile.getContext('2d')!;
    const img = cx.createImageData(128, 128);
    const r = rng(77);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
  }
  const ctx = g.ctx;
  ctx.save();
  ctx.globalAlpha = amt;
  ctx.globalCompositeOperation = 'overlay';
  const pat = ctx.createPattern(grainTile, 'repeat')!;
  pat.setTransform(new DOMMatrix().scale((1000 / g.S) * 1.2));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, 1000, 1000);
  ctx.restore();
}

function linGrad(g: PatternCtx, x0: number, y0: number, x1: number, y1: number, cols: string[]) {
  const gr = g.ctx.createLinearGradient(x0, y0, x1, y1);
  cols.forEach((c, i) => gr.addColorStop(i / Math.max(1, cols.length - 1), c));
  return gr;
}

/** Diagonal clear-coat sheen bands. */
function sheen(g: PatternCtx, a = 0.12) {
  fillAll(g, linGrad(g, 0, 0, 1000, 1000, [`rgba(255,255,255,${a})`, 'rgba(255,255,255,0)', `rgba(255,255,255,${a * 0.8})`, 'rgba(255,255,255,0)', `rgba(255,255,255,${a * 0.6})`]));
}

function hsl(h: number, s: number, l: number): RGB {
  h = fract(h);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    t = fract(t);
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

// ================================================================================================
// Generators
// ================================================================================================

/** Gradient sweep across the texture, airbrushed. */
const fade: Gen = (g) => {
  const ang = (num(g, 'angle', 20) * Math.PI) / 180;
  const P = g.pal;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  field(g, 384, (x, y) => {
    const t = ((x - 500) * ca + (y - 500) * sa) / 1000 + 0.5 + (g.n.fbm(x / 240, y / 240, 3) - 0.5) * 0.18;
    const c = ramp(P, smooth(0.05, 0.95, t));
    const m = (g.n2.fbm(x / 90, y / 90, 3) - 0.5) * 18;
    return [c[0] + m, c[1] + m, c[2] + m];
  });
  sheen(g, 0.16);
  grain(g, 0.05);
};

/** Brushed anodised metal with a two-tone gradient. */
const anodized: Gen = (g) => {
  const a = pc(g, 0), b = pc(g, 1);
  field(g, 512, (x, y) => {
    const t = clamp(y / 1000 + (g.n.fbm(x / 400, y / 400, 3) - 0.5) * 0.4);
    const c = mix(a, b, smooth(0.1, 0.9, t));
    const s = (g.n2.v(x / 900, y / 2.5) - 0.5) * 30;
    return [c[0] + s, c[1] + s, c[2] + s];
  });
  fillAll(g, linGrad(g, 0, 0, 1000, 0, ['rgba(255,255,255,0)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']));
};

/** Matte single colour with soft variation (cheap consumer finishes). */
const solid: Gen = (g) => {
  const a = pc(g, 0);
  const b = g.pal[1] ?? mix(a, [0, 0, 0], 0.3);
  field(g, 256, (x, y) => mix(a, b, smooth(0.3, 0.75, g.n.fbm(x / 300, y / 300, 4)) * 0.7));
  grain(g, 0.1);
};

/** Woodland camo: colour blobs layered by thresholded, warped fbm. */
const camo: Gen = (g) => {
  const sc = num(g, 'scale', 1);
  const P = g.pal;
  field(g, 640, (x, y) => {
    let c = P[0];
    const wx = x + (g.n2.fbm(x / 110, y / 110, 2) - 0.5) * 70;
    const wy = y + (g.n2.fbm(x / 110 + 9, y / 110, 2) - 0.5) * 70;
    for (let i = 1; i < P.length; i++) {
      const v = g.n.fbm(wx / (200 * sc) + i * 13.1, wy / (130 * sc) - i * 7.7, 4);
      if (v > 0.52 + i * 0.012) c = P[i];
    }
    return c;
  });
  grain(g, 0.12);
};

/** Digital / pixel camo: noise quantised to a square grid. */
const digital: Gen = (g) => {
  const cell = num(g, 'cell', 16);
  const P = g.pal;
  const ctx = g.ctx;
  for (let y = 0; y < 1000; y += cell) {
    for (let x = 0; x < 1000; x += cell) {
      let c = P[0];
      for (let i = 1; i < P.length; i++) {
        const v = g.n.fbm(x / 210 + i * 11.3, y / 150 - i * 4.1, 3) + (g.n2.v(x / cell, y / cell) - 0.5) * 0.14;
        if (v > 0.5 + i * 0.012) c = P[i];
      }
      ctx.fillStyle = rgb(c);
      ctx.fillRect(x, y, cell + 0.6, cell + 0.6);
    }
  }
  grain(g, 0.1);
};

/** Tiger stripes: warped, tapered bands. */
const tiger: Gen = (g) => {
  const a = pc(g, 0), b = pc(g, 1), c2 = g.pal[2] ?? mix(a, [255, 255, 255], 0.25);
  const freq = num(g, 'freq', 1);
  field(g, 768, (x, y) => {
    const w = g.n.fbm(x / 170, y / 300, 4);
    const band = Math.sin((x / 1000) * 46 * freq + w * 10 + g.n2.fbm(x / 60, y / 80, 2) * 2.2);
    const taper = smooth(0.3, 0.62, g.n.fbm(x / 120 + 40, y / 180, 3));
    const t = smooth(0.45, 0.6, band * (0.6 + taper * 0.6) - (1 - taper) * 0.6);
    const base = mix(a, c2, smooth(0.25, 0.85, g.n2.fbm(x / 400, y / 400, 2)));
    return mix(base, b, t);
  });
  sheen(g, 0.08);
  grain(g, 0.06);
};

/** Doppler: dark galaxy base with swirling metallic colour clouds and sparkles. Phases = palettes. */
const doppler: Gen = (g) => {
  const P = g.pal;
  const dark = mix(P[0], [0, 0, 0], num(g, 'dark', 0.72));
  const swirl = num(g, 'swirl', 4.5);
  field(g, 640, (x, y) => {
    const qx = g.n.fbm(x / 280, y / 280, 4), qy = g.n.fbm(x / 280 + 5.2, y / 280 + 1.3, 4);
    const v = g.n2.fbm(x / 230 + qx * swirl, y / 230 + qy * swirl, 5);
    const t = smooth(0.28, 0.78, v);
    let c = t < 0.5 ? mix(dark, P[0], t * 2) : mix(P[0], P[1] ?? P[0], (t - 0.5) * 2);
    c = mix(c, P[2] ?? [255, 255, 255], smooth(0.64, 0.82, v) * 0.6);
    const fil = Math.pow(1 - Math.abs(fract(v * 9) - 0.5) * 2, 6) * 30 * t;
    return [c[0] + fil, c[1] + fil, c[2] + fil];
  });
  const ctx = g.ctx;
  const count = num(g, 'stars', 340);
  for (let i = 0; i < count; i++) {
    const x = g.r() * 1000, y = g.r() * 1000, s = g.r() * g.r() * 2.4 + 0.35;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + g.r() * 0.7})`;
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
  }
  sheen(g, 0.16);
};

/** Marble fade: colour ramp across x, warped, with dark/light veins. */
const marble: Gen = (g) => {
  const P = g.pal;
  field(g, 640, (x, y) => {
    const wx = g.n.fbm(x / 260, y / 260, 4), wy = g.n.fbm(x / 260 + 7, y / 260 + 3, 4);
    const t = (x / 1000) * 0.9 + (wx - 0.5) * 0.7 + (Math.sin(y / 140 + wy * 6) * 0.06);
    let c = ramp(P, fract(t * num(g, 'bands', 1.2)));
    const vein = g.n2.ridge(x / 220 + wx * 2.5, y / 220 + wy * 2.5, 5);
    c = mix(c, [255, 255, 255], smooth(0.7, 0.92, vein) * 0.55);
    c = mix(c, [10, 8, 12], smooth(0.55, 0.7, 1 - vein) * 0.25);
    return c;
  });
  sheen(g, 0.18);
};

/** Case hardened: heat-tint patina of blue, purple, gold over steel. Seed window makes blue gems rare. */
const casehardened: Gen = (g) => {
  const P = g.pal.length >= 3 ? g.pal : [hex('#24508f'), hex('#c8a24a'), hex('#8b8f94'), hex('#5a3c74')];
  const steel = P[2];
  const V = (x: number, y: number) => {
    const w1 = g.n.fbm(x / 150, y / 150, 4), w2 = g.n.fbm(x / 150 + 9, y / 150 + 4, 4);
    return g.n2.fbm(x / 210 + w1 * 2.2, y / 210 + w2 * 2.2, 5);
  };
  // Special seeds (see data/specials.ts): `blue` = share of the motif area painted blue (blue gem),
  // `goldgem` = almost all gold. The blue threshold is the matching quantile of the field around the
  // texture centre, which the renderer puts onto the weapon's biggest painted part.
  const target = num(g, 'blue', -1), goldgem = num(g, 'goldgem', 0) > 0;
  let b0 = 0.48, b1 = 0.66;
  if (target >= 0) {
    const vs: number[] = [];
    const mw = num(g, 'mw', 500), mh = num(g, 'mh', 160);
    for (let i = 0; i < 48; i++) for (let j = 0; j < 24; j++) vs.push(V(500 + ((i + 0.5) / 48 - 0.5) * mw, 500 + ((j + 0.5) / 24 - 0.5) * mh));
    vs.sort((a, b) => a - b);
    const thr = vs[Math.min(vs.length - 1, Math.max(0, Math.floor((1 - target) * vs.length)))];
    b0 = thr - 0.024; b1 = thr;
  } else if (goldgem) { b0 = 2; b1 = 3; }
  const goldC: RGB = goldgem ? mix(P[1], [255, 214, 92], 0.3) : P[1];
  field(g, 640, (x, y) => {
    const v = V(x, y);
    const blue = smooth(b0, b1, v);
    const gold = goldgem ? 1 - smooth(0.66, 0.74, g.n.fbm(x / 170 + 31, y / 170 - 11, 4)) * 0.18 : smooth(0.42, 0.6, g.n.fbm(x / 170 + 31, y / 170 - 11, 4));
    let c: RGB = mix(steel, goldC, gold * 0.95);
    c = mix(c, P[3] ?? mix(P[0], [120, 60, 140], 0.5), smooth(0.4, 0.5, v) * (1 - blue) * (goldgem ? 0.08 : 0.5));
    c = mix(c, P[0], blue);
    const mott = (g.n.v(x / 6, y / 6) - 0.5) * 26;
    return [c[0] + mott, c[1] + mott, c[2] + mott];
  });
  sheen(g, 0.18);
  grain(g, 0.07);
};

/** Urban hex: hexagon grid, tiles in palette colours with bevel lines. */
const hexg: Gen = (g) => {
  const R = num(g, 'size', 26);
  const ctx = g.ctx;
  fillAll(g, rgb(mix(pc(g, 0), [0, 0, 0], 0.55)));
  const h = Math.sqrt(3) * R;
  for (let row = -1; row * h * 0.5 < 1040; row++) {
    for (let colI = -1; colI * R * 3 < 1040; colI++) {
      const cx = colI * R * 3 + (row % 2 ? R * 1.5 : 0), cy = row * h * 0.5;
      const v = g.n.fbm(cx / 260, cy / 260, 3) + (g.r() - 0.5) * 0.25;
      const ci = Math.min(g.pal.length - 1, Math.max(0, Math.floor(v * g.pal.length * 1.1 - 0.1)));
      const base = pc(g, ci);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; ctx.lineTo(cx + Math.cos(a) * (R - 2.2), cy + Math.sin(a) * (R - 2.2)); }
      ctx.closePath();
      const gr = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
      gr.addColorStop(0, rgb(mix(base, [255, 255, 255], 0.22))); gr.addColorStop(1, rgb(mix(base, [0, 0, 0], 0.25)));
      ctx.fillStyle = gr; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }
  grain(g, 0.08);
};

/** Carbon fibre weave with a coloured tint and gloss. */
const carbon: Gen = (g) => {
  const ctx = g.ctx;
  const a = pc(g, 0), b = g.pal[1] ?? mix(a, [255, 255, 255], 0.3);
  const cell = num(g, 'cell', 14);
  fillAll(g, rgb(mix(a, [0, 0, 0], 0.6)));
  for (let y = 0; y < 1000; y += cell) {
    for (let x = 0; x < 1000; x += cell) {
      const flip = ((x / cell) + (y / cell)) % 2 === 0;
      const gr = flip ? ctx.createLinearGradient(x, y, x + cell, y) : ctx.createLinearGradient(x, y, x, y + cell);
      gr.addColorStop(0, rgb(mix(a, [0, 0, 0], 0.5)));
      gr.addColorStop(0.5, rgb(mix(a, b, 0.55)));
      gr.addColorStop(1, rgb(mix(a, [0, 0, 0], 0.5)));
      ctx.fillStyle = gr;
      ctx.fillRect(x + 0.7, y + 0.7, cell - 1.4, cell - 1.4);
    }
  }
  sheen(g, 0.22);
};

/** Damascus steel: flowing layered wavy bands. */
const damascus: Gen = (g) => {
  const P = g.pal.length >= 2 ? g.pal : [hex('#2b2e33'), hex('#b8bec6')];
  field(g, 768, (x, y) => {
    const w = g.n.fbm(x / 180, y / 180, 5) * 160 + g.n2.fbm(x / 60, y / 60, 3) * 30;
    const v = Math.sin((y + w + Math.sin(x / 90) * 18) / 7.5);
    const t = smooth(-0.6, 0.6, v);
    const c = ramp(P, t);
    const s = (g.n2.v(x / 3, y / 3) - 0.5) * 14;
    return [c[0] + s, c[1] + s, c[2] + s];
  });
  if (num(g, 'stripe', 0)) {
    // night stripe: a dark band along the length through the motif centre
    const mh = num(g, 'mh', 160);
    const half = Math.max(18, mh * 0.3);
    field(g, 384, (x, y) => {
      const d = Math.abs(y - 500 - Math.sin(x / 70) * half * 0.25);
      const a = 1 - smooth(half * 0.75, half, d);
      return [12, 13, 16, a * 225];
    }, true);
  }
  sheen(g, 0.2);
};

/** Crimson web: dark base with spider webs. `hero` 1 = one big centred web, 3 = three in a row. */
const web: Gen = (g) => {
  const ctx = g.ctx;
  const base = pc(g, 0), line = g.pal[1] ?? [10, 10, 10];
  field(g, 256, (x, y) => mix(base, mix(base, [0, 0, 0], 0.4), smooth(0.35, 0.7, g.n.fbm(x / 250, y / 250, 3))));
  const hero = num(g, 'hero', 0);
  const mw = num(g, 'mw', 500), mh = num(g, 'mh', 160);
  ctx.strokeStyle = rgb(line);
  ctx.lineCap = 'round';
  const one = (cx: number, cy: number, R: number, k = 1) => {
    const spokes = 9 + Math.floor(g.r() * 5);
    const angs: number[] = [];
    for (let i = 0; i < spokes; i++) angs.push(((i + g.r() * 0.4) / spokes) * TAU);
    ctx.lineWidth = 3.2 * k;
    angs.forEach((a) => { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); });
    ctx.lineWidth = 2.2 * k;
    for (let rI = 1; rI < 9; rI++) {
      const rr = (rI / 9) * R * (0.9 + g.r() * 0.1);
      ctx.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a0 = angs[i % spokes], a1 = angs[(i + 1) % spokes] + (i + 1 >= spokes ? TAU : 0);
        const p0x = cx + Math.cos(a0) * rr, p0y = cy + Math.sin(a0) * rr;
        if (i === 0) ctx.moveTo(p0x, p0y);
        const am = (a0 + a1) / 2;
        const sag = rr * 0.86;
        ctx.quadraticCurveTo(cx + Math.cos(am) * sag, cy + Math.sin(am) * sag, cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr);
      }
      ctx.stroke();
    }
  };
  if (!hero) {
    const webs = num(g, 'webs', 5);
    for (let k = 0; k < webs; k++) one(g.r() * 1000, g.r() * 1000, 260 + g.r() * 260);
  } else {
    // background webs thin and away from the middle, so the hero webs read clearly
    for (let k = 0; k < 4; k++) {
      const cx = g.r() * 1000, cy = (g.r() < 0.5 ? 0.15 : 0.85) * 1000 + (g.r() - 0.5) * 100;
      one(cx, cy, 200 + g.r() * 160, 0.7);
    }
    const n = hero >= 3 ? 3 : 1;
    const wh = num(g, 'wh', 220);
    const R = n === 1 ? Math.max(mh * 0.6, wh * 0.5) : Math.min(mw / 6.3, Math.max(mh * 0.5, wh * 0.4));
    const k = Math.max(1.2, Math.min(2.2, R / 90));
    for (let i = 0; i < n; i++) one(500 + (i - (n - 1) / 2) * R * 2.05, 500, R, k);
  }
  sheen(g, 0.12);
  grain(g, 0.06);
};

/** Flowing blotches (slaughter-like): soft-edged organic patches over a gradient. */
const blotch: Gen = (g) => {
  const P = g.pal;
  field(g, 640, (x, y) => {
    const wx = g.n.fbm(x / 140, y / 140, 3), wy = g.n.fbm(x / 140 + 3, y / 140 + 8, 3);
    const v = g.n2.fbm(x / 160 + wx * 1.6, y / 160 + wy * 1.6, 5);
    const base = mix(P[0], P[1] ?? P[0], smooth(0.2, 0.8, y / 1000 + (wx - 0.5) * 0.5));
    let c = mix(base, P[2] ?? mix(P[0], [255, 255, 255], 0.5), smooth(0.5, 0.56, v));
    c = mix(c, [255, 255, 255], smooth(0.62, 0.7, v) * 0.35);
    const edge = 1 - Math.abs(v - 0.53) * 30;
    if (edge > 0) c = mix(c, [0, 0, 0], clamp(edge) * 0.3);
    return c;
  });
  const shape = g.p.shape;
  if (typeof shape === 'string') motifShape(g, shape, P[2] ?? mix(P[0], [255, 255, 255], 0.5));
  sheen(g, 0.16);
};

/** A clean shape (slaughter-style special) on the motif centre, sized to the painted part. */
function motifShape(g: PatternCtx, shape: string, col: RGB) {
  const ctx = g.ctx;
  const H = Math.max(40, num(g, 'mh', 160) * 0.92);
  const p = new Path2D();
  const cx = 500, cy = 500;
  if (shape === 'herz') {
    const w = H * 0.62;
    p.moveTo(cx, cy + H * 0.48);
    p.bezierCurveTo(cx - w * 1.1, cy - H * 0.05, cx - w * 0.85, cy - H * 0.62, cx, cy - H * 0.22);
    p.bezierCurveTo(cx + w * 0.85, cy - H * 0.62, cx + w * 1.1, cy - H * 0.05, cx, cy + H * 0.48);
  } else if (shape === 'diamant') {
    p.moveTo(cx, cy - H * 0.5); p.lineTo(cx + H * 0.62, cy); p.lineTo(cx, cy + H * 0.5); p.lineTo(cx - H * 0.62, cy); p.closePath();
  } else {
    // engel: two swept wings and a head
    for (const sgn of [-1, 1]) {
      p.moveTo(cx + sgn * H * 0.08, cy - H * 0.05);
      p.bezierCurveTo(cx + sgn * H * 0.5, cy - H * 0.55, cx + sgn * H * 1.15, cy - H * 0.5, cx + sgn * H * 1.25, cy - H * 0.32);
      p.bezierCurveTo(cx + sgn * H * 0.95, cy - H * 0.2, cx + sgn * H * 0.9, cy + H * 0.05, cx + sgn * H * 1.0, cy + H * 0.12);
      p.bezierCurveTo(cx + sgn * H * 0.6, cy + H * 0.1, cx + sgn * H * 0.45, cy + H * 0.42, cx + sgn * H * 0.1, cy + H * 0.3);
      p.closePath();
    }
    p.moveTo(cx + H * 0.13, cy - H * 0.28); p.arc(cx, cy - H * 0.28, H * 0.13, 0, TAU);
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(3, H * 0.08); ctx.stroke(p);
  const gr = ctx.createLinearGradient(cx, cy - H * 0.5, cx, cy + H * 0.5);
  gr.addColorStop(0, rgb(mix(col, [255, 255, 255], 0.6))); gr.addColorStop(1, rgb(mix(col, [255, 255, 255], 0.3)));
  ctx.fillStyle = gr; ctx.fill(p);
  ctx.restore();
}

/** Sticker bomb / graffiti: bold shapes, tags and outlines in many colours. */
const graffiti: Gen = (g) => {
  const ctx = g.ctx;
  fillAll(g, col(g, 0));
  const P = g.colors.slice(1).length ? g.colors.slice(1) : ['#ff2d55', '#ffd60a', '#30d158', '#0a84ff'];
  const n = num(g, 'count', 70);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = g.r() * 1000, y = g.r() * 1000, s = 30 + g.r() * 70, kind = Math.floor(g.r() * 6);
    const c = P[Math.floor(g.r() * P.length)];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((g.r() - 0.5) * 1.2);
    ctx.fillStyle = c;
    ctx.strokeStyle = '#0d0d10';
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (kind === 0) ctx.arc(0, 0, s * 0.6, 0, TAU);
    else if (kind === 1) { for (let k = 0; k < 10; k++) { const a = (k * Math.PI) / 5, r = k % 2 ? s * 0.3 : s * 0.7; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
    else if (kind === 2) ctx.roundRect(-s * 0.7, -s * 0.4, s * 1.4, s * 0.8, s * 0.2);
    else if (kind === 3) { ctx.moveTo(-s * 0.6, s * 0.5); ctx.lineTo(0, -s * 0.6); ctx.lineTo(s * 0.6, s * 0.5); ctx.closePath(); }
    else if (kind === 4) { ctx.moveTo(-s * 0.2, -s * 0.7); ctx.lineTo(s * 0.4, -s * 0.1); ctx.lineTo(0, 0); ctx.lineTo(s * 0.3, s * 0.7); ctx.lineTo(-s * 0.4, s * 0.05); ctx.lineTo(0, 0); ctx.closePath(); }
    else { ctx.moveTo(0, s * 0.6); ctx.bezierCurveTo(-s, -s * 0.1, -s * 0.4, -s * 0.8, 0, -s * 0.25); ctx.bezierCurveTo(s * 0.4, -s * 0.8, s, -s * 0.1, 0, s * 0.6); }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(-s * 0.15, -s * 0.2, s * 0.18, s * 0.08, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // tags: scribbled strokes
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = P[Math.floor(g.r() * P.length)];
    ctx.lineWidth = 7;
    ctx.beginPath();
    let x = g.r() * 1000, y = g.r() * 1000;
    ctx.moveTo(x, y);
    for (let k = 0; k < 7; k++) { const nx = x + 20 + g.r() * 30, ny = y + (g.r() - 0.5) * 60; ctx.quadraticCurveTo(x + 10, y - 40 * (k % 2 ? 1 : -1), nx, ny); x = nx; y = ny; }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  }
  sheen(g, 0.14);
};

/** Neon circuit board: traces with right-angle turns, pads, glow. */
const circuit: Gen = (g) => {
  const ctx = g.ctx;
  const base = pc(g, 0), neon = col(g, 1), neon2 = col(g, 2);
  field(g, 256, (x, y) => mix(base, mix(base, [0, 0, 0], 0.5), smooth(0.3, 0.7, g.n.fbm(x / 200, y / 200, 3))));
  const grid = 20;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const traces = num(g, 'traces', 90);
  for (let pass = 0; pass < 2; pass++) {
    const rr = rng(1234);
    for (let i = 0; i < traces; i++) {
      const c = rr() < 0.75 ? neon : neon2;
      let x = Math.round((rr() * 1000) / grid) * grid, y = Math.round((rr() * 1000) / grid) * grid;
      const pts: [number, number][] = [[x, y]];
      let dir = Math.floor(rr() * 4);
      const segs = 2 + Math.floor(rr() * 5);
      for (let k = 0; k < segs; k++) {
        const L = (1 + Math.floor(rr() * 5)) * grid;
        const dx = [1, 0, -1, 0][dir], dy = [0, 1, 0, -1][dir];
        x += dx * L; y += dy * L; pts.push([x, y]);
        dir = (dir + (rr() < 0.5 ? 1 : 3)) % 4;
        if (rr() < 0.4) { x += grid * 0.6 * (rr() < 0.5 ? 1 : -1); y += grid * 0.6; pts.push([x, y]); }
      }
      ctx.beginPath(); pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      if (pass === 0) { ctx.strokeStyle = c; ctx.globalAlpha = 0.25; ctx.lineWidth = 11; ctx.stroke(); }
      else {
        ctx.globalAlpha = 1; ctx.strokeStyle = c; ctx.lineWidth = 3.4; ctx.stroke();
        ctx.fillStyle = c;
        const [ex, ey] = pts[pts.length - 1];
        ctx.beginPath(); ctx.arc(ex, ey, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = rgb(base); ctx.beginPath(); ctx.arc(ex, ey, 2.6, 0, TAU); ctx.fill();
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 4, 0, TAU); ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  // chips
  const rr = rng(99);
  for (let i = 0; i < 10; i++) {
    const x = rr() * 900, y = rr() * 900, w = 50 + rr() * 60, h = 30 + rr() * 40;
    ctx.fillStyle = 'rgba(8,10,14,0.92)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = neon; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = neon;
    for (let k = 6; k < w - 4; k += 9) { ctx.fillRect(x + k, y - 6, 3, 6); ctx.fillRect(x + k, y + h, 3, 6); }
  }
  grain(g, 0.06);
};

/** Dragon / serpent line art: a scaled body winding over a cloudy ground. */
const dragon: Gen = (g) => {
  const ctx = g.ctx;
  const base = pc(g, 0), body = col(g, 1), line = col(g, 2), accent = col(g, 3);
  field(g, 384, (x, y) => mix(base, mix(base, [255, 255, 255], 0.15), smooth(0.45, 0.75, g.n.fbm(x / 160, y / 160, 4))));
  // cloud swirls
  ctx.strokeStyle = line; ctx.globalAlpha = 0.5; ctx.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    const x = g.r() * 1000, y = g.r() * 1000, r = 14 + g.r() * 26;
    ctx.beginPath();
    for (let t = 0; t < 2.6 * Math.PI; t += 0.15) ctx.lineTo(x + Math.cos(t) * r * (1 - t / 10), y + Math.sin(t) * r * (1 - t / 10));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // serpent spine
  const pts: [number, number][] = [];
  for (let t = 0; t <= 1; t += 0.004) {
    pts.push([-60 + t * 800, 500 + Math.sin(t * TAU * 1.7 + 0.6) * 58 + Math.sin(t * TAU * 4.3) * 14]);
  }
  const width = (t: number) => 30 + Math.sin(Math.min(1, t * 0.9 + 0.05) * Math.PI) * 44;
  const stroke = (w: (t: number) => number, style: string) => {
    for (let i = 1; i < pts.length; i++) {
      ctx.strokeStyle = style; ctx.lineWidth = w(i / pts.length); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
  };
  stroke((t) => width(t) + 9, line);
  stroke((t) => width(t), body);
  // belly line and scales
  stroke((t) => width(t) * 0.25, accent);
  ctx.strokeStyle = line; ctx.lineWidth = 2.2;
  for (let i = 4; i < pts.length - 2; i += 4) {
    const [x0, y0] = pts[i - 2], [x1, y1] = pts[i + 2];
    const a = Math.atan2(y1 - y0, x1 - x0), w = width(i / pts.length) * 0.42;
    const [cx, cy] = pts[i];
    ctx.beginPath();
    ctx.arc(cx, cy, w, a + Math.PI * 0.55, a + Math.PI * 1.45);
    ctx.stroke();
  }
  // spikes along the back
  ctx.fillStyle = accent; ctx.strokeStyle = line; ctx.lineWidth = 2.5;
  for (let i = 10; i < pts.length - 10; i += 12) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i + 1];
    const a = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2, w = width(i / pts.length);
    const [cx, cy] = pts[i];
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * w * 0.45 - Math.cos(a + Math.PI / 2) * 10, cy + Math.sin(a) * w * 0.45 - Math.sin(a + Math.PI / 2) * 10);
    ctx.lineTo(cx + Math.cos(a) * (w * 0.5 + 26) + Math.cos(a + Math.PI / 2) * 10, cy + Math.sin(a) * (w * 0.5 + 26) + Math.sin(a + Math.PI / 2) * 10);
    ctx.lineTo(cx + Math.cos(a) * w * 0.45 + Math.cos(a + Math.PI / 2) * 12, cy + Math.sin(a) * w * 0.45 + Math.sin(a + Math.PI / 2) * 12);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // head at the end of the body, facing right
  {
    const [hx, hy] = pts[pts.length - 1];
    const [px, py] = pts[pts.length - 8];
    const a = Math.atan2(hy - py, hx - px);
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(a);
    ctx.lineJoin = 'round';
    // horns
    ctx.fillStyle = accent; ctx.strokeStyle = line; ctx.lineWidth = 3;
    for (const sgn of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(-10, sgn * 18); ctx.quadraticCurveTo(-50, sgn * 70, -90, sgn * 64); ctx.quadraticCurveTo(-40, sgn * 46, 4, sgn * 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // skull + snout + jaw
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-26, -34); ctx.quadraticCurveTo(30, -50, 70, -22); ctx.lineTo(120, -16); ctx.quadraticCurveTo(134, -6, 120, 2);
    ctx.lineTo(60, 4); ctx.lineTo(110, 22); ctx.quadraticCurveTo(100, 36, 60, 30); ctx.quadraticCurveTo(10, 46, -26, 34); ctx.closePath();
    ctx.fill(); ctx.lineWidth = 5; ctx.stroke();
    // teeth
    ctx.fillStyle = '#fff8e0'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(66 + k * 10, 4); ctx.lineTo(70 + k * 10, 13); ctx.lineTo(74 + k * 10, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    // eye
    ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(36, -18, 12, 7, -0.2, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = line; ctx.beginPath(); ctx.ellipse(39, -18, 3, 6, 0, 0, TAU); ctx.fill();
    // whiskers
    ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(110, -12); ctx.bezierCurveTo(150, -40, 170, 10, 230, -30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(100, 24); ctx.bezierCurveTo(140, 60, 180, 20, 240, 50); ctx.stroke();
    // flame breath
    const fg = ctx.createLinearGradient(130, 0, 330, 0);
    fg.addColorStop(0, accent); fg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fg; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(126, -2); ctx.quadraticCurveTo(220, -60, 330, -30); ctx.quadraticCurveTo(250, 0, 330, 34); ctx.quadraticCurveTo(220, 50, 126, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  sheen(g, 0.12);
  grain(g, 0.05);
};

/** Japanese waves: seigaiha arcs plus foam curls. */
const waves: Gen = (g) => {
  const ctx = g.ctx;
  const P = g.colors;
  const R = num(g, 'size', 46);
  fillAll(g, P[0]);
  for (let row = 0; row * R * 0.5 < 1100; row++) {
    for (let k = -1; k * R * 2 < 1100; k++) {
      const cx = k * R * 2 + (row % 2 ? R : 0), cy = row * R * 0.5;
      for (let ring = 5; ring >= 1; ring--) {
        ctx.beginPath(); ctx.arc(cx, cy, (R * ring) / 5, Math.PI, 0); ctx.closePath();
        ctx.fillStyle = ring % 2 ? P[1 % P.length] : P[2 % P.length];
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 0); ctx.strokeStyle = P[3 % P.length] ?? '#fff'; ctx.lineWidth = 2.4; ctx.stroke();
    }
  }
  // big foam curls
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const x = g.r() * 1000, y = g.r() * 1000, r = 60 + g.r() * 50;
    ctx.lineWidth = 9;
    ctx.beginPath();
    for (let t = 0; t < 3.2 * Math.PI; t += 0.08) { const rr = r * (1 - t / 12); ctx.lineTo(x + Math.cos(t + Math.PI) * rr, y + Math.sin(t + Math.PI) * rr); }
    ctx.stroke();
  }
  sheen(g, 0.1);
  grain(g, 0.07);
};

/** Paint splatter: drops, splashes, spray. */
const splatter: Gen = (g) => {
  const ctx = g.ctx;
  fillAll(g, col(g, 0));
  field(g, 256, (x, y) => [0, 0, 0, smooth(0.4, 0.8, g.n.fbm(x / 240, y / 240, 3)) * 60], true);
  const P = g.colors.slice(1).length ? g.colors.slice(1) : ['#fff'];
  const n = num(g, 'count', 26);
  for (let i = 0; i < n; i++) {
    const c = P[i % P.length];
    const x = g.r() * 1000, y = g.r() * 1000, R = 20 + g.r() * 60;
    ctx.fillStyle = c;
    ctx.beginPath();
    const spikes = 14 + Math.floor(g.r() * 10);
    for (let k = 0; k <= spikes * 2; k++) {
      const a = (k / (spikes * 2)) * TAU, rr = k % 2 ? R * (0.75 + g.r() * 0.3) : R * (1 + g.r() * 0.7);
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    for (let k = 0; k < 18; k++) {
      const a = g.r() * TAU, d = R * (1.3 + g.r() * 2.2), s = 2 + g.r() * R * 0.16;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, TAU); ctx.fill();
    }
    // drip
    if (g.r() < 0.5) { ctx.fillRect(x - 4, y, 8, R * (1 + g.r() * 2)); ctx.beginPath(); ctx.arc(x, y + R * 2, 7, 0, TAU); ctx.fill(); }
  }
  sheen(g, 0.14);
  grain(g, 0.06);
};

/** Topography: contour lines over a gradient. */
const topo: Gen = (g) => {
  const P = g.pal;
  const lineC = P[P.length - 1];
  const N = num(g, 'lines', 16);
  field(g, 768, (x, y) => {
    const v = g.n.fbm(x / 300, y / 300, 5);
    const base = ramp(P.slice(0, Math.max(1, P.length - 1)), smooth(0.25, 0.75, v));
    const f = fract(v * N);
    const ln = Math.max(0, 1 - Math.min(f, 1 - f) * 22);
    const major = Math.floor(v * N) % 4 === 0 ? 1 : 0.6;
    return mix(base, lineC, ln * major);
  });
  grain(g, 0.06);
};

/** Low-poly geometric triangle tiles. */
const tiles: Gen = (g) => {
  const ctx = g.ctx;
  const cell = num(g, 'size', 70);
  const P = g.pal;
  const jit: [number, number][][] = [];
  const nC = Math.ceil(1000 / cell) + 2;
  for (let j = 0; j < nC; j++) {
    jit.push([]);
    for (let i = 0; i < nC; i++) jit[j].push([(i - 0.5) * cell + (g.r() - 0.5) * cell * 0.6, (j - 0.5) * cell + (g.r() - 0.5) * cell * 0.6]);
  }
  for (let j = 0; j < nC - 1; j++) {
    for (let i = 0; i < nC - 1; i++) {
      const a = jit[j][i], b = jit[j][i + 1], c = jit[j + 1][i], d = jit[j + 1][i + 1];
      for (const tri of [[a, b, d], [a, d, c]]) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const v = g.n.fbm(cx / 400, cy / 400, 2);
        const base = ramp(P, smooth(0.2, 0.8, v + (g.r() - 0.5) * 0.25));
        const light = (g.r() - 0.5) * 0.3;
        ctx.fillStyle = rgb(light > 0 ? mix(base, [255, 255, 255], light) : mix(base, [0, 0, 0], -light));
        ctx.beginPath(); ctx.moveTo(tri[0][0], tri[0][1]); ctx.lineTo(tri[1][0], tri[1][1]); ctx.lineTo(tri[2][0], tri[2][1]); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  }
  sheen(g, 0.14);
};

/** Hot-rod flames licking from left to right over a dark base. */
const flames: Gen = (g) => {
  const base = pc(g, 0);
  const P = g.pal.length > 1 ? g.pal.slice(1) : [hex('#ff3b00'), hex('#ffb000'), hex('#fff1a8')];
  field(g, 768, (x, y) => {
    const band = fract(y / 330);
    const ny = g.n.fbm(x / 70 - 3, y / 30, 4);
    const tongue = Math.sin(band * Math.PI) * (1 - x / 1300) + (ny - 0.5) * 0.9 + (g.n2.fbm(x / 200, y / 200, 2) - 0.5) * 0.4;
    const t = smooth(0.1, 0.95, tongue);
    if (t <= 0.02) return mix(base, [0, 0, 0], g.n2.fbm(x / 200, y / 200, 3) * 0.4);
    const c = ramp(P, t);
    const edge = smooth(0.02, 0.1, t);
    return mix(base, c, edge);
  });
  sheen(g, 0.14);
  grain(g, 0.05);
};

/** Lightning bolts with glow over a dark stormy base. */
const lightning: Gen = (g) => {
  const ctx = g.ctx;
  const base = pc(g, 0), boltC = col(g, 1), glow = col(g, 2);
  field(g, 384, (x, y) => mix(mix(base, [0, 0, 0], 0.55), base, smooth(0.35, 0.75, g.n.fbm(x / 180, y / 180, 5))));
  const bolt = (x0: number, y0: number, x1: number, y1: number, disp: number, w: number, depth: number) => {
    if (depth === 0 || Math.hypot(x1 - x0, y1 - y0) < 8) {
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); return;
    }
    const mx = (x0 + x1) / 2 + (g.r() - 0.5) * disp, my = (y0 + y1) / 2 + (g.r() - 0.5) * disp;
    bolt(x0, y0, mx, my, disp / 2, w, depth - 1);
    bolt(mx, my, x1, y1, disp / 2, w, depth - 1);
    if (g.r() < 0.18 && w > 1.5) bolt(mx, my, mx + (g.r() - 0.3) * 260, my + (g.r() - 0.5) * 260, disp / 2, w * 0.55, depth - 1);
  };
  ctx.lineCap = 'round';
  const n = num(g, 'bolts', 7);
  for (let i = 0; i < n; i++) {
    const x0 = g.r() * 1000, y0 = g.r() * 1000, a = g.r() * TAU, L = 300 + g.r() * 500;
    const st = g.r() * 1e6;
    for (const [style, w, alpha] of [[glow, 16, 0.18], [glow, 8, 0.4], [boltC, 3.2, 1]] as [string, number, number][]) {
      const save = g.r; const rr = rng(st); g.r = rr;
      ctx.strokeStyle = style; ctx.globalAlpha = alpha;
      bolt(x0, y0, x0 + Math.cos(a) * L, y0 + Math.sin(a) * L, 180, w, 7);
      g.r = save;
    }
  }
  ctx.globalAlpha = 1;
  grain(g, 0.06);
};

/** Holographic iridescence: hue flows with noise and diagonal diffraction bands. */
const holo: Gen = (g) => {
  const tint = pc(g, 0);
  const hueShift = num(g, 'hue', 0);
  field(g, 512, (x, y) => {
    const v = g.n.fbm(x / 320, y / 320, 4);
    const h = v * 1.6 + (x + y) / 1400 + hueShift + Math.sin((x - y) / 22) * 0.04;
    const c = hsl(h, 0.85, 0.6 + Math.sin((x * 0.7 + y) / 9) * 0.04);
    return mix(c, tint, 0.25);
  });
  fillAll(g, linGrad(g, 0, 1000, 1000, 0, ['rgba(255,255,255,0.0)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0)']));
};

/** Deep space nebula with star field and flares. */
const galaxy: Gen = (g) => {
  const ctx = g.ctx;
  const P = g.pal;
  field(g, 512, (x, y) => {
    const w = g.n.fbm(x / 200, y / 200, 3);
    const v = g.n2.fbm(x / 260 + w * 2, y / 260 - w * 2, 5);
    let c: RGB = [6, 6, 16];
    c = mix(c, P[0], smooth(0.4, 0.7, v));
    c = mix(c, P[1] ?? P[0], smooth(0.55, 0.8, g.n.fbm(x / 180 + 20, y / 180, 4)) * 0.8);
    c = mix(c, P[2] ?? [255, 255, 255], smooth(0.72, 0.9, v) * 0.6);
    return c;
  });
  for (let i = 0; i < 700; i++) {
    const x = g.r() * 1000, y = g.r() * 1000, s = g.r() * g.r() * 2 + 0.3;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + g.r() * 0.7})`;
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < 12; i++) {
    const x = g.r() * 1000, y = g.r() * 1000, L = 14 + g.r() * 22;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, L);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.2, 'rgba(200,220,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, L, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(x - L, y - 0.7, L * 2, 1.4); ctx.fillRect(x - 0.7, y - L, 1.4, L * 2);
  }
  if (num(g, 'core', 0)) {
    // supernova core: big glow plus a four-ray flare on the motif centre
    const L = Math.max(60, num(g, 'mh', 160) * 1.1);
    const tint = rgb(P[2] ?? [255, 255, 255]);
    let gr = ctx.createRadialGradient(500, 500, 0, 500, 500, L * 1.6);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.35, tint); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(500, 500, L * 1.6, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (const [w, h] of [[L * 3.2, L * 0.07], [L * 0.07, L * 1.6]]) {
      gr = ctx.createRadialGradient(500, 500, 0, 500, 500, Math.max(w, h) / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(500 - w / 2, 500 - h / 2, w, h);
    }
  }
  sheen(g, 0.1);
};

/** Wood grain (colours = light, dark, optional ring tint). */
const wood: Gen = (g) => {
  const a = pc(g, 0), b = g.pal[1] ?? mix(a, [0, 0, 0], 0.5);
  field(g, 768, (x, y) => {
    const w = g.n.fbm(x / 400, y / 90, 4) * 70;
    const ring = fract((y + w + Math.sin(x / 160) * 12) / 26);
    const t = smooth(0.15, 0.9, ring) * 0.7 + g.n2.v(x / 40, y / 3) * 0.3;
    const knot = smooth(0.7, 0.85, g.n2.fbm(x / 120, y / 60, 3));
    return mix(mix(a, b, t), b, knot * 0.6);
  });
  sheen(g, 0.08);
  grain(g, 0.05);
};

/** Snakeskin: offset rows of shaded scales with diamond markings. */
const snake: Gen = (g) => {
  const ctx = g.ctx;
  const a = pc(g, 0), b = g.pal[1] ?? mix(a, [0, 0, 0], 0.5), c3 = g.pal[2] ?? mix(a, [255, 255, 255], 0.3);
  const s = num(g, 'size', 22);
  fillAll(g, rgb(mix(b, [0, 0, 0], 0.5)));
  for (let row = -1; row * s * 0.6 < 1040; row++) {
    for (let k = -1; k * s < 1040; k++) {
      const cx = k * s + (row % 2 ? s / 2 : 0), cy = row * s * 0.6;
      const dm = Math.abs(fract(cx / 220 + 0.5 * Math.sin(cy / 160)) - 0.5) + Math.abs(fract(cy / 160) - 0.5);
      const mark = smooth(0.42, 0.36, dm);
      const v = g.n.fbm(cx / 220, cy / 220, 3);
      let base = mix(a, c3, smooth(0.4, 0.8, v));
      base = mix(base, b, mark);
      const gr = ctx.createRadialGradient(cx, cy - s * 0.25, 0, cx, cy, s * 0.7);
      gr.addColorStop(0, rgb(mix(base, [255, 255, 255], 0.25))); gr.addColorStop(1, rgb(mix(base, [0, 0, 0], 0.35)));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.52, s * 0.42, 0, 0, TAU); ctx.fill();
    }
  }
  sheen(g, 0.14);
};

/** Racing / hazard stripes. */
const stripes: Gen = (g) => {
  const ctx = g.ctx;
  fillAll(g, col(g, 0));
  const ang = (num(g, 'angle', -30) * Math.PI) / 180;
  const w = num(g, 'width', 48);
  ctx.save();
  ctx.translate(500, 500); ctx.rotate(ang); ctx.translate(-800, -800);
  for (let x = 0, i = 0; x < 1600; x += w * 2, i++) { ctx.fillStyle = col(g, 1 + (i % Math.max(1, g.colors.length - 1))); ctx.fillRect(x, 0, w, 1600); }
  ctx.restore();
  field(g, 256, (x, y) => [0, 0, 0, smooth(0.45, 0.8, g.n.fbm(x / 200, y / 200, 3)) * 50], true);
  sheen(g, 0.16);
  grain(g, 0.07);
};

/** Acid: psychedelic warped colour bands. */
const acid: Gen = (g) => {
  const P = g.pal;
  field(g, 640, (x, y) => {
    const w1 = g.n.fbm(x / 200, y / 200, 4), w2 = g.n.fbm(x / 200 + 4, y / 200 - 2, 4);
    const v = g.n2.fbm(x / 300 + w1 * 3, y / 300 + w2 * 3, 4);
    return ramp([...P, P[0]], fract(v * 3.2));
  });
  sheen(g, 0.16);
};

export const PATTERNS: Record<string, Gen> = {
  fade, doppler, marble, casehardened, tiger, camo, digital, hex: hexg, carbon, damascus, web, blotch,
  graffiti, circuit, dragon, waves, splatter, anodized, topo, tiles, flames, lightning, holo, galaxy,
  wood, snake, scales: snake, stripes, solid, acid,
};

export const PATTERN_KINDS = () => Object.keys(PATTERNS);

/** Paint `recipe` into a fresh S x S canvas. */
export function paintPattern(recipe: PatternRecipe, S: number, seed: number): HTMLCanvasElement {
  const c = mkCanvas(S, S);
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

/**
 * The 2D renderer: weapon model + skin texture + wear + shading, anti-aliased and hi-DPI.
 *
 * Texture mapping (shared with the 3D viewer): the skin's pattern texture is painted once per skin.
 * The item seed picks a window of it; that window is stretched over the weapon's model box
 * (u = x / box.w, v = y / box.h). renderSkinTexture returns exactly that window as a square,
 * so planar UVs from the model box line up with the 2D render.
 */
import type { RenderOpts, SkinDef, WeaponModel, WeaponPart } from '../contract';
import { skinById, weaponById } from '../data/catalog';
import { buildModel } from './models';
import { paintPattern } from './patterns';
import { Noise, rng, hashStr, clamp, smooth } from './noise';

// ---------------------------------------------------------------- small LRU
class Lru<V> {
  private m = new Map<string, V>();
  constructor(private max: number) {}
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) { this.m.delete(k); this.m.set(k, v); }
    return v;
  }
  set(k: string, v: V) {
    this.m.set(k, v);
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
}

// ---------------------------------------------------------------- pattern textures
const texCache = new Lru<HTMLCanvasElement>(90);
/** Window of the full texture that maps onto a model box: TW texture-px wide. */
const WINDOW = 0.62;

export function patternTexture(skin: SkinDef, S: number): HTMLCanvasElement {
  const key = skin.id + '|' + S;
  let t = texCache.get(key);
  if (!t) {
    t = paintPattern(skin.pattern, S, hashStr(skin.id) % 100000);
    texCache.set(key, t);
  }
  return t;
}

/** Seed -> window inside the texture (fractions 0..1 of S). Deterministic. */
export function seedWindow(seed: number, aspect: number): { x: number; y: number; w: number; h: number; flip: boolean } {
  const r = rng(seed * 2654435761 + 11);
  const w = WINDOW, h = WINDOW * aspect;
  return { x: r() * (1 - w), y: r() * (1 - h), w, h, flip: false };
}

function modelOf(skin: SkinDef): WeaponModel {
  const w = weaponById(skin.weapon);
  return buildModel(skin.weapon, w?.kind);
}

// ---------------------------------------------------------------- wear noise
/** Per seed: two noise grids over model space (256 cells), fine chips + big blotches. */
const wearNoiseCache = new Lru<{ fine: Float32Array; big: Float32Array }>(64);
const WN = 256;
function wearNoise(seed: number) {
  const k = String(seed);
  let w = wearNoiseCache.get(k);
  if (w) return w;
  const n = new Noise(seed * 31 + 7), n2 = new Noise(seed * 17 + 101);
  const fine = new Float32Array(WN * WN), big = new Float32Array(WN * WN);
  for (let y = 0; y < WN; y++) {
    for (let x = 0; x < WN; x++) {
      fine[y * WN + x] = n.fbm(x / 7, y / 7, 4);
      big[y * WN + x] = n2.fbm(x / 34, y / 34, 4) * 0.8 + n.v(x / 5 + 50, y / 5) * 0.2;
    }
  }
  w = { fine, big };
  wearNoiseCache.set(k, w);
  return w;
}
/** Bilinear lookup, x/y in grid cells (wraps). */
function sample(g: Float32Array, x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = xi & 255, y0 = yi & 255, x1 = (x0 + 1) & 255, y1 = (y0 + 1) & 255;
  const a = g[y0 * WN + x0], b = g[y0 * WN + x1], c = g[y1 * WN + x0], d = g[y1 * WN + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * Paint-loss alpha 0..1 at a point.
 * edge: 0..1 proximity to a part edge; scratch 0..1; fine/big noise 0..1; f = float.
 */
function lossAt(f: number, edge: number, scratch: number, fine: number, big: number): number {
  if (f < 0.02) return 0;
  // edge chips: grow with float, jagged by fine noise
  const thrE = 1.02 - f * 1.55;
  const e = smooth(thrE, thrE + 0.12, edge * (0.45 + fine * 0.9));
  // interior blotches for battle-scarred
  const thrB = 1.0 - Math.max(0, f - 0.2) * 0.9;
  const b = smooth(thrB, thrB + 0.05, big * 0.75 + fine * 0.3);
  const s = scratch * smooth(0.08, 0.3, f) * (0.6 + fine * 0.6);
  return clamp(Math.max(e, b, s));
}

// ---------------------------------------------------------------- materials
function materialStyle(ctx: CanvasRenderingContext2D, mat: WeaponPart['material'], y0: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  switch (mat) {
    case 'metal':
      g.addColorStop(0, '#a7adb5'); g.addColorStop(0.35, '#6b7179'); g.addColorStop(0.55, '#4b5058'); g.addColorStop(1, '#2a2e33'); break;
    case 'dark':
      g.addColorStop(0, '#4a4e55'); g.addColorStop(0.5, '#2a2d31'); g.addColorStop(1, '#16181b'); break;
    case 'rubber':
      g.addColorStop(0, '#3a3b3e'); g.addColorStop(0.5, '#232426'); g.addColorStop(1, '#121213'); break;
    case 'wood':
      g.addColorStop(0, '#a26a3b'); g.addColorStop(0.5, '#7a4824'); g.addColorStop(1, '#4b2a12'); break;
    default:
      g.addColorStop(0, '#777'); g.addColorStop(1, '#444');
  }
  return g;
}

interface PathInfo { path: Path2D; bx: number; by: number; bw: number; bh: number }

function partPath(p: WeaponPart, m: number, ox: number, oy: number): PathInfo {
  const path = new Path2D();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  p.rings.forEach((ring, ri) => {
    ring.forEach(([x, y], i) => {
      const X = ox + x * m, Y = oy + y * m;
      if (i === 0) path.moveTo(X, Y); else path.lineTo(X, Y);
      if (ri === 0) { if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
    });
    path.closePath();
  });
  return { path, bx: x0, by: y0, bw: x1 - x0, bh: y1 - y0 };
}

// ---------------------------------------------------------------- wear on one part
let scratchCanvas: HTMLCanvasElement | null = null;
function scratchCtx(w: number, h: number): CanvasRenderingContext2D {
  if (!scratchCanvas) scratchCanvas = document.createElement('canvas');
  if (scratchCanvas.width < w || scratchCanvas.height < h) {
    scratchCanvas.width = Math.max(scratchCanvas.width, w);
    scratchCanvas.height = Math.max(scratchCanvas.height, h);
  }
  const c = scratchCanvas.getContext('2d', { willReadFrequently: true })!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w, h);
  return c;
}

function applyWear(
  ctx: CanvasRenderingContext2D, pi: PathInfo, partIdx: number, f: number, seed: number, m: number, ox: number, oy: number,
) {
  if (f < 0.03) return;
  const X = Math.max(0, Math.floor(pi.bx) - 2), Y = Math.max(0, Math.floor(pi.by) - 2);
  const W = Math.min(ctx.canvas.width - X, Math.ceil(pi.bw) + 4), H = Math.min(ctx.canvas.height - Y, Math.ceil(pi.bh) + 4);
  if (W <= 0 || H <= 0) return;
  const c = scratchCtx(W, H);
  c.translate(-X, -Y);
  c.save();
  c.clip(pi.path, 'evenodd');
  // edge proximity in red: concentric strokes (edges wear first)
  c.globalCompositeOperation = 'lighter';
  c.lineJoin = 'round';
  const band = (3 + f * 16) * m;
  for (let k = 1; k <= 4; k++) {
    c.strokeStyle = 'rgba(64,0,0,1)';
    c.lineWidth = (band * 2 * k) / 4;
    c.stroke(pi.path);
  }
  // scratches in green
  const r = rng(seed * 13 + partIdx * 101);
  const ns = Math.round(f * 60 * (pi.bw * pi.bh) / (m * m * 6000));
  c.strokeStyle = 'rgba(0,255,0,1)';
  c.lineCap = 'round';
  for (let i = 0; i < Math.min(ns, 80); i++) {
    const x = pi.bx + r() * pi.bw, y = pi.by + r() * pi.bh;
    const a = (r() - 0.5) * 0.9 + (r() < 0.3 ? Math.PI / 2 : 0), L = (6 + r() * 30) * m;
    c.lineWidth = (0.35 + r() * 0.7) * m;
    c.beginPath(); c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + (r() - 0.5) * 4 * m, y + Math.sin(a) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L);
    c.stroke();
  }
  // mask inside the part only
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = '#fff';
  c.fill(pi.path, 'evenodd');
  c.restore();

  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  const { fine, big } = wearNoise(seed);
  const inv = 1 / m;
  const grime = f > 0.12 ? Math.min(0.32, (f - 0.12) * 0.55) : 0;
  for (let y = 0, i = 0; y < H; y++) {
    const my = ((Y + y) - oy) * inv * 0.5;
    for (let x = 0; x < W; x++, i += 4) {
      const a0 = d[i + 3];
      if (a0 === 0) continue;
      const mx = ((X + x) - ox) * inv * 0.5;
      const fn = sample(fine, mx, my), bg = sample(big, mx * 0.5 + 40, my * 0.5 + 40);
      const loss = lossAt(f, d[i] / 255, d[i + 1] / 255, fn, bg);
      const gA = grime * smooth(0.45, 0.8, bg) * (a0 / 255);
      if (loss > 0.01) {
        const v = 150 + fn * 70;
        d[i] = v; d[i + 1] = v + 3; d[i + 2] = v + 8;
        d[i + 3] = Math.max(loss, gA) * a0;
      } else if (gA > 0.01) {
        d[i] = 46; d[i + 1] = 38; d[i + 2] = 28;
        d[i + 3] = gA * 255;
      } else d[i + 3] = 0;
    }
  }
  c.putImageData(img, 0, 0);
  ctx.drawImage(c.canvas, 0, 0, W, H, X, Y, W, H);
}

// ---------------------------------------------------------------- drawing the whole weapon
export function drawWeapon(
  ctx: CanvasRenderingContext2D, skin: SkinDef | null, model: WeaponModel, f: number, seed: number,
  W: number, H: number, pad = 0.06,
) {
  const [bw, bh] = model.box;
  const m = Math.min((W * (1 - pad * 2)) / bw, (H * (1 - pad * 2)) / bh);
  const ox = (W - bw * m) / 2, oy = (H - bh * m) / 2;
  const px = Math.max(0.5, m * 0.9); // ~1 model unit in device px, min half a pixel

  let tex: HTMLCanvasElement | null = null;
  let win = { x: 0, y: 0, w: 1, h: 1, flip: false };
  if (skin) {
    const S = bw * m > 700 ? 1024 : 512;
    tex = patternTexture(skin, S);
    win = seedWindow(seed, bh / bw);
  }

  model.parts.forEach((p, idx) => {
    const pi = partPath(p, m, ox, oy);
    // base fill with soft contact shadow onto what is already drawn (ambient occlusion)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 3.5 * px;
    ctx.shadowOffsetY = 1.2 * px;
    ctx.fillStyle = p.material === 'skin' ? '#555' : materialStyle(ctx, p.material, pi.by, pi.by + pi.bh);
    ctx.fill(pi.path, 'evenodd');
    ctx.restore();

    ctx.save();
    ctx.clip(pi.path, 'evenodd');
    if (p.material === 'skin' && tex) {
      const S = tex.width;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tex, win.x * S, win.y * S, win.w * S, win.h * S, ox, oy, bw * m, bh * m);
      ctx.restore();
      applyWear(ctx, pi, idx, f, seed, m, ox, oy);
      ctx.save();
      ctx.clip(pi.path, 'evenodd');
    } else if (p.material === 'skin') {
      ctx.fillStyle = materialStyle(ctx, 'dark', pi.by, pi.by + pi.bh);
      ctx.fill(pi.path);
    }
    if (p.material === 'wood') woodGrain(ctx, pi, m);

    // top light / bottom shade across the part
    const lg = ctx.createLinearGradient(0, pi.by, 0, pi.by + pi.bh);
    const sk = p.material === 'skin';
    lg.addColorStop(0, `rgba(255,255,255,${sk ? 0.2 : 0.16})`);
    lg.addColorStop(0.42, 'rgba(255,255,255,0)');
    lg.addColorStop(0.7, 'rgba(0,0,0,0.06)');
    lg.addColorStop(1, `rgba(0,0,0,${sk ? 0.34 : 0.3})`);
    ctx.fillStyle = lg;
    ctx.fillRect(pi.bx - 1, pi.by - 1, pi.bw + 2, pi.bh + 2);

    // specular glint
    if (p.material === 'metal' || sk) {
      const gy = pi.by + pi.bh * (sk ? 0.2 : 0.28);
      const gg = ctx.createLinearGradient(pi.bx, 0, pi.bx + pi.bw, 0);
      const a = sk ? 0.14 : 0.45;
      gg.addColorStop(0, 'rgba(255,255,255,0)');
      gg.addColorStop(0.3, `rgba(255,255,255,${a})`);
      gg.addColorStop(0.65, `rgba(255,255,255,${a * 0.4})`);
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(pi.bx, gy, pi.bw, Math.max(px * 0.9, Math.min(pi.bh * 0.08, 2.2 * px)));
    }

    // inner bevel: highlight on top edges, shade on bottom edges
    ctx.lineJoin = 'round';
    ctx.translate(0, 1.1 * px);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 1.5 * px;
    ctx.stroke(pi.path);
    ctx.translate(0, -2.2 * px);
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.stroke(pi.path);
    ctx.restore();

    // crisp outline
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(8,9,12,0.7)';
    ctx.lineWidth = Math.max(0.6, 0.75 * px);
    ctx.stroke(pi.path);
    ctx.restore();
  });
}

function woodGrain(ctx: CanvasRenderingContext2D, pi: PathInfo, m: number) {
  const r = rng(Math.round(pi.bx * 7 + pi.by));
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = '#3a1c08';
  for (let i = 0; i < 14; i++) {
    const y = pi.by + r() * pi.bh;
    ctx.lineWidth = (0.4 + r()) * m;
    ctx.beginPath();
    ctx.moveTo(pi.bx, y);
    ctx.bezierCurveTo(pi.bx + pi.bw * 0.3, y + (r() - 0.5) * 8 * m, pi.bx + pi.bw * 0.7, y + (r() - 0.5) * 8 * m, pi.bx + pi.bw, y + (r() - 0.5) * 4 * m);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- public renderers
const renderCache = new Lru<HTMLCanvasElement>(400);

function dpr(): number {
  return Math.min(3, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
}

function copyCanvas(src: HTMLCanvasElement, cssW: number, cssH: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  c.style.width = cssW + 'px';
  c.style.height = cssH + 'px';
  return c;
}

export function renderSkinImpl(o: RenderOpts): HTMLCanvasElement {
  const d = dpr();
  const fb = Math.round(clamp(o.float) * 100);
  const key = `${o.skin}|${fb}|${o.seed}|${o.width}x${o.height}|${d}|${o.statTrak ? 1 : 0}`;
  const hit = renderCache.get(key);
  if (hit) return copyCanvas(hit, o.width, o.height);

  const skin = skinById(o.skin) ?? null;
  const model = skin ? modelOf(skin) : buildModel('ar7');
  const outW = Math.max(1, Math.round(o.width * d)), outH = Math.max(1, Math.round(o.height * d));
  // supersample small/1x renders for smoother pattern edges; cap the work for big ones
  const ss = d < 2 && outW * outH < 900 * 600 ? 2 : 1;
  const W = outW * ss, H = outH * ss;
  const big = document.createElement('canvas');
  big.width = W; big.height = H;
  const bctx = big.getContext('2d')!;
  drawWeapon(bctx, skin, model, fb / 100, o.seed, W, H);

  let out = big;
  if (ss > 1) {
    out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    const c = out.getContext('2d')!;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(big, 0, 0, outW, outH);
  }
  renderCache.set(key, out);
  return copyCanvas(out, o.width, o.height);
}

/** Wear alpha for a flat square texture (no part edges: noise + scratches only). */
function textureWear(f: number, seed: number, size: number): Float32Array {
  const { fine, big } = wearNoise(seed);
  const out = new Float32Array(size * size);
  if (f < 0.03) return out;
  // scratches rasterised on a small canvas
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  const r = rng(seed * 13 + 5);
  cx.strokeStyle = '#0f0';
  cx.lineCap = 'round';
  const ns = Math.round(f * 90);
  for (let i = 0; i < ns; i++) {
    const x = r() * size, y = r() * size, a = (r() - 0.5) * 0.9, L = (0.02 + r() * 0.08) * size;
    cx.lineWidth = Math.max(0.6, (0.4 + r() * 0.8) * size / 512);
    cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); cx.stroke();
  }
  const sd = cx.getImageData(0, 0, size, size).data;
  const k = 256 / size;
  for (let y = 0, i = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++) {
      const mx = x * k, my = y * k * 0.4;
      const fn = sample(fine, mx, my), bg = sample(big, mx * 0.5 + 40, my * 0.5 + 40);
      // no geometric edges in texture space: treat the high fine-noise peaks as "edges"
      out[i] = lossAt(f, smooth(0.55, 0.85, fn) * 0.85, sd[i * 4 + 1] / 255, fn, bg);
    }
  }
  return out;
}

const texOutCache = new Lru<HTMLCanvasElement>(24);

export function renderSkinTextureImpl(skinId: string, float: number, seed: number, size: number): HTMLCanvasElement {
  const fb = Math.round(clamp(float) * 100);
  const key = `${skinId}|${fb}|${seed}|${size}`;
  const hit = texOutCache.get(key);
  if (hit) return copyCanvas(hit, size, size);
  const skin = skinById(skinId);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  if (!skin) { ctx.fillStyle = '#555'; ctx.fillRect(0, 0, size, size); return c; }
  const model = modelOf(skin);
  const tex = patternTexture(skin, size > 600 ? 1024 : 512);
  const win = seedWindow(seed, model.box[1] / model.box[0]);
  const S = tex.width;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tex, win.x * S, win.y * S, win.w * S, win.h * S, 0, 0, size, size);
  const wear = textureWear(fb / 100, seed, size);
  if (fb >= 3) {
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    const grime = fb > 12 ? Math.min(0.3, (fb / 100 - 0.12) * 0.5) : 0;
    for (let i = 0; i < wear.length; i++) {
      const a = wear[i], j = i * 4;
      if (grime) { d[j] *= 1 - grime * 0.5; d[j + 1] *= 1 - grime * 0.55; d[j + 2] *= 1 - grime * 0.6; }
      if (a > 0) {
        const v = 160;
        d[j] += (v - d[j]) * a; d[j + 1] += (v + 3 - d[j + 1]) * a; d[j + 2] += (v + 8 - d[j + 2]) * a;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  texOutCache.set(key, c);
  return copyCanvas(c, size, size);
}

export function renderWearMaskImpl(skinId: string, float: number, seed: number, size: number): HTMLCanvasElement {
  void skinId;
  const fb = Math.round(clamp(float) * 100);
  const wear = textureWear(fb / 100, seed, size);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < wear.length; i++) {
    const v = wear[i] * 255, j = i * 4;
    img.data[j] = img.data[j + 1] = img.data[j + 2] = v; img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

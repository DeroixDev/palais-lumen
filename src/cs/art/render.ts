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
import { patternInfo, type ArtVariant } from '../data/specials';
import { Noise, rng, hashStr, clamp, smooth } from './noise';
import { mkCanvas, dpr, cssSize } from './canvas';

// ---------------------------------------------------------------- small LRU
class Lru<V> {
  private m = new Map<string, V>();
  constructor(public max: number) {}
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
// 512px textures are 1 MB each: keep the cache bounded (worker pools split skins between workers)
const texCache = new Lru<HTMLCanvasElement>(96);
/** Window of the full texture that maps onto a model box: TW texture-px wide. */
const WINDOW = 0.62;

export function patternTexture(skin: SkinDef, S: number, v: ArtVariant | null = null, model?: WeaponModel): HTMLCanvasElement {
  const motif = (v?.win === 'motif' || v?.win === 'paint') && model ? motifParams(model, v.win) : null;
  const key = skin.id + '|' + S + (v?.key ? '|' + v.key : '');
  let t = texCache.get(key);
  if (!t) {
    const recipe = v?.key ? { kind: skin.pattern.kind, colors: v.colors ?? skin.pattern.colors, params: { ...skin.pattern.params, ...v.params, ...motif } } : skin.pattern;
    t = paintPattern(recipe, S, hashStr(skin.id) % 100000);
    texCache.set(key, t);
  }
  return t;
}

/**
 * Where specials go, as fractions of the model box. 'motif': the biggest painted part, preferring
 * central ones (receiver over stock). 'paint': the bounding box of everything painted.
 */
type Rect = { cx: number; cy: number; w: number; h: number };
const motifCache = new Map<string, Rect>();
export function motifPart(model: WeaponModel, mode: 'motif' | 'paint' = 'motif'): Rect {
  const ck = mode + '|' + model.box.join('x') + '|' + model.parts.length + '|' + (model.parts[0]?.rings[0]?.[0]?.join(',') ?? '');
  let m = motifCache.get(ck);
  if (m) return m;
  const [bw, bh] = model.box;
  let best: Rect = { cx: 0.5, cy: 0.5, w: 0.4, h: 0.3 }, score = 0;
  let ux0 = 1e9, uy0 = 1e9, ux1 = -1e9, uy1 = -1e9;
  for (const p of model.parts) {
    if (p.material !== 'skin' || !p.rings[0]?.length) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of p.rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    ux0 = Math.min(ux0, x0); uy0 = Math.min(uy0, y0); ux1 = Math.max(ux1, x1); uy1 = Math.max(uy1, y1);
    const cx = (x0 + x1) / 2 / bw;
    // the part that fits the biggest motif, preferring central parts
    const sc = Math.min(x1 - x0, (y1 - y0) * 1.5) * (1 - Math.abs(cx - 0.5));
    if (sc > score) { score = sc; best = { cx, cy: (y0 + y1) / 2 / bh, w: (x1 - x0) / bw, h: (y1 - y0) / bh }; }
  }
  m = mode === 'paint' && ux1 > ux0 ? { cx: (ux0 + ux1) / 2 / bw, cy: (uy0 + uy1) / 2 / bh, w: (ux1 - ux0) / bw, h: (uy1 - uy0) / bh } : best;
  motifCache.set(ck, m);
  return m;
}
/** Motif sizes in texture units (1000 = texture): biggest part (mw, mh) and window (ww, wh). */
function motifParams(model: WeaponModel, mode: 'motif' | 'paint') {
  const mp = motifPart(model, mode);
  const w = WINDOW, h = Math.min(0.98, WINDOW * (model.box[1] / model.box[0]));
  return { mw: Math.round(mp.w * w * 1000), mh: Math.round(mp.h * h * 1000), ww: Math.round(w * 1000), wh: Math.round(h * 1000) };
}

/** The window of this item: seed placement, or the special's placement (motif centred, fade %). */
export function itemWindow(skin: SkinDef, seed: number, model: WeaponModel, v: ArtVariant | null) {
  const aspect = model.box[1] / model.box[0];
  const win = v?.win;
  if (win === 'motif' || win === 'paint') {
    const mp = motifPart(model, win);
    const w = WINDOW, h = Math.min(0.98, WINDOW * aspect);
    const x = Math.max(0, Math.min(1 - w, 0.5 - mp.cx * w)), y = Math.max(0, Math.min(1 - h, 0.5 - mp.cy * h));
    return { x, y, w, h, flip: false };
  }
  if (win && typeof win === 'object') {
    // the painted area shows texture x range span[0]..span[1] (may reach outside the texture over
    // unpainted parts such as a knife handle; drawImage clips the source rect)
    const mp = motifPart(model, 'paint');
    const px0 = mp.cx - mp.w / 2;
    const w = (win.span[1] - win.span[0]) / Math.max(0.05, mp.w);
    const h = Math.min(0.98, w * aspect);
    return { x: win.span[0] - px0 * w, y: (1 - h) / 2, w, h, flip: false };
  }
  const sw = seedWindow(seed, aspect, skin.pattern.kind);
  if (skin.pattern.kind !== 'casehardened') return sw;
  // Ordinary case-hardened seeds must not look like a blue gem: if the seed's window would put a
  // mostly blue patch on the main part, the next candidate windows of the same seed are tried.
  // Judged on the 256 px texture only, so every render size picks the same window.
  const grid = blueGrid(skin);
  const mp = motifPart(model, 'paint');
  const share = (wn: { x: number; y: number; w: number; h: number }) => {
    let b = 0, n = 0;
    const x0 = wn.x + (mp.cx - mp.w / 2) * wn.w, x1 = wn.x + (mp.cx + mp.w / 2) * wn.w;
    const y0 = wn.y + (mp.cy - mp.h / 2) * wn.h, y1 = wn.y + (mp.cy + mp.h / 2) * wn.h;
    for (let gy = Math.floor(y0 * BG); gy < Math.ceil(y1 * BG); gy++) for (let gx = Math.floor(x0 * BG); gx < Math.ceil(x1 * BG); gx++) { n++; b += grid[gy * BG + gx] ?? 0; }
    return n ? b / n : 0;
  };
  let best = sw, bs = share(sw);
  for (let k = 1; k < 24 && bs > 0.35; k++) {
    const c = seedWindow(seed + k * 1000, aspect, skin.pattern.kind);
    const v = share(c);
    if (v < bs) { best = c; bs = v; }
  }
  return best;
}
const BG = 64;
const blueCache = new Map<string, Uint8Array>();
/** 64x64 grid of the skin's base texture: 1 where the paint is clearly blue. */
function blueGrid(skin: SkinDef): Uint8Array {
  let g = blueCache.get(skin.id);
  if (g) return g;
  const c = mkCanvas(BG, BG);
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.imageSmoothingEnabled = true;
  cx.drawImage(patternTexture(skin, 256), 0, 0, BG, BG);
  const d = cx.getImageData(0, 0, BG, BG).data;
  g = new Uint8Array(BG * BG);
  for (let i = 0; i < g.length; i++) g[i] = d[i * 4 + 2] > d[i * 4] + 25 && d[i * 4 + 2] > d[i * 4 + 1] ? 1 : 0;
  blueCache.set(skin.id, g);
  return g;
}

/** Seed -> window inside the texture (fractions 0..1 of S). Deterministic. */
export function seedWindow(seed: number, aspect: number, kind = ''): { x: number; y: number; w: number; h: number; flip: boolean } {
  const r = rng(seed * 2654435761 + 11);
  const w = WINDOW, h = Math.min(0.98, WINDOW * aspect);
  const x = r() * (1 - w);
  // hero patterns (one big motif along the middle) only jitter a little vertically
  const y = CENTERED.has(kind) ? (1 - h) / 2 + (r() - 0.5) * Math.min(0.12, 1 - h) : r() * (1 - h);
  return { x, y, w, h, flip: false };
}
const CENTERED = new Set(['dragon']);

function modelOf(skin: SkinDef): WeaponModel {
  const w = weaponById(skin.weapon);
  return buildModel(skin.weapon, w?.kind);
}

// ---------------------------------------------------------------- wear noise
/**
 * Two shared noise grids over model space (fine chips 512 cells, big blotches 256 cells, 2 model
 * units per cell). The seed only picks an offset into them, so a new seed costs nothing.
 */
const FN = 512, BN = 256;
let grids: { fine: Float32Array; big: Float32Array } | null = null;
function wearNoise(seed: number) {
  if (!grids) {
    const n = new Noise(9173), n2 = new Noise(5521);
    const fine = new Float32Array(FN * FN), big = new Float32Array(BN * BN);
    for (let y = 0; y < FN; y++) for (let x = 0; x < FN; x++) fine[y * FN + x] = n.fbm(x / 7, y / 7, 4);
    for (let y = 0; y < BN; y++) for (let x = 0; x < BN; x++) big[y * BN + x] = n2.fbm(x / 17, y / 17, 4) * 0.8 + n.v(x / 2.5 + 50, y / 2.5) * 0.2;
    grids = { fine, big };
  }
  const r = rng(seed * 7919 + 13);
  return { fine: grids.fine, big: grids.big, fx: Math.floor(r() * 180), fy: Math.floor(r() * 180), bx: Math.floor(r() * 90), by: Math.floor(r() * 90) };
}
/** Bilinear lookup, x/y in grid cells (wraps). */
function sample(g: Float32Array, N: number, x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const M = N - 1;
  const x0 = xi & M, y0 = yi & M, x1 = (x0 + 1) & M, y1 = (y0 + 1) & M;
  const a = g[y0 * N + x0], b = g[y0 * N + x1], c = g[y1 * N + x0], d = g[y1 * N + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * Paint-loss alpha 0..1 at a point.
 * edge: 0..1 proximity to a part edge; scratch 0..1; fine/big noise 0..1; f = float.
 */
function lossAt(f: number, edge: number, scratch: number, fine: number, big: number): number {
  if (f < 0.02) return 0;
  // edge chips: grow with float, jagged by fine noise
  let e = 0;
  if (edge > 0) {
    const thrE = 1.08 - Math.min(f, 0.5) * 1.25;
    e = smooth(thrE, thrE + 0.07, edge * 0.5 + fine * 0.8 - 0.14);
  }
  // interior blotches for well-worn / battle-scarred
  const thrB = 1.0 - Math.max(0, f - 0.3) * 0.8;
  const b = smooth(thrB, thrB + 0.04, big * 0.78 + fine * 0.3);
  const s = scratch * smooth(0.1, 0.45, f) * (0.35 + fine * 0.4);
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
  if (!scratchCanvas) scratchCanvas = mkCanvas(1, 1);
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
  ctx: CanvasRenderingContext2D, pi: PathInfo, partIdx: number, f: number, seed: number, m: number, ox: number, oy: number, ws: number,
) {
  if (f < 0.03) return;
  const X = Math.max(0, Math.floor(pi.bx) - 2), Y = Math.max(0, Math.floor(pi.by) - 2);
  const W = Math.min(ctx.canvas.width - X, Math.ceil(pi.bw) + 4), H = Math.min(ctx.canvas.height - Y, Math.ceil(pi.bh) + 4);
  if (W <= 0 || H <= 0) return;
  // the mask is computed at `ws` resolution (supersampled renders don't need it at full res)
  const w = Math.max(1, Math.ceil(W * ws)), h = Math.max(1, Math.ceil(H * ws));
  const c = scratchCtx(w, h);
  c.setTransform(ws, 0, 0, ws, -X * ws, -Y * ws);
  c.save();
  c.clip(pi.path, 'evenodd');
  // edge proximity in red: concentric strokes (edges wear first)
  c.globalCompositeOperation = 'lighter';
  c.lineJoin = 'round';
  const band = (2 + Math.min(f, 0.5) * 10) * m;
  c.strokeStyle = 'rgba(64,0,0,1)';
  for (let k = 1; k <= 4; k++) {
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
    c.lineWidth = Math.max(0.8 / ws, (0.35 + r() * 0.7) * m);
    c.beginPath(); c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + (r() - 0.5) * 4 * m, y + Math.sin(a) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L);
    c.stroke();
  }
  // mask inside the part only
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = '#fff';
  c.fill(pi.path, 'evenodd');
  c.restore();

  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const { fine, big, fx: nfx, fy: nfy, bx: nbx, by: nby } = wearNoise(seed);
  const inv = 1 / (m * ws);
  const grime = f > 0.12 ? Math.min(0.32, (f - 0.12) * 0.55) : 0;
  const needBig = f > 0.3 || grime > 0;
  const oxs = ox * ws, oys = oy * ws, Xs = X * ws, Ys = Y * ws;
  for (let y = 0, i = 0; y < h; y++) {
    const my = (Ys + y - oys) * inv * 0.5;
    for (let x = 0; x < w; x++, i += 4) {
      const a0 = d[i + 3];
      if (a0 === 0) continue;
      const er = d[i], sg = d[i + 1];
      if (er === 0 && sg === 0 && !needBig) { d[i + 3] = 0; continue; }
      const mx = (Xs + x - oxs) * inv * 0.5;
      const fn = sample(fine, FN, mx + nfx, my + nfy);
      const bg = needBig ? sample(big, BN, mx * 0.5 + nbx, my * 0.5 + nby) : 0;
      const loss = lossAt(f, er / 255, sg / 255, fn, bg);
      const gA = grime ? grime * smooth(0.45, 0.8, bg) * (a0 / 255) : 0;
      if (loss > 0.01) {
        const v = 128 + fn * 60;
        d[i] = v; d[i + 1] = v + 3; d[i + 2] = v + 7;
        d[i + 3] = Math.max(loss, gA) * a0;
      } else if (gA > 0.01) {
        d[i] = 46; d[i + 1] = 38; d[i + 2] = 28;
        d[i + 3] = gA * 255;
      } else d[i + 3] = 0;
    }
  }
  c.putImageData(img, 0, 0);
  ctx.save();
  ctx.clip(pi.path, 'evenodd');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c.canvas, 0, 0, w, h, X, Y, w / ws, h / ws);
  ctx.restore();
}

// ---------------------------------------------------------------- drawing the whole weapon
export function drawWeapon(
  ctx: CanvasRenderingContext2D, skin: SkinDef | null, model: WeaponModel, f: number, seed: number,
  W: number, H: number, pad = 0.06, wearScale = 1,
) {
  const [bw, bh] = model.box;
  const m = Math.min((W * (1 - pad * 2)) / bw, (H * (1 - pad * 2)) / bh);
  const ox = (W - bw * m) / 2, oy = (H - bh * m) / 2;
  const px = Math.max(0.5, m * 0.9); // ~1 model unit in device px, min half a pixel

  let tex: HTMLCanvasElement | null = null;
  let win = { x: 0, y: 0, w: 1, h: 1, flip: false };
  if (skin) {
    // texture tier by the final on-screen width of the model box
    const tw = bw * m * wearScale;
    const S = tw > 640 ? 1024 : tw > 300 ? 512 : 256;
    const v = patternInfo(skin, seed).art;
    tex = patternTexture(skin, S, v, model);
    win = itemWindow(skin, seed, model, v);
  }
  // the seed window of the texture, resampled once to device pixels over the model box
  let skinFill: CanvasPattern | null = null;
  if (tex) {
    const LW = Math.max(1, Math.ceil(bw * m)), LH = Math.max(1, Math.ceil(bh * m));
    const layer = mkCanvas(LW, LH);
    const lc = layer.getContext('2d')!;
    lc.imageSmoothingEnabled = true;
    lc.imageSmoothingQuality = 'medium';
    const S = tex.width;
    lc.drawImage(tex, win.x * S, win.y * S, win.w * S, win.h * S, 0, 0, LW, LH);
    skinFill = ctx.createPattern(layer, 'no-repeat');
    skinFill?.setTransform(new DOMMatrix().translate(ox, oy));
  }

  model.parts.forEach((p, idx) => {
    const pi = partPath(p, m, ox, oy);
    // base fill with soft contact shadow onto what is already drawn (ambient occlusion)
    // (cheap: stacked translucent strokes instead of a blur; parts below get darkened near this one)
    if (idx > 0) {
      ctx.save();
      ctx.translate(0, 0.9 * px);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      for (const lw of [5, 3.2, 1.8]) { ctx.lineWidth = lw * px; ctx.stroke(pi.path); }
      ctx.restore();
    }
    ctx.fillStyle = p.material === 'skin' ? '#555' : materialStyle(ctx, p.material, pi.by, pi.by + pi.bh);
    ctx.fill(pi.path, 'evenodd');

    ctx.save();
    ctx.clip(pi.path, 'evenodd');
    if (p.material === 'skin' && skinFill) {
      ctx.fillStyle = skinFill;
      ctx.fill(pi.path, 'evenodd');
      ctx.restore();
      applyWear(ctx, pi, idx, f, seed, m, ox, oy, wearScale);
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
/** Inside a worker the page caches the encoded results, so the worker keeps few canvases. */
export function setRenderCacheSize(n: number) { renderCache.max = n; }

function copyCanvas(src: HTMLCanvasElement, cssW: number, cssH: number): HTMLCanvasElement {
  const c = mkCanvas(src.width, src.height);
  c.getContext('2d')!.drawImage(src, 0, 0);
  cssSize(c, cssW, cssH);
  return c;
}

/** Cache key of a 2D render (float in 0.01 buckets, like the renderer itself). */
export function skinKey(o: RenderOpts, d = dpr()): string {
  const fb = Math.round(clamp(o.float) * 100);
  return `${o.skin}|${fb}|${o.seed}|${o.width}x${o.height}|${d}|${o.statTrak ? 1 : 0}`;
}

export function renderSkinImpl(o: RenderOpts): HTMLCanvasElement {
  return copyCanvas(renderSkinShared(o), o.width, o.height);
}

/** The cached render itself (callers must not draw into it). */
export function renderSkinShared(o: RenderOpts): HTMLCanvasElement {
  const d = dpr();
  const fb = Math.round(clamp(o.float) * 100);
  const key = skinKey(o, d);
  const hit = renderCache.get(key);
  if (hit) return hit;

  const skin = skinById(o.skin) ?? null;
  const model = skin ? modelOf(skin) : buildModel('ar7');
  const outW = Math.max(1, Math.round(o.width * d)), outH = Math.max(1, Math.round(o.height * d));
  // supersample small/1x renders for smoother pattern edges; cap the work for big ones
  const ss = d < 2 && outW * outH < 900 * 600 ? 2 : 1;
  const W = outW * ss, H = outH * ss;
  const big = mkCanvas(W, H);
  const bctx = big.getContext('2d')!;
  drawWeapon(bctx, skin, model, fb / 100, o.seed, W, H, 0.06, 1 / ss);

  // downscale (anti-aliasing) with a soft cast shadow under the whole weapon
  const out = mkCanvas(outW, outH);
  const c = out.getContext('2d')!;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  const sh = Math.max(1, Math.min(outW, outH) / 60);
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = sh * 2.2;
  c.shadowOffsetY = sh * 1.3;
  c.drawImage(big, 0, 0, outW, outH);
  renderCache.set(key, out);
  return out;
}

/** Wear alpha for a flat square texture (no part edges: noise + scratches only). */
function textureWear(f: number, seed: number, size: number): Float32Array {
  const { fine, big, fx: nfx, fy: nfy, bx: nbx, by: nby } = wearNoise(seed);
  const out = new Float32Array(size * size);
  if (f < 0.03) return out;
  // scratches rasterised on a small canvas
  const c = mkCanvas(size, size);
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
      const fn = sample(fine, FN, mx + nfx, my + nfy), bg = sample(big, BN, mx * 0.5 + nbx, my * 0.5 + nby);
      // no geometric edges in texture space: treat the high fine-noise peaks as "edges"
      out[i] = lossAt(f, smooth(0.62, 0.9, fn) * 0.7, sd[i * 4 + 1] / 255, fn, bg);
    }
  }
  return out;
}

const texOutCache = new Lru<HTMLCanvasElement>(24);

/**
 * Pre-generate pattern textures in idle time (e.g. all skins of a case before the reel spins).
 * Resolves when done. Cheap to call repeatedly: cached textures are skipped.
 */
export function warmSkinsImpl(ids: string[], sizes: number[] = [dpr() >= 1.5 ? 512 : 256]): Promise<void> {
  const jobs: [SkinDef, number][] = [];
  for (const id of ids) {
    const s = skinById(id);
    if (!s) continue;
    for (const S of sizes) if (!texCache.get(s.id + '|' + S)) jobs.push([s, S]);
  }
  return new Promise((resolve) => {
    const idle: (cb: () => void) => void = (cb) =>
      typeof (window as any).requestIdleCallback === 'function' ? (window as any).requestIdleCallback(cb, { timeout: 200 }) : setTimeout(cb, 16);
    const step = () => {
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 12) {
        const [s, S] = jobs.shift()!;
        patternTexture(s, S);
      }
      if (jobs.length) idle(step); else resolve();
    };
    idle(step);
  });
}

/** Synchronously paints the pattern textures a 2D render of these skins will need. */
export function warmTextures(ids: string[], sizes: number[] = [dpr() >= 1.5 ? 512 : 256]) {
  for (const id of ids) {
    const s = skinById(id);
    if (s) for (const S of sizes) patternTexture(s, S);
  }
}

export function renderSkinTextureImpl(skinId: string, float: number, seed: number, size: number): HTMLCanvasElement {
  const fb = Math.round(clamp(float) * 100);
  const key = `${skinId}|${fb}|${seed}|${size}`;
  const hit = texOutCache.get(key);
  if (hit) return copyCanvas(hit, size, size);
  const skin = skinById(skinId);
  const c = mkCanvas(size, size);
  const ctx = c.getContext('2d')!;
  if (!skin) { ctx.fillStyle = '#555'; ctx.fillRect(0, 0, size, size); return c; }
  const model = modelOf(skin);
  const v = patternInfo(skin, seed).art;
  const tex = patternTexture(skin, size > 600 ? 1024 : 512, v, model);
  const win = itemWindow(skin, seed, model, v);
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
  const c = mkCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < wear.length; i++) {
    const v = wear[i] * 255, j = i * 4;
    img.data[j] = img.data[j + 1] = img.data[j + 2] = v; img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Case box art. Eight box forms (weapon crate, briefcase, treasure chest, hex capsule, safe, drum,
 * ornate casket, neon container) in six materials, lit with rim light, specular sheen, ambient
 * occlusion and a glow in the case colours. The best items of the case peek out from behind the
 * box (drawn with the weapon renderer), an emblem sits on a plate, the name is stencilled on.
 * Gold/premium cases get gold trim, gems, light rays and sparkles; event cases get themed particles.
 *
 * Pure canvas 2D: runs on the page and inside the art worker (OffscreenCanvas, no DOM).
 */
import type { CaseDef, CaseForm, CaseMaterial, Rarity, SkinDef } from '../contract';
import { hex, rgb, mix, rng, hashStr, type Rng } from './noise';
import { mkCanvas, dpr, cssSize } from './canvas';
import { skinById } from '../data/catalog';
import { renderSkinShared } from './render';
import { EMBLEMS } from './emblems';

export { EMBLEM_KEYS } from './emblems';

type RGB = [number, number, number];
type C = CanvasRenderingContext2D;
const WHITE: RGB = [255, 255, 255], BLACK: RGB = [0, 0, 0];
const lt = (c: RGB, t: number) => mix(c, WHITE, t);
const dk = (c: RGB, t: number) => mix(c, BLACK, t);
const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const TAU = Math.PI * 2;
const GOLD: RGB = [232, 184, 74];
const STEEL: RGB = [168, 174, 182];

const RARITY_RGB: Record<Rarity, RGB> = {
  consumer: [176, 195, 217], industrial: [94, 152, 217], milspec: [75, 105, 255], restricted: [136, 71, 255],
  classified: [211, 44, 230], covert: [235, 75, 75], gold: [228, 174, 57],
};

interface G {
  c: C; d: number; u: number; r: Rng;
  A: RGB; B: RGB; T: RGB;
  mat: CaseMaterial; cd: CaseDef; lux: boolean; W: number; H: number;
}
interface Box { x: number; y: number; w: number; h: number; top: number }

// ------------------------------------------------------------------ small drawing helpers

function rrPath(x: number, y: number, w: number, h: number, r: number | number[]): Path2D {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  return p;
}
function polyPath(pts: number[]): Path2D {
  const p = new Path2D();
  for (let i = 0; i < pts.length; i += 2) (i ? p.lineTo : p.moveTo).call(p, pts[i], pts[i + 1]);
  p.closePath();
  return p;
}
/** Polished metal ramp, in a tone (vertical unless x0/x1 are given). */
function metalGrad(c: C, y0: number, y1: number, t: RGB, x0 = 0, x1 = 0): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgb(lt(t, 0.7)));
  g.addColorStop(0.3, rgb(lt(t, 0.15)));
  g.addColorStop(0.55, rgb(dk(t, 0.35)));
  g.addColorStop(0.8, rgb(lt(t, 0.05)));
  g.addColorStop(1, rgb(dk(t, 0.5)));
  return g;
}
function rivet(g: G, x: number, y: number, r: number, t = g.T) {
  const { c } = g;
  const gr = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, rgb(lt(t, 0.85))); gr.addColorStop(0.5, rgb(t)); gr.addColorStop(1, rgb(dk(t, 0.6)));
  c.beginPath(); c.arc(x, y + r * 0.25, r, 0, TAU); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = gr; c.fill();
}
/** Four-point sparkle with a soft core. */
function sparkle(c: C, x: number, y: number, L: number) {
  const gr = c.createRadialGradient(x, y, 0, x, y, L * 0.6);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gr; c.beginPath(); c.arc(x, y, L * 0.6, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.beginPath();
  c.moveTo(x, y - L); c.quadraticCurveTo(x, y, x + L * 0.16, y); c.quadraticCurveTo(x, y, x, y + L);
  c.quadraticCurveTo(x, y, x - L * 0.16, y); c.quadraticCurveTo(x, y, x, y - L);
  c.moveTo(x - L * 0.7, y); c.quadraticCurveTo(x, y, x, y - L * 0.12); c.quadraticCurveTo(x, y, x + L * 0.7, y);
  c.quadraticCurveTo(x, y, x, y + L * 0.12); c.quadraticCurveTo(x, y, x - L * 0.7, y);
  c.fill();
}
/** Faceted gem in a metal setting. */
function gem(g: G, x: number, y: number, r: number, col: RGB) {
  const { c } = g;
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.beginPath(); c.arc(x, y, r * 1.28, 0, TAU); c.fillStyle = metalGrad(c, y - r * 1.3, y + r * 1.3, g.T); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = g.d * 0.6; c.stroke();
  const body = polyPath(pts);
  const gr = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r * 1.1);
  gr.addColorStop(0, rgb(lt(col, 0.75))); gr.addColorStop(0.45, rgb(col)); gr.addColorStop(1, rgb(dk(col, 0.6)));
  c.fillStyle = gr; c.fill(body);
  const t = r * 0.5;
  c.strokeStyle = rgb(lt(col, 0.6), 0.6); c.lineWidth = Math.max(0.5, g.d * 0.5);
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    c.moveTo(x + Math.cos(a) * t, y + Math.sin(a) * t); c.lineTo(pts[i * 2], pts[i * 2 + 1]);
  }
  c.stroke();
  c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; c.lineTo(x + Math.cos(a) * t, y + Math.sin(a) * t); } c.closePath();
  c.fillStyle = rgb(lt(col, 0.35), 0.55); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.35, r * 0.22, r * 0.12, -0.6, 0, TAU); c.fill();
}

// ------------------------------------------------------------------ materials + lighting

/** Small repeating carbon weave tile (cached per colour + size). */
const tileCache = new Map<string, CanvasPattern | null>();
function carbonPattern(g: G, base: RGB): CanvasPattern | null {
  const s = Math.max(4, Math.round(g.u * 2.4));
  const key = `${base.map(Math.round).join(',')}|${s}`;
  if (tileCache.has(key)) return tileCache.get(key)!;
  const t = mkCanvas(s * 2, s * 2);
  const x = t.getContext('2d')!;
  const dark = dk(base, 0.55), light = lt(base, 0.18);
  x.fillStyle = rgb(dark); x.fillRect(0, 0, s * 2, s * 2);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const horiz = (i + j) % 2 === 0;
    const gx = horiz ? x.createLinearGradient(0, j * s, 0, j * s + s) : x.createLinearGradient(i * s, 0, i * s + s, 0);
    gx.addColorStop(0, rgb(dark)); gx.addColorStop(0.5, rgb(light)); gx.addColorStop(1, rgb(dark));
    x.fillStyle = gx; x.fillRect(i * s + 0.5, j * s + 0.5, s - 1, s - 1);
  }
  const p = g.c.createPattern(t, 'repeat');
  tileCache.set(key, p);
  if (tileCache.size > 60) tileCache.delete(tileCache.keys().next().value as string);
  return p;
}

/**
 * Fills `path` with the material in `base`, then lights it: top light, bottom occlusion, a
 * diagonal specular sheen, coloured bounce light and a rim. `bx` is the bounding box for gradients.
 */
function surface(g: G, path: Path2D, bx: Box, base: RGB, mat: CaseMaterial = g.mat, opts: { glow?: boolean; sheen?: number; rim?: boolean } = {}) {
  const { c, d, r, u } = g;
  const { x, y, w, h } = bx;
  if (opts.glow) {
    c.save();
    c.shadowColor = rgb(g.B, 0.75); c.shadowBlur = 16 * d;
    c.fillStyle = rgb(dk(base, 0.3)); c.fill(path);
    c.restore();
  }
  c.save();
  c.clip(path);
  if (mat === 'gold') base = mix(GOLD, base, 0.22);
  const bg = c.createLinearGradient(x, y, x + w * 0.35, y + h);
  bg.addColorStop(0, rgb(lt(base, 0.14)));
  bg.addColorStop(0.5, rgb(base));
  bg.addColorStop(1, rgb(dk(base, 0.3)));
  c.fillStyle = bg; c.fillRect(x - 2, y - 2, w + 4, h + 4);
  if (mat === 'metal' || mat === 'gold') {
    const n = Math.min(160, Math.round(h / d / 1.2));
    for (let i = 0; i < n; i++) {
      const yy = y + r() * h;
      c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.02 + r() * 0.06})` : `rgba(0,0,0,${0.03 + r() * 0.07})`;
      c.fillRect(x + r() * w * 0.3 - w * 0.1, yy, w * (0.6 + r() * 0.6), Math.max(0.6, d * (0.3 + r() * 0.6)));
    }
    const hb = c.createLinearGradient(0, y, 0, y + h);
    hb.addColorStop(0, 'rgba(255,255,255,0)'); hb.addColorStop(0.18, `rgba(255,255,255,${mat === 'gold' ? 0.32 : 0.2})`);
    hb.addColorStop(0.32, 'rgba(255,255,255,0)'); hb.addColorStop(0.7, 'rgba(255,255,255,0.05)'); hb.addColorStop(0.8, 'rgba(255,255,255,0)');
    c.fillStyle = hb; c.fillRect(x, y, w, h);
  } else if (mat === 'carbon') {
    const p = carbonPattern(g, base);
    if (p) { c.globalAlpha = 0.9; c.fillStyle = p; c.fillRect(x, y, w, h); c.globalAlpha = 1; }
  } else if (mat === 'wood') {
    const planks = Math.max(3, Math.round(h / (u * 9)));
    const ph = h / planks;
    for (let i = 0; i < planks; i++) {
      const py = y + i * ph;
      c.fillStyle = rgb(i % 2 ? dk(base, 0.08) : lt(base, 0.05), 0.6); c.fillRect(x, py, w, ph);
      c.strokeStyle = rgb(dk(base, 0.45), 0.45); c.lineWidth = Math.max(0.6, d * 0.6);
      for (let k = 0; k < 5; k++) {
        const gy = py + ph * (0.15 + r() * 0.7), amp = ph * (0.04 + r() * 0.08), f = 2 + r() * 4, ph0 = r() * 6;
        c.beginPath();
        for (let s = 0; s <= 24; s++) { const xx = x + (s / 24) * w; c.lineTo(xx, gy + Math.sin(ph0 + (s / 24) * f) * amp); }
        c.stroke();
      }
      if (r() < 0.5) { c.beginPath(); c.ellipse(x + r() * w, py + ph / 2, ph * 0.22, ph * 0.12, 0, 0, TAU); c.stroke(); }
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x, py + ph - d, w, d * 1.2);
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x, py + ph + d * 0.3, w, d * 0.6);
    }
  } else if (mat === 'leather') {
    const n = Math.min(900, Math.round((w * h) / (d * d * 14)));
    for (let i = 0; i < n; i++) {
      c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)';
      c.fillRect(x + r() * w, y + r() * h, d * (0.6 + r()), d * (0.6 + r()));
    }
    const vg = c.createRadialGradient(x + w / 2, y + h * 0.4, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.max(w, h) * 0.7);
    vg.addColorStop(0, 'rgba(255,255,255,0.06)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = vg; c.fillRect(x, y, w, h);
  } else {
    for (let i = 0; i < 7; i++) {
      const sx = x + r() * w, sy = y + r() * h, L = u * (1.5 + r() * 5), a = r() * Math.PI;
      c.strokeStyle = `rgba(255,255,255,${0.08 + r() * 0.1})`; c.lineWidth = Math.max(0.5, d * 0.5);
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L * 0.3); c.stroke();
    }
  }
  const lg = c.createLinearGradient(0, y, 0, y + h);
  lg.addColorStop(0, 'rgba(255,255,255,0.2)'); lg.addColorStop(0.28, 'rgba(255,255,255,0)');
  lg.addColorStop(0.7, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = lg; c.fillRect(x, y, w, h);
  const sh = opts.sheen ?? (mat === 'paint' || mat === 'gold' ? 0.22 : 0.13);
  const sg = c.createLinearGradient(x, y, x + w, y + h * 0.6);
  sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.22, `rgba(255,255,255,${sh})`);
  sg.addColorStop(0.3, 'rgba(255,255,255,0)'); sg.addColorStop(0.36, `rgba(255,255,255,${sh * 0.4})`); sg.addColorStop(0.42, 'rgba(255,255,255,0)');
  c.fillStyle = sg; c.fillRect(x, y, w, h);
  const bl = c.createLinearGradient(0, y + h * 0.75, 0, y + h);
  bl.addColorStop(0, rgb(g.B, 0)); bl.addColorStop(1, rgb(g.B, 0.18));
  c.fillStyle = bl; c.fillRect(x, y, w, h);
  if (opts.rim !== false) {
    const rg = c.createLinearGradient(x, y, x + w * 0.3, y + h);
    rg.addColorStop(0, 'rgba(255,255,255,0.55)'); rg.addColorStop(0.4, 'rgba(255,255,255,0.08)'); rg.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.strokeStyle = rg; c.lineWidth = d * 2.4; c.stroke(path);
  }
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.65)'; c.lineWidth = d * 1.1; c.stroke(path);
}

/** Dashed stitching just inside a rounded rect (leather). */
function stitch(g: G, x: number, y: number, w: number, h: number, r: number) {
  const { c, d } = g;
  c.save();
  c.setLineDash([d * 2.2, d * 1.6]);
  c.lineWidth = Math.max(0.6, d * 0.8);
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.beginPath(); c.roundRect(x, y + d * 0.8, w, h, r); c.stroke();
  c.strokeStyle = rgb(lt(g.A, 0.45), 0.6);
  c.beginPath(); c.roundRect(x, y, w, h, r); c.stroke();
  c.restore();
}

// ------------------------------------------------------------------ emblem + label

function tinted(mask: HTMLCanvasElement, fill: string | CanvasGradient): HTMLCanvasElement {
  const t = mkCanvas(mask.width, mask.height);
  const tc = t.getContext('2d')!;
  tc.drawImage(mask, 0, 0);
  tc.globalCompositeOperation = 'source-in';
  tc.fillStyle = fill; tc.fillRect(0, 0, mask.width, mask.height);
  return t;
}

/** Draws the case emblem as embossed metal or as a neon glow at cx, cy with radius R. */
function emblem(g: G, cx: number, cy: number, R: number, style: 'metal' | 'neon' = 'metal') {
  const { c, d } = g;
  const draw = EMBLEMS[g.cd.look.emblem] ?? EMBLEMS.star;
  const S = Math.ceil(R * 2.6);
  const m = mkCanvas(S, S);
  const mc = m.getContext('2d')!;
  mc.translate(S / 2, S / 2); mc.scale(R * 0.95, R * 0.95);
  mc.fillStyle = '#fff'; mc.strokeStyle = '#fff';
  draw(mc);
  const x0 = cx - S / 2, y0 = cy - S / 2;
  if (style === 'neon') {
    const core = tinted(m, rgb(lt(g.B, 0.65)));
    c.save();
    c.shadowColor = rgb(g.B, 1); c.shadowBlur = 10 * d;
    c.drawImage(core, x0, y0); c.drawImage(core, x0, y0);
    c.restore();
    return;
  }
  const base = g.lux ? GOLD : lt(g.B, 0.35);
  const gr = mc.createLinearGradient(0, S * 0.15, 0, S * 0.85);
  gr.addColorStop(0, rgb(lt(base, 0.75))); gr.addColorStop(0.45, rgb(base)); gr.addColorStop(0.55, rgb(dk(base, 0.25))); gr.addColorStop(1, rgb(lt(base, 0.2)));
  const shadow = tinted(m, 'rgba(0,0,0,0.75)');
  const hi = tinted(m, 'rgba(255,255,255,0.65)');
  const body = tinted(m, gr);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 3 * d; c.shadowOffsetY = d;
  c.drawImage(shadow, x0, y0 + d * 1.2);
  c.restore();
  c.drawImage(hi, x0, y0 - d * 0.8);
  c.drawImage(body, x0, y0);
}

type PlateShape = 'circle' | 'shield' | 'hex' | 'diamond' | 'square';
/** Raised plate with a trim ring, and the emblem on it. */
function badge(g: G, cx: number, cy: number, R: number, shape: PlateShape = 'circle') {
  const { c, d } = g;
  const path = (k: number) => {
    const rr = R * k;
    switch (shape) {
      case 'shield': {
        const p = new Path2D();
        p.moveTo(cx, cy - rr); p.lineTo(cx + rr * 0.9, cy - rr * 0.72); p.bezierCurveTo(cx + rr * 0.92, cy + rr * 0.2, cx + rr * 0.5, cy + rr * 0.75, cx, cy + rr * 1.05);
        p.bezierCurveTo(cx - rr * 0.5, cy + rr * 0.75, cx - rr * 0.92, cy + rr * 0.2, cx - rr * 0.9, cy - rr * 0.72); p.closePath();
        return p;
      }
      case 'hex': { const pts: number[] = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } return polyPath(pts); }
      case 'diamond': return polyPath([cx, cy - rr * 1.12, cx + rr, cy, cx, cy + rr * 1.12, cx - rr, cy]);
      case 'square': return rrPath(cx - rr, cy - rr, rr * 2, rr * 2, rr * 0.25);
      default: { const p = new Path2D(); p.arc(cx, cy, rr, 0, TAU); return p; }
    }
  };
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 4 * d; c.shadowOffsetY = d * 1.5;
  c.fillStyle = metalGrad(c, cy - R, cy + R, g.T);
  c.fill(path(1.12));
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = d * 0.8; c.stroke(path(1.12));
  const f = c.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.1, cx, cy, R * 1.1);
  f.addColorStop(0, rgb(lt(g.B, 0.15))); f.addColorStop(0.55, rgb(dk(g.B, 0.25))); f.addColorStop(1, rgb(dk(g.B, 0.7)));
  c.fillStyle = f; c.fill(path(0.96));
  c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = d; c.stroke(path(0.96));
  c.strokeStyle = rgb(lt(g.B, 0.5), 0.35); c.lineWidth = d * 0.7; c.stroke(path(0.84));
  emblem(g, cx, cy, R * 0.6);
  c.save(); c.clip(path(0.96));
  const gl = c.createLinearGradient(cx - R, cy - R, cx + R * 0.2, cy + R * 0.2);
  gl.addColorStop(0, 'rgba(255,255,255,0.28)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.06)'); gl.addColorStop(0.51, 'rgba(255,255,255,0)');
  c.fillStyle = gl; c.fillRect(cx - R, cy - R, R * 2, R * 2);
  c.restore();
}

const FONT = '"Impact", "Haettenschweiler", "Arial Narrow Bold", "Arial Black", "Helvetica Neue", sans-serif';
let measCtx: CanvasRenderingContext2D | null = null;
/** Stencilled, slightly worn text centred at cx, cy, fitted into maxW. */
function stencil(g: G, text: string, cx: number, cy: number, maxW: number, size: number, col: string, opts: { worn?: boolean; mono?: boolean; glow?: string } = {}) {
  const { c, d, r } = g;
  const font = (p: number) => `${opts.mono ? 700 : 900} ${p}px ${opts.mono ? '"Consolas", "Menlo", "DejaVu Sans Mono", monospace' : FONT}`;
  measCtx ??= mkCanvas(1, 1).getContext('2d')!;
  const meas = measCtx;
  const spacing = 0.12;
  const width = (p: number) => { meas.font = font(p); return meas.measureText(text).width + p * spacing * (text.length - 1); };
  let px = size;
  let tw = width(px);
  if (tw > maxW) { px = Math.max(5 * d, px * (maxW / tw)); tw = width(px); }
  const sp = px * spacing;
  const Wt = Math.ceil(tw + px), Ht = Math.ceil(px * 1.6);
  const t = mkCanvas(Wt, Ht);
  const tc = t.getContext('2d')!;
  tc.font = font(px); tc.textBaseline = 'middle'; tc.fillStyle = col;
  let xx = px / 2;
  for (const ch of text) { tc.fillText(ch, xx, Ht / 2); xx += tc.measureText(ch).width + sp; }
  if (opts.worn !== false) {
    tc.globalCompositeOperation = 'destination-out';
    const n = Math.round((Wt * Ht) / (d * d * 30));
    for (let i = 0; i < n; i++) { tc.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.6})`; tc.fillRect(r() * Wt, r() * Ht, d * (0.5 + r() * 1.2), d * (0.4 + r() * 0.8)); }
    tc.fillStyle = 'rgba(0,0,0,1)';
    tc.fillRect(0, Ht / 2 - d * 0.35, Wt, Math.max(0.6, d * 0.7));
  }
  c.save();
  if (opts.glow) { c.shadowColor = opts.glow; c.shadowBlur = 6 * d; }
  else { c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowOffsetY = d * 0.6; c.shadowBlur = d; }
  c.drawImage(t, cx - Wt / 2, cy - Ht / 2);
  c.restore();
}
function labelText(g: G): string {
  return (g.cd.look.label ?? g.cd.name).toUpperCase();
}
/** Name plate: recessed plate with stencil text and two rivets. */
function namePlate(g: G, cx: number, cy: number, w: number, h: number, light = false) {
  const { c, d } = g;
  const p = rrPath(cx - w / 2, cy - h / 2, w, h, h * 0.2);
  c.save();
  c.fillStyle = light ? 'rgba(240,236,224,0.92)' : 'rgba(10,12,16,0.72)';
  c.fill(p);
  c.strokeStyle = metalGrad(c, cy - h / 2, cy + h / 2, g.T); c.lineWidth = d * 1.2; c.stroke(p);
  c.restore();
  rivet(g, cx - w / 2 + h * 0.32, cy, h * 0.12);
  rivet(g, cx + w / 2 - h * 0.32, cy, h * 0.12);
  stencil(g, labelText(g), cx, cy + d * 0.3, w - h * 1.1, h * 0.72, light ? '#1a1a1a' : rgb(lt(g.B, 0.55)));
}

/** A sticker: hazard tape, star sticker or a number tag, slightly rotated. */
function sticker(g: G, x: number, y: number, s: number) {
  const { c, d, r } = g;
  const kind = hashStr(g.cd.id + 'st') % 3;
  c.save(); c.translate(x, y); c.rotate((r() - 0.5) * 0.5);
  c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 2 * d; c.shadowOffsetY = d * 0.6;
  if (kind === 0) {
    const w = s * 2.4, h = s * 0.6;
    c.fillStyle = '#f2c200'; c.fillRect(-w / 2, -h / 2, w, h);
    c.shadowColor = 'transparent';
    c.save(); c.beginPath(); c.rect(-w / 2, -h / 2, w, h); c.clip();
    c.fillStyle = '#1a1a1a';
    for (let i = -6; i < 8; i++) { c.beginPath(); c.moveTo(-w / 2 + i * h, h / 2); c.lineTo(-w / 2 + i * h + h * 0.5, h / 2); c.lineTo(-w / 2 + i * h + h, -h / 2); c.lineTo(-w / 2 + i * h + h * 0.5, -h / 2); c.fill(); }
    c.restore();
  } else if (kind === 1) {
    c.fillStyle = rgb(lt(g.B, 0.15));
    c.beginPath(); c.arc(0, 0, s * 0.62, 0, TAU); c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = d * 0.9; c.beginPath(); c.arc(0, 0, s * 0.5, 0, TAU); c.stroke();
    c.fillStyle = '#fff';
    c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? s * 0.14 : s * 0.34; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill();
  } else {
    const w = s * 1.5, h = s * 0.7;
    c.fillStyle = '#f0ece0'; c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, h * 0.15); c.fill();
    c.shadowColor = 'transparent';
    c.fillStyle = rgb(dk(g.B, 0.2)); c.fillRect(-w / 2, -h / 2, w * 0.28, h);
    c.font = `900 ${h * 0.62}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#1a1a1a';
    c.fillText('#' + String(1 + (hashStr(g.cd.id) % 98)).padStart(2, '0'), w * 0.12, h * 0.04);
  }
  c.restore();
}

// ------------------------------------------------------------------ the stage

function ambient(g: G, bx: Box) {
  const { c, W, H, A, B } = g;
  const cx = bx.x + bx.w / 2, cy = bx.y + bx.h * 0.2;
  const R = Math.max(W, H) * 0.62;
  const gl = c.createRadialGradient(cx, cy, 0, cx, cy, R);
  gl.addColorStop(0, rgb(lt(B, 0.1), 0.5)); gl.addColorStop(0.35, rgb(B, 0.2)); gl.addColorStop(0.7, rgb(A, 0.06)); gl.addColorStop(1, rgb(A, 0));
  c.fillStyle = gl; c.fillRect(0, 0, W, H);
}

/** Light rays fanning out behind the box (gold / premium). */
function rays(g: G, bx: Box) {
  const { c, W, H, r } = g;
  const cx = bx.x + bx.w / 2, cy = bx.y;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const n = 9;
  const L = Math.max(W, H) * 0.75;
  const gr = c.createRadialGradient(cx, cy, 0, cx, cy, L);
  gr.addColorStop(0, rgb(lt(g.B, 0.4), 0.22)); gr.addColorStop(1, rgb(g.B, 0));
  c.fillStyle = gr;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32 + (r() - 0.5) * 0.12, wdt = 0.05 + r() * 0.06;
    c.beginPath(); c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a - wdt) * L, cy + Math.sin(a - wdt) * L); c.lineTo(cx + Math.cos(a + wdt) * L, cy + Math.sin(a + wdt) * L);
    c.closePath(); c.fill();
  }
  c.restore();
}

function floorShadow(g: G, bx: Box) {
  const { c } = g;
  c.save();
  c.translate(bx.x + bx.w / 2, bx.y + bx.h);
  c.scale(1, 0.13);
  const R = bx.w * 0.62;
  const sh = c.createRadialGradient(0, 0, 0, 0, 0, R);
  sh.addColorStop(0, 'rgba(0,0,0,0.75)'); sh.addColorStop(0.6, 'rgba(0,0,0,0.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sh; c.fillRect(-R, -R, R * 2, R * 2);
  c.restore();
  c.save();
  c.translate(bx.x + bx.w / 2, bx.y + bx.h + g.d);
  c.scale(1, 0.08);
  const R2 = bx.w * 0.8;
  const fl = c.createRadialGradient(0, 0, 0, 0, 0, R2);
  fl.addColorStop(0, rgb(g.B, 0.35)); fl.addColorStop(1, rgb(g.B, 0));
  c.fillStyle = fl; c.fillRect(-R2, -R2, R2 * 2, R2 * 2);
  c.restore();
}

// ------------------------------------------------------------------ peeking items

const RANK: Rarity[] = ['gold', 'covert', 'classified', 'restricted', 'milspec', 'industrial', 'consumer'];
/** The case's best items: the top ★ and the top non-★, different weapons where possible. */
export function showcase(cd: CaseDef, n = 3): SkinDef[] {
  const out: SkinDef[] = [];
  const weapons = new Set<string>();
  const byTier = RANK.map((rr) => ((cd.contents[rr] ?? []).map((id) => skinById(id)).filter(Boolean) as SkinDef[]).sort((a, b) => b.basePrice - a.basePrice));
  const firstNonGold = byTier.slice(1).find((l) => l.length) ?? [];
  const order = [byTier[0][0], firstNonGold[0], byTier[0][1], firstNonGold[1], ...byTier.flat()];
  for (const s of order) {
    if (!s || out.includes(s) || weapons.has(s.weapon)) continue;
    out.push(s); weapons.add(s.weapon);
    if (out.length >= n) break;
  }
  return out;
}

function peek(g: G, bx: Box) {
  const { c, d } = g;
  const items = showcase(g.cd, bx.w / d > 110 ? 3 : 2);
  if (!items.length) return;
  const top = bx.y - bx.top;
  const cx = bx.x + bx.w / 2;
  const hc = RARITY_RGB[items[0].rarity];
  const hy = top;
  const halo = c.createRadialGradient(cx, hy, 0, cx, hy, bx.w * 0.6);
  halo.addColorStop(0, rgb(hc, 0.42)); halo.addColorStop(1, rgb(hc, 0));
  c.fillStyle = halo; c.fillRect(0, 0, g.W, g.H);
  // [item index, x offset (box widths), y offset (box heights), angle, mirrored, size]
  const slots: [number, number, number, number, boolean, number][] =
    items.length >= 3
      ? [[2, 0.02, -0.36, -1.25, false, 0.7], [1, -0.2, -0.2, -0.5, true, 0.86], [0, 0.2, -0.24, -0.55, false, 0.9]]
      : items.length === 2
        ? [[1, -0.18, -0.2, -0.5, true, 0.86], [0, 0.18, -0.24, -0.55, false, 0.9]]
        : [[0, 0.05, -0.24, -0.45, false, 0.92]];
  for (const [i, ox, oy, ang, mir, sc] of slots) {
    const s = items[i];
    const knife = s.rarity === 'gold';
    const iw = Math.max(24, Math.round((bx.w / d) * sc * (knife ? 0.82 : 1)));
    const ih = Math.round(iw * 0.42);
    const img = renderSkinShared({ skin: s.id, float: 0.015, seed: 7, width: iw, height: ih, statTrak: false });
    c.save();
    c.translate(cx + ox * bx.w, top + oy * bx.h + bx.h * 0.12);
    if (mir) c.scale(-1, 1);
    c.rotate(ang);
    c.shadowColor = rgb(RARITY_RGB[s.rarity], 0.9); c.shadowBlur = 6 * d;
    c.drawImage(img, -img.width / 2, -img.height / 2);
    c.restore();
  }
}

// ------------------------------------------------------------------ forms

const ASPECT: Record<CaseForm, number> = { crate: 0.6, briefcase: 0.6, chest: 0.66, capsule: 0.66, safe: 0.78, drum: 0.84, casket: 0.62, neon: 0.6 };
const WIDTH: Record<CaseForm, number> = { crate: 1, briefcase: 0.98, chest: 0.94, capsule: 1, safe: 0.86, drum: 0.74, casket: 0.98, neon: 1 };
const TOP: Record<CaseForm, number> = { crate: 0.16, briefcase: 0.08, chest: 0, capsule: 0, safe: 0.12, drum: 0.1, casket: 0.2, neon: 0.14 };

/** Lid seen from above: a trapezoid of depth `top` above the front face. */
function topFace(g: G, bx: Box, inset: number, base: RGB) {
  const { c, d } = g;
  const { x, y, w, top } = bx;
  const p = polyPath([x + inset, y - top, x + w - inset, y - top, x + w, y + d, x, y + d]);
  surface(g, p, { x, y: y - top, w, h: top, top: 0 }, lt(base, 0.18), g.mat, { sheen: 0.08, rim: false });
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = d;
  c.beginPath(); c.moveTo(x + d, y + d * 0.2); c.lineTo(x + w - d, y + d * 0.2); c.stroke();
}

/** L-shaped metal corner guard; (sx, sy) = direction into the box. */
function lCorner(g: G, x: number, y: number, s: number, sx: number, sy: number) {
  const { c, d } = g;
  const t = s * 0.38;
  const p = polyPath([x, y, x + sx * s, y, x + sx * s, y + sy * t, x + sx * t, y + sy * t, x + sx * t, y + sy * s, x, y + sy * s]);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 2 * d; c.shadowOffsetY = d;
  c.fillStyle = metalGrad(c, Math.min(y, y + sy * s), Math.max(y, y + sy * s), g.T);
  c.fill(p);
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = d * 0.7; c.stroke(p);
  rivet(g, x + sx * t * 0.5, y + sy * s * 0.7, t * 0.2);
  rivet(g, x + sx * s * 0.7, y + sy * t * 0.5, t * 0.2);
}

function latch(g: G, cx: number, cy: number, w: number, h: number) {
  const { c, d } = g;
  const p = rrPath(cx - w / 2, cy - h / 2, w, h, h * 0.2);
  c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 2 * d; c.shadowOffsetY = d;
  c.fillStyle = metalGrad(c, cy - h / 2, cy + h / 2, g.T); c.fill(p); c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = d * 0.7; c.stroke(p);
  c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.roundRect(cx - w * 0.3, cy - h * 0.1, w * 0.6, h * 0.22, h * 0.1); c.fill();
}

const FORMS: Record<CaseForm, (g: G, bx: Box) => void> = {
  crate(g, bx) {
    const { c, d, u } = g;
    const { x, y, w, h } = bx;
    topFace(g, bx, w * 0.05, g.A);
    const body = rrPath(x, y, w, h, u * 2.2);
    surface(g, body, bx, g.A, g.mat, { glow: true });
    for (const fx of [0.2, 0.8]) {
      const rx = x + w * fx - u * 2.5;
      const rib = rrPath(rx, y + h * 0.04, u * 5, h * 0.92, u * 1.2);
      surface(g, rib, { x: rx, y, w: u * 5, h, top: 0 }, lt(g.A, 0.08), g.mat, { sheen: 0.18 });
    }
    const sy = y + h * 0.3;
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x + d, sy, w - 2 * d, d * 1.6);
    c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(x + d, sy + d * 1.6, w - 2 * d, d);
    const cs = Math.min(w, h) * 0.2;
    lCorner(g, x, y, cs, 1, 1); lCorner(g, x + w, y, cs, -1, 1); lCorner(g, x, y + h, cs, 1, -1); lCorner(g, x + w, y + h, cs, -1, -1);
    latch(g, x + w * 0.2, sy, u * 8, h * 0.13);
    latch(g, x + w * 0.8, sy, u * 8, h * 0.13);
    badge(g, x + w / 2, y + h * 0.52, h * 0.27, g.lux ? 'shield' : 'circle');
    stencil(g, labelText(g), x + w / 2, y + h * 0.89, w * 0.5, h * 0.12, rgb(lt(g.B, 0.6)));
    if (!g.lux) sticker(g, x + w * 0.34, y + h * 0.17, h * 0.13);
  },
  briefcase(g, bx) {
    const { c, d, u } = g;
    const { x, y, w, h } = bx;
    const hw = w * 0.32, ty = y - bx.top, hy = ty - h * 0.15;
    const handle = () => {
      c.beginPath();
      c.moveTo(x + w / 2 - hw / 2, ty + d); c.lineTo(x + w / 2 - hw / 2, hy + h * 0.05);
      c.quadraticCurveTo(x + w / 2 - hw / 2, hy, x + w / 2 - hw / 2 + h * 0.06, hy); c.lineTo(x + w / 2 + hw / 2 - h * 0.06, hy);
      c.quadraticCurveTo(x + w / 2 + hw / 2, hy, x + w / 2 + hw / 2, hy + h * 0.05); c.lineTo(x + w / 2 + hw / 2, ty + d);
    };
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.65)'; c.lineWidth = h * 0.095; handle(); c.stroke();
    c.strokeStyle = g.mat === 'leather' ? rgb(dk(g.A, 0.15)) : metalGrad(c, hy - h * 0.04, hy + h * 0.04, g.T);
    c.lineWidth = h * 0.065; handle(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = h * 0.015;
    c.beginPath(); c.moveTo(x + w / 2 - hw / 2 + h * 0.06, hy - h * 0.015); c.lineTo(x + w / 2 + hw / 2 - h * 0.06, hy - h * 0.015); c.stroke();
    c.restore();
    for (const s of [-1, 1]) {
      const mx = x + w / 2 + (s * hw) / 2;
      c.fillStyle = metalGrad(c, ty - h * 0.06, ty + h * 0.02, g.T);
      c.beginPath(); c.roundRect(mx - u * 3, ty - h * 0.05, u * 6, h * 0.07, u); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = d * 0.6; c.stroke();
    }
    topFace(g, bx, w * 0.02, g.A);
    const body = rrPath(x, y, w, h, h * 0.12);
    surface(g, body, bx, g.A, g.mat, { glow: true });
    if (g.mat === 'metal' || g.mat === 'gold') {
      for (let i = 0; i < 4; i++) {
        const ry = y + h * (0.36 + i * 0.13);
        c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x + w * 0.04, ry, w * 0.92, d * 1.4);
        c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x + w * 0.04, ry + d * 1.4, w * 0.92, d * 0.8);
      }
    } else if (g.mat === 'leather') stitch(g, x + u * 2.5, y + u * 2.5, w - u * 5, h - u * 5, h * 0.09);
    const sy = y + h * 0.2;
    c.fillStyle = metalGrad(c, sy - h * 0.025, sy + h * 0.025, g.T);
    c.fillRect(x + d, sy - h * 0.022, w - 2 * d, h * 0.044);
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x + d, sy + h * 0.022, w - 2 * d, d);
    for (const fx of [0.17, 0.83]) {
      const lx = x + w * fx, lw = w * 0.15, lh = h * 0.16;
      const lp = rrPath(lx - lw / 2, sy - lh / 2, lw, lh, lh * 0.18);
      c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 2 * d; c.shadowOffsetY = d;
      c.fillStyle = metalGrad(c, sy - lh / 2, sy + lh / 2, g.T); c.fill(lp); c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = d * 0.7; c.stroke(lp);
      for (let k = 0; k < 3; k++) {
        const dx = lx - lw * 0.28 + k * lw * 0.28;
        const wg = c.createLinearGradient(0, sy - lh * 0.28, 0, sy + lh * 0.28);
        wg.addColorStop(0, '#1a1c20'); wg.addColorStop(0.5, '#7a8088'); wg.addColorStop(1, '#1a1c20');
        c.fillStyle = wg; c.fillRect(dx - lw * 0.1, sy - lh * 0.28, lw * 0.2, lh * 0.56);
      }
    }
    badge(g, x + w / 2, y + h * 0.54, h * 0.25, g.lux ? 'diamond' : 'shield');
    namePlate(g, x + w / 2, y + h * 0.89, w * 0.42, h * 0.11);
    lCorner(g, x, y + h, h * 0.16, 1, -1); lCorner(g, x + w, y + h, h * 0.16, -1, -1);
  },
  chest(g, bx) {
    const { c, d, u } = g;
    const { x, y, w, h } = bx;
    const lidH = h * 0.42, bodyY = y + lidH;
    const lid = new Path2D();
    lid.moveTo(x, bodyY); lid.lineTo(x, y + lidH * 0.45);
    lid.bezierCurveTo(x, y - lidH * 0.08, x + w, y - lidH * 0.08, x + w, y + lidH * 0.45);
    lid.lineTo(x + w, bodyY); lid.closePath();
    surface(g, lid, { x, y, w, h: lidH, top: 0 }, lt(g.A, 0.08), g.mat, { glow: true, sheen: 0.18 });
    const body = rrPath(x, bodyY, w, h - lidH, [0, 0, u * 2, u * 2]);
    surface(g, body, { x, y: bodyY, w, h: h - lidH, top: 0 }, g.A, g.mat, { glow: true });
    const outline = new Path2D(); outline.addPath(lid); outline.addPath(body);
    for (const fx of [0.14, 0.86]) {
      const bxx = x + w * fx - u * 3;
      c.save();
      c.clip(outline);
      c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 2 * d; c.shadowOffsetX = d;
      c.fillStyle = metalGrad(c, 0, 0, g.T, bxx, bxx + u * 6); c.fillRect(bxx, y - lidH * 0.1, u * 6, h + lidH * 0.1);
      c.restore();
      for (let k = 0; k < 4; k++) rivet(g, bxx + u * 3, y + lidH * 0.25 + (k * (h - lidH * 0.3)) / 3.6, u * 1.1);
    }
    c.fillStyle = metalGrad(c, bodyY - u * 2, bodyY + u * 2, g.T);
    c.fillRect(x - d, bodyY - u * 1.6, w + 2 * d, u * 3.2);
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = d * 0.7; c.strokeRect(x - d, bodyY - u * 1.6, w + 2 * d, u * 3.2);
    const lw = w * 0.13, lh = h * 0.24, lx = x + w / 2 - lw / 2, ly = bodyY - lh * 0.35;
    const lp = new Path2D(); lp.moveTo(lx, ly); lp.lineTo(lx + lw, ly); lp.lineTo(lx + lw, ly + lh * 0.7); lp.quadraticCurveTo(lx + lw / 2, ly + lh * 1.15, lx, ly + lh * 0.7); lp.closePath();
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 3 * d; c.shadowOffsetY = d;
    c.fillStyle = metalGrad(c, ly, ly + lh, g.T); c.fill(lp); c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.stroke(lp);
    c.fillStyle = '#0a0a0a';
    c.beginPath(); c.arc(lx + lw / 2, ly + lh * 0.38, lw * 0.13, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(lx + lw * 0.42, ly + lh * 0.4); c.lineTo(lx + lw * 0.58, ly + lh * 0.4); c.lineTo(lx + lw * 0.55, ly + lh * 0.68); c.lineTo(lx + lw * 0.45, ly + lh * 0.68); c.fill();
    badge(g, x + w * 0.3, y + lidH * 0.5, lidH * 0.34, 'circle');
    gem(g, x + w * 0.7, y + lidH * 0.5, lidH * 0.16, lt(g.B, 0.1));
    namePlate(g, x + w / 2, y + h * 0.84, w * 0.44, h * 0.11, g.mat === 'wood');
    lCorner(g, x, y + h, h * 0.16, 1, -1); lCorner(g, x + w, y + h, h * 0.16, -1, -1);
  },
  capsule(g, bx) {
    const { c, d, u } = g;
    const { x, y, w, h } = bx;
    const cx = x + w / 2, cy = y + h / 2;
    const rx = w / 2, ry = h / 2;
    const outer = [cx - rx, cy, cx - rx * 0.55, cy - ry, cx + rx * 0.55, cy - ry, cx + rx, cy, cx + rx * 0.55, cy + ry, cx - rx * 0.55, cy + ry];
    const k = 0.72;
    const inner = outer.map((v, i) => (i % 2 ? cy + (v - cy) * k : cx + (v - cx) * (k - 0.04)));
    const op = polyPath(outer);
    c.save(); c.shadowColor = rgb(g.B, 0.8); c.shadowBlur = 18 * d; c.fillStyle = rgb(dk(g.A, 0.3)); c.fill(op); c.restore();
    const light = [0.25, 0.4, 0.05, -0.25, -0.45, -0.1];
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const f = polyPath([outer[i * 2], outer[i * 2 + 1], outer[j * 2], outer[j * 2 + 1], inner[j * 2], inner[j * 2 + 1], inner[i * 2], inner[i * 2 + 1]]);
      const base = light[i] >= 0 ? lt(g.A, light[i]) : dk(g.A, -light[i]);
      surface(g, f, bx, base, g.mat, { sheen: 0.1, rim: false });
    }
    c.strokeStyle = metalGrad(c, y, y + h, g.T); c.lineWidth = d * 2; c.stroke(op);
    const wp = polyPath(inner);
    const wg = c.createRadialGradient(cx, cy, 0, cx, cy, rx * 0.8);
    wg.addColorStop(0, rgb(lt(g.B, 0.2), 0.95)); wg.addColorStop(0.5, rgb(dk(g.B, 0.35))); wg.addColorStop(1, rgb(dk(g.A, 0.7)));
    c.fillStyle = wg; c.fill(wp);
    c.save(); c.clip(wp);
    c.strokeStyle = rgb(lt(g.B, 0.5), 0.12); c.lineWidth = d * 0.6;
    const hs = u * 4;
    for (let yy = y, row = 0; yy < y + h; yy += hs * 0.87, row++) for (let xx = x + ((row % 2) * hs) / 2; xx < x + w; xx += hs) {
      c.beginPath(); for (let q = 0; q < 6; q++) { const a = (q / 6) * TAU; c.lineTo(xx + Math.cos(a) * hs * 0.5, yy + Math.sin(a) * hs * 0.5); } c.closePath(); c.stroke();
    }
    c.restore();
    emblem(g, cx, cy - h * 0.04, h * 0.25, 'neon');
    emblem(g, cx, cy - h * 0.04, h * 0.25, 'metal');
    c.save(); c.clip(wp);
    const gl = c.createLinearGradient(x, y, x + w * 0.6, y + h);
    gl.addColorStop(0, 'rgba(255,255,255,0.3)'); gl.addColorStop(0.35, 'rgba(255,255,255,0.05)'); gl.addColorStop(0.36, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(x, y, w, h);
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = d * 1.2; c.stroke(wp);
    for (let i = 0; i < 6; i++) rivet(g, outer[i * 2] + (cx - outer[i * 2]) * 0.14, outer[i * 2 + 1] + (cy - outer[i * 2 + 1]) * 0.14, u * 1.3);
    stencil(g, labelText(g), cx, y + h * 0.92, w * 0.4, h * 0.085, rgb(lt(g.B, 0.7)), { worn: false, glow: rgb(g.B, 0.9) });
  },
  safe(g, bx) {
    const { c, d, u } = g;
    const { x, y, w, h } = bx;
    topFace(g, bx, w * 0.04, dk(g.A, 0.05));
    const body = rrPath(x, y, w, h, u * 3);
    surface(g, body, bx, dk(g.A, 0.05), g.mat, { glow: true });
    const ix = x + w * 0.07, iy = y + h * 0.07, iw = w * 0.86, ih = h * 0.86;
    const door = rrPath(ix, iy, iw, ih, u * 2);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 4 * d; c.shadowOffsetX = d; c.shadowOffsetY = d * 1.5;
    c.fillStyle = rgb(g.A); c.fill(door); c.restore();
    surface(g, door, { x: ix, y: iy, w: iw, h: ih, top: 0 }, lt(g.A, 0.06), g.mat, { sheen: 0.16 });
    for (const fy of [0.22, 0.78]) {
      const hx = x + w * 0.035, hh = h * 0.16;
      c.fillStyle = metalGrad(c, 0, 0, g.T, hx - u * 2, hx + u * 2);
      c.beginPath(); c.roundRect(hx - u * 1.8, y + h * fy - hh / 2, u * 3.6, hh, u * 1.5); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = d * 0.7; c.stroke();
    }
    const dx = ix + iw * 0.36, dy = iy + ih * 0.56, R = Math.min(iw, ih) * 0.3;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 5 * d; c.shadowOffsetY = d * 2;
    c.beginPath(); c.arc(dx, dy, R, 0, TAU); c.fillStyle = metalGrad(c, dy - R, dy + R, g.T); c.fill(); c.restore();
    c.beginPath(); c.arc(dx, dy, R * 0.86, 0, TAU);
    const dg = c.createRadialGradient(dx - R * 0.3, dy - R * 0.3, 0, dx, dy, R);
    dg.addColorStop(0, '#3a3e46'); dg.addColorStop(1, '#0c0d10'); c.fillStyle = dg; c.fill();
    c.strokeStyle = rgb(lt(g.T, 0.4)); c.lineWidth = Math.max(0.6, d * 0.6);
    c.beginPath();
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU, L = i % 5 ? 0.08 : 0.15;
      c.moveTo(dx + Math.cos(a) * R * 0.84, dy + Math.sin(a) * R * 0.84); c.lineTo(dx + Math.cos(a) * R * (0.84 - L), dy + Math.sin(a) * R * (0.84 - L));
    }
    c.stroke();
    c.beginPath(); c.arc(dx, dy, R * 0.6, 0, TAU);
    const kg = c.createRadialGradient(dx, dy - R * 0.2, 0, dx, dy, R * 0.6);
    kg.addColorStop(0, rgb(dk(g.B, 0.05))); kg.addColorStop(1, rgb(dk(g.B, 0.65))); c.fillStyle = kg; c.fill();
    c.strokeStyle = metalGrad(c, dy - R * 0.6, dy + R * 0.6, g.T); c.lineWidth = d * 1.5; c.stroke();
    emblem(g, dx, dy, R * 0.38);
    c.fillStyle = rgb(lt(g.B, 0.3)); c.beginPath(); c.moveTo(dx, dy - R * 1.02); c.lineTo(dx - R * 0.08, dy - R * 1.16); c.lineTo(dx + R * 0.08, dy - R * 1.16); c.fill();
    const hx = ix + iw * 0.8, hy = dy, hr = R * 0.55;
    c.save(); c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 3 + 0.3;
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = u * 2.6;
      c.beginPath(); c.moveTo(hx, hy + d); c.lineTo(hx + Math.cos(a) * hr, hy + Math.sin(a) * hr + d); c.stroke();
      c.strokeStyle = metalGrad(c, hy - hr, hy + hr, g.T); c.lineWidth = u * 1.8;
      c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + Math.cos(a) * hr, hy + Math.sin(a) * hr); c.stroke();
      c.beginPath(); c.arc(hx + Math.cos(a) * hr, hy + Math.sin(a) * hr, u * 1.8, 0, TAU); c.fillStyle = metalGrad(c, hy - hr, hy + hr, g.T); c.fill();
    }
    c.restore();
    rivet(g, hx, hy, u * 2.4);
    namePlate(g, ix + iw / 2, iy + ih * 0.13, iw * 0.6, ih * 0.14);
    for (let i = 0; i < 4; i++) rivet(g, ix + iw * (0.1 + i * 0.27), iy + ih * 0.95, u * 0.9);
    if (g.lux) { gem(g, ix + iw * 0.8, iy + ih * 0.86, u * 2.2, lt(g.B, 0.05)); }
  },
  drum(g, bx) {
    const { c, d, u } = g;
    const { x, y, w, h } = bx;
    const ey = h * 0.09;
    const body = new Path2D();
    body.moveTo(x, y); body.lineTo(x, y + h - ey); body.ellipse(x + w / 2, y + h - ey, w / 2, ey, 0, Math.PI, 0, true); body.lineTo(x + w, y); body.closePath();
    surface(g, body, bx, g.A, g.mat, { glow: true, rim: false });
    c.save(); c.clip(body);
    const cg = c.createLinearGradient(x, 0, x + w, 0);
    cg.addColorStop(0, 'rgba(0,0,0,0.55)'); cg.addColorStop(0.18, 'rgba(0,0,0,0.05)'); cg.addColorStop(0.3, 'rgba(255,255,255,0.22)');
    cg.addColorStop(0.38, 'rgba(255,255,255,0.02)'); cg.addColorStop(0.8, 'rgba(0,0,0,0.15)'); cg.addColorStop(1, 'rgba(0,0,0,0.6)');
    c.fillStyle = cg; c.fillRect(x, y, w, h);
    for (const fy of [0.13, 0.64]) {
      const hy = y + h * fy;
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = u * 3.4;
      c.beginPath(); c.ellipse(x + w / 2, hy + d, w / 2 + d, ey, 0, 0, Math.PI); c.stroke();
      c.strokeStyle = metalGrad(c, 0, 0, g.T, x, x + w); c.lineWidth = u * 2.6;
      c.beginPath(); c.ellipse(x + w / 2, hy, w / 2 + d, ey, 0, 0, Math.PI); c.stroke();
    }
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.65)'; c.lineWidth = d * 1.1; c.stroke(body);
    const lid = new Path2D(); lid.ellipse(x + w / 2, y, w / 2, ey, 0, 0, TAU);
    const lg = c.createLinearGradient(x, y - ey, x + w, y + ey);
    lg.addColorStop(0, rgb(lt(g.A, 0.4))); lg.addColorStop(0.5, rgb(lt(g.A, 0.12))); lg.addColorStop(1, rgb(dk(g.A, 0.2)));
    c.fillStyle = lg; c.fill(lid);
    c.strokeStyle = metalGrad(c, y - ey, y + ey, g.T); c.lineWidth = u * 1.8; c.stroke(lid);
    c.beginPath(); c.ellipse(x + w / 2, y, w * 0.36, ey * 0.62, 0, 0, TAU); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = d; c.stroke();
    c.beginPath(); c.ellipse(x + w * 0.7, y, u * 3.4, ey * 0.35, 0, 0, TAU); c.fillStyle = metalGrad(c, y - ey * 0.35, y + ey * 0.35, g.T); c.fill();
    const lr = Math.min(w * 0.28, h * 0.19);
    badge(g, x + w / 2, y + h * 0.4, lr, 'circle');
    namePlate(g, x + w / 2, y + h * 0.82, w * 0.66, h * 0.1);
    if (!g.lux) sticker(g, x + w * 0.2, y + h * 0.32, h * 0.08);
  },
  casket(g, bx) {
    const { c, d, u } = g;
    const { x, y, w, h } = bx;
    const lidY = y - bx.top;
    const lid = polyPath([x + w * 0.1, lidY, x + w * 0.9, lidY, x + w + u * 2, y + h * 0.04, x - u * 2, y + h * 0.04]);
    surface(g, lid, { x, y: lidY, w, h: bx.top + h * 0.04, top: 0 }, lt(g.A, 0.12), g.mat, { glow: true, sheen: 0.2 });
    c.strokeStyle = metalGrad(c, lidY, y, g.T); c.lineWidth = u * 1.2;
    c.beginPath(); c.moveTo(x + w * 0.1, lidY); c.lineTo(x + w * 0.9, lidY); c.stroke();
    const ch = bx.top * 0.55;
    const crest = polyPath([x + w * 0.38, lidY, x + w * 0.44, lidY - ch, x + w * 0.56, lidY - ch, x + w * 0.62, lidY]);
    c.fillStyle = metalGrad(c, lidY - ch, lidY, g.T); c.fill(crest); c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = d * 0.7; c.stroke(crest);
    gem(g, x + w / 2, lidY - ch * 0.45, ch * 0.34, lt(g.B, 0.1));
    const by = y + h * 0.04, bh = h * 0.88;
    const body = rrPath(x, by, w, bh, u * 1.5);
    surface(g, body, { x, y: by, w, h: bh, top: 0 }, g.A, g.mat, { glow: true });
    if (g.mat === 'leather') stitch(g, x + u * 4, by + u * 4, w - u * 8, bh - u * 8, u);
    c.strokeStyle = metalGrad(c, by, by + bh, g.T); c.lineWidth = u * 2;
    c.beginPath(); c.roundRect(x + u * 1.5, by + u * 1.5, w - u * 3, bh - u * 3, u); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = d * 0.6;
    c.beginPath(); c.roundRect(x + u * 2.6, by + u * 2.6, w - u * 5.2, bh - u * 5.2, u); c.stroke();
    const fil = (sx: number) => {
      c.save();
      c.translate(x + w / 2, by + bh * 0.48); c.scale(sx, 1);
      c.lineCap = 'round';
      const s = bh * 0.34;
      const paths = (lw: number, style: string | CanvasGradient) => {
        c.strokeStyle = style; c.lineWidth = lw;
        c.beginPath();
        c.moveTo(s * 0.6, 0); c.bezierCurveTo(s * 0.9, -s * 0.55, s * 1.5, -s * 0.5, s * 1.55, -s * 0.15);
        c.bezierCurveTo(s * 1.58, s * 0.05, s * 1.35, s * 0.12, s * 1.28, -s * 0.05);
        c.moveTo(s * 0.6, 0); c.bezierCurveTo(s * 0.9, s * 0.55, s * 1.5, s * 0.5, s * 1.55, s * 0.15);
        c.bezierCurveTo(s * 1.58, -s * 0.05, s * 1.35, -s * 0.12, s * 1.28, s * 0.05);
        c.moveTo(s * 0.95, -s * 0.33); c.quadraticCurveTo(s * 1.05, -s * 0.62, s * 1.25, -s * 0.66);
        c.moveTo(s * 0.95, s * 0.33); c.quadraticCurveTo(s * 1.05, s * 0.62, s * 1.25, s * 0.66);
        c.stroke();
      };
      paths(u * 1.6, 'rgba(0,0,0,0.5)');
      c.translate(0, -d * 0.6);
      paths(u * 1.0, metalGrad(c, -s, s, g.T));
      for (const yy of [-0.66, 0.66]) { c.beginPath(); c.ellipse(s * 1.3, s * yy, s * 0.09, s * 0.045, 0.4 * Math.sign(yy), 0, TAU); c.fillStyle = metalGrad(c, -s, s, g.T); c.fill(); }
      c.restore();
    };
    fil(1); fil(-1);
    badge(g, x + w / 2, by + bh * 0.46, bh * 0.27, 'diamond');
    const gc = lt(g.B, 0.05);
    for (const [gx, gy] of [[x + u * 6, by + u * 6], [x + w - u * 6, by + u * 6], [x + u * 6, by + bh - u * 6], [x + w - u * 6, by + bh - u * 6]]) gem(g, gx, gy, u * 2.4, gc);
    for (const fx of [0.1, 0.9]) {
      const fx0 = x + w * fx, fy0 = by + bh;
      c.beginPath(); c.ellipse(fx0, fy0 + h * 0.035, w * 0.055, h * 0.045, 0, 0, TAU);
      c.fillStyle = metalGrad(c, fy0, fy0 + h * 0.08, g.T); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = d * 0.6; c.stroke();
    }
    stencil(g, labelText(g), x + w / 2, by + bh * 0.86, w * 0.36, h * 0.075, rgb(lt(g.T, 0.35)), { worn: false });
  },
  neon(g, bx) {
    const { c, d, u } = g;
    const { x, y, w, h } = bx;
    const k = u * 5;
    const tp = polyPath([x + k + w * 0.04, y - bx.top, x + w - k - w * 0.04, y - bx.top, x + w - k, y + d, x + k, y + d]);
    surface(g, tp, { x, y: y - bx.top, w, h: bx.top, top: 0 }, lt(dk(g.A, 0.2), 0.14), g.mat, { rim: false, sheen: 0.06 });
    const body = polyPath([x + k, y, x + w - k, y, x + w, y + k, x + w, y + h - k, x + w - k, y + h, x + k, y + h, x, y + h - k, x, y + k]);
    surface(g, body, bx, dk(g.A, 0.15), g.mat, { glow: true });
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = d;
    c.beginPath(); c.moveTo(x + w * 0.22, y); c.lineTo(x + w * 0.22, y + h); c.moveTo(x + w * 0.78, y); c.lineTo(x + w * 0.78, y + h); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.moveTo(x + w * 0.22 + d, y); c.lineTo(x + w * 0.22 + d, y + h); c.moveTo(x + w * 0.78 + d, y); c.lineTo(x + w * 0.78 + d, y + h); c.stroke();
    for (const vx of [x + w * 0.06, x + w * 0.84]) for (let i = 0; i < 5; i++) {
      const vy = y + h * (0.3 + i * 0.1);
      c.fillStyle = '#050608'; c.beginPath(); c.roundRect(vx, vy, w * 0.1, h * 0.04, h * 0.02); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(vx, vy + h * 0.04, w * 0.1, d * 0.6);
    }
    const neon = (pts: number[], col: RGB) => {
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      c.shadowColor = rgb(col, 1); c.shadowBlur = 8 * d;
      c.strokeStyle = rgb(lt(col, 0.2)); c.lineWidth = u * 1.1;
      c.beginPath(); for (let i = 0; i < pts.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, pts[i], pts[i + 1]); c.stroke();
      c.shadowBlur = 0; c.strokeStyle = rgb(lt(col, 0.75)); c.lineWidth = u * 0.4; c.stroke();
      c.restore();
    };
    neon([x + k * 1.6, y + h * 0.08, x + w - k * 1.6, y + h * 0.08], g.B);
    neon([x + w * 0.3, y + h * 0.93, x + w * 0.7, y + h * 0.93], g.T);
    neon([x + d * 2, y + k * 1.2, x + d * 2, y + h * 0.24], g.B);
    neon([x + w - d * 2, y + h - k * 1.2, x + w - d * 2, y + h * 0.76], g.B);
    const px = x + w * 0.27, py = y + h * 0.18, pw = w * 0.46, ph = h * 0.66;
    const panel = rrPath(px, py, pw, ph, u * 1.5);
    const pg = c.createLinearGradient(0, py, 0, py + ph);
    pg.addColorStop(0, rgb(dk(g.B, 0.55), 0.95)); pg.addColorStop(1, rgb(dk(g.B, 0.85), 0.95));
    c.fillStyle = pg; c.fill(panel);
    c.save(); c.clip(panel);
    c.fillStyle = rgb(g.B, 0.1);
    for (let yy = py; yy < py + ph; yy += d * 2.4) c.fillRect(px, yy, pw, d);
    const gg = c.createRadialGradient(px + pw / 2, py + ph * 0.45, 0, px + pw / 2, py + ph * 0.45, pw * 0.6);
    gg.addColorStop(0, rgb(g.B, 0.45)); gg.addColorStop(1, rgb(g.B, 0));
    c.fillStyle = gg; c.fillRect(px, py, pw, ph);
    c.restore();
    c.strokeStyle = rgb(lt(g.B, 0.3), 0.8); c.lineWidth = d; c.stroke(panel);
    c.strokeStyle = rgb(lt(g.B, 0.6)); c.lineWidth = d * 1.2;
    const bl = pw * 0.12;
    for (const [bxx, byy, sx, sy] of [[px, py, 1, 1], [px + pw, py, -1, 1], [px, py + ph, 1, -1], [px + pw, py + ph, -1, -1]]) {
      c.beginPath(); c.moveTo(bxx + sx * u, byy + sy * (u + bl)); c.lineTo(bxx + sx * u, byy + sy * u); c.lineTo(bxx + sx * (u + bl), byy + sy * u); c.stroke();
    }
    emblem(g, px + pw / 2, py + ph * 0.42, ph * 0.28, 'neon');
    stencil(g, labelText(g), px + pw / 2, py + ph * 0.84, pw * 0.86, ph * 0.13, rgb(lt(g.B, 0.75)), { worn: false, mono: true, glow: rgb(g.B, 1) });
    for (let i = 0; i < 3; i++) {
      const lx = x + w * 0.82 + i * u * 2.6, ly = y + h * 0.17;
      c.save(); c.shadowColor = i === 0 ? '#39ff6a' : rgb(g.B); c.shadowBlur = 4 * d;
      c.fillStyle = i === 0 ? '#9dffb8' : rgb(lt(g.B, 0.5)); c.beginPath(); c.arc(lx, ly, u * 0.8, 0, TAU); c.fill(); c.restore();
    }
  },
};

const FORM_LIST: CaseForm[] = ['crate', 'briefcase', 'chest', 'capsule', 'safe', 'drum', 'casket', 'neon'];
function defaultForm(cd: CaseDef): CaseForm {
  if (cd.category === 'gold') return 'safe';
  if (cd.category === 'premium') return 'casket';
  return FORM_LIST[hashStr(cd.id) % FORM_LIST.length];
}
function defaultMat(form: CaseForm, cd: CaseDef): CaseMaterial {
  if (cd.category === 'gold') return 'gold';
  return form === 'chest' ? 'wood' : form === 'neon' ? 'carbon' : form === 'briefcase' ? 'leather' : 'metal';
}

// ------------------------------------------------------------------ foreground effects

function sparkles(g: G, bx: Box) {
  const { c, d, r } = g;
  const n = g.cd.category === 'gold' || g.mat === 'gold' ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const sx = bx.x + r() * bx.w, sy = bx.y - bx.top + r() * (bx.h + bx.top) * 0.9;
    sparkle(c, sx, sy, (3 + r() * 6) * d);
  }
}

/** Themed particles for event cases: petals, snow, embers, confetti, leaves. */
function particles(g: G) {
  const { c, d, r, W, H } = g;
  const em = g.cd.look.emblem;
  const kind = em === 'blossom' || em === 'heart' ? 'petal' : em === 'snow' ? 'snow' : em === 'moon' || em === 'pumpkin' || em === 'flame' || em === 'sun' ? 'ember' : em === 'leaf' ? 'leaf' : 'confetti';
  const n = Math.round(14 + r() * 8);
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H * 0.95, s = (1.4 + r() * 2.6) * d, a = r() * TAU;
    c.save(); c.translate(x, y); c.rotate(a);
    if (kind === 'petal') {
      c.fillStyle = r() < 0.5 ? '#ffb0d0' : '#ffd8e8'; c.globalAlpha = 0.85;
      c.beginPath(); c.ellipse(0, 0, s * 1.4, s * 0.8, 0, 0, TAU); c.fill();
    } else if (kind === 'snow') {
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(0, 0, s * 0.7, 0, TAU); c.fill();
    } else if (kind === 'ember') {
      c.shadowColor = '#ff6a00'; c.shadowBlur = 4 * d; c.fillStyle = r() < 0.5 ? '#ffb040' : '#ff6a1a';
      c.beginPath(); c.arc(0, 0, s * 0.55, 0, TAU); c.fill();
    } else if (kind === 'leaf') {
      c.fillStyle = ['#e07a1a', '#c84a10', '#e8b040'][Math.floor(r() * 3)]; c.globalAlpha = 0.9;
      c.beginPath(); c.moveTo(-s * 1.4, 0); c.quadraticCurveTo(0, -s, s * 1.4, 0); c.quadraticCurveTo(0, s, -s * 1.4, 0); c.fill();
    } else {
      c.fillStyle = [rgb(g.B), rgb(lt(g.A, 0.4)), '#ffd400', '#ffffff', rgb(g.T)][Math.floor(r() * 5)];
      c.fillRect(-s, -s * 0.4, s * 2, s * 0.8);
    }
    c.restore();
  }
}

// ------------------------------------------------------------------ entry

export function renderCaseImpl(cd: CaseDef, width: number, height: number): HTMLCanvasElement {
  const d = dpr();
  const W = Math.round(width * d), H = Math.round(height * d);
  const cv = mkCanvas(W, H);
  cssSize(cv, width, height);
  const c = cv.getContext('2d')!;
  const look = cd.look;
  const form = look.form ?? defaultForm(cd);
  const mat = look.material ?? defaultMat(form, cd);
  const lux = cd.category === 'gold' || cd.category === 'premium' || mat === 'gold' || cd.level >= 50;
  const A0 = hex(look.a), B = hex(look.b);
  // a near-black body would vanish on the dark page: lift it a little
  const A: RGB = lum(A0) < 0.06 ? lt(A0, 0.08) : A0;
  const T = look.trim ? hex(look.trim) : lux ? GOLD : STEEL;

  // box geometry: bottom-anchored, room above for the peeking items
  const asp = ASPECT[form];
  let bw = Math.min(W * 0.74, H * 0.96) * WIDTH[form];
  const maxH = H * 0.56;
  if (bw * asp > maxH) bw = maxH / asp;
  const bh = bw * asp;
  const bx: Box = { x: (W - bw) / 2, y: H * 0.93 - bh, w: bw, h: bh, top: bh * TOP[form] };
  const g: G = { c, d, u: bw / 100, r: rng(hashStr(cd.id)), A, B, T, mat, cd, lux, W, H };

  // background light on its own layer, faded out towards the edges so nothing ends at the frame
  const bgc = mkCanvas(W, H);
  const bg = bgc.getContext('2d')!;
  const gb: G = { ...g, c: bg };
  ambient(gb, bx);
  if (lux) rays(gb, bx);
  bg.globalCompositeOperation = 'destination-in';
  bg.save();
  bg.translate(W / 2, H * 0.55); bg.scale(1, (H * 0.55) / (W / 2));
  const vg = bg.createRadialGradient(0, 0, 0, 0, 0, W / 2);
  vg.addColorStop(0, 'rgba(0,0,0,1)'); vg.addColorStop(0.6, 'rgba(0,0,0,0.85)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
  bg.fillStyle = vg; bg.fillRect(-W, -W, W * 2, W * 2);
  bg.restore();
  c.drawImage(bgc, 0, 0);
  try { peek(g, bx); } catch { /* item art is decoration: never fail the case for it */ }
  floorShadow(g, bx);
  FORMS[form](g, bx);
  if (lux) sparkles(g, bx);
  if (cd.category === 'event' || cd.section === 'event') particles(g);
  return cv;
}

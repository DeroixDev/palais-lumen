// Zauberbrunnen: a dev toy behind the code pad. Set how many random items come out, press the
// button, and the magic fountain crackles them out one by one into a growing loot grid.
//
// Performance: one shared canvas for the fountain, particles, lightning and the flying items
// (their art is the worker-rendered <img> of the same size the grid uses, so each skin renders
// once). Particles live in a fixed-size pool, cards go into the grid in one fragment per frame,
// card art loads lazily, and everything stops when the page is left.

import './fountain.css';
import { RARITIES, wearOf, type ItemInstance, type Rarity, type SkinDef } from '../../contract';
import { SKINS, skinById, skinURL, skinURLNow } from '../lib/assets';
import { insiderLabel, isRareSeed, itemValue, lowFloatBonus, makeItem } from '../lib/economy';
import * as M from '../lib/mods';
import { sfx } from '../lib/sound';
import { addItem, commit, save, sellItems, sellValue } from '../lib/state';
import { clamp, esc, fmt, reducedMotion } from '../lib/util';
import { artImg, names, rColor, rName } from '../ui/items';
import { toast } from '../ui/toast';
import type { Cleanup } from './page';

// ------------------------------------------------------------------ settings

type Mode = 'all' | 'tier' | 'real' | 'gold';
type FloatMode = 'range' | 'fn' | 'fix';
interface Cfg { n: number; mode: Mode; rar: Rarity[]; fmode: FloatMode; fix: number; st: number; inv: boolean; instant: boolean }
const CFG_KEY = 'csgambler.brunnen';
const DEF: Cfg = { n: 50, mode: 'all', rar: [...RARITIES], fmode: 'range', fix: 0.01, st: 10, inv: true, instant: false };
function loadCfg(): Cfg {
  try {
    const o = JSON.parse(sessionStorage.getItem(CFG_KEY) ?? 'null') as Partial<Cfg> | null;
    if (o && typeof o === 'object') {
      return {
        n: clamp(Math.round(Number(o.n) || DEF.n), 1, 500),
        mode: (['all', 'tier', 'real', 'gold'] as Mode[]).includes(o.mode as Mode) ? (o.mode as Mode) : DEF.mode,
        rar: Array.isArray(o.rar) ? RARITIES.filter((r) => o.rar!.includes(r)) : DEF.rar,
        fmode: (['range', 'fn', 'fix'] as FloatMode[]).includes(o.fmode as FloatMode) ? (o.fmode as FloatMode) : DEF.fmode,
        fix: clamp(Number(o.fix) || 0, 0, 1),
        st: clamp(Number(o.st) || 0, 0, 100),
        inv: o.inv !== false,
        instant: o.instant === true,
      };
    }
  } catch { /* defaults */ }
  return { ...DEF, rar: [...DEF.rar] };
}
const saveCfg = (c: Cfg) => { try { sessionStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch { /* ignore */ } };

// ------------------------------------------------------------------ the draw

const POOL = new Map<Rarity, SkinDef[]>();
for (const s of SKINS) { const a = POOL.get(s.rarity) ?? []; a.push(s); POOL.set(s.rarity, a); }
const PRESENT = RARITIES.filter((r) => (POOL.get(r)?.length ?? 0) > 0);

/** Case-like odds over every tier the catalog has: 0.26 % ★, then 0.64 / 3.2 / 15.98 %, the rest 79.92 % on a 5:1 ladder. */
const REAL: Partial<Record<Rarity, number>> = (() => {
  const w: Partial<Record<Rarity, number>> = {};
  const normal = PRESENT.filter((r) => r !== 'gold').reverse();
  const top = [0.64, 3.2, 15.98];
  normal.slice(0, 3).forEach((r, i) => (w[r] = top[i]));
  const rest = normal.slice(3);
  const raw = rest.map((_, i) => Math.pow(5, i));
  const sum = raw.reduce((a, b) => a + b, 0);
  rest.forEach((r, i) => (w[r] = (raw[i] / sum) * 79.92));
  if (PRESENT.includes('gold')) w.gold = 0.26;
  return w;
})();

/** Chance per rarity for the current settings (sum 1, or empty when nothing can come out). */
function chances(c: Cfg): Map<Rarity, number> {
  const out = new Map<Rarity, number>();
  const rs = c.mode === 'gold' ? (['gold'] as Rarity[]) : PRESENT.filter((r) => c.rar.includes(r));
  let sum = 0;
  for (const r of rs) {
    const w = c.mode === 'all' ? POOL.get(r)?.length ?? 0 : c.mode === 'real' ? REAL[r] ?? 0 : 1;
    if (w > 0) { out.set(r, w); sum += w; }
  }
  out.forEach((w, r) => out.set(r, w / sum));
  return out;
}

function pickRarity(ch: Map<Rarity, number>): Rarity {
  let x = Math.random();
  let last: Rarity = 'milspec';
  for (const [r, p] of ch) { last = r; x -= p; if (x <= 0) return r; }
  return last;
}

function rollItem(c: Cfg, ch: Map<Rarity, number>): ItemInstance {
  const pool = POOL.get(pickRarity(ch))!;
  const skin = pool[Math.floor(Math.random() * pool.length)];
  let f: number | undefined;
  if (c.fmode === 'fn') { const hi = Math.min(skin.floatMax, 0.07); f = hi > skin.floatMin ? skin.floatMin + Math.random() * (hi - skin.floatMin) : skin.floatMin; }
  else if (c.fmode === 'fix') f = clamp(c.fix, skin.floatMin, skin.floatMax);
  const it = makeItem(skin, 'Zauberbrunnen', f);
  it.statTrak = skin.rarity !== 'gold' && Math.random() * 100 < c.st;
  return it;
}

/** Total show time for n items: 1 → instant-ish, 10 → ~1 s, 100 → ~4.5 s, 500 → ~12 s. */
const showMs = (n: number) => 260 * Math.pow(n, 0.62);

// ------------------------------------------------------------------ particles (fixed pool)

const PAL = [...RARITIES.map((r) => rColor(r)), '#8fe6ff', '#ffffff', '#ff8a1f', '#a58bff'];
const C_WATER = RARITIES.length, C_WHITE = C_WATER + 1, C_HOT = C_WATER + 2, C_VIOLET = C_WATER + 3;
const rIdx = (r: Rarity) => RARITIES.indexOf(r);

class Pool {
  n = 0;
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; life: Float32Array; max: Float32Array; size: Float32Array; g: Float32Array;
  kind: Uint8Array; col: Uint8Array;
  constructor(public cap: number) {
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.vx = new Float32Array(cap); this.vy = new Float32Array(cap);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.size = new Float32Array(cap); this.g = new Float32Array(cap);
    this.kind = new Uint8Array(cap); this.col = new Uint8Array(cap);
  }
  /** kind 0 = glowing mote, 1 = spark streak, 2 = water drop. */
  add(kind: number, x: number, y: number, vx: number, vy: number, max: number, size: number, col: number, g: number) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.kind[i] = kind; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = 0; this.max[i] = max; this.size[i] = size; this.col[i] = col; this.g[i] = g;
  }
  step(dt: number) {
    for (let i = 0; i < this.n; ) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) {
        const j = --this.n; // swap-remove
        this.kind[i] = this.kind[j]; this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
        this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j]; this.col[i] = this.col[j]; this.g[i] = this.g[j];
        continue;
      }
      this.vy[i] += this.g[i] * dt;
      if (this.kind[i] === 1) { this.vx[i] *= 1 - 1.6 * dt; this.vy[i] *= 1 - 0.8 * dt; }
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      i++;
    }
  }
}

/** Small radial glow sprites, one per palette colour (drawn with drawImage instead of shadowBlur). */
const sprites: HTMLCanvasElement[] = [];
function sprite(ci: number): HTMLCanvasElement {
  let s = sprites[ci];
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 64;
  const g = s.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, PAL[ci]);
  gr.addColorStop(0.45, hexA(PAL[ci], 0.35));
  gr.addColorStop(1, hexA(PAL[ci], 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  sprites[ci] = s;
  return s;
}
function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ------------------------------------------------------------------ lightning

interface Bolt { x0: number; y0: number; x1: number; y1: number; fly: Flyer | null; life: number; max: number; col: number; w: number; pts: Float32Array; np: number; jit: number }
const BOLT_PTS = 33;
function shapeBolt(b: Bolt) {
  // midpoint displacement into a fixed buffer (no allocation)
  const p = b.pts;
  const n = BOLT_PTS - 1;
  p[0] = b.x0; p[1] = b.y0; p[n * 2] = b.x1; p[n * 2 + 1] = b.y1;
  const len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
  for (let step = n; step > 1; step >>= 1) {
    const half = step >> 1;
    const amp = (len * 0.32 * step) / n;
    for (let i = half; i < n; i += step) {
      const a = i - half, c = i + half;
      const ax = p[a * 2], ay = p[a * 2 + 1], cx = p[c * 2], cy = p[c * 2 + 1];
      const dx = cx - ax, dy = cy - ay, dl = Math.hypot(dx, dy) || 1;
      const off = (Math.random() - 0.5) * amp;
      p[i * 2] = (ax + cx) / 2 - (dy / dl) * off;
      p[i * 2 + 1] = (ay + cy) / 2 + (dx / dl) * off;
    }
  }
  b.np = BOLT_PTS;
}

// ------------------------------------------------------------------ flying items

interface Flyer { item: ItemInstance; r: Rarity; ci: number; img: HTMLImageElement | null; x: number; y: number; vx: number; vy: number; rot: number; vr: number; t: number; big: number; done: boolean }
const ART_W = 96, ART_H = 56;
/**
 * Art of a flying item: one render per skin (fixed float and seed), so a show of 500 items asks
 * the art workers for at most one picture per skin and a second show for none. The grid cards
 * show the exact item.
 */
function flyArt(it: ItemInstance) {
  const s = skinById(it.skin);
  const f = s ? Math.min((s.floatMin + s.floatMax) / 2, 0.1) : 0.1;
  return { skin: it.skin, float: f, seed: 7, width: ART_W, height: ART_H, statTrak: false };
}

// ------------------------------------------------------------------ page

export function fountainPage(root: HTMLElement): Cleanup {
  const cfg = loadCfg();
  const reduced = reducedMotion();
  const pf = clamp(M.num('fx.particles'), 0, 4);
  root.classList.add('fb-page');
  root.innerHTML = `
  <div class="fb-head"><div><h1>Zauberbrunnen</h1><p>Stell ein, wie viele Items rauskommen sollen, und wirf ihn an. Es kann alles dabei sein.</p></div><span class="fb-dev mono">DEV</span></div>
  <div class="fb-stage"><div class="fb-glow" aria-hidden="true"></div><canvas class="fb-cv" aria-hidden="true"></canvas><div class="fb-hud mono" aria-live="off"></div><div class="fb-hint">Bereit</div></div>
  <section class="fb-ctl" aria-label="Brunnen einstellen">
    <div class="fb-box fb-num">
      <span class="lbl">Anzahl</span>
      <div class="fb-numrow"><input class="inp mono fb-n" type="number" min="1" max="500" step="1" inputmode="numeric" aria-label="Anzahl Items"><input class="fb-range fb-nr" type="range" min="1" max="500" step="1" aria-label="Anzahl Items Regler"></div>
      <div class="chips fb-pre">${[1, 10, 50, 100, 500].map((v) => `<button type="button" class="chip" data-n="${v}">${v}</button>`).join('')}</div>
    </div>
    <div class="fb-box fb-what">
      <span class="lbl">Was kann rauskommen</span>
      <div class="seg fb-mode" role="radiogroup" aria-label="Verteilung">${([['all', 'Alles'], ['tier', 'Jede Stufe gleich'], ['real', 'Echte Chancen'], ['gold', 'Nur Gold']] as [Mode, string][]).map(([v, t]) => `<button type="button" class="seg-b" role="radio" data-m="${v}">${t}</button>`).join('')}</div>
      <div class="chips fb-rar">${PRESENT.map((r) => `<button type="button" class="chip rc" data-r="${r}" style="--rc:${rColor(r)}"><i></i>${esc(rName(r).replace('★ ', '★ '))}<small class="mono"></small></button>`).join('')}</div>
    </div>
    <div class="fb-box fb-more">
      <span class="lbl">Float</span>
      <div class="seg fb-fmode" role="radiogroup" aria-label="Float">${([['range', 'Zufällig'], ['fn', 'Nur FN'], ['fix', 'Fest']] as [FloatMode, string][]).map(([v, t]) => `<button type="button" class="seg-b" role="radio" data-f="${v}">${t}</button>`).join('')}</div>
      <input class="inp mono fb-fix" type="number" min="0" max="1" step="0.0001" aria-label="Fester Float">
      <label class="fb-st"><span class="lbl">StatTrak-Chance</span><input class="fb-range fb-stv" type="range" min="0" max="100" step="1" aria-label="StatTrak-Chance"><output class="mono"></output></label>
      <div class="fb-tg">
        <label class="fb-sw"><input type="checkbox" class="fb-inv"><span></span>Ins Inventar legen</label>
        <label class="fb-sw"><input type="checkbox" class="fb-inst"><span></span>Sofort</label>
      </div>
    </div>
    <div class="fb-go"><button type="button" class="btn primary xl fb-start"><span class="fb-spark" aria-hidden="true">✺</span><span class="fb-start-t">Brunnen anwerfen</span></button><button type="button" class="btn ghost fb-skip" hidden>Überspringen</button></div>
  </section>
  <section class="fb-loot" aria-label="Ausbeute" hidden>
    <div class="fb-lhead"><h2>Ausbeute</h2><div class="fb-acts"><button type="button" class="btn cash fb-sell">Alles verkaufen</button><button type="button" class="btn ghost fb-keep">Alles behalten</button><button type="button" class="btn ghost fb-again">Nochmal</button></div></div>
    <div class="fb-sum" aria-live="polite"><div class="fb-tiers"></div><div class="fb-tot"><span class="lbl">Gesamtwert</span><b class="mono"><span class="coin"></span><span class="fb-totv">0,00</span></b></div><div class="fb-best"><span class="lbl">Bestes Item</span><b>–</b></div></div>
    <div class="fb-grid"></div>
  </section>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector(s) as T;
  const stage = $('.fb-stage');
  const cv = $<HTMLCanvasElement>('.fb-cv');
  const glow = $('.fb-glow');
  let lastGlow = -1;
  const hud = $('.fb-hud');
  const hint = $('.fb-hint');
  const nIn = $<HTMLInputElement>('.fb-n'), nRg = $<HTMLInputElement>('.fb-nr');
  const fixIn = $<HTMLInputElement>('.fb-fix'), stRg = $<HTMLInputElement>('.fb-stv');
  const invCb = $<HTMLInputElement>('.fb-inv'), instCb = $<HTMLInputElement>('.fb-inst');
  const startBtn = $<HTMLButtonElement>('.fb-start'), startT = $('.fb-start-t'), skipBtn = $<HTMLButtonElement>('.fb-skip');
  const loot = $('.fb-loot'), grid = $('.fb-grid'), tiers = $('.fb-tiers'), totV = $('.fb-totv'), bestEl = $('.fb-best b');
  const sellBtn = $<HTMLButtonElement>('.fb-sell'), keepBtn = $<HTMLButtonElement>('.fb-keep'), againBtn = $<HTMLButtonElement>('.fb-again');

  // ---------------------------------------------------------------- controls
  const drawCtl = () => {
    nIn.value = String(cfg.n); nRg.value = String(cfg.n);
    root.querySelectorAll<HTMLElement>('.fb-pre .chip').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === cfg.n));
    root.querySelectorAll<HTMLElement>('.fb-mode .seg-b').forEach((b) => { const on = b.dataset.m === cfg.mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    root.querySelectorAll<HTMLElement>('.fb-fmode .seg-b').forEach((b) => { const on = b.dataset.f === cfg.fmode; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    const ch = chances(cfg);
    root.querySelectorAll<HTMLButtonElement>('.fb-rar .chip').forEach((b) => {
      const r = b.dataset.r as Rarity;
      b.classList.toggle('on', cfg.mode === 'gold' ? r === 'gold' : cfg.rar.includes(r));
      b.disabled = cfg.mode === 'gold';
      const p = ch.get(r) ?? 0;
      b.querySelector('small')!.textContent = p ? (p >= 0.1 ? `${(p * 100).toFixed(0)} %` : `${(p * 100).toLocaleString('de-DE', { maximumFractionDigits: p < 0.01 ? 2 : 1 })} %`) : '';
      b.setAttribute('aria-pressed', String(b.classList.contains('on')));
    });
    fixIn.hidden = cfg.fmode !== 'fix';
    if (document.activeElement !== fixIn) fixIn.value = String(cfg.fix);
    stRg.value = String(cfg.st);
    (root.querySelector('.fb-st output') as HTMLElement).textContent = `${cfg.st} %`;
    invCb.checked = cfg.inv; instCb.checked = cfg.instant;
    startBtn.disabled = !!run?.going || ch.size === 0;
    saveCfg(cfg);
  };
  const setN = (v: number) => { cfg.n = clamp(Math.round(v) || 1, 1, 500); drawCtl(); };
  nIn.addEventListener('change', () => setN(Number(nIn.value)));
  nIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { setN(Number(nIn.value)); start(); } });
  nRg.addEventListener('input', () => setN(Number(nRg.value)));
  $('.fb-pre').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-n]'); if (b) { setN(Number(b.dataset.n)); sfx.click(); } });
  $('.fb-mode').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]'); if (b) { cfg.mode = b.dataset.m as Mode; sfx.click(); drawCtl(); } });
  $('.fb-fmode').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-f]'); if (b) { cfg.fmode = b.dataset.f as FloatMode; sfx.click(); drawCtl(); } });
  $('.fb-rar').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
    if (!b || cfg.mode === 'gold') return;
    const r = b.dataset.r as Rarity;
    cfg.rar = cfg.rar.includes(r) ? cfg.rar.filter((x) => x !== r) : RARITIES.filter((x) => x === r || cfg.rar.includes(x));
    sfx.click();
    drawCtl();
  });
  fixIn.addEventListener('change', () => { cfg.fix = clamp(Number(fixIn.value.replace(',', '.')) || 0, 0, 1); drawCtl(); });
  stRg.addEventListener('input', () => { cfg.st = Number(stRg.value); drawCtl(); });
  invCb.addEventListener('change', () => { cfg.inv = invCb.checked; drawCtl(); });
  instCb.addEventListener('change', () => { cfg.instant = instCb.checked; drawCtl(); });

  // ---------------------------------------------------------------- canvas + geometry
  const ctx = cv.getContext('2d')!;
  let W = 0, H = 0, DPR = 1;
  const G = { u: 1, cx: 0, base: 0, rimY: 0, rx: 0, ry: 0, ubY: 0, uRx: 0, uRy: 0, ox: 0, oy: 0, orbR: 0 };
  let layerA: HTMLCanvasElement | null = null; // lower basin, front wall, rim
  let layerB: HTMLCanvasElement | null = null; // column, upper bowl
  let stoneTex: CanvasPattern | null = null;

  function layout() {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    DPR = Math.min(1.5, devicePixelRatio || 1) * rs;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    const u = Math.min(W / 760, H / 500);
    G.u = u; G.cx = W / 2; G.base = H - 14 * u;
    G.rimY = G.base - 112 * u; G.rx = Math.min(W / 2 - 12, 300 * u); G.ry = 42 * u;
    G.ubY = G.rimY - 168 * u; G.uRx = 116 * u; G.uRy = 19 * u;
    G.ox = G.cx; G.orbR = 15 * u; G.oy = G.ubY - 58 * u;
    stage.style.setProperty('--oy', `${Math.round(G.oy + 40 * u)}px`);
    stage.style.setProperty('--wy', `${Math.round(G.rimY + 40 * u)}px`);
    stage.style.setProperty('--wr', `${Math.round(G.rx * 1.4)}px`);
    buildLayers();
    needDraw = true;
  }

  function mkLayer(): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    const g = c.getContext('2d')!;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    return [c, g];
  }
  function brass(g: CanvasRenderingContext2D, x0: number, x1: number): CanvasGradient {
    const gr = g.createLinearGradient(x0, 0, x1, 0);
    [[0, '#3a2207'], [0.12, '#8a5416'], [0.3, '#ffd892'], [0.42, '#d39338'], [0.6, '#7a4a12'], [0.78, '#f0b860'], [0.9, '#9a6018'], [1, '#3a2207']].forEach(([o, c]) => gr.addColorStop(o as number, c as string));
    return gr;
  }
  function stone(g: CanvasRenderingContext2D, y0: number, y1: number, top = '#3a4352', bot = '#151a22'): CanvasGradient {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, top); gr.addColorStop(1, bot);
    return gr;
  }
  function texture(g: CanvasRenderingContext2D) {
    if (!stoneTex) {
      const t = document.createElement('canvas');
      t.width = t.height = 96;
      const tg = t.getContext('2d')!;
      for (let i = 0; i < 520; i++) {
        tg.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${Math.random() * 0.06})` : `rgba(0,0,0,${Math.random() * 0.22})`;
        tg.fillRect(Math.random() * 96, Math.random() * 96, 1 + Math.random() * 2.5, 1 + Math.random() * 1.5);
      }
      stoneTex = g.createPattern(t, 'repeat');
    }
    g.save(); g.fillStyle = stoneTex!; g.fill(); g.restore();
  }
  const ell = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); };
  // Rune marks on the walls: a few strokes each, seeded so they stay put.
  const RUNES: number[][] = Array.from({ length: 11 }, (_, i) => { let s = (i + 3) * 9301; const rnd = () => ((s = (s * 49297 + 233280) % 233280) / 233280); return Array.from({ length: 3 + (i % 2) }, () => [rnd(), rnd(), rnd(), rnd()]).flat(); });
  function runePath(g: CanvasRenderingContext2D, k: number, x: number, y: number, sz: number) {
    const r = RUNES[k % RUNES.length];
    g.moveTo(x, y - sz); g.lineTo(x, y + sz);
    for (let i = 0; i < r.length; i += 4) {
      g.moveTo(x + (r[i] - 0.5) * sz * 1.2, y + (r[i + 1] - 0.5) * sz * 2);
      g.lineTo(x + (r[i + 2] - 0.5) * sz * 1.2, y + (r[i + 3] - 0.5) * sz * 2);
    }
  }
  const runeSpots: { x: number; y: number; s: number }[] = [];

  let rectA = [0, 0, 1, 1], rectB = [0, 0, 1, 1];
  const crop = (x: number, y: number, w: number, h: number) => { const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y)); return [x0, y0, Math.max(1, Math.min(W, Math.ceil(x + w)) - x0), Math.max(1, Math.min(H, Math.ceil(y + h)) - y0)]; };
  const blit = (c: HTMLCanvasElement, r: number[]) => ctx.drawImage(c, r[0] * DPR, r[1] * DPR, r[2] * DPR, r[3] * DPR, r[0], r[1], r[2], r[3]);
  function buildLayers() {
    const { u, cx, base, rimY, rx, ry, ubY, uRx, uRy } = G;
    // ---- layer A: step, front wall, rim, inner shadow
    const [a, g] = mkLayer();
    // floor shadow
    const sh = g.createRadialGradient(cx, base, 0, cx, base, rx * 1.3);
    sh.addColorStop(0, 'rgba(0,0,0,.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.save(); g.translate(cx, base); g.scale(1, 0.18); g.beginPath(); g.arc(0, 0, rx * 1.3, 0, Math.PI * 2); g.restore(); g.fill();
    // step (a low disc under the basin)
    const sRx = rx * 1.07, sRy = ry * 0.95, sY = base - 16 * u;
    g.beginPath(); g.ellipse(cx, sY, sRx, sRy, 0, 0, Math.PI); g.lineTo(cx - sRx, sY); g.ellipse(cx, sY + 12 * u, sRx, sRy, 0, Math.PI, 0, true); g.closePath();
    g.beginPath(); g.moveTo(cx - sRx, sY); g.ellipse(cx, sY, sRx, sRy, 0, Math.PI, 0, true); g.lineTo(cx + sRx, sY + 12 * u); g.ellipse(cx, sY + 12 * u, sRx, sRy, 0, 0, Math.PI); g.closePath();
    g.fillStyle = stone(g, sY, sY + sRy + 12 * u, '#262d38', '#0d1015'); g.fill(); texture(g);
    ell(g, cx, sY, sRx, sRy); g.fillStyle = stone(g, sY - sRy, sY + sRy, '#2c3441', '#1b2029'); g.fill(); texture(g);
    g.lineWidth = 1.5 * u; g.strokeStyle = 'rgba(255,177,94,.25)'; ell(g, cx, sY, sRx, sRy); g.stroke();
    // front wall: between the rim's lower half and a narrower bottom curve
    const bY = base - 44 * u, bRx = rx * 0.9, bRy = ry * 0.95;
    g.beginPath();
    g.ellipse(cx, rimY, rx, ry, 0, Math.PI, 0, true); // left → right along the front of the rim
    g.lineTo(cx + bRx, bY);
    g.ellipse(cx, bY, bRx, bRy, 0, 0, Math.PI); // right → left along the bottom
    g.closePath();
    const wall = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
    wall.addColorStop(0, '#11151b'); wall.addColorStop(0.3, '#2f3846'); wall.addColorStop(0.55, '#3a4454'); wall.addColorStop(0.85, '#1d232c'); wall.addColorStop(1, '#0e1116');
    g.fillStyle = wall; g.fill(); texture(g);
    // vertical shading on the wall
    const vs = g.createLinearGradient(0, rimY, 0, bY + bRy);
    vs.addColorStop(0, 'rgba(120,110,255,.10)'); vs.addColorStop(0.6, 'rgba(0,0,0,0)'); vs.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = vs; g.fill();
    // brass band low on the wall
    g.save(); g.clip();
    g.lineWidth = 5 * u; g.strokeStyle = brass(g, cx - rx, cx + rx);
    g.beginPath(); g.ellipse(cx, bY - 12 * u, bRx * 1.02, bRy, 0, 0, Math.PI); g.stroke();
    g.lineWidth = 2 * u;
    g.beginPath(); g.ellipse(cx, rimY + 18 * u, rx * 0.985, ry, 0, 0.05, Math.PI - 0.05); g.stroke();
    g.restore();
    // rune spots along the wall (glow added per frame)
    runeSpots.length = 0;
    for (let i = 0; i < 9; i++) {
      const th = Math.PI * (0.16 + (0.68 * i) / 8);
      const x = cx + Math.cos(th) * rx * 0.93;
      const y = (rimY + Math.sin(th) * ry + bY + Math.sin(th) * bRy) / 2 + 3 * u;
      const s = 8 * u * (0.65 + 0.35 * Math.sin(th));
      runeSpots.push({ x, y, s });
    }
    g.beginPath(); runeSpots.forEach((p, i) => runePath(g, i, p.x, p.y, p.s));
    g.lineWidth = 1.6 * u; g.lineCap = 'round'; g.strokeStyle = 'rgba(255,138,31,.35)'; g.stroke();
    // rim: thick brass-capped stone ring
    ell(g, cx, rimY, rx, ry); g.fillStyle = stone(g, rimY - ry, rimY + ry, '#4a5466', '#232a35'); g.fill(); texture(g);
    ell(g, cx, rimY + 2 * u, rx * 0.95, ry * 0.86); g.fillStyle = '#0a0c14'; g.fill(); // inner far wall (water drawn over it)
    g.lineWidth = 3 * u; g.strokeStyle = brass(g, cx - rx, cx + rx); ell(g, cx, rimY, rx - 1.5 * u, ry - 1.5 * u); g.stroke();
    g.lineWidth = 1.2 * u; g.strokeStyle = 'rgba(255,220,160,.35)'; ell(g, cx, rimY + 2 * u, rx * 0.95, ry * 0.86); g.stroke();
    layerA = a;
    rectA = crop(cx - rx * 1.32, rimY - ry - 4 * u, rx * 2.64, H);

    // ---- layer B: column + upper bowl + finial
    const [b, h] = mkLayer();
    const colBot = rimY + 6 * u, colTop = ubY + 40 * u;
    // plinth in the water
    ell(h, cx, colBot, 46 * u, 11 * u); h.fillStyle = stone(h, colBot - 11 * u, colBot + 11 * u, '#3b4453', '#151a22'); h.fill();
    h.beginPath(); h.moveTo(cx - 40 * u, colBot); h.lineTo(cx - 40 * u, colBot - 14 * u); h.ellipse(cx, colBot - 14 * u, 40 * u, 9 * u, 0, Math.PI, 0, true); h.lineTo(cx + 40 * u, colBot); h.ellipse(cx, colBot, 40 * u, 9 * u, 0, 0, Math.PI); h.closePath();
    h.fillStyle = (() => { const gr = h.createLinearGradient(cx - 40 * u, 0, cx + 40 * u, 0); gr.addColorStop(0, '#12161c'); gr.addColorStop(0.4, '#465063'); gr.addColorStop(1, '#141820'); return gr; })(); h.fill(); texture(h);
    // shaft (tapered)
    h.beginPath();
    h.moveTo(cx - 25 * u, colBot - 16 * u); h.quadraticCurveTo(cx - 16 * u, (colBot + colTop) / 2, cx - 17 * u, colTop);
    h.lineTo(cx + 17 * u, colTop); h.quadraticCurveTo(cx + 16 * u, (colBot + colTop) / 2, cx + 25 * u, colBot - 16 * u); h.closePath();
    const sg = h.createLinearGradient(cx - 25 * u, 0, cx + 25 * u, 0);
    sg.addColorStop(0, '#10141a'); sg.addColorStop(0.35, '#4d586b'); sg.addColorStop(0.55, '#37404f'); sg.addColorStop(1, '#0f1217');
    h.fillStyle = sg; h.fill(); texture(h);
    // brass rings on the shaft
    for (const f of [0.18, 0.55, 0.9]) {
      const y = colBot - 16 * u + (colTop - colBot + 16 * u) * f;
      const hw = 25 * u + (17 - 25) * u * f + 2 * u;
      h.beginPath(); h.ellipse(cx, y, hw, 3.2 * u, 0, 0, Math.PI); h.lineWidth = 3.2 * u; h.strokeStyle = brass(h, cx - hw, cx + hw); h.stroke();
    }
    // upper bowl body
    h.beginPath();
    h.ellipse(cx, ubY, uRx, uRy, 0, Math.PI, 0, true);
    h.bezierCurveTo(cx + uRx * 0.95, ubY + 30 * u, cx + 34 * u, ubY + 40 * u, cx + 20 * u, ubY + 46 * u);
    h.lineTo(cx - 20 * u, ubY + 46 * u);
    h.bezierCurveTo(cx - 34 * u, ubY + 40 * u, cx - uRx * 0.95, ubY + 30 * u, cx - uRx, ubY);
    h.closePath();
    const bg = h.createLinearGradient(cx - uRx, 0, cx + uRx, 0);
    bg.addColorStop(0, '#0f1217'); bg.addColorStop(0.32, '#465165'); bg.addColorStop(0.5, '#3a4455'); bg.addColorStop(1, '#0e1116');
    h.fillStyle = bg; h.fill(); texture(h);
    h.save(); h.clip();
    h.lineWidth = 4 * u; h.strokeStyle = brass(h, cx - uRx, cx + uRx);
    h.beginPath(); h.ellipse(cx, ubY + 12 * u, uRx * 0.93, uRy, 0, 0.1, Math.PI - 0.1); h.stroke();
    h.restore();
    // upper rim + inner
    ell(h, cx, ubY, uRx, uRy); h.fillStyle = stone(h, ubY - uRy, ubY + uRy, '#56617a', '#262d39'); h.fill();
    ell(h, cx, ubY + 1.5 * u, uRx * 0.92, uRy * 0.8); h.fillStyle = '#0a0c14'; h.fill();
    h.lineWidth = 2.6 * u; h.strokeStyle = brass(h, cx - uRx, cx + uRx); ell(h, cx, ubY, uRx - 1.3 * u, uRy - 1.3 * u); h.stroke();
    layerB = b;
    rectB = crop(cx - uRx - 4 * u, ubY - uRy - 4 * u, uRx * 2 + 8 * u, rimY + 24 * u - (ubY - uRy - 4 * u));
  }

  // finial + orb holder are drawn per frame after the upper water (cheap paths)
  function drawFinial(g: CanvasRenderingContext2D) {
    const { u, cx, ubY, oy, orbR } = G;
    g.beginPath();
    g.moveTo(cx - 13 * u, ubY + 3 * u); g.quadraticCurveTo(cx - 6 * u, ubY - 18 * u, cx - 6 * u, oy + orbR * 0.7);
    g.lineTo(cx + 6 * u, oy + orbR * 0.7); g.quadraticCurveTo(cx + 6 * u, ubY - 18 * u, cx + 13 * u, ubY + 3 * u); g.closePath();
    g.fillStyle = brassF ??= brass(g, cx - 13 * u, cx + 13 * u); g.fill();
    // crown claws holding the orb
    g.beginPath();
    for (const s of [-1, 1]) { g.moveTo(cx + s * 4 * u, oy + orbR * 0.8); g.quadraticCurveTo(cx + s * (orbR + 7 * u), oy + 2 * u, cx + s * (orbR * 0.75), oy - orbR * 0.7); }
    g.lineWidth = 2.6 * u; g.strokeStyle = brassF; g.stroke();
  }
  let brassF: CanvasGradient | null = null;

  // ---------------------------------------------------------------- simulation state
  const parts = new Pool(Math.round(clamp(1400 * Math.max(pf, 0.25), 300, 4000)));
  const bolts: Bolt[] = [];
  const BOLT_CAP = 16;
  const flyers: Flyer[] = [];
  const FLY_CAP = 64;
  // Adaptive quality: when frames get slow, fewer particles and glows (the items always fly).
  let q = 1, avgFt = 16.7, cardsAt = 0, slowFor = 0;
  // Resolution scale: a weak (software-rendered) machine still gets a smooth show at a slightly softer canvas.
  let rs = 1;
  let t = 0, last = performance.now(), raf = 0, needDraw = true, visible = true, dead = false;
  let surge = 0, flash = 0, tint = PAL[C_VIOLET], tintCi = C_VIOLET, pulse = 0;

  function addBolt(x0: number, y0: number, x1: number, y1: number, ci: number, w: number, max: number, fly: Flyer | null = null) {
    if (bolts.length >= BOLT_CAP) bolts.shift();
    const b: Bolt = { x0, y0, x1, y1, fly, life: 0, max, col: ci, w, pts: new Float32Array(BOLT_PTS * 2), np: 0, jit: 0 };
    shapeBolt(b);
    bolts.push(b);
  }
  const emitN = (n: number) => { const v = n * pf * q; return Math.floor(v) + (Math.random() < v % 1 ? 1 : 0); };

  // ---------------------------------------------------------------- run
  interface Run { items: ItemInstance[]; vals: Map<string, number>; launched: number; landed: number; going: boolean; inv: boolean; added: Set<string>; state: 'open' | 'sold' | 'kept'; counts: Map<Rarity, number>; total: number; best: ItemInstance | null; acc: number; interval: number; delay: number; anim: boolean }
  let run: Run | null = null;
  const pending: ItemInstance[] = [];
  let commitAt = 0, sumAt = 0, dirtyInv = false;

  function start() {
    const ch = chances(cfg);
    if (!ch.size || run?.going) return;
    if (run && run.state === 'open' && !run.inv) run.state = 'kept'; // previous unlanded show: just drop it
    const n = cfg.n;
    const items = Array.from({ length: n }, () => rollItem(cfg, ch));
    const vals = new Map(items.map((it) => [it.uid, itemValue(it)]));
    const anim = !cfg.instant && !reduced;
    run = { items, vals, launched: 0, landed: 0, going: true, inv: cfg.inv, added: new Set(), state: 'open', counts: new Map(), total: 0, best: null, acc: 0, interval: anim ? showMs(n) / n : 0, delay: anim ? 650 : 0, anim };
    pending.length = 0;
    artIO.disconnect();
    grid.replaceChildren();
    grid.classList.remove('sold');
    loot.hidden = false;
    drawSum(true);
    drawCtl();
    startBtn.classList.add('going');
    skipBtn.hidden = !anim;
    hint.textContent = '';
    sfx.surge();
    pulse = 1;
    if (anim) {
      // the art of the first items starts rendering during the wind-up
      for (const it of items.slice(0, 24)) void skinURL(flyArt(it));
    } else {
      // Sofort / reduced motion: everything lands at once, one splash
      for (const it of items) land(it);
      run.launched = n;
      if (!reduced) { splashBurst(); if (run.counts.get('gold')) goldFx(null); }
      if (run.counts.get('gold')) sfx.goldChime(); else sfx.splash();
      finish();
    }
    kick();
  }

  function launch(it: ItemInstance) {
    const r = rarOf(it);
    const ci = rIdx(r);
    const { u, ox, oy, orbR } = G;
    const side = Math.random() < 0.5 ? -1 : 1;
    const f: Flyer = {
      item: it, r, ci, img: null, x: ox, y: oy - orbR, rot: 0, vr: (Math.random() - 0.5) * 5, t: 0, big: r === 'gold' ? 1.45 : r === 'covert' ? 1.15 : 1, done: false,
      vx: side * (90 + Math.random() * 330) * u, vy: -(420 + Math.random() * 200) * u,
    };
    const o = flyArt(it);
    const now = skinURLNow(o);
    const img = new Image();
    img.decoding = 'async';
    if (now) img.src = now; else skinURL(o).then((url) => { if (url) img.src = url; }, () => undefined);
    f.img = img;
    flyers.push(f);
    tint = PAL[ci]; tintCi = ci;
    // crackle at the orb: a short bolt along the launch direction plus sparks
    if (q > 0.6 || rIdx(r) >= rIdx('restricted') || flyers.length < 20) addBolt(ox, oy - orbR * 0.4, ox + f.vx * 0.12, oy + f.vy * 0.12, ci, r === 'gold' ? 3 : 1.6, 0.16);
    if (rIdx(r) >= rIdx('covert') || (q > 0.6 && r === 'classified')) addBolt(ox, oy, f.x, f.y, ci, 2, 0.35, f);
    for (let i = 0, k = emitN(r === 'gold' ? 46 : 9 + rIdx(r) * 2); i < k; i++) {
      const a = Math.random() * Math.PI * 2, v = (120 + Math.random() * 380) * u;
      parts.add(1, ox, oy - orbR * 0.5, Math.cos(a) * v, Math.sin(a) * v - 80 * u, 0.25 + Math.random() * 0.4, 1 + Math.random() * 1.6, Math.random() < 0.3 ? C_WHITE : ci, 500 * u);
    }
    if (r === 'gold') {
      // A gold right after another gets a smaller burst, so a gold-only show does not turn into a white-out.
      const big = performance.now() - lastGold > 700;
      lastGold = performance.now();
      goldFx(f, big);
      if (big) sfx.goldChime(); else sfx.zap(r);
    } else sfx.zap(r);
    pulse = Math.min(1, pulse + 0.35);
  }

  let lastGold = 0;
  function goldFx(f: Flyer | null, big = true) {
    const { u, ox, oy } = G;
    flash = Math.max(flash, big ? 1 : 0.3);
    for (let i = 0, nb = big ? 5 : 1; i < nb; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      addBolt(ox, oy, ox + Math.cos(a) * 260 * u, oy + Math.sin(a) * 260 * u, rIdx('gold'), 3.2, 0.32 + Math.random() * 0.15);
    }
    if (f) addBolt(ox, oy, f.x, f.y, C_WHITE, 3, 0.5, f);
    for (let i = 0, k = emitN(big ? 70 : 16); i < k; i++) {
      const a = Math.random() * Math.PI * 2, v = (60 + Math.random() * 300) * u;
      parts.add(0, ox, oy, Math.cos(a) * v, Math.sin(a) * v, 0.6 + Math.random() * 0.9, 5 + Math.random() * 8, Math.random() < 0.5 ? rIdx('gold') : C_WHITE, 120 * u);
    }
    if (!reduced && big) { stage.classList.remove('jolt'); void stage.offsetWidth; stage.classList.add('jolt'); }
  }

  function splashBurst() {
    const { u, cx, rimY, ox, oy } = G;
    flash = Math.max(flash, 0.45);
    for (let i = 0, k = emitN(160); i < k; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = (200 + Math.random() * 500) * u;
      parts.add(2, ox, oy, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 0.7, 1.5 + Math.random() * 2, C_WATER, 900 * u);
    }
    for (let i = 0, k = emitN(60); i < k; i++) parts.add(0, cx + (Math.random() - 0.5) * G.rx * 1.6, rimY, (Math.random() - 0.5) * 60 * u, -(40 + Math.random() * 160) * u, 0.8 + Math.random(), 4 + Math.random() * 6, Math.floor(Math.random() * RARITIES.length), -20 * u);
    for (let i = 0; i < 4; i++) addBolt(ox, oy, ox + (Math.random() - 0.5) * 400 * u, oy - Math.random() * 120 * u, Math.floor(Math.random() * RARITIES.length), 2, 0.3);
  }

  function land(it: ItemInstance) {
    const R = run!;
    R.landed++;
    const r = rarOf(it);
    R.counts.set(r, (R.counts.get(r) ?? 0) + 1);
    const v = R.vals.get(it.uid) ?? 0;
    R.total += v;
    if (!R.best || v > (R.vals.get(R.best.uid) ?? 0)) R.best = it;
    if (R.inv && !R.added.has(it.uid)) { addItem(it); R.added.add(it.uid); dirtyInv = true; }
    pending.push(it);
  }
  const rarCache = new Map<string, Rarity>();
  for (const s of SKINS) rarCache.set(s.id, s.rarity);
  const rarOf = (it: ItemInstance): Rarity => rarCache.get(it.skin) ?? 'milspec';

  function finish() {
    if (!run) return;
    run.going = false;
    if (rs < 1) { rs = 1; layout(); }
    startBtn.classList.remove('going');
    skipBtn.hidden = true;
    startT.textContent = 'Brunnen anwerfen';
    hint.textContent = `${run.landed} Items`;
    if (dirtyInv) { dirtyInv = false; commit(); }
    drawSum(true);
    drawCtl();
  }

  /** Lands everything still in the air or waiting (skip, sell during the show, leaving the page). */
  function landAll() {
    if (!run || !run.going) return;
    for (const f of flyers) if (!f.done) { f.done = true; land(f.item); }
    flyers.length = 0;
    while (run.launched < run.items.length) land(run.items[run.launched++]);
    finish();
  }

  // ---------------------------------------------------------------- loot grid + summary
  function flushCards(max: number) {
    if (!pending.length) return;
    const take = pending.splice(0, Math.min(max, pending.length));
    const frag = document.createDocumentFragment();
    const pop = run?.anim && take.length <= 4;
    for (let i = take.length - 1; i >= 0; i--) {
      const it = take[i];
      const c = lootCard(it);
      if (pop) c.classList.add('pop');
      frag.appendChild(c);
    }
    grid.prepend(frag);
  }

  // Loot cards: the same look as inventory cards, but their art loads only once a card has stayed in
  // view for a moment. New cards always enter at the top, so a looser lazy rule would render every
  // card of a long show while it is pushed down past the viewport.
  const artOf = new WeakMap<Element, { img: HTMLImageElement; it: ItemInstance; timer: number }>();
  const artIO = new IntersectionObserver((es) => {
    for (const e of es) {
      const a = artOf.get(e.target);
      if (!a) continue;
      clearTimeout(a.timer);
      if (!e.isIntersecting) continue;
      a.timer = window.setTimeout(() => {
        artIO.unobserve(e.target);
        artOf.delete(e.target);
        const o = { skin: a.it.skin, float: a.it.float, seed: a.it.seed, width: 104, height: 62, statTrak: a.it.statTrak };
        const now = skinURLNow(o);
        if (now) { a.img.src = now; a.img.classList.remove('loading'); return; }
        skinURL(o).then((u) => { if (!u || dead) return; a.img.src = u; a.img.decode().catch(() => undefined).then(() => a.img.classList.remove('loading')); }, () => undefined);
      }, run?.going ? 260 : 40);
    }
  }, { rootMargin: '120px 0px' });
  function lootCard(it: ItemInstance): HTMLElement {
    const r = rarOf(it);
    const n = names(it);
    const c = document.createElement('div');
    c.className = `icard sm r-${r}`;
    c.style.setProperty('--rc', rColor(r));
    c.dataset.uid = it.uid;
    c.title = `${it.statTrak ? 'StatTrak™ ' : ''}${n.full} · ${wearOf(it.float).name} · Float ${it.float.toFixed(6)} · Seed ${it.seed}`;
    c.innerHTML = `<div class="ic-top"><span class="ic-wear">${wearOf(it.float).short}</span>${it.statTrak ? '<span class="ic-st">ST</span>' : ''}${isRareSeed(it.seed) ? '<span class="ic-seed" title="Seltenes Muster">◆</span>' : ''}</div><div class="ic-art"></div><div class="ic-name"><small>${esc(n.weapon)}</small><b>${esc(n.skin)}</b></div><div class="ic-val"><span class="coin"></span>${fmt(run?.vals.get(it.uid) ?? itemValue(it))}</div><div class="fb-fl mono">${it.float.toFixed(6)}</div>`;
    const img = artImg(104, 62);
    img.classList.add('loading');
    c.querySelector('.ic-art')!.appendChild(img);
    artOf.set(c, { img, it, timer: 0 });
    artIO.observe(c);
    return c;
  }

  function drawSum(force = false) {
    const now = performance.now();
    if (!force && now - sumAt < 150) return;
    sumAt = now;
    if (!run) return;
    const R = run;
    tiers.innerHTML = RARITIES.filter((r) => R.counts.get(r)).map((r) => `<span class="fb-tc" style="--rc:${rColor(r)}" title="${esc(rName(r))}"><i></i><b class="mono">${R.counts.get(r)}</b><small>${esc(rName(r).replace('★ ', ''))}</small></span>`).join('') || '<span class="muted">Noch nichts</span>';
    totV.textContent = fmt(R.total);
    if (R.best) {
      const r = rarOf(R.best);
      const b = R.best;
      const extra = [insiderLabel(b.seed), lowFloatBonus(b.float, b.statTrak, skinById(b.skin)) > 1.05 ? `Top-Float ${b.float.toFixed(6)}` : ''].filter(Boolean).join(' · ');
      bestEl.innerHTML = `<span style="color:${rColor(r)}">${b.statTrak ? 'StatTrak™ ' : ''}${esc(names(b).full)}</span> <span class="mono">${fmt(R.vals.get(b.uid) ?? 0)}</span>${extra ? `<small>${esc(extra)}</small>` : ''}`;
    } else bestEl.textContent = '–';
    hud.textContent = R.going ? `${R.landed} / ${R.items.length}` : '';
    if (R.going) startT.textContent = `Britzelt … ${R.landed}/${R.items.length}`;
    const open = R.state === 'open';
    sellBtn.disabled = !open || !R.items.length;
    keepBtn.disabled = !open || !R.items.length;
    const sellV = sellValue(R.going ? R.total : R.items.reduce((a, it) => a + (R.vals.get(it.uid) ?? 0), 0));
    sellBtn.innerHTML = R.state === 'sold' ? 'Verkauft' : `Alles verkaufen <span class="mono">${fmt(sellV)}</span>`;
    keepBtn.textContent = R.state === 'kept' ? (R.inv ? 'Im Inventar' : 'Behalten') : R.inv ? 'Alles behalten' : 'Alles behalten';
  }

  sellBtn.addEventListener('click', () => {
    if (!run || run.state !== 'open') return;
    landAll();
    flushCards(Infinity);
    // items that are not in the inventory yet go in first, so selling runs through the normal path
    const inInv = new Set(save.inv.map((i) => i.uid));
    for (const it of run.items) if (!inInv.has(it.uid) && !run.added.has(it.uid)) { addItem(it); run.added.add(it.uid); }
    const uids = run.items.map((i) => i.uid).filter((u) => run!.added.has(u));
    const v = sellItems(uids);
    run.state = 'sold';
    grid.classList.add('sold');
    sfx.sell();
    toast('Verkauft', `${uids.length} Items · +${fmt(v)} Coins`, 'good', '¢');
    drawSum(true);
  });
  keepBtn.addEventListener('click', () => {
    if (!run || run.state !== 'open') return;
    landAll();
    for (const it of run.items) if (!run.added.has(it.uid)) { addItem(it); run.added.add(it.uid); }
    run.state = 'kept';
    commit();
    sfx.coin();
    toast('Ins Inventar gelegt', `${run.items.length} Items`, 'good');
    drawSum(true);
  });
  againBtn.addEventListener('click', () => {
    if (run?.going) return;
    stage.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    start();
  });
  startBtn.addEventListener('click', start);
  skipBtn.addEventListener('click', () => { landAll(); sfx.splash(); });

  // ---------------------------------------------------------------- frame
  function kick() { if (!raf && !dead) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  function frame(now: number) {
    raf = 0;
    if (dead) return;
    const ft = now - last;
    if (ft < 200) {
      avgFt = avgFt * 0.9 + ft * 0.1;
      q = avgFt > 21 ? Math.max(0.25, q - 0.03) : avgFt < 17.5 ? Math.min(1, q + 0.01) : q;
      slowFor = q <= 0.3 && avgFt > 24 ? slowFor + ft : 0;
      if (slowFor > 700 && rs > 0.6) { rs = Math.max(0.6, rs * 0.8); slowFor = 0; avgFt = 16.7; layout(); }
    }
    const dtR = Math.min(0.05, ft / 1000);
    last = now;
    const sp = M.anim();
    const dt = dtR * sp;
    t += dt;
    const R = run;

    // emission
    if (R && R.going && R.anim) {
      if (R.delay > 0) R.delay -= dt * 1000;
      else {
        R.acc += dt * 1000;
        while (R.launched < R.items.length && R.acc >= R.interval && flyers.length < FLY_CAP) {
          R.acc -= R.interval;
          launch(R.items[R.launched++]);
        }
        if (R.launched >= R.items.length && !flyers.length) finish();
      }
    }
    const target = R && R.going ? 1 : 0;
    surge += (target - surge) * Math.min(1, dt * (target ? 3 : 1.4));
    flash = Math.max(0, flash - dt * 2.2);
    pulse = Math.max(0, pulse - dt * 1.5);

    if (!reduced) {
      // ambient: rising motes over the water, droplets from the jet, crackles at the orb
      const { u, cx, rimY, rx, ry, ox, oy, orbR } = G;
      const amb = (3.5 + surge * 9) * dt * 10;
      for (let i = 0, k = emitN(amb); i < k; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
        parts.add(0, cx + Math.cos(a) * rx * 0.85 * rr, rimY + 4 * u + Math.sin(a) * ry * 0.75 * rr, (Math.random() - 0.5) * 14 * u, -(18 + Math.random() * 46) * u, 1.2 + Math.random() * 1.6, 2.5 + Math.random() * 4, Math.random() < 0.65 ? (Math.random() < 0.5 ? C_WATER : C_VIOLET) : Math.random() < 0.5 ? C_HOT : tintCi, -6 * u);
      }
      for (let i = 0, k = emitN((3 + surge * 14) * dt * 10); i < k; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = (60 + surge * 260 + Math.random() * 120) * u;
        parts.add(2, ox, oy - orbR, Math.cos(a) * v * 0.6, Math.sin(a) * v, 0.6 + Math.random() * 0.6, 1 + Math.random() * 1.4, C_WATER, 700 * u);
      }
      if (surge > 0.2 && flyers.length < 24 && Math.random() < dt * 14 * surge) {
        const a = Math.random() * Math.PI * 2, d = (30 + Math.random() * 60) * u;
        addBolt(ox, oy, ox + Math.cos(a) * d, oy + Math.sin(a) * d * 0.8, Math.random() < 0.5 ? C_VIOLET : tintCi, 1.2, 0.09);
        if (Math.random() < 0.3) sfx.crackle(1, 0);
      }
      parts.step(dt);
      // flyers
      const bottom = H + 10 * u;
      for (const f of flyers) {
        f.t += dt;
        f.vy += 1250 * u * dt;
        f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
        if (Math.random() < pf * q * 0.5) parts.add(1, f.x, f.y, -f.vx * 0.15 + (Math.random() - 0.5) * 60 * u, -f.vy * 0.15 + (Math.random() - 0.5) * 60 * u, 0.25 + Math.random() * 0.25, 1 + Math.random(), f.ci, 200 * u);
        if (f.y > bottom || f.x < -120 * u || f.x > W + 120 * u) { f.done = true; land(f.item); }
      }
      for (let i = flyers.length - 1; i >= 0; i--) if (flyers[i].done) flyers.splice(i, 1);
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.life += dt;
        if (b.life >= b.max || (b.fly && b.fly.done)) { bolts.splice(i, 1); continue; }
        if (b.fly) { b.x1 = b.fly.x; b.y1 = b.fly.y; }
        if ((b.jit = (b.jit + 1) % 2) === 0) shapeBolt(b);
      }
    }

    // grid + bookkeeping
    if (!R?.anim) flushCards(60);
    else if (now - cardsAt > 180 || !R.going) { cardsAt = now; flushCards(Infinity); }
    if (dirtyInv && now - commitAt > 400) { commitAt = now; dirtyInv = false; commit(); }
    if (R) drawSum();

    if ((!reduced || needDraw) && visible) { draw(); needDraw = false; }
    const busy = pending.length > 0 || (R?.going ?? false) || dirtyInv;
    if (!reduced || busy) raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- draw
  function draw() {
    const g = ctx;
    const { u, cx, rimY, rx, ry, ubY, uRx, uRy, ox, oy, orbR } = G;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, W, H);
    const tw = reduced ? 0.5 : t;
    const sg = surge, pu = pulse;

    // the halo behind the fountain is a CSS layer; only its opacity changes
    const glowO = Math.min(1, 0.55 + sg * 0.35 + pu * 0.15 + flash * 0.3);
    if (Math.abs(glowO - lastGlow) > 0.015) { lastGlow = glowO; glow.style.opacity = glowO.toFixed(3); }

    // magic circle on the floor around the basin, turning slowly
    {
      const fy = G.base - 14 * u, frx = rx * 1.22, fry = ry * 1.25;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineWidth = 1.5 * u;
      g.strokeStyle = `rgba(255,150,60,${0.32 + 0.25 * sg})`;
      ell(g, cx, fy, frx, fry); g.stroke();
      g.strokeStyle = `rgba(150,120,255,${0.3 + 0.3 * sg})`;
      ell(g, cx, fy, frx * 1.06, fry * 1.06); g.stroke();
      g.beginPath();
      const rot = tw * (0.12 + 0.5 * sg);
      for (let k = 0; k < 36; k++) {
        const th = rot + (k / 36) * Math.PI * 2;
        const c = Math.cos(th), si = Math.sin(th);
        const l = k % 3 === 0 ? 0.05 : 0.025;
        g.moveTo(cx + c * frx, fy + si * fry); g.lineTo(cx + c * frx * (1 + l), fy + si * fry * (1 + l));
      }
      g.strokeStyle = `rgba(255,190,110,${0.4 + 0.3 * sg})`; g.stroke();
      g.restore();
    }
    if (layerA) blit(layerA, rectA);

    // ---- lower water (clipped to the inner ellipse)
    g.save();
    ell(g, cx, rimY + 2 * u, rx * 0.95, ry * 0.86); g.clip();
    const wY = rimY + 6 * u;
    const wg = g.createRadialGradient(cx, wY, 4 * u, cx, wY, rx);
    wg.addColorStop(0, hexA('#bdf3ff', 0.85 + sg * 0.15));
    wg.addColorStop(0.25, hexA('#59b8ff', 0.85));
    wg.addColorStop(0.6, '#4a37d8');
    wg.addColorStop(1, '#170f45');
    ell(g, cx, wY, rx * 0.95, ry * 0.84); g.fillStyle = wg; g.fill();
    g.globalCompositeOperation = 'lighter';
    // ripples
    g.lineWidth = 1.4 * u;
    for (let k = 0; k < 7; k++) {
      const ph = (tw * (0.35 + sg * 0.5) + k / 7) % 1;
      g.strokeStyle = `rgba(190,240,255,${(1 - ph) * (0.28 + sg * 0.2)})`;
      ell(g, cx, wY, (40 + ph * 0.95 * rx) * 1, (10 + ph * 0.8 * ry)); g.stroke();
    }
    // shimmer streaks
    for (let k = 0; k < 9; k++) {
      const yy = wY + (k / 8 - 0.5) * ry * 1.4;
      const off = Math.sin(tw * (0.8 + k * 0.13) + k * 1.7) * rx * 0.5;
      const len = rx * (0.12 + 0.08 * Math.sin(tw * 1.3 + k));
      g.strokeStyle = `rgba(255,255,255,${0.08 + 0.06 * Math.sin(tw * 2 + k)})`;
      g.beginPath(); g.moveTo(cx + off - len, yy); g.quadraticCurveTo(cx + off, yy - 2 * u, cx + off + len, yy); g.stroke();
    }
    // glint of the current tint
    if (sg > 0.02 || flash > 0) { g.fillStyle = hexA(tint, 0.18 * sg + flash * 0.3); ell(g, cx, wY, rx * 0.95, ry * 0.84); g.fill(); }
    g.restore();

    if (layerB) blit(layerB, rectB);

    // ---- upper water
    g.save();
    ell(g, cx, ubY + 1.5 * u, uRx * 0.92, uRy * 0.8); g.clip();
    const ug = g.createRadialGradient(cx, ubY + 2 * u, 2 * u, cx, ubY + 2 * u, uRx);
    ug.addColorStop(0, '#e2fbff'); ug.addColorStop(0.3, '#6fcaff'); ug.addColorStop(0.75, '#5440e0'); ug.addColorStop(1, '#1b1150');
    g.fillStyle = ug; g.fillRect(cx - uRx, ubY - uRy, uRx * 2, uRy * 2);
    g.globalCompositeOperation = 'lighter';
    g.lineWidth = 1.1 * u;
    for (let k = 0; k < 4; k++) {
      const ph = (tw * (0.6 + sg) + k / 4) % 1;
      g.strokeStyle = `rgba(220,250,255,${(1 - ph) * 0.35})`;
      ell(g, cx, ubY + 2 * u, 14 * u + ph * uRx * 0.85, 3 * u + ph * uRy * 0.7); g.stroke();
    }
    g.restore();

    // ---- spill curtains from the upper bowl into the lower water
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    const NC = 11;
    for (let k = 0; k < NC; k++) {
      const th = Math.PI * (0.1 + (0.8 * k) / (NC - 1));
      const x0 = cx + Math.cos(th) * uRx * 0.97, y0 = ubY + Math.sin(th) * uRy + 1.5 * u;
      const spread = 1.75 + 0.25 * sg;
      const x1 = cx + (x0 - cx) * spread, y1 = rimY + 6 * u + Math.sin(th) * ry * 0.55;
      const c1x = cx + (x0 - cx) * (1.35 + 0.2 * sg), c1y = y0 + 6 * u;
      const front = Math.sin(th);
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(c1x, c1y, x1, y1);
      g.lineWidth = (5 + 3 * sg) * u * (0.6 + 0.4 * front);
      g.strokeStyle = `rgba(120,170,255,${0.16 + 0.12 * front + 0.1 * sg})`;
      g.setLineDash([]); g.stroke();
      g.lineWidth = 1.6 * u;
      g.setLineDash([6 * u, 11 * u]);
      g.lineDashOffset = -tw * (60 + 120 * sg) * u - k * 7;
      g.strokeStyle = `rgba(225,248,255,${0.35 + 0.25 * front})`;
      g.stroke();
      // foam where it hits the water
      g.setLineDash([]);
      g.drawImage(sprite(C_WATER), x1 - 9 * u, y1 - 5 * u, 18 * u, 10 * u);
    }
    g.setLineDash([]);
    g.restore();

    // ---- finial, jet arcs and the orb
    drawFinial(g);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const jh = (34 + 120 * sg + 26 * pu + 4 * Math.sin(tw * 5)) * u;
    const top = Math.max(8 * u, oy - orbR - jh);
    // center jet
    const jg = g.createLinearGradient(0, oy, 0, top);
    jg.addColorStop(0, 'rgba(200,240,255,.9)'); jg.addColorStop(1, 'rgba(160,200,255,0)');
    g.strokeStyle = jg; g.lineWidth = (4 + 3 * sg) * u; g.lineCap = 'round';
    g.beginPath(); g.moveTo(ox, oy - orbR); g.lineTo(ox + Math.sin(tw * 3) * 1.5 * u, top); g.stroke();
    // arcs falling into the upper bowl
    g.lineWidth = 2 * u;
    for (let k = 0; k < 8; k++) {
      const side = k % 2 ? 1 : -1, j = (k >> 1) / 3;
      const ex = ox + side * uRx * (0.35 + 0.5 * j), ey = ubY + 2 * u;
      const peak = oy - orbR - jh * (0.45 + 0.35 * (1 - j));
      g.strokeStyle = `rgba(150,215,255,${0.32 + 0.2 * sg})`;
      g.setLineDash([]);
      g.beginPath(); g.moveTo(ox, oy - orbR); g.quadraticCurveTo(ox + (ex - ox) * 0.45, peak - (ey - peak) * 0.25, ex, ey); g.stroke();
      g.setLineDash([3 * u, 9 * u]); g.lineDashOffset = -tw * (80 + 160 * sg) * u - k * 5;
      g.strokeStyle = 'rgba(240,252,255,.6)'; g.stroke();
    }
    g.setLineDash([]);
    // orb
    const orbG = 1 + sg * 0.45 + pu * 0.4 + flash * 0.6;
    g.drawImage(sprite(C_VIOLET), ox - orbR * 5 * orbG, oy - orbR * 5 * orbG, orbR * 10 * orbG, orbR * 10 * orbG);
    g.drawImage(sprite(tintCi), ox - orbR * 3 * orbG, oy - orbR * 3 * orbG, orbR * 6 * orbG, orbR * 6 * orbG);
    g.globalCompositeOperation = 'source-over';
    const og = g.createRadialGradient(ox - orbR * 0.35, oy - orbR * 0.4, orbR * 0.1, ox, oy, orbR);
    og.addColorStop(0, '#ffffff'); og.addColorStop(0.35, '#c9b8ff'); og.addColorStop(0.75, '#6a4bff'); og.addColorStop(1, '#2a1680');
    g.fillStyle = og; g.beginPath(); g.arc(ox, oy, orbR, 0, Math.PI * 2); g.fill();
    g.restore();

    // ---- rune glow on the front wall
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineWidth = 1.8 * u;
    for (let i = 0; i < runeSpots.length; i++) {
      const p = runeSpots[i];
      const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(tw * 1.6 + i * 0.9)) + sg * 0.4;
      g.globalAlpha = Math.min(1, a);
      g.drawImage(sprite(C_HOT), p.x - p.s * 2.2, p.y - p.s * 2.2, p.s * 4.4, p.s * 4.4);
      g.strokeStyle = '#ffb15e';
      g.beginPath(); runePath(g, i, p.x, p.y, p.s); g.stroke();
    }
    g.globalAlpha = 1;
    g.restore();

    // ---- particles (additive)
    g.save();
    g.globalCompositeOperation = 'lighter';
    const P = parts;
    for (let i = 0; i < P.n; i++) {
      const k = P.kind[i];
      if (k === 1) continue;
      const lf = P.life[i] / P.max[i];
      const a = k === 0 ? Math.sin(lf * Math.PI) * (0.6 + 0.4 * Math.sin((P.x[i] + tw * 400) * 0.05)) : 1 - lf;
      if (a <= 0.01) continue;
      g.globalAlpha = a;
      const s = k === 0 ? P.size[i] * u : P.size[i] * u * 2.2;
      g.drawImage(sprite(P.col[i]), P.x[i] - s, P.y[i] - s, s * 2, s * 2);
    }
    g.globalAlpha = 0.9;
    // sparks as streaks, one path per colour
    g.lineCap = 'round';
    for (let c = 0; c < PAL.length; c++) {
      let any = false;
      g.beginPath();
      for (let i = 0; i < P.n; i++) {
        if (P.kind[i] !== 1 || P.col[i] !== c) continue;
        const k = 1 - P.life[i] / P.max[i];
        g.moveTo(P.x[i], P.y[i]); g.lineTo(P.x[i] - P.vx[i] * 0.035 * k, P.y[i] - P.vy[i] * 0.035 * k);
        any = true;
      }
      if (!any) continue;
      g.strokeStyle = PAL[c]; g.lineWidth = 1.6 * u; g.stroke();
    }
    g.globalAlpha = 1;

    // ---- lightning
    for (const b of bolts) {
      const k = 1 - b.life / b.max;
      g.beginPath();
      g.moveTo(b.pts[0], b.pts[1]);
      for (let i = 1; i < b.np; i++) g.lineTo(b.pts[i * 2], b.pts[i * 2 + 1]);
      g.globalAlpha = 0.35 * k; g.strokeStyle = PAL[b.col]; g.lineWidth = b.w * 4 * u; g.stroke();
      g.globalAlpha = 0.85 * k; g.lineWidth = b.w * 1.6 * u; g.stroke();
      g.globalAlpha = k; g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(0.8, b.w * 0.6 * u); g.stroke();
    }
    g.globalAlpha = 1;

    // ---- flying items (glow behind, art on top)
    for (const f of flyers) {
      const grow = Math.min(1, 0.35 + f.t * 2.2);
      const w = ART_W * 0.82 * u * grow * f.big, h = ART_H * 0.82 * u * grow * f.big;
      if (q > 0.55 || f.big > 1) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.8;
        g.drawImage(sprite(f.ci), f.x - w * 0.7, f.y - w * 0.5, w * 1.4, w);
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      if (f.img && f.img.complete && f.img.naturalWidth) {
        if (q < 0.55 && f.big <= 1) g.drawImage(f.img, f.x - w / 2, f.y - h / 2, w, h); else {
        g.save(); g.translate(f.x, f.y); g.rotate(Math.sin(f.rot) * 0.5);
        g.drawImage(f.img, -w / 2, -h / 2, w, h);
        g.restore(); }
      } else {
        g.globalCompositeOperation = 'lighter';
        g.drawImage(sprite(C_WHITE), f.x - w * 0.25, f.y - w * 0.25, w * 0.5, w * 0.5);
        g.globalCompositeOperation = 'source-over';
      }
    }
    g.restore();

    // ---- flash
    if (flash > 0.01) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = hexA(tint === PAL[rIdx('gold')] ? '#ffd14a' : '#b9a6ff', flash * 0.35);
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
  }

  // ---------------------------------------------------------------- lifecycle
  let roT = 0;
  const ro = new ResizeObserver(() => { cancelAnimationFrame(roT); roT = requestAnimationFrame(() => { layout(); brassF = null; if (reduced) kickOnce(); }); });
  ro.observe(stage);
  const io = new IntersectionObserver((es) => { for (const e of es) visible = e.isIntersecting; if (visible) needDraw = true; kick(); });
  io.observe(stage);
  function kickOnce() { needDraw = true; kick(); }
  const onVis = () => { if (document.visibilityState === 'visible') kick(); };
  document.addEventListener('visibilitychange', onVis);

  drawCtl();
  layout();
  if (reduced) { hint.textContent = 'Bereit'; }
  kick();

  return () => {
    dead = true;
    cancelAnimationFrame(raf); cancelAnimationFrame(roT);
    ro.disconnect(); io.disconnect(); artIO.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    // a show cut short still puts its items where they were going
    if (run?.going && run.inv) { for (const f of flyers) if (!f.done) land(f.item); while (run.launched < run.items.length) land(run.items[run.launched++]); }
    if (dirtyInv) commit();
    flyers.length = 0; bolts.length = 0; parts.n = 0; pending.length = 0;
  };
}

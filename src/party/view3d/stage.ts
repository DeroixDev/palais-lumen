// The render loop: one renderer, one active view (board, minigame or podium) at a time.
// Pauses while the tab is hidden. DOM labels follow 3D points of the active camera (a label's
// style is only written when its position really changed).
// A view may cap its frame rate (the board renders at most ~60 times a second, also on 120 or
// 144 Hz screens) and may bake its shadow map (drawn only when the view says something that
// casts a shadow moved). Every scene is compiled once, all parts visible, when it is first
// shown, so no shader is compiled in the middle of play.
// A view may ask for post-processing (bloom, colour grade, vignette: view3d/post.ts); the
// quality governor decides how much of it runs.

import { MAXDT, tickTweens } from '../util';
import { THREE, createRenderer, getRenderer } from './kit';
import { quality, onPixelRatio } from './quality';
import { Post, type PostParams } from './post';

export interface View {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  update(dt: number, t: number): void;
  /** Render at most this many frames per second (whole fractions of the display rate). */
  fpsCap?: number;
  /** Baked shadows: the shadow map is redrawn only on frames where this returns true. */
  shadowNeeded?(): boolean;
  /** Extra objects to compile with the scene (materials that are swapped in later). */
  warm?(): THREE.Object3D[];
  /** Post-processing settings for this frame (null: draw straight to the screen). */
  post?(): PostParams | null;
  /** Menu backdrops: cap the pixel ratio (the quality governor does not judge these frames). */
  dprCap?: number;
  /** Drawn after the view itself (e.g. a small extra scene into a part of the screen). */
  afterRender?(): void;
}

let canvas: HTMLCanvasElement;
let host: HTMLElement;
let labelsEl: HTMLElement;
let active: View | null = null;
export let VW = 1, VH = 1;
let T = 0, last = 0, lastRaw = 0, raf = 0, skip = 0;
/** Estimated display refresh interval (ms). */
let vsync = 1000 / 60;
const cams = new Set<THREE.PerspectiveCamera>();
const warmed = new WeakSet<THREE.Scene>();
let post: Post | null = null;

export const perf = { fps: 0, frames: 0, acc: 0, samples: [] as number[], calls: 0, tris: 0, vsync: 0, shadowDraws: 0 };

export function initStage(stageEl: HTMLElement, canvasEl: HTMLCanvasElement, labels: HTMLElement) {
  host = stageEl;
  canvas = canvasEl;
  labelsEl = labels;
  createRenderer(canvas);
  quality.apply();
  onPixelRatio(resize);
  new ResizeObserver(resize).observe(host);
  resize();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) last = lastRaw = performance.now(); });
  raf = requestAnimationFrame((t) => { last = lastRaw = t; frame(t); });
}

export function setView(v: View | null) {
  if (active?.dprCap && !v?.dprCap) quality.apply();
  active = v;
  if (v) { cams.add(v.cam); fit(v.cam); warm(v); }
  skip = 0;
  updateLabels();
}
export const getView = () => active;

/** Compiles every material of the scene once (hidden parts too), so nothing compiles mid-play. */
function warm(v: View) {
  if (warmed.has(v.scene)) return;
  warmed.add(v.scene);
  const r = getRenderer();
  const extra = v.warm?.() ?? [];
  for (const o of extra) v.scene.add(o);
  const hidden: THREE.Object3D[] = [];
  v.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  try { r.compile(v.scene, v.cam); } catch { /* compile is only a warm-up */ }
  if (v.post) { post ??= new Post(r); try { post.warm(r); } catch { /* warm-up only */ } }
  for (const o of hidden) o.visible = false;
  for (const o of extra) v.scene.remove(o);
}

function fit(c: THREE.PerspectiveCamera) {
  c.aspect = VW / VH;
  c.updateProjectionMatrix();
}

export function resize() {
  if (!host) return;
  VW = Math.max(1, host.clientWidth);
  VH = Math.max(1, host.clientHeight);
  getRenderer().setSize(VW, VH, false);
  for (const c of cams) fit(c);
}

// ---------- labels ----------
export interface Label { el: HTMLElement; inner: HTMLElement; get: (v: THREE.Vector3) => void; scene: THREE.Scene | null; tx: string; shown: boolean }
const labels = new Set<Label>();
export function addLabel(cls: string, html: string, get: (v: THREE.Vector3) => void, scene: THREE.Scene | null) {
  const el = document.createElement('div');
  el.className = 'l3';
  el.innerHTML = `<div class="${cls}">${html}</div>`;
  labelsEl.appendChild(el);
  const L: Label = { el, inner: el.firstElementChild as HTMLElement, get, scene, tx: '', shown: true };
  labels.add(L);
  return L;
}
export function removeLabel(L: Label | null | undefined) {
  if (!L) return;
  L.el.remove();
  labels.delete(L);
}
export function floatText(pos: THREE.Vector3, txt: string, col = '#ffe14a', scene: THREE.Scene | null = null) {
  const P = pos.clone();
  const L = addLabel('flt', txt, (v) => v.copy(P), scene ?? active?.scene ?? null);
  L.inner.style.setProperty('--fc', col);
  setTimeout(() => removeLabel(L), 1300);
}
export function clearLabels(scene: THREE.Scene) { for (const L of [...labels]) if (L.scene === scene) removeLabel(L); }

const _lv = new THREE.Vector3();
const show = (L: Label, on: boolean) => { if (L.shown !== on) { L.shown = on; L.el.style.display = on ? '' : 'none'; } };
function updateLabels() {
  for (const L of labels) {
    if (!active || (L.scene && L.scene !== active.scene)) { show(L, false); continue; }
    L.get(_lv);
    _lv.project(active.cam);
    const vis = _lv.z < 1 && Math.abs(_lv.x) < 1.3 && Math.abs(_lv.y) < 1.3;
    show(L, vis);
    if (!vis) continue;
    // whole pixels: no sub-pixel jitter and far fewer style writes while the camera settles
    const tx = `translate3d(${Math.round((_lv.x * 0.5 + 0.5) * VW)}px, ${Math.round((-_lv.y * 0.5 + 0.5) * VH)}px, 0) translate(-50%, -100%)`;
    if (tx !== L.tx) { L.tx = tx; L.el.style.transform = tx; }
  }
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  if (document.hidden) return;
  const raw = now - lastRaw;
  lastRaw = now;
  if (raw > 2 && raw < 40) vsync += (raw - vsync) * 0.05;
  perf.vsync = vsync;
  // frame cap: render every n-th display frame (n = 2 on 120/144 Hz for a 60 fps cap)
  const cap = active?.fpsCap ?? 0;
  if (cap) {
    const n = Math.max(1, Math.floor(1000 / cap / vsync + 0.15));
    if (++skip < n) return;
    skip = 0;
  }
  let dt = (now - last) / 1000;
  last = now;
  perf.frames++;
  perf.acc += dt;
  if (perf.acc >= 1) {
    perf.fps = perf.frames / perf.acc;
    perf.samples.push(Math.round(perf.fps));
    if (perf.samples.length > 30) perf.samples.shift();
    perf.frames = 0;
    perf.acc = 0;
  }
  if (!active?.dprCap) quality.tick(dt);
  if (dt > MAXDT) dt = MAXDT;
  if (dt < 0) dt = 0;
  T += dt;
  tickTweens(dt);
  if (!active) return;
  active.update(dt, T);
  updateLabels();
  const r = getRenderer();
  if (active.shadowNeeded) {
    r.shadowMap.autoUpdate = false;
    if (active.shadowNeeded()) { r.shadowMap.needsUpdate = true; perf.shadowDraws++; }
  } else r.shadowMap.autoUpdate = true;
  if (active.dprCap) capDpr(active.dprCap);
  renderView(active);
  active.afterRender?.();
}

/** A menu backdrop renders at a lower pixel ratio (never above what the quality allows). */
function capDpr(cap: number) {
  const r = getRenderer(), want = Math.min(quality.current().dpr, cap);
  if (Math.abs(r.getPixelRatio() - want) > 0.001) { r.setPixelRatio(want); resize(); }
}

/** Draws a view: through the post chain when it asks for one and the quality allows it. */
export function renderView(v: View) {
  const r = getRenderer();
  const p = quality.post > 0 ? v.post?.() ?? null : null;
  if (p) {
    post ??= new Post(r);
    post.render(r, v.scene, v.cam, p, quality.post > 1);
    perf.calls = post.calls;
    perf.tris = post.tris;
  } else {
    r.render(v.scene, v.cam);
    perf.calls = r.info.render.calls;
    perf.tris = r.info.render.triangles;
  }
}

export const stopStage = () => cancelAnimationFrame(raf);
export const stageTime = () => T;

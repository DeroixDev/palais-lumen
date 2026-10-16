// The render loop: one renderer, one active view (board, minigame or podium) at a time.
// Pauses while the tab is hidden. DOM labels follow 3D points of the active camera.

import { MAXDT, tickTweens } from '../util';
import { THREE, createRenderer, getRenderer } from './kit';
import { quality, onPixelRatio } from './quality';

export interface View {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  update(dt: number, t: number): void;
}

let canvas: HTMLCanvasElement;
let host: HTMLElement;
let labelsEl: HTMLElement;
let active: View | null = null;
export let VW = 1, VH = 1;
let T = 0, last = 0, raf = 0;
const cams = new Set<THREE.PerspectiveCamera>();

export const perf = { fps: 0, frames: 0, acc: 0, samples: [] as number[], calls: 0, tris: 0 };

export function initStage(stageEl: HTMLElement, canvasEl: HTMLCanvasElement, labels: HTMLElement) {
  host = stageEl;
  canvas = canvasEl;
  labelsEl = labels;
  createRenderer(canvas);
  quality.apply();
  onPixelRatio(resize);
  new ResizeObserver(resize).observe(host);
  resize();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) last = performance.now(); });
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
}

export function setView(v: View | null) {
  active = v;
  if (v) { cams.add(v.cam); fit(v.cam); }
  updateLabels();
}
export const getView = () => active;

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
export interface Label { el: HTMLElement; inner: HTMLElement; get: (v: THREE.Vector3) => void; scene: THREE.Scene | null }
const labels = new Set<Label>();
export function addLabel(cls: string, html: string, get: (v: THREE.Vector3) => void, scene: THREE.Scene | null) {
  const el = document.createElement('div');
  el.className = 'l3';
  el.innerHTML = `<div class="${cls}">${html}</div>`;
  labelsEl.appendChild(el);
  const L: Label = { el, inner: el.firstElementChild as HTMLElement, get, scene };
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
function updateLabels() {
  for (const L of labels) {
    if (!active || (L.scene && L.scene !== active.scene)) { if (L.el.style.display !== 'none') L.el.style.display = 'none'; continue; }
    L.get(_lv);
    _lv.project(active.cam);
    const vis = _lv.z < 1 && Math.abs(_lv.x) < 1.3 && Math.abs(_lv.y) < 1.3;
    L.el.style.display = vis ? '' : 'none';
    if (vis) L.el.style.transform = `translate3d(${((_lv.x * 0.5 + 0.5) * VW).toFixed(1)}px, ${((-_lv.y * 0.5 + 0.5) * VH).toFixed(1)}px, 0) translate(-50%, -100%)`;
  }
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  if (document.hidden) return;
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
  quality.tick(dt);
  if (dt > MAXDT) dt = MAXDT;
  if (dt < 0) dt = 0;
  T += dt;
  tickTweens(dt);
  if (!active) return;
  active.update(dt, T);
  updateLabels();
  const r = getRenderer();
  r.render(active.scene, active.cam);
  perf.calls = r.info.render.calls;
  perf.tris = r.info.render.triangles;
}

export const stopStage = () => cancelAnimationFrame(raf);
export const stageTime = () => T;

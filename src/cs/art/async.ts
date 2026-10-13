/**
 * Off-main-thread art: renders skins and case boxes in a small pool of Web Workers
 * (OffscreenCanvas) and hands back object URLs for plain <img> elements.
 *
 * Why <img> and not <canvas>: every 2D canvas on the page becomes its own composited layer, and a
 * reel full of canvases (plus everything overlapping them) made the compositor re-layerize
 * hundreds of layers per frame while the strip moved. Images paint into their parent layer.
 *
 * Without OffscreenCanvas (old Safari) the same jobs run on the main thread in small idle-time
 * slices, so nothing ever blocks for long either way.
 */
import type { CaseDef, RenderOpts } from '../contract';
import { dpr } from './canvas';
import { renderSkinShared, skinKey, warmTextures } from './render';
import { renderCaseImpl } from './case';
import type { ArtJob, ArtReply } from './worker';

type Prio = 0 | 1 | 2; // 0 = needed now (visible), 1 = soon (prefetch), 2 = idle warm-up
interface Entry {
  key: string;
  job: ArtJob;
  prio: Prio;
  route: number;
  url?: string;
  promise: Promise<string>;
  resolve: (u: string) => void;
  reject: (e: unknown) => void;
  started: boolean;
}

// ---------------------------------------------------------------- url cache (LRU, revokes)
const MAX_URLS = 700;
const cache = new Map<string, Entry>();
function touch(e: Entry) { cache.delete(e.key); cache.set(e.key, e); }
function trim() {
  if (cache.size <= MAX_URLS) return;
  for (const [k, e] of cache) {
    if (cache.size <= MAX_URLS) break;
    if (!e.url) continue; // queued or running: keep
    cache.delete(k);
    // Revoke later: an <img> that was just given this URL may still be loading it.
    const u = e.url;
    setTimeout(() => URL.revokeObjectURL(u), 10_000);
  }
}

// ---------------------------------------------------------------- workers
let nextId = 1;
const queue: Entry[] = [];
interface W { w: Worker; busy: number }
let pool: W[] | null = null;
let poolBroken = false;
const running = new Map<number, { e: Entry; w: W }>();

function canUseWorkers(): boolean {
  if (poolBroken || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return false;
  try {
    const oc = new OffscreenCanvas(1, 1);
    return !!oc.getContext('2d') && typeof oc.convertToBlob === 'function';
  } catch { return false; }
}

function ensurePool(): W[] | null {
  if (pool || poolBroken) return pool;
  if (!canUseWorkers()) { poolBroken = true; return null; }
  const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const n = Math.max(1, Math.min(3, hc - 1));
  try {
    pool = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      const ww: W = { w, busy: 0 };
      w.onmessage = (ev: MessageEvent<ArtReply>) => onReply(ww, ev.data);
      w.onerror = () => breakPool();
      w.postMessage({ t: 'init', dpr: dpr() });
      pool.push(ww);
    }
  } catch {
    breakPool();
  }
  return pool;
}

/** A worker failed (no module workers, no 2D OffscreenCanvas ...): finish everything on the page. */
function breakPool() {
  poolBroken = true;
  pool?.forEach((p) => p.w.terminate());
  pool = null;
  for (const { e } of running.values()) { e.started = false; queue.push(e); }
  running.clear();
  pump();
}

function onReply(w: W, r: ArtReply) {
  const run = running.get(r.id);
  running.delete(r.id);
  w.busy--;
  if (run) {
    const e = run.e;
    if (r.blob) finish(e, URL.createObjectURL(r.blob));
    else if (r.err) { e.started = false; mainQueue.push(e); kickMain(); }
    else finish(e, '');
  }
  pump();
}

function finish(e: Entry, url: string) {
  e.url = url;
  e.resolve(url);
  if (e.job.t === 'warm') cache.delete(e.key);
  trim();
}

const PER_WORKER = 2;
function pump() {
  const p = ensurePool();
  if (!p) { while (queue.length) mainQueue.push(queue.shift()!); kickMain(); return; }
  queue.sort((a, b) => a.prio - b.prio);
  for (let i = 0; i < queue.length; ) {
    const e = queue[i];
    // skins go to "their" worker (its pattern-texture cache), case art to the least busy one
    const w = e.route >= 0 ? p[e.route % p.length] : p.reduce((a, b) => (b.busy < a.busy ? b : a));
    if (w.busy >= PER_WORKER) { i++; continue; }
    queue.splice(i, 1);
    e.started = true;
    w.busy++;
    running.set(e.job.id, { e, w });
    w.w.postMessage(e.job);
  }
}

// ---------------------------------------------------------------- main-thread fallback
const mainQueue: Entry[] = [];
let mainKicked = false;
type IdleCb = (d: { timeRemaining(): number }) => void;
const ric: (cb: IdleCb) => void =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (cb) => (window as unknown as { requestIdleCallback(c: IdleCb, o: object): void }).requestIdleCallback(cb, { timeout: 120 })
    : (cb) => setTimeout(() => cb({ timeRemaining: () => 8 }), 16);
function kickMain() {
  if (mainKicked || !mainQueue.length) return;
  mainKicked = true;
  ric(mainSlice);
}
function mainSlice() {
  mainKicked = false;
  mainQueue.sort((a, b) => a.prio - b.prio);
  const t0 = performance.now();
  // one job at least, then as many as fit into ~10 ms
  while (mainQueue.length && (performance.now() - t0 < 10)) {
    const e = mainQueue.shift()!;
    try {
      const j = e.job;
      if (j.t === 'warm') { warmTextures(j.skins); finish(e, ''); continue; }
      const c = j.t === 'skin' ? renderSkinShared(j.o) : renderCaseImpl(j.c, j.w, j.h);
      c.toBlob((b) => (b ? finish(e, URL.createObjectURL(b)) : e.reject(new Error('toBlob'))), 'image/png');
    } catch (err) { cache.delete(e.key); e.reject(err); }
  }
  kickMain();
}

// ---------------------------------------------------------------- requests
function hashRoute(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

function request(key: string, mk: (id: number) => ArtJob, prio: Prio, route: number): Entry {
  const hit = cache.get(key);
  if (hit) {
    touch(hit);
    if (!hit.started && prio < hit.prio) hit.prio = prio;
    return hit;
  }
  let resolve!: (u: string) => void, reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => { /* callers handle it; never an unhandled rejection */ });
  const e: Entry = { key, job: mk(nextId++), prio, route, promise, resolve, reject, started: false };
  cache.set(key, e);
  queue.push(e);
  schedulePump();
  return e;
}
let pumpQueued = false;
function schedulePump() {
  if (pumpQueued) return;
  pumpQueued = true;
  queueMicrotask(() => { pumpQueued = false; pump(); });
}

/** Already rendered? Then the URL, else undefined. */
export function skinURLNow(o: RenderOpts): string | undefined { return cache.get('s|' + skinKey(o))?.url || undefined; }

/** Object URL of the 2D render (same look as renderSkin). */
export function skinURL(o: RenderOpts, prio: Prio = 0): Promise<string> {
  const opts = { skin: o.skin, float: o.float, seed: o.seed, width: o.width, height: o.height, statTrak: !!o.statTrak };
  return request('s|' + skinKey(opts), (id) => ({ t: 'skin', id, o: opts }), prio, hashRoute(o.skin)).promise;
}

export function caseURLNow(c: CaseDef, w: number, h: number): string | undefined { return cache.get(`c|${c.id}|${c.look.a}|${c.look.b}|${w}x${h}|${dpr()}`)?.url || undefined; }

/** Object URL of the case box art. */
export function caseURL(c: CaseDef, w: number, h: number, prio: Prio = 0): Promise<string> {
  const cd: CaseDef = JSON.parse(JSON.stringify(c));
  return request(`c|${c.id}|${c.look.a}|${c.look.b}|${w}x${h}|${dpr()}`, (id) => ({ t: 'case', id, c: cd, w, h }), prio, -1).promise;
}

/** Paints the pattern textures of these skins in the workers in the background. */
export function warmSkinsAsync(ids: string[]): Promise<void> {
  // one job per skin, routed to the worker that will later render that skin
  const ps = ids.map((id) => request(`w|${id}|${nextId}`, (jid) => ({ t: 'warm', id: jid, skins: [id] }), 2, hashRoute(id)).promise);
  return Promise.all(ps).then(() => undefined, () => undefined);
}

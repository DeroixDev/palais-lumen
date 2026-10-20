// Quality: render sharp (full device pixel ratio up to 2, MSAA, big shadow maps, bloom and the
// colour grade) and step down automatically only when frames stay slow. Order of the steps
// (Auto): first the bloom (the post passes that cost most), then the shadow map size, then the
// effects (ambient life, air particles, the colour-grade pass; the life of boards/leben.ts too:
// traffic, pigeons, spectators, coins, buoys, gulls), and only at the very end the
// pixel ratio, never below 1. Shadows are never switched off in Auto (that would recompile every
// shader: a visible hitch). A step down needs two 2-second windows in a row whose MEDIAN frame
// time is above 24 ms (single spikes don't count); a step up needs two good windows (about 4 s),
// and never to a level that already failed twice. The player can also pick a fixed level.

import type { Quality } from '../types';
import { allLights, getRenderer } from './kit';

/** post: 2 = bloom + grade, 1 = grade only, 0 = straight to the screen. */
interface Level { dpr: number; shadow: number; fx: boolean; post: 0 | 1 | 2; name: string }
const dev = () => window.devicePixelRatio || 1;
const LEVELS: (() => Level)[] = [
  () => ({ dpr: Math.min(dev(), 2), shadow: 1, fx: true, post: 2, name: 'hoch' }),
  () => ({ dpr: Math.min(dev(), 2), shadow: 1, fx: true, post: 1, name: 'hoch-' }),
  () => ({ dpr: Math.min(dev(), 2), shadow: 0.5, fx: true, post: 1, name: 'hoch--' }),
  () => ({ dpr: Math.min(dev(), 2), shadow: 0.5, fx: false, post: 0, name: 'mittel' }),
  () => ({ dpr: Math.min(dev(), 1.75), shadow: 0.5, fx: false, post: 0, name: 'mittel-' }),
  () => ({ dpr: Math.min(dev(), 1.5), shadow: 0.25, fx: false, post: 0, name: 'niedrig' }),
  () => ({ dpr: Math.min(dev(), 1.25), shadow: 0.25, fx: false, post: 0, name: 'niedrig-' }),
  () => ({ dpr: 1, shadow: 0.25, fx: false, post: 0, name: 'minimal' }),
];
/** Fixed levels picked in the settings (Niedrig turns shadows off: one recompile, on purpose). */
const FIXED: Record<Exclude<Quality, 'auto'>, () => Level> = {
  hoch: LEVELS[0],
  mittel: () => ({ dpr: Math.min(dev(), 1.5), shadow: 0.5, fx: true, post: 1, name: 'mittel' }),
  niedrig: () => ({ dpr: 1, shadow: 0, fx: false, post: 0, name: 'niedrig' }),
};
const WINDOW = 2;
const SLOW = 0.024, FAST = 0.0185;

export const quality = {
  mode: 'auto' as Quality,
  level: 0,
  fails: new Array(LEVELS.length).fill(0) as number[],
  /** Frame times of the current window (seconds). */
  win: [] as number[],
  acc: 0,
  bad: 0,
  good: 0,
  changes: 0,
  last: '' as string,
  /** Effects on (ambient life, traffic, pigeons, spectators, air particles); boards read this. */
  fx: true,
  /** Post-processing: 2 bloom + grade, 1 grade only, 0 none. */
  post: 2 as 0 | 1 | 2,
  /** Bumped whenever shadow maps were reallocated (baked shadow maps must be drawn again). */
  shadowEpoch: 0,

  set(mode: Quality) {
    this.mode = mode;
    this.level = 0;
    this.bad = this.good = 0;
    this.win.length = 0;
    this.acc = 0;
    this.apply();
  },

  current(): Level { return this.mode === 'auto' ? LEVELS[this.level]() : FIXED[this.mode](); },

  apply() {
    const r = getRenderer();
    if (!r) return;
    const L = this.current();
    if (Math.abs(r.getPixelRatio() - L.dpr) > 0.001) {
      r.setPixelRatio(L.dpr);
      onDpr?.();
    }
    for (const li of allLights()) {
      const on = L.shadow > 0;
      if (li.sun.castShadow !== on) { li.sun.castShadow = on; this.shadowEpoch++; }
      const size = Math.max(512, Math.round(li.baseSize * (L.shadow || 0.25)));
      if (li.sun.shadow.mapSize.x !== size) {
        li.sun.shadow.mapSize.set(size, size);
        li.sun.shadow.map?.dispose();
        li.sun.shadow.map = null as never;
        this.shadowEpoch++;
      }
    }
    this.fx = L.fx;
    this.post = L.post;
    this.last = L.name;
  },

  /** Called once per rendered frame with the real frame time (seconds). */
  tick(dt: number) {
    if (this.mode !== 'auto' || document.hidden || dt > 0.5) return;
    this.win.push(dt);
    this.acc += dt;
    if (this.acc < WINDOW) return;
    const s = this.win.sort((a, b) => a - b), med = s[s.length >> 1];
    this.win.length = 0;
    this.acc = 0;
    if (med > SLOW) {
      this.good = 0;
      if (++this.bad >= 2 && this.level < LEVELS.length - 1) {
        this.fails[this.level]++;
        this.level++;
        this.bad = 0;
        this.changes++;
        this.apply();
      }
    } else if (med < FAST) {
      this.bad = 0;
      if (this.level > 0 && ++this.good >= 2 && this.fails[this.level - 1] < 2) {
        this.level--;
        this.good = 0;
        this.changes++;
        this.apply();
      }
    } else { this.bad = 0; this.good = 0; }
  },
};

let onDpr: (() => void) | null = null;
export const onPixelRatio = (fn: () => void) => { onDpr = fn; };

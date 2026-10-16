// Quality: render sharp (full device pixel ratio up to 2, MSAA, big shadow maps) and step down
// automatically when the frame time stays above ~20 ms: first the pixel ratio, then the
// shadows. With headroom it steps back up, but never to a level that already failed twice.
// The player can also pick a fixed level: Hoch, Mittel, Niedrig.

import type { Quality } from '../types';
import { allLights, getRenderer } from './kit';

interface Level { dpr: number; shadow: number; name: string }
const dev = () => window.devicePixelRatio || 1;
const LEVELS: (() => Level)[] = [
  () => ({ dpr: Math.min(dev(), 2), shadow: 1, name: 'hoch' }),
  () => ({ dpr: Math.min(dev(), 1.75), shadow: 1, name: 'hoch-' }),
  () => ({ dpr: Math.min(dev(), 1.5), shadow: 0.5, name: 'mittel' }),
  () => ({ dpr: Math.min(dev(), 1.25), shadow: 0.5, name: 'mittel-' }),
  () => ({ dpr: 1, shadow: 0.25, name: 'niedrig' }),
  () => ({ dpr: 1, shadow: 0, name: 'niedrig-' }),
  () => ({ dpr: 0.75, shadow: 0, name: 'minimal' }),
];
const FIXED: Record<Exclude<Quality, 'auto'>, number> = { hoch: 0, mittel: 2, niedrig: 4 };

export const quality = {
  mode: 'auto' as Quality,
  level: 0,
  fails: new Array(LEVELS.length).fill(0) as number[],
  /** Frame-time window. */
  acc: 0,
  frames: 0,
  good: 0,
  changes: 0,
  last: '' as string,

  set(mode: Quality) {
    this.mode = mode;
    this.level = mode === 'auto' ? 0 : FIXED[mode];
    this.apply();
  },

  current(): Level { return LEVELS[this.level](); },

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
      if (li.sun.castShadow !== on) li.sun.castShadow = on;
      const size = Math.max(256, Math.round(li.baseSize * (L.shadow || 0.25)));
      if (li.sun.shadow.mapSize.x !== size) {
        li.sun.shadow.mapSize.set(size, size);
        li.sun.shadow.map?.dispose();
        li.sun.shadow.map = null as never;
      }
    }
    this.last = L.name;
  },

  /** Called every frame with the real frame time (seconds). */
  tick(dt: number) {
    if (this.mode !== 'auto' || document.hidden || dt > 0.5) return;
    this.acc += dt;
    this.frames++;
    if (this.acc < 2) return;
    const avg = this.acc / this.frames;
    this.acc = 0;
    this.frames = 0;
    if (avg > 0.02 && this.level < LEVELS.length - 1) {
      this.fails[this.level]++;
      this.level++;
      this.good = 0;
      this.changes++;
      this.apply();
    } else if (avg < 0.0175 && this.level > 0) {
      // 10 s of steady frames before trying one level up, and not to a level that failed twice
      if (++this.good >= 5 && this.fails[this.level - 1] < 2) {
        this.level--;
        this.good = 0;
        this.changes++;
        this.apply();
      }
    } else this.good = 0;
  },
};

let onDpr: (() => void) | null = null;
export const onPixelRatio = (fn: () => void) => { onDpr = fn; };

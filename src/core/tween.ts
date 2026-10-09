// Minimal tween engine driven by the Pixi ticker (see main.ts).

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

interface Running {
  update(dtMs: number): boolean; // returns true when finished
  cancel(): void;
}

const running = new Set<Running>();

export function updateTweens(dtMs: number) {
  for (const r of [...running]) {
    // A tween whose target was destroyed (e.g. a scene closed mid-animation) must not
    // break every other animation: drop it and carry on.
    let done: boolean;
    try {
      done = r.update(dtMs);
    } catch (e) {
      console.error(e);
      r.cancel();
      done = true;
    }
    if (done) running.delete(r);
  }
}

export function cancelAllTweens() {
  for (const r of running) r.cancel();
  running.clear();
}

/** Animates numeric properties of `target` to `to`. Nested props like "scale.x" are supported. */
export function tween<T extends object>(
  target: T,
  to: Record<string, number>,
  durationMs: number,
  easing: Ease = ease.outCubic,
  delayMs = 0,
): Promise<void> {
  return new Promise((resolve) => {
    const keys = Object.keys(to);
    let from: number[] | null = null;
    let elapsed = -delayMs;
    let done = false;
    const get = (k: string) => k.split('.').reduce<any>((o, p) => o?.[p], target) as number;
    const set = (k: string, v: number) => {
      const parts = k.split('.');
      const last = parts.pop()!;
      const obj = parts.reduce<any>((o, p) => o?.[p], target);
      if (obj && !obj.destroyed) obj[last] = v;
    };
    const r: Running = {
      update(dt) {
        if (done) return true;
        if ((target as any).destroyed) {
          done = true;
          resolve();
          return true;
        }
        elapsed += dt;
        if (elapsed < 0) return false;
        if (!from) from = keys.map(get);
        const t = Math.min(1, elapsed / durationMs);
        const e = easing(t);
        keys.forEach((k, i) => set(k, from![i] + (to[k] - from![i]) * e));
        if (t >= 1) {
          done = true;
          resolve();
        }
        return done;
      },
      cancel() {
        done = true;
        resolve();
      },
    };
    running.add(r);
  });
}

/** Calls fn(t) every frame for durationMs, t from 0 to 1 (eased). */
export function animate(durationMs: number, fn: (t: number) => void, easing: Ease = ease.linear): Promise<void> {
  return new Promise((resolve) => {
    let elapsed = 0;
    let done = false;
    running.add({
      update(dt) {
        if (done) return true;
        elapsed += dt;
        const t = Math.min(1, elapsed / durationMs);
        fn(easing(t));
        if (t >= 1) {
          done = true;
          resolve();
        }
        return done;
      },
      cancel() {
        done = true;
        resolve();
      },
    });
  });
}

export function wait(ms: number): Promise<void> {
  return animate(ms, () => {});
}

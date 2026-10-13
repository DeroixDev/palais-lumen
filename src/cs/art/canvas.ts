/**
 * Canvas helpers that work both on the page and inside a Web Worker (OffscreenCanvas), so the
 * whole art pipeline can run off the main thread (see ./worker.ts and ./async.ts).
 */

/** A fresh canvas of w x h device pixels: <canvas> on the page, OffscreenCanvas in a worker. */
export function mkCanvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  // OffscreenCanvas has the same drawing surface API; the art code only uses that part.
  return new OffscreenCanvas(w, h) as unknown as HTMLCanvasElement;
}

let dprOverride = 0;
/** The worker has no window: the page tells it its devicePixelRatio. */
export function setDpr(d: number) { dprOverride = d; }
export function dpr(): number {
  const d = dprOverride || (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return Math.min(3, Math.max(1, d));
}

/** Sets CSS size when the canvas is a DOM element (no-op for OffscreenCanvas). */
export function cssSize(c: HTMLCanvasElement, w: number, h: number) {
  if ('style' in c && c.style) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
}

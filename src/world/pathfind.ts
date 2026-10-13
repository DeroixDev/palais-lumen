// Click-to-walk route finding: A* over a coarse grid of the room's free floor, then the corners
// are pulled tight so the walk looks like a person taking the short way round, not a grid crawl.
// The grid is built on demand from the same collision test the walking uses, so gates that open,
// figures that step aside and moved furniture are always respected.

export interface Pt {
  x: number;
  y: number;
}

/** Cell size in world pixels: small enough to slip between tables, coarse enough to stay fast. */
const CELL = 16;
/** Give up searching after this many expanded cells (a 4400 px corridor needs about 15k). */
const MAX_EXPAND = 60000;

/**
 * Route from `from` to `to` as a list of waypoints (the last one is the goal, or the closest
 * reachable point to it when the goal itself is blocked). `free(x, y)` says whether the player
 * may stand at a point. Returns null when nothing better than standing still exists.
 */
export function findPath(from: Pt, to: Pt, free: (x: number, y: number) => boolean, w: number, h: number): Pt[] | null {
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const idx = (c: number, r: number) => r * cols + c;
  const cx = (c: number) => c * CELL + CELL / 2;
  const cy = (r: number) => r * CELL + CELL / 2;
  // Walkability is evaluated lazily and cached: most cells are never looked at.
  const walk = new Int8Array(cols * rows); // 0 unknown, 1 free, 2 blocked
  const ok = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
    const i = idx(c, r);
    if (!walk[i]) walk[i] = free(cx(c), cy(r)) ? 1 : 2;
    return walk[i] === 1;
  };
  const cellOf = (p: Pt) => [Math.max(0, Math.min(cols - 1, Math.floor(p.x / CELL))), Math.max(0, Math.min(rows - 1, Math.floor(p.y / CELL)))] as const;

  /** Nearest free cell to a point (rings outwards), for a start inside a wall or a goal on a table. */
  const nearestFree = (p: Pt, maxRing: number): [number, number] | null => {
    const [c0, r0] = cellOf(p);
    if (ok(c0, r0)) return [c0, r0];
    for (let ring = 1; ring <= maxRing; ring++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dc = -ring; dc <= ring; dc++)
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (!ok(c, r)) continue;
          const d = Math.hypot(cx(c) - p.x, cy(r) - p.y);
          if (d < bestD) {
            bestD = d;
            best = [c, r];
          }
        }
      if (best) return best;
    }
    return null;
  };

  const s = nearestFree(from, 4);
  if (!s) return null;
  const goalFree = free(to.x, to.y);
  const g = goalFree ? cellOf(to) : nearestFree(to, 40);
  if (!g) return null;
  const start = idx(s[0], s[1]);
  const goal = idx(g[0], g[1]);

  // A* with octile distance; diagonals may not cut a blocked corner.
  const gScore = new Float32Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const heap = new MinHeap();
  const hEst = (i: number) => {
    const dx = Math.abs((i % cols) - g[0]);
    const dy = Math.abs(Math.floor(i / cols) - g[1]);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  gScore[start] = 0;
  heap.push(start, hEst(start));
  // When the goal can't be reached (closed gate, sealed room), head for the explored cell closest to it.
  let bestI = start;
  let bestH = hEst(start);
  let expanded = 0;
  let found = false;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) {
      found = true;
      break;
    }
    const he = hEst(cur);
    if (he < bestH) {
      bestH = he;
      bestI = cur;
    }
    if (++expanded > MAX_EXPAND) break;
    const c = cur % cols;
    const r = Math.floor(cur / cols);
    for (let dc = -1; dc <= 1; dc++)
      for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (!ok(nc, nr)) continue;
        if (dc && dr && (!ok(c + dc, r) || !ok(c, r + dr))) continue;
        const ni = idx(nc, nr);
        if (closed[ni]) continue;
        const ng = gScore[cur] + (dc && dr ? Math.SQRT2 : 1);
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + hEst(ni));
        }
      }
  }
  const end = found ? goal : bestI;
  if (end === start && !found) return null;
  const cells: Pt[] = [];
  for (let i = end; i !== -1; i = came[i]) cells.push({ x: cx(i % cols), y: cy(Math.floor(i / cols)) });
  cells.reverse();
  // The exact goal replaces its cell centre when it is reachable and free.
  if (found && goalFree) cells[cells.length - 1] = { x: to.x, y: to.y };
  return smooth(from, cells, free);
}

/** Straight-line check in small steps with the real collision test. */
export function clearLine(a: Pt, b: Pt, free: (x: number, y: number) => boolean) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d / 6));
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    if (!free(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

/** String pulling: from each waypoint, jump to the furthest one still in a straight, clear line. */
function smooth(from: Pt, cells: Pt[], free: (x: number, y: number) => boolean): Pt[] {
  const out: Pt[] = [];
  let cur = from;
  let i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !clearLine(cur, cells[j], free)) j--;
    out.push(cells[j]);
    cur = cells[j];
    i = j + 1;
  }
  return out;
}

/** Binary min-heap of cell indices keyed by f-score. */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    const n = ids.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}

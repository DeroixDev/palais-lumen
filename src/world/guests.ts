// Other guests: they stroll between machines, play a while and sometimes win a little.
// Purely decorative, so the casino never feels empty when you play alone.

import { Container, Sprite } from 'pixi.js';
import { COLORS, floatText, glowTexture, emblemTexture } from '../core/fx';
import { animate, ease } from '../core/tween';
import { sfx } from '../core/audio';
import { Player, type Avatar, type PlayerLook, type HairStyle } from './player';

export interface Spot {
  x: number;
  y: number;
  /** Where the effect of a win appears (the machine itself). */
  fx?: { x: number; y: number };
  kind: 'station' | 'lounge';
}

const SKIN = [0xe8b48a, 0xc68a5e, 0x8d5a3b, 0xf1c9a5, 0x6b4127];
const HAIR = [0x2a1a10, 0x6b3a1e, 0xd9b26a, 0x1b1b22, 0x9a9a9a, 0xb3402a];
const JACKET = [0x1d2a4a, 0x3a1a2a, 0x1f3a2a, 0x2a2a2a, 0x4a2a14];
const ACCENT = [COLORS.neon, COLORS.cyan, 0x7bd47b, 0xffa94a, 0xc9a0ff, COLORS.lamp, 0xff6b5f];
const DRESS = [0x6b1a2e, 0x1f5a44, 0x26305a, 0xb8862f, 0x5a2a6a, 0x1b1b22, 0xa24a6a, 0x2f6f7a];
const HAT = [0x1b1b22, 0x3a2a20, 0x2a2a3a, 0xd8c8a8, 0x4a1a24];
const SUIT_HAIR: HairStyle[] = ['short', 'short', 'sidePart', 'sidePart', 'curly', 'bald', 'long'];
const DRESS_HAIR: HairStyle[] = ['long', 'long', 'bun', 'bun', 'curly', 'short', 'sidePart'];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** A random, varied evening outfit for one guest. */
function randomLook(): PlayerLook {
  const dress = Math.random() < 0.45;
  const hair = pick(HAIR);
  if (dress) {
    return {
      skin: pick(SKIN),
      hair,
      outfit: 'dress',
      jacket: pick(DRESS),
      hairStyle: pick(DRESS_HAIR),
      accessory: Math.random() < 0.85 ? 'necklace' : 'none',
    };
  }
  const r = Math.random();
  return {
    skin: pick(SKIN),
    hair,
    outfit: 'suit',
    jacket: pick(JACKET),
    // Grey hair goes thin a little more often.
    hairStyle: hair === 0x9a9a9a && Math.random() < 0.5 ? 'bald' : pick(SUIT_HAIR),
    hat: r < 0.12 ? 'fedora' : r < 0.19 ? 'topHat' : 'none',
    hatColor: pick(HAT),
    accessory: Math.random() < 0.6 ? 'bowTie' : 'tie',
  };
}

interface Guest {
  p: Avatar;
  target: Spot | null;
  /** Waypoints to the target, found with A* on a coarse grid and smoothed. */
  path: { x: number; y: number }[];
  /** Seconds left to stay at the current spot. */
  stay: number;
  /** Seconds until the next possible small win while playing. */
  nextWin: number;
  stuck: number;
  speed: number;
  /** Short pause, e.g. to let someone pass. */
  wait: number;
  blockedFor: number;
  replan: boolean;
}

const CELL = 20;
const WALK = 120;

export class Guests {
  private list: Guest[] = [];
  private taken = new Set<Spot>();
  private cols: number;
  private rows: number;
  /** 1 where a guest can stand. */
  private open: Uint8Array;

  constructor(
    private layer: Container,
    private fxLayer: Container,
    private spots: Spot[],
    count: number,
    private collides: (x: number, y: number) => boolean,
    private listener: () => { x: number; y: number },
    size: { w: number; h: number },
    make: (color: number, look: PlayerLook) => Avatar = (color, look) => {
      const p = new Player(color, look);
      p.view.scale.set(1.3);
      return p;
    },
  ) {
    this.cols = Math.ceil(size.w / CELL);
    this.rows = Math.ceil(size.h / CELL);
    this.open = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        // A cell counts as open only with a little room to spare, so paths keep off the furniture's edges.
        const x = c * CELL + CELL / 2;
        const y = r * CELL + CELL / 2;
        const blocked = [[0, 0], [-6, -6], [6, -6], [-6, 6], [6, 6]].some(([dx, dy]) => collides(x + dx, y + dy));
        this.open[r * this.cols + c] = blocked ? 0 : 1;
      }
    for (let i = 0; i < count; i++) {
      const p = make(pick(ACCENT), randomLook());
      const start = this.free() ?? spots[0];
      if (!start) return;
      p.view.position.set(start.x, start.y);
      p.view.label = 'guest'; // found by the quips for speech bubbles
      this.layer.addChild(p.view);
      const g: Guest = { p, target: start, path: [], stay: 2 + Math.random() * 8, nextWin: 3 + Math.random() * 6, stuck: 0, speed: 0, wait: 0, blockedFor: 0, replan: false };
      this.taken.add(start);
      this.list.push(g);
    }
  }

  /** Sends everyone home (the room is rebuilding its crowd). */
  destroy() {
    for (const g of this.list) if (!g.p.view.destroyed) g.p.view.destroy({ children: true });
    this.list = [];
    this.taken.clear();
  }

  private free(except?: Spot | null) {
    const options = this.spots.filter((s) => !this.taken.has(s) && s !== except);
    return options.length ? pick(options) : null;
  }

  // ---- Path finding -------------------------------------------------------

  private cellOf(x: number, y: number) {
    return { c: Math.max(0, Math.min(this.cols - 1, Math.floor(x / CELL))), r: Math.max(0, Math.min(this.rows - 1, Math.floor(y / CELL))) };
  }

  private nearestOpen(c: number, r: number) {
    if (this.open[r * this.cols + c]) return r * this.cols + c;
    for (let d = 1; d < 6; d++)
      for (let dr = -d; dr <= d; dr++)
        for (let dc = -d; dc <= d; dc++) {
          const cc = c + dc;
          const rr = r + dr;
          if (cc >= 0 && rr >= 0 && cc < this.cols && rr < this.rows && this.open[rr * this.cols + cc]) return rr * this.cols + cc;
        }
    return -1;
  }

  /** True when a guest can walk the straight line from a to b. */
  private clear(ax: number, ay: number, bx: number, by: number) {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.ceil(d / 8);
    for (let i = 1; i <= n; i++) if (this.collides(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n)) return false;
    return true;
  }

  private findPath(fx: number, fy: number, tx: number, ty: number) {
    if (this.clear(fx, fy, tx, ty)) return [{ x: tx, y: ty }];
    const a = this.cellOf(fx, fy);
    const b = this.cellOf(tx, ty);
    const start = this.nearestOpen(a.c, a.r);
    const goal = this.nearestOpen(b.c, b.r);
    if (start < 0 || goal < 0) return [{ x: tx, y: ty }];
    const N = this.cols * this.rows;
    const gScore = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap: [number, number][] = [];
    const push = (f: number, i: number) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const gc = goal % this.cols;
    const gr = Math.floor(goal / this.cols);
    const h = (i: number) => {
      const dc = Math.abs((i % this.cols) - gc);
      const dr = Math.abs(Math.floor(i / this.cols) - gr);
      return Math.max(dc, dr) + 0.414 * Math.min(dc, dr);
    };
    gScore[start] = 0;
    push(h(start), start);
    let found = false;
    while (heap.length) {
      const [, i] = pop();
      if (closed[i]) continue;
      closed[i] = 1;
      if (i === goal) {
        found = true;
        break;
      }
      const c = i % this.cols;
      const r = Math.floor(i / this.cols);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const cc = c + dc;
          const rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= this.cols || rr >= this.rows) continue;
          const j = rr * this.cols + cc;
          if (!this.open[j] || closed[j]) continue;
          // No cutting corners past furniture.
          if (dr && dc && (!this.open[r * this.cols + cc] || !this.open[rr * this.cols + c])) continue;
          const ng = gScore[i] + (dr && dc ? 1.414 : 1);
          if (ng < gScore[j]) {
            gScore[j] = ng;
            from[j] = i;
            push(ng + h(j), j);
          }
        }
    }
    if (!found) return [{ x: tx, y: ty }];
    const cells: { x: number; y: number }[] = [];
    for (let i = goal; i !== -1 && i !== start; i = from[i]) cells.push({ x: (i % this.cols) * CELL + CELL / 2, y: Math.floor(i / this.cols) * CELL + CELL / 2 });
    cells.reverse();
    cells.push({ x: tx, y: ty });
    // String-pull: skip every waypoint that can be reached in a straight line.
    const out: { x: number; y: number }[] = [];
    let cx = fx;
    let cy = fy;
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let m = cells.length - 1; m > k; m--)
        if (this.clear(cx, cy, cells[m].x, cells[m].y)) {
          far = m;
          break;
        }
      out.push(cells[far]);
      cx = cells[far].x;
      cy = cells[far].y;
      k = far + 1;
    }
    return out;
  }

  // ---- Simulation -----------------------------------------------------------

  update(dtMs: number) {
    const dt = Math.min(dtMs, 50) / 1000;
    const you = this.listener();
    for (const g of this.list) {
      const v = g.p.view;
      const t = g.target;
      if (!t) continue;
      if (Math.hypot(t.x - v.x, t.y - v.y) > 6) {
        if (!g.path.length) g.path = this.findPath(v.x, v.y, t.x, t.y);
        const wp = g.path[0];
        const dx = wp.x - v.x;
        const dy = wp.y - v.y;
        const d = Math.hypot(dx, dy);
        if (d < 5 && g.path.length > 1) {
          g.path.shift();
          continue;
        }
        // Someone (another guest or the player) right ahead: a moving person gets a moment
        // to pass, someone standing still gets walked around.
        let ux = dx / (d || 1);
        let uy = dy / (d || 1);
        let blocked = false;
        let side = 0;
        let still = false;
        for (const o of this.list) {
          if (o === g) continue;
          const ov = o.p.view;
          const ox = ov.x - v.x;
          const oy = ov.y - v.y;
          const ahead = ox * ux + oy * uy;
          const lateral = ox * uy - oy * ux;
          if (ahead > 0 && ahead < 38 && Math.abs(lateral) < 26) {
            blocked = true;
            side = lateral > 0 ? -1 : 1;
            still = o.speed < 10;
          }
        }
        {
          const ox = you.x - v.x;
          const oy = you.y - v.y;
          const ahead = ox * ux + oy * uy;
          const lateral = ox * uy - oy * ux;
          if (ahead > 0 && ahead < 42 && Math.abs(lateral) < 28) {
            blocked = true;
            side = lateral > 0 ? -1 : 1;
            still = true;
          }
        }
        g.blockedFor = blocked ? g.blockedFor + dt : 0;
        if (blocked && (still || g.blockedFor > 0.5)) {
          // Swerve: bend the direction sideways, away from whoever is in the way.
          const sx = ux - uy * side * 1.3;
          const sy = uy + ux * side * 1.3;
          const sl = Math.hypot(sx, sy);
          ux = sx / sl;
          uy = sy / sl;
        } else if (blocked) g.wait = Math.max(g.wait, 0.2);
        g.wait -= dt;
        const want = g.wait > 0 ? 0 : WALK * Math.min(1, 0.4 + Math.hypot(t.x - v.x, t.y - v.y) / 60);
        g.speed += (want - g.speed) * Math.min(1, dt * 6);
        const step = Math.min(Math.max(d, 4), g.speed * dt);
        const ox = v.x;
        const oy = v.y;
        // Walk on, or slide along an edge if a corner is in the way.
        if (!this.collides(v.x + ux * step, v.y + uy * step) || this.collides(v.x, v.y)) {
          v.x += ux * step;
          v.y += uy * step;
        } else if (Math.abs(ux) > 0.2 && !this.collides(v.x + Math.sign(ux) * step, v.y)) v.x += Math.sign(ux) * step;
        else if (Math.abs(uy) > 0.2 && !this.collides(v.x, v.y + Math.sign(uy) * step)) v.y += Math.sign(uy) * step;
        // After a swerve the old waypoints may be out of sight: plan again.
        if (blocked && still) g.replan = true;
        else if (g.replan) {
          g.replan = false;
          g.path = [];
        }
        if (g.wait <= 0 && Math.hypot(v.x - ox, v.y - oy) < 0.05) {
          g.stuck += dt;
          if (g.stuck > 0.6) g.path = []; // find a new way
          if (g.stuck > 3) this.retarget(g);
        } else if (g.wait <= 0) g.stuck = 0;
        // Still no way through: change plans.
        if (g.blockedFor > 3 + Math.random()) this.retarget(g);
        g.p.update(dtMs, g.speed > 8 ? Math.atan2(dy, dx) : null);
      } else {
        // At the spot: face the machine and play, or just hang out.
        if (t.fx) g.p.faceTowards(Math.atan2(t.fx.y - v.y, t.fx.x - v.x));
        g.p.update(dtMs, null);
        g.speed = 0;
        g.stay -= dt;
        if (t.kind === 'station') {
          g.nextWin -= dt;
          if (g.nextWin <= 0) {
            g.nextWin = 4 + Math.random() * 8;
            if (Math.random() < 0.35) this.smallWin(t);
          }
        }
        if (g.stay <= 0) this.retarget(g);
      }
      v.zIndex = v.y + 16;
    }
  }

  private retarget(g: Guest) {
    const next = this.free(g.target);
    if (!next) {
      g.stay = 3;
      return;
    }
    if (g.target) this.taken.delete(g.target);
    this.taken.add(next);
    g.target = next;
    g.path = [];
    g.stay = next.kind === 'station' ? 8 + Math.random() * 14 : 5 + Math.random() * 8;
    g.stuck = 0;
    g.blockedFor = 0;
  }

  /** A little win at someone else's machine: a few sparks of light rise and a number floats up. */
  private smallWin(s: Spot) {
    const at = s.fx ?? { x: s.x, y: s.y - 40 };
    const amount = pick([20, 30, 40, 60, 80, 120, 150, 250]);
    floatText(this.fxLayer, at.x, at.y - 10, `+${amount}`, COLORS.lamp, 20);
    for (let i = 0; i < 4; i++) {
      const c = new Container();
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.width = glow.height = 40;
      glow.tint = COLORS.lamp;
      glow.alpha = 0.5;
      glow.blendMode = 'add';
      const m = new Sprite(emblemTexture());
      m.anchor.set(0.5);
      m.width = m.height = 16;
      m.tint = 0xfff1c4;
      c.addChild(glow, m);
      c.position.set(at.x, at.y);
      this.fxLayer.addChild(c);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const dist = 50 + Math.random() * 50;
      const base = 16 / m.texture.width;
      void animate(
        1300 + Math.random() * 500,
        (k) => {
          // The room may be left (and destroyed) while the sparks still rise.
          if (c.destroyed) return;
          c.x = at.x + Math.cos(ang) * dist * k + Math.sin(k * 12 + i) * 6;
          c.y = at.y + Math.sin(ang) * dist * k;
          c.alpha = 1 - k;
          m.scale.set(base * (0.8 + 0.3 * Math.sin(k * 14 + i)));
        },
        ease.outCubic,
      ).then(() => !c.destroyed && c.destroy({ children: true }));
    }
    const l = this.listener();
    if (Math.hypot(l.x - at.x, l.y - at.y) < 380) sfx.coin();
  }
}

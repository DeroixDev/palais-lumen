// Shared visual effects: textures, particles, screen shake, floating text, counters.

import { CanvasSource, Container, Graphics, Sprite, Text, Texture, type Renderer, type TextStyleOptions } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { animate, ease, tween, wait } from './tween';
import { formatChips } from './state';

export const COLORS = {
  ink: 0x120c14,
  plum: 0x2a1630,
  burgundy: 0x6b1a2e,
  brass: 0xe0b25a,
  brassDark: 0x9a6f25,
  felt: 0x12705f,
  feltDark: 0x0b4a3f,
  lamp: 0xffcf7a,
  neon: 0xff5fa2,
  cyan: 0x5fe3ff,
  red: 0xc8243a,
  black: 0x1b1b22,
  white: 0xfff6e6,
};

export const FONT_DISPLAY = 'Bungee, Impact, sans-serif';
export const FONT_BODY = '"Barlow Condensed", "Arial Narrow", sans-serif';

const texCache = new Map<string, Texture>();

function canvasTexture(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = Texture.from(cv);
  texCache.set(key, t);
  return t;
}

/** Soft radial light, white; tint it and use blendMode "add". */
export function glowTexture() {
  return canvasTexture('glow', 256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

/** Linear gradient texture, used for cabinet bodies and panels. */
export function gradientTexture(key: string, w: number, h: number, stops: [number, string][], vertical = true) {
  return canvasTexture('grad-' + key, w, h, (c) => {
    const g = vertical ? c.createLinearGradient(0, 0, 0, h) : c.createLinearGradient(0, 0, w, 0);
    for (const [p, col] of stops) g.addColorStop(p, col);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}

/** Draws the house emblem (still the moth until the art pass) on a 2D canvas. */
export function drawEmblem(c: CanvasRenderingContext2D, cx: number, cy: number, s: number, wing: string | CanvasGradient, body: string, spots?: string) {
  c.save();
  c.fillStyle = wing;
  for (const side of [-1, 1]) {
    c.beginPath();
    c.ellipse(cx + side * 0.27 * s, cy - 0.1 * s, 0.3 * s, 0.19 * s, side * -0.45, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(cx + side * 0.18 * s, cy + 0.17 * s, 0.18 * s, 0.13 * s, side * 0.6, 0, Math.PI * 2);
    c.fill();
  }
  if (spots) {
    c.fillStyle = spots;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.arc(cx + side * 0.3 * s, cy - 0.12 * s, 0.06 * s, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.fillStyle = body;
  c.beginPath();
  c.ellipse(cx, cy + 0.02 * s, 0.055 * s, 0.27 * s, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = body;
  c.lineWidth = Math.max(1, 0.025 * s);
  c.lineCap = 'round';
  for (const side of [-1, 1]) {
    c.beginPath();
    c.moveTo(cx + side * 0.02 * s, cy - 0.22 * s);
    c.quadraticCurveTo(cx + side * 0.06 * s, cy - 0.42 * s, cx + side * 0.17 * s, cy - 0.46 * s);
    c.stroke();
  }
  c.restore();
}

/** The house coin: brass with an embossed moth. */
export function coinTexture() {
  return canvasTexture('coin', 64, 64, (c) => paintCoin(c, 64));
}

export function paintCoin(c: CanvasRenderingContext2D, size: number) {
  const k = size / 64;
  const g = c.createRadialGradient(24 * k, 22 * k, 4 * k, 32 * k, 32 * k, 30 * k);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(0.5, '#f0c25a');
  g.addColorStop(1, '#a8741f');
  c.fillStyle = g;
  c.beginPath();
  c.arc(32 * k, 32 * k, 29 * k, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#7a5214';
  c.lineWidth = 3 * k;
  c.stroke();
  // Milled rim.
  c.strokeStyle = 'rgba(122,82,20,0.55)';
  c.lineWidth = 1.2 * k;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    c.beginPath();
    c.moveTo(32 * k + Math.cos(a) * 25 * k, 32 * k + Math.sin(a) * 25 * k);
    c.lineTo(32 * k + Math.cos(a) * 28 * k, 32 * k + Math.sin(a) * 28 * k);
    c.stroke();
  }
  // Embossed moth: dark offset, then light face.
  drawEmblem(c, 33 * k, 35 * k, 38 * k, 'rgba(110,70,15,0.75)', 'rgba(110,70,15,0.9)');
  drawEmblem(c, 32 * k, 34 * k, 38 * k, '#ffe7a0', '#c9902e', 'rgba(168,116,31,0.7)');
}

/** White moth for particles; tint it. Wings flap by scaling x. */
export function emblemTexture() {
  return canvasTexture('moth', 64, 64, (c) => drawEmblem(c, 32, 34, 56, 'rgba(255,255,255,0.95)', 'rgba(255,255,255,1)', 'rgba(200,200,200,0.9)'));
}

/** Coin as an image URL for the HTML HUD. */
export function coinDataUrl(size = 64) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  paintCoin(cv.getContext('2d')!, size);
  return cv.toDataURL();
}

export function sparkTexture() {
  return canvasTexture('spark', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
    c.fillStyle = 'white';
    c.fillRect(15, 0, 2, 32);
    c.fillRect(0, 15, 32, 2);
  });
}

// ---- Reduced motion -----------------------------------------------------------------------

const MOTION_KEY = 'nf-reduced-motion';
let motionOverride: boolean | null = (() => {
  try {
    const v = localStorage.getItem(MOTION_KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
})();
const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/**
 * True when movement should be calm: the system setting, or the game's own switch.
 * Then: no screen shake, a third of the particles, counters jump, panels only fade.
 */
export function reducedMotion(): boolean {
  return motionOverride ?? motionQuery?.matches ?? false;
}

/** The game's own switch; null follows the system setting again. Remembered per device. */
export function setReducedMotion(on: boolean | null) {
  motionOverride = on;
  try {
    if (on === null) localStorage.removeItem(MOTION_KEY);
    else localStorage.setItem(MOTION_KEY, on ? '1' : '0');
  } catch {
    /* storage blocked: the switch still holds for this visit */
  }
  window.dispatchEvent(new Event('motion-change'));
}

/** Screen readers hear big moments (not every small win, that would be spam). */
let liveEl: HTMLElement | null = null;
export function announce(text: string) {
  if (typeof document === 'undefined') return;
  if (!liveEl) {
    liveEl = document.createElement('div');
    liveEl.setAttribute('aria-live', 'polite');
    liveEl.setAttribute('role', 'status');
    liveEl.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;left:0;top:0;';
    document.body.appendChild(liveEl);
  }
  liveEl.textContent = '';
  const el = liveEl;
  setTimeout(() => (el.textContent = text), 30);
}

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  vr: number;
  g: number;
  life: number;
  max: number;
  flip: number;
  fade: boolean;
  /** Grows with age (light waves). */
  grow?: number;
  base?: number;
}

interface Moth {
  c: Container;
  wings: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  phase: number;
  orbit: { x: number; y: number; r: number } | null;
  angle: number;
  spin: number;
}

interface FlyingCoin {
  s: Sprite;
  t: number;
  delay: number;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  arrived: boolean;
}

/** Where the HUD purse sits on screen; set by main.ts. */
export const purse = { x: 40, y: 34 };

/** Upper limit of live particle sprites, so a jackpot never floods the frame. */
const MAX_LIVE = 340;
/** Seconds a coin needs to fly into the purse (guide: about 400 ms). */
const COIN_FLIGHT = 0.42;

/** A soft ring of light for the medium win wave; tint it. */
export function ringTexture() {
  return canvasTexture('ring', 256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 60, 128, 128, 126);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.12)');
    g.addColorStop(0.82, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

export class Particles {
  readonly view = new Container();
  private list: Particle[] = [];
  private moths: Moth[] = [];
  private coins: FlyingCoin[] = [];

  /** How many of `n` requested particles may be spawned now (budget and reduced motion). */
  private budget(n: number) {
    const want = reducedMotion() ? Math.ceil(n / 3) : n;
    const live = this.list.length + this.moths.length * 2 + this.coins.length;
    return Math.max(0, Math.min(want, MAX_LIVE - live));
  }

  /**
   * The brand effect for big wins: glowing moths burst out of a point,
   * optionally circle something (a wheel, a machine), then flutter away.
   */
  drawSwarm(x: number, y: number, count: number, orbit: { x: number; y: number; r: number } | null = null, tint = 0xffe7a8, lifeS = 3.2) {
    count = this.budget(count);
    for (let i = 0; i < count; i++) {
      const c = new Container();
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.width = glow.height = 70;
      glow.tint = tint;
      glow.alpha = 0.5;
      glow.blendMode = 'add';
      const wings = new Sprite(emblemTexture());
      wings.anchor.set(0.5);
      wings.tint = tint;
      c.addChild(glow, wings);
      const sc = 0.4 + Math.random() * 0.35;
      c.scale.set(sc);
      c.position.set(x, y);
      this.view.addChild(c);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 260 + Math.random() * 320;
      this.moths.push({
        c,
        wings,
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        t: -Math.random() * 0.25,
        life: lifeS + Math.random() * 0.8,
        phase: Math.random() * 10,
        orbit,
        angle: Math.random() * Math.PI * 2,
        spin: (0.9 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1),
      });
    }
  }

  /** Coins fly from a point into the HUD purse (about 400 ms each, slightly staggered). */
  coinsToPurse(x: number, y: number, count: number) {
    count = this.budget(count);
    for (let i = 0; i < count; i++) {
      const s = new Sprite(coinTexture());
      s.anchor.set(0.5);
      s.scale.set(0.45);
      const ox = x + (Math.random() - 0.5) * 80;
      const oy = y + (Math.random() - 0.5) * 50;
      s.position.set(ox, oy);
      s.alpha = 0;
      this.view.addChild(s);
      this.coins.push({
        s,
        t: 0,
        delay: 0.08 + i * 0.035,
        x0: ox,
        y0: oy,
        cx: (ox + purse.x) / 2 + (Math.random() - 0.5) * 160,
        cy: Math.min(oy, purse.y) - 80 - Math.random() * 90,
        arrived: false,
      });
    }
  }

  /** A ring of light that sweeps out from a point: the medium win. */
  lightWave(x: number, y: number, tint: number = COLORS.lamp, radius = 260) {
    if (!this.budget(2)) return;
    const s = new Sprite(ringTexture());
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.tint = tint;
    s.blendMode = 'add';
    const base = (radius * 2) / 256;
    s.scale.set(base * 0.15);
    this.view.addChild(s);
    this.list.push({ s, vx: 0, vy: 0, vr: 0, g: 0, life: 0, max: 0.75, flip: 0, fade: true, grow: 1, base });
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.position.set(x, y);
    glow.tint = tint;
    glow.blendMode = 'add';
    glow.width = glow.height = radius * 1.4;
    glow.alpha = 0.5;
    this.view.addChild(glow);
    this.list.push({ s: glow, vx: 0, vy: 0, vr: 0, g: 0, life: 0, max: 0.5, flip: 0, fade: true });
  }

  private updateMoths(dt: number) {
    for (let i = this.moths.length - 1; i >= 0; i--) {
      const m = this.moths[i];
      m.t += dt;
      if (m.t < 0) continue;
      const leaving = m.t > m.life - 1;
      if (m.t < 0.55) {
        // Burst: fly out and slow down.
        m.vx *= 1 - 2.2 * dt;
        m.vy *= 1 - 2.2 * dt;
      } else if (m.orbit && !leaving) {
        m.angle += m.spin * dt;
        const r = m.orbit.r * (1 + 0.12 * Math.sin(m.t * 3 + m.phase));
        const tx = m.orbit.x + Math.cos(m.angle) * r;
        const ty = m.orbit.y + Math.sin(m.angle) * r * 0.85;
        m.vx += ((tx - m.x) * 6 - m.vx) * Math.min(1, dt * 4);
        m.vy += ((ty - m.y) * 6 - m.vy) * Math.min(1, dt * 4);
      } else {
        // Flutter: a wobbly drift that drifts upwards when leaving.
        m.vx += Math.sin(m.t * 5 + m.phase) * 500 * dt;
        m.vy += (Math.cos(m.t * 4 + m.phase) * 400 - (leaving ? 700 : 60)) * dt;
        m.vx *= 1 - 0.8 * dt;
        m.vy *= 1 - 0.8 * dt;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.c.position.set(m.x, m.y);
      m.c.rotation = Math.atan2(m.vy, m.vx) + Math.PI / 2;
      m.wings.scale.x = 0.25 + 0.75 * Math.abs(Math.sin(m.t * 22 + m.phase));
      m.c.alpha = Math.min(1, m.t * 4) * (leaving ? Math.max(0, m.life - m.t) : 1);
      if (m.t >= m.life) {
        m.c.destroy({ children: true });
        this.moths.splice(i, 1);
      }
    }
  }

  private updateCoins(dt: number) {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt;
      const k = Math.min(1, (c.t - c.delay) / COIN_FLIGHT);
      if (k < 0) {
        // A short pop where the coin appears.
        const a = Math.min(1, c.t * 12);
        c.s.alpha = a;
        c.s.scale.set(0.45 * (0.6 + 0.4 * ease.outBack(a)));
        continue;
      }
      // Ease in: the coin gathers speed and lands with a snap.
      const e = k * k * (1.6 - 0.6 * k);
      const u = 1 - e;
      c.s.x = u * u * c.x0 + 2 * u * e * c.cx + e * e * purse.x;
      c.s.y = u * u * c.y0 + 2 * u * e * c.cy + e * e * purse.y;
      c.s.alpha = 1;
      c.s.scale.set(0.45 * (1 - e * 0.45));
      c.s.scale.x *= Math.cos(c.t * 14);
      if (k >= 1) {
        c.s.destroy();
        this.coins.splice(i, 1);
        window.dispatchEvent(new Event('purse-bump'));
      }
    }
  }

  update(dtMs: number) {
    const dt = dtMs / 1000;
    this.updateMoths(dt);
    this.updateCoins(dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life += dt;
      p.vy += p.g * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.vr * dt;
      if (p.flip) p.s.scale.x = Math.cos(p.life * p.flip) * Math.abs(p.s.scale.y);
      const k = p.life / p.max;
      if (p.grow && p.base) p.s.scale.set(p.base * (0.15 + 0.85 * ease.outCubic(Math.min(1, k))));
      if (p.fade) p.s.alpha = Math.max(0, 1 - k * k);
      if (k >= 1) {
        p.s.destroy();
        this.list.splice(i, 1);
      }
    }
  }

  private add(tex: Texture, x: number, y: number, o: Partial<Particle> & { scale?: number; tint?: number; add?: boolean }) {
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.scale.set(o.scale ?? 1);
    if (o.tint !== undefined) s.tint = o.tint;
    if (o.add) s.blendMode = 'add';
    this.view.addChild(s);
    this.list.push({
      s,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      vr: o.vr ?? 0,
      g: o.g ?? 0,
      life: 0,
      max: o.max ?? 1,
      flip: o.flip ?? 0,
      fade: o.fade ?? true,
    });
    return s;
  }

  /** Coins burst out of a point. */
  coinBurst(x: number, y: number, count: number) {
    count = this.budget(count);
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 300 + Math.random() * 500;
      this.add(coinTexture(), x, y, {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: 1400,
        max: 1.4 + Math.random() * 0.6,
        flip: 6 + Math.random() * 8,
        scale: 0.35 + Math.random() * 0.3,
      });
    }
  }

  /** Coins falling from the top edge over the whole width. */
  coinRain(width: number, count: number) {
    count = this.budget(count);
    for (let i = 0; i < count; i++) {
      this.add(coinTexture(), Math.random() * width, -40 - Math.random() * 600, {
        vx: (Math.random() - 0.5) * 80,
        vy: 200 + Math.random() * 300,
        g: 600,
        max: 3,
        flip: 5 + Math.random() * 8,
        scale: 0.3 + Math.random() * 0.45,
      });
    }
  }

  sparkle(x: number, y: number, count: number, tint = 0xffe7a8, spread = 160) {
    count = this.budget(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * spread;
      this.add(sparkTexture(), x, y, {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        max: 0.6 + Math.random() * 0.8,
        vr: (Math.random() - 0.5) * 6,
        scale: 0.4 + Math.random() * 0.8,
        tint,
        add: true,
      });
    }
  }

  /** Paper confetti in the house colours: brass, rose, cream and teal. */
  confetti(width: number, count: number) {
    count = this.budget(count);
    const cols = [COLORS.brass, 0xe86a92, COLORS.white, 0x5fc9c0, COLORS.lamp, 0xb3132b];
    for (let i = 0; i < count; i++) {
      const s = this.add(confettiTexture(), Math.random() * width, -20 - Math.random() * 300, {
        vx: (Math.random() - 0.5) * 120,
        vy: 120 + Math.random() * 200,
        g: 180,
        vr: (Math.random() - 0.5) * 10,
        flip: 4 + Math.random() * 6,
        max: 4,
        scale: 0.6 + Math.random() * 0.5,
        tint: cols[i % cols.length],
      });
      s.scale.y = s.scale.x;
    }
  }

  clear() {
    for (const p of this.list) p.s.destroy();
    for (const m of this.moths) m.c.destroy({ children: true });
    for (const c of this.coins) c.s.destroy();
    this.list = [];
    this.moths = [];
    this.coins = [];
  }
}

/** A small paper rectangle with a fold shading; tint it. */
function confettiTexture() {
  return canvasTexture('confetti', 24, 12, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(1, 1, 22, 10);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(12, 1, 11, 10);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillRect(1, 1, 22, 2);
  });
}

const shaking = new WeakMap<Container, { ox: number; oy: number; n: number }>();

/**
 * Shakes a container around its resting position. Kept for the biggest moments only:
 * at most 8 px and 300 ms, and not at all with reduced motion.
 */
export function shake(target: Container, strength = 8, durationMs = 300) {
  if (reducedMotion()) return Promise.resolve();
  const s0 = Math.min(8, Math.max(0, strength));
  const d = Math.min(300, Math.max(60, durationMs));
  // Overlapping shakes share one resting point, so the layer never drifts away.
  let rest = shaking.get(target);
  if (!rest) shaking.set(target, (rest = { ox: target.x, oy: target.y, n: 0 }));
  rest.n++;
  const r = rest;
  return animate(d, (t) => {
    if (target.destroyed) return;
    const s = s0 * (1 - t) * (1 - t);
    target.x = r.ox + (Math.random() - 0.5) * 2 * s;
    target.y = r.oy + (Math.random() - 0.5) * 2 * s;
    if (t >= 1) {
      target.position.set(r.ox, r.oy);
      if (--r.n <= 0) shaking.delete(target);
    }
  });
}

/** Text that pops, rises and fades, e.g. "+250". Cream-gold with an ink outline, readable on any table. */
export function floatText(parent: Container, x: number, y: number, text: string, color = COLORS.lamp, size = 34) {
  const t = new Text({
    text,
    style: {
      fontFamily: FONT_DISPLAY,
      fontSize: size,
      fill: color,
      stroke: { color: 0x1a0f14, width: Math.max(3, size * 0.18), join: 'round' },
      dropShadow: { color: 0x0a0410, blur: 6, distance: Math.max(2, size * 0.08), angle: Math.PI / 2, alpha: 0.6 },
    },
  });
  t.anchor.set(0.5);
  t.position.set(x, y);
  parent.addChild(t);
  if (reducedMotion()) {
    void tween(t, { alpha: 0 }, 600, ease.inCubic, 900).then(() => t.destroy());
    return;
  }
  t.scale.set(0.5);
  void tween(t.scale, { x: 1, y: 1 }, 260, ease.outBack);
  void tween(t, { y: y - 70, alpha: 0 }, 1100, ease.inCubic, 450).then(() => t.destroy());
}

/** Rolls a number up in a Text object (ease-out); with reduced motion it jumps to the result. */
export function countUp(t: Text, from: number, to: number, durationMs: number, prefix = '', onTick?: () => void) {
  if (reducedMotion()) {
    t.text = prefix + formatChips(to);
    onTick?.();
    return Promise.resolve();
  }
  let last = from;
  return animate(
    durationMs,
    (k) => {
      const v = Math.round(from + (to - from) * k);
      if (v !== last && onTick) onTick();
      last = v;
      t.text = prefix + formatChips(v);
    },
    ease.outCubic,
  );
}

let rendererRef: Renderer | null = null;
export function setRenderer(r: Renderer) {
  rendererRef = r;
}
/** Renders a Graphics/Container once into a texture so it can be reused cheaply. */
export function bake(c: Container): Texture {
  const tex = rendererRef!.generateTexture({ target: c, resolution: 2, antialias: true });
  c.destroy({ children: true });
  return tex;
}

/**
 * Neon title text. The glow is rendered once into a texture: a live glow filter
 * would be recalculated every frame and cost a lot of frame time.
 */
export function glowText(
  text: string,
  style: Partial<TextStyleOptions>,
  glow: { color: number; distance?: number; outerStrength?: number; innerStrength?: number },
): Sprite {
  const t = new Text({ text, style });
  const d = glow.distance ?? 16;
  const wrap = new Container();
  wrap.addChild(new Graphics().rect(-d * 2, -d * 2, t.width + d * 4, t.height + d * 4).fill({ color: 0, alpha: 0.001 }));
  t.filters = [new GlowFilter({ ...glow, distance: d, quality: 0.5 })];
  wrap.addChild(t);
  const s = new Sprite(bake(wrap));
  s.anchor.set(0.5);
  return s;
}

const glowCache = new Map<string, GlowFilter>();
/** One shared glow filter per look, so repeated highlights don't create new filters every round. */
export function sharedGlow(color: number, distance = 12, outerStrength = 3): GlowFilter {
  const key = `${color}-${distance}-${outerStrength}`;
  let f = glowCache.get(key);
  if (!f) {
    f = new GlowFilter({ color, distance, outerStrength, quality: 0.2 });
    glowCache.set(key, f);
  }
  return f;
}

export type WinTier = 'small' | 'big' | 'jackpot';

/** Same three levels in every game: small win (more than the stake back), big win from 10×, jackpot from 50×. */
export function tierFor(multiplier: number): WinTier | null {
  // Getting part of the stake back is not a win, so it gets no fanfare.
  if (multiplier <= 1) return null;
  if (multiplier >= 50) return 'jackpot';
  if (multiplier >= 10) return 'big';
  return 'small';
}

/**
 * The reward ladder of the UI guide, finer than tierFor:
 * 0 nothing, 1 small (coins into the purse), 2 medium from 10× (plus a light wave),
 * 3 big from 20× (the stage moment), 4 jackpot from 50× (the only one that shakes).
 */
export function rewardLevel(multiplier: number): 0 | 1 | 2 | 3 | 4 {
  if (multiplier <= 1) return 0;
  if (multiplier >= 50) return 4;
  if (multiplier >= 20) return 3;
  if (multiplier >= 10) return 2;
  return 1;
}

// ---- Painted plaque (banners, day card) ---------------------------------------------------------

const measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;

function hex(n: number, a = 1) {
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * A brass-framed velvet plaque with ribbon tails and a moth crest, the title in polished gold.
 * Painted once with Canvas 2D (no filters); `accent` colours the halo and the inner line.
 * Returns the texture and the plaque's size in world pixels (the texture has a margin for the halo).
 */
export function plaqueTexture(title: string, accent: number, opts: { size?: number; sub?: string; subSize?: number } = {}) {
  const size = opts.size ?? 64;
  const subSize = opts.subSize ?? Math.round(size * 0.42);
  const font = `${size}px Bungee, Impact, sans-serif`;
  const subFont = `600 ${subSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  const spacing = size * 0.06;
  const subLines = opts.sub ? opts.sub.split('\n') : [];
  let tw = size * title.length * 0.7;
  let sw = 0;
  if (measureCtx) {
    measureCtx.font = font;
    tw = measureCtx.measureText(title).width + spacing * (title.length - 1);
    measureCtx.font = subFont;
    for (const l of subLines) sw = Math.max(sw, measureCtx.measureText(l).width);
  }
  const padX = size * 0.9;
  const pw = Math.ceil(Math.max(tw, sw) + padX * 2);
  const ph = Math.ceil(size * 1.55 + (subLines.length ? subSize * (0.35 + 1.2 * subLines.length) : 0));
  const tail = size * 0.8;
  const margin = size * 0.9;
  const W = pw + tail * 2 + margin * 2;
  const H = ph + margin * 2 + size * 0.5;
  const res = 2;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(W * res);
  cv.height = Math.ceil(H * res);
  const c = cv.getContext('2d')!;
  c.scale(res, res);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const x0 = margin + tail;
  const y0 = margin + size * 0.35;
  const cx = W / 2;
  const ink = 'rgba(22,10,20,0.9)';

  // Halo in the accent colour, so the plaque reads as lit.
  c.save();
  c.translate(cx, y0 + ph / 2);
  c.scale(1, (ph + margin * 1.4) / (pw + margin * 1.4));
  const halo = c.createRadialGradient(0, 0, 0, 0, 0, (pw + margin * 1.4) / 2);
  halo.addColorStop(0, hex(accent, 0.45));
  halo.addColorStop(0.55, hex(accent, 0.18));
  halo.addColorStop(1, hex(accent, 0));
  c.fillStyle = halo;
  c.beginPath();
  c.arc(0, 0, (pw + margin * 1.4) / 2, 0, Math.PI * 2);
  c.fill();
  c.restore();

  // Ribbon tails behind both ends, folded back.
  for (const side of [-1, 1]) {
    const ex = side < 0 ? x0 + 6 : x0 + pw - 6;
    const ty = y0 + ph * 0.28;
    const th = ph * 0.62;
    c.beginPath();
    c.moveTo(ex, ty);
    c.lineTo(ex - side * (tail + 10), ty + th * 0.1);
    c.lineTo(ex - side * (tail - 12), ty + th * 0.55);
    c.lineTo(ex - side * (tail + 10), ty + th);
    c.lineTo(ex, ty + th * 0.9);
    c.closePath();
    const rg = c.createLinearGradient(0, ty, 0, ty + th);
    rg.addColorStop(0, '#6b1a2e');
    rg.addColorStop(1, '#2a0a16');
    c.fillStyle = rg;
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 2.5;
    c.stroke();
    c.strokeStyle = 'rgba(224,178,90,0.75)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(ex - side * 4, ty + 5);
    c.lineTo(ex - side * (tail + 2), ty + th * 0.16);
    c.stroke();
  }

  // Brass frame with a cut-corner art-deco outline.
  const cut = Math.min(18, ph * 0.22);
  const path = (x: number, y: number, w: number, h: number, k: number) => {
    c.beginPath();
    c.moveTo(x + k, y);
    c.lineTo(x + w - k, y);
    c.lineTo(x + w, y + k);
    c.lineTo(x + w, y + h - k);
    c.lineTo(x + w - k, y + h);
    c.lineTo(x + k, y + h);
    c.lineTo(x, y + h - k);
    c.lineTo(x, y + k);
    c.closePath();
  };
  // Drop shadow under the plaque.
  path(x0 + 3, y0 + 7, pw, ph, cut);
  c.fillStyle = 'rgba(8,3,10,0.55)';
  c.fill();
  path(x0, y0, pw, ph, cut);
  const brass = c.createLinearGradient(x0, y0, x0 + pw * 0.4, y0 + ph);
  brass.addColorStop(0, '#fff4c2');
  brass.addColorStop(0.25, '#f0c868');
  brass.addColorStop(0.55, '#b07a2a');
  brass.addColorStop(0.8, '#e6b85a');
  brass.addColorStop(1, '#7a4e18');
  c.fillStyle = brass;
  c.fill();
  c.strokeStyle = ink;
  c.lineWidth = 3;
  c.stroke();
  // Velvet field.
  const b = Math.max(5, size * 0.1);
  path(x0 + b, y0 + b, pw - b * 2, ph - b * 2, cut - b * 0.5);
  const vel = c.createLinearGradient(0, y0, 0, y0 + ph);
  vel.addColorStop(0, '#3a1530');
  vel.addColorStop(0.5, '#24101f');
  vel.addColorStop(1, '#150812');
  c.fillStyle = vel;
  c.fill();
  c.strokeStyle = 'rgba(22,10,20,0.9)';
  c.lineWidth = 2;
  c.stroke();
  // Fine velvet grain.
  c.save();
  c.clip();
  let s = (title.length * 977 + size) >>> 0 || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) % 10000) / 10000;
  for (let i = 0; i < pw * 0.6; i++) {
    c.strokeStyle = rnd() < 0.5 ? 'rgba(255,230,240,0.035)' : 'rgba(0,0,0,0.08)';
    c.lineWidth = 1 + rnd();
    const px = x0 + rnd() * pw;
    const py = y0 + rnd() * ph;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + 4 + rnd() * 8, py + (rnd() - 0.5) * 2);
    c.stroke();
  }
  // Soft light from the upper left.
  const sheen = c.createRadialGradient(x0 + pw * 0.25, y0, 0, x0 + pw * 0.25, y0, pw * 0.7);
  sheen.addColorStop(0, 'rgba(255,220,240,0.12)');
  sheen.addColorStop(1, 'rgba(255,220,240,0)');
  c.fillStyle = sheen;
  c.fillRect(x0, y0, pw, ph);
  c.restore();
  // Accent inner line and the 2 px gloss edge on the upper left of the frame.
  path(x0 + b + 4, y0 + b + 4, pw - b * 2 - 8, ph - b * 2 - 8, cut - b);
  c.strokeStyle = hex(accent, 0.55);
  c.lineWidth = 1.5;
  c.stroke();
  c.beginPath();
  c.moveTo(x0 + 2, y0 + ph - cut);
  c.lineTo(x0 + 2, y0 + cut);
  c.lineTo(x0 + cut, y0 + 2);
  c.lineTo(x0 + pw * 0.55, y0 + 2);
  c.strokeStyle = 'rgba(255,248,220,0.9)';
  c.lineWidth = 2;
  c.stroke();

  // Moth crest on top, the only ornament.
  const cy = y0 - size * 0.05;
  c.beginPath();
  c.arc(cx, cy, size * 0.36, 0, Math.PI * 2);
  c.fillStyle = brass;
  c.fill();
  c.strokeStyle = ink;
  c.lineWidth = 2.5;
  c.stroke();
  drawEmblem(c, cx + 1, cy + 2, size * 0.5, 'rgba(90,50,10,0.7)', 'rgba(90,50,10,0.9)');
  drawEmblem(c, cx, cy + 1, size * 0.5, '#fff1c4', '#9a6f25', 'rgba(168,116,31,0.7)');

  // Title: ink outline, then polished gold with a light top.
  const tyMid = y0 + (subLines.length ? size * 0.82 : ph / 2) + size * 0.04;
  c.font = font;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  const drawSpaced = (fn: (ch: string, x: number) => void) => {
    let x = cx - tw / 2;
    for (const ch of title) {
      fn(ch, x);
      x += c.measureText(ch).width + spacing;
    }
  };
  c.lineWidth = size * 0.16;
  c.strokeStyle = ink;
  drawSpaced((ch, x) => c.strokeText(ch, x, tyMid + 2));
  const tg = c.createLinearGradient(0, tyMid - size * 0.5, 0, tyMid + size * 0.5);
  tg.addColorStop(0, '#fff8dc');
  tg.addColorStop(0.45, '#f6d27a');
  tg.addColorStop(0.55, '#d9a440');
  tg.addColorStop(1, '#fbe3a0');
  c.fillStyle = tg;
  drawSpaced((ch, x) => c.fillText(ch, x, tyMid));
  c.font = subFont;
  c.textAlign = 'center';
  c.fillStyle = '#f2e6c9';
  subLines.forEach((l, i) => c.fillText(l, cx, y0 + size * 1.5 + subSize * (0.55 + 1.2 * i)));
  const tex = new Texture({ source: new CanvasSource({ resource: cv, resolution: res }) });
  return { tex, w: pw, h: ph, fullW: W, visW: pw + tail * 2 };
}

/** Only one stage moment at a time: a new banner replaces the one on screen. */
let liveBanner: { out: () => void } | null = null;

/**
 * A big headline on a painted plaque: pops in (about 450 ms), holds, then leaves.
 * Tapping skips it from 0.5 s on. Resolves when it has arrived, like before.
 */
export async function banner(parent: Container, text: string, color: number, x: number, y: number, maxWidth: number) {
  liveBanner?.out();
  const { tex, fullW, visW } = plaqueTexture(text, color, { size: 64 });
  const c = new Container();
  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.tint = color;
  glow.blendMode = 'add';
  glow.alpha = 0;
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  c.addChild(glow, s);
  const fit = Math.min(1, maxWidth / (visW + 24));
  glow.width = fullW * 1.1;
  glow.height = tex.height * 1.1;
  c.position.set(x, y);
  parent.addChild(c);
  announce(text);
  const calm = reducedMotion();
  let gone = false;
  let shownAt = performance.now();
  const out = () => {
    if (gone) return;
    gone = true;
    window.removeEventListener('pointerdown', onTap, true);
    if (liveBanner?.out === out) liveBanner = null;
    void tween(c, { alpha: 0 }, 180, ease.inCubic).then(() => {
      c.destroy({ children: true });
      tex.destroy(true);
    });
    if (!calm) void tween(c.scale, { x: fit * 0.97, y: fit * 0.97 }, 180, ease.inCubic);
  };
  const onTap = () => {
    if (performance.now() - shownAt >= 500) out();
  };
  liveBanner = { out };
  window.addEventListener('pointerdown', onTap, true);
  if (calm) {
    c.scale.set(fit);
    c.alpha = 0;
    await tween(c, { alpha: 1 }, 280);
  } else {
    c.scale.set(fit * 0.6);
    c.rotation = -0.05;
    c.alpha = 0;
    shownAt = performance.now();
    await Promise.all([
      tween(c, { alpha: 1 }, 200),
      tween(c, { rotation: 0 }, 450, ease.outBack),
      tween(c.scale, { x: fit, y: fit }, 450, ease.outBack),
      tween(glow, { alpha: 0.55 }, 300).then(() => tween(glow, { alpha: 0.25 }, 700, ease.inOutCubic)),
    ]);
  }
  // Holds for about 1.4 s, so the whole moment stays inside 1.5 to 2.5 s.
  void wait(1400).then(() => {
    if (gone) return;
    if (!calm) void tween(c, { y: y - 16 }, 380, ease.inCubic);
    gone = true;
    window.removeEventListener('pointerdown', onTap, true);
    if (liveBanner?.out === out) liveBanner = null;
    void tween(c, { alpha: 0 }, 380, ease.inCubic).then(() => {
      c.destroy({ children: true });
      tex.destroy(true);
    });
  });
}

export const CHIP_COLORS: Record<number, number> = { 10: 0x2f6fd6, 50: 0xe0761f, 100: 0x1b1b22, 250: 0x1d8a5c, 500: 0x7b3fc4, 1000: 0xc8243a };

/** A casino chip with the brand's wing pattern on the rim. */
export function drawChip(value: number, radius = 20): Container {
  const c = new Container();
  const col = CHIP_COLORS[value] ?? 0x2f6fd6;
  const g = new Graphics();
  g.circle(0, 3, radius).fill({ color: 0x000000, alpha: 0.4 });
  g.circle(0, 0, radius).fill(col);
  // Four pairs of wings around the rim.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    for (const side of [-1, 1]) {
      const base = a + side * 0.09;
      const tip = a + side * 0.42;
      const r0 = radius * 0.62;
      const r1 = radius * 0.98;
      g.poly([
        Math.cos(base) * r0, Math.sin(base) * r0,
        Math.cos(base) * r1, Math.sin(base) * r1,
        Math.cos(tip) * r1, Math.sin(tip) * r1,
        Math.cos(tip - side * 0.08) * (r0 + radius * 0.12), Math.sin(tip - side * 0.08) * (r0 + radius * 0.12),
      ]).fill(0xfff6e6);
    }
  }
  g.circle(0, 0, radius * 0.62).fill(col).stroke({ color: 0xfff6e6, width: Math.max(1, radius * 0.07), alpha: 0.8 });
  g.circle(0, 0, radius).stroke({ color: 0x000000, width: 1, alpha: 0.35 });
  c.addChild(g);
  return c;
}

// Shared visual effects: textures, particles, screen shake, floating text, counters.

import { Container, Graphics, Sprite, Text, Texture, type Renderer } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { animate, ease, tween } from './tween';
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

/** Draws the Nachtfalter moth (the brand mark) on a 2D canvas. */
export function drawMoth(c: CanvasRenderingContext2D, cx: number, cy: number, s: number, wing: string | CanvasGradient, body: string, spots?: string) {
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

/** The "Falter" coin: brass with an embossed moth. */
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
  drawMoth(c, 33 * k, 35 * k, 38 * k, 'rgba(110,70,15,0.75)', 'rgba(110,70,15,0.9)');
  drawMoth(c, 32 * k, 34 * k, 38 * k, '#ffe7a0', '#c9902e', 'rgba(168,116,31,0.7)');
}

/** White moth for particles; tint it. Wings flap by scaling x. */
export function mothTexture() {
  return canvasTexture('moth', 64, 64, (c) => drawMoth(c, 32, 34, 56, 'rgba(255,255,255,0.95)', 'rgba(255,255,255,1)', 'rgba(200,200,200,0.9)'));
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

export class Particles {
  readonly view = new Container();
  private list: Particle[] = [];
  private moths: Moth[] = [];
  private coins: FlyingCoin[] = [];

  /**
   * The brand effect for big wins: glowing moths burst out of a point,
   * optionally circle something (a wheel, a machine), then flutter away.
   */
  mothSwarm(x: number, y: number, count: number, orbit: { x: number; y: number; r: number } | null = null, tint = 0xffe7a8, lifeS = 3.2) {
    for (let i = 0; i < count; i++) {
      const c = new Container();
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.width = glow.height = 70;
      glow.tint = tint;
      glow.alpha = 0.55;
      glow.blendMode = 'add';
      const wings = new Sprite(mothTexture());
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

  /** Coins fly from a point into the HUD purse. */
  coinsToPurse(x: number, y: number, count: number) {
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
        delay: 0.15 + i * 0.045,
        x0: ox,
        y0: oy,
        cx: (ox + purse.x) / 2 + (Math.random() - 0.5) * 200,
        cy: Math.min(oy, purse.y) - 120 - Math.random() * 120,
        arrived: false,
      });
    }
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
      const k = (c.t - c.delay) / 0.7;
      if (k < 0) {
        c.s.alpha = Math.min(1, c.t * 8);
        continue;
      }
      const e = k * k * (3 - 2 * k);
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
  }

  /** Coins burst out of a point. */
  coinBurst(x: number, y: number, count: number) {
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

  confetti(width: number, count: number) {
    const cols = [COLORS.neon, COLORS.brass, COLORS.cyan, COLORS.white, COLORS.lamp];
    for (let i = 0; i < count; i++) {
      this.add(Texture.WHITE, Math.random() * width, -20 - Math.random() * 300, {
        vx: (Math.random() - 0.5) * 120,
        vy: 120 + Math.random() * 200,
        g: 180,
        vr: (Math.random() - 0.5) * 10,
        flip: 4 + Math.random() * 6,
        max: 4,
        scale: 0.6 + Math.random() * 0.5,
        tint: cols[i % cols.length],
      });
      const s = this.list[this.list.length - 1].s;
      s.width = 12;
      s.height = 6;
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

/** Shakes a container around its current position. */
export function shake(target: Container, strength = 12, durationMs = 450) {
  const ox = target.x;
  const oy = target.y;
  return animate(durationMs, (t) => {
    const s = strength * (1 - t);
    target.x = ox + (Math.random() - 0.5) * 2 * s;
    target.y = oy + (Math.random() - 0.5) * 2 * s;
    if (t >= 1) target.position.set(ox, oy);
  });
}

/** Text that rises and fades, e.g. "+250". */
export function floatText(parent: Container, x: number, y: number, text: string, color = COLORS.lamp, size = 34) {
  const t = new Text({
    text,
    style: {
      fontFamily: FONT_DISPLAY,
      fontSize: size,
      fill: color,
      stroke: { color: COLORS.ink, width: 6 },
      dropShadow: { color: color, blur: 12, distance: 0, alpha: 0.8 },
    },
  });
  t.anchor.set(0.5);
  t.position.set(x, y);
  t.scale.set(0.3);
  parent.addChild(t);
  void tween(t.scale, { x: 1, y: 1 }, 350, ease.outBack);
  void tween(t, { y: y - 90, alpha: 0 }, 1400, ease.inCubic, 500).then(() => t.destroy());
}

/** Rolls a number up in a Text object. */
export function countUp(t: Text, from: number, to: number, durationMs: number, prefix = '', onTick?: () => void) {
  let last = from;
  return animate(
    durationMs,
    (k) => {
      const v = Math.round(from + (to - from) * k);
      if (v !== last && onTick && Math.abs(v - last) > 0) onTick();
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

export type WinTier = 'small' | 'big' | 'jackpot';

/** Same three levels in every game: small win (more than the stake back), big win from 10×, jackpot from 50×. */
export function tierFor(multiplier: number): WinTier | null {
  // Getting part of the stake back is not a win, so it gets no fanfare.
  if (multiplier <= 1) return null;
  if (multiplier >= 50) return 'jackpot';
  if (multiplier >= 10) return 'big';
  return 'small';
}

/** A big headline that pops in, glows and fades out. */
export async function banner(parent: Container, text: string, color: number, x: number, y: number, maxWidth: number) {
  const t = new Text({
    text,
    style: { fontFamily: FONT_DISPLAY, fontSize: 84, fill: 0xfff6e6, stroke: { color: 0x14080f, width: 10 }, align: 'center' },
  });
  t.filters = [new GlowFilter({ color, distance: 24, outerStrength: 4, quality: 0.2 })];
  t.anchor.set(0.5);
  const fit = Math.min(1, (maxWidth * 0.9) / t.width);
  t.position.set(x, y);
  t.scale.set(0.1);
  t.rotation = -0.15;
  parent.addChild(t);
  await Promise.all([tween(t, { rotation: 0 }, 500, ease.outBack), tween(t.scale, { x: fit, y: fit }, 600, ease.outElastic)]);
  void tween(t.scale, { x: fit * 1.05, y: fit * 1.05 }, 700, ease.inOutCubic).then(() =>
    tween(t, { alpha: 0, y: y - 30 }, 500, ease.inCubic, 700).then(() => t.destroy()),
  );
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

// Shared visual effects: textures, particles, screen shake, floating text, counters.

import { Container, Sprite, Text, Texture, type Renderer } from 'pixi.js';
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

export function coinTexture() {
  return canvasTexture('coin', 64, 64, (c) => {
    const g = c.createRadialGradient(24, 22, 4, 32, 32, 30);
    g.addColorStop(0, '#fff3c4');
    g.addColorStop(0.5, '#f0c25a');
    g.addColorStop(1, '#a8741f');
    c.fillStyle = g;
    c.beginPath();
    c.arc(32, 32, 29, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#7a5214';
    c.lineWidth = 3;
    c.stroke();
    c.strokeStyle = 'rgba(255,240,190,0.8)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(32, 32, 20, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#7a5214';
    c.font = 'bold 24px Bungee, Impact, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('N', 32, 34);
  });
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

export class Particles {
  readonly view = new Container();
  private list: Particle[] = [];

  update(dtMs: number) {
    const dt = dtMs / 1000;
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
    this.list = [];
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

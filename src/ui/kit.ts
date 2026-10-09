// The painted menu kit: velvet panels in a brass frame with moth corner ornaments, a
// brass title plaque, the 48 px close knob, brass price plates and velvet display cases.
// Everything is painted once with Canvas 2D (same brushes as the world) and cached.

import { Container, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { COLORS, FONT_BODY, FONT_DISPLAY, drawMoth, reducedMotion } from '../core/fx';
import { animate, ease } from '../core/tween';
import { sfx } from '../core/audio';
import { brass, luma, softBack, velvetNap } from '../core/ui';
import { INK, dark, fillInk, glowAt, light, paint, rgb, rrect, type Ctx } from '../world/painted/brush';

export const CREAM = 0xf2e6c9;
export const VELVET = 0x1a0f14;
export const MUTED = 0xc9b48e;

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

// ---- Motion -------------------------------------------------------------------------------------

/** Panel in: 280 ms, 0.92 → 1 with a slight overshoot, fading in. Reduced motion: fade only. */
export function enterMotion(t: Container, ms = 280) {
  const base = t.scale.x;
  t.alpha = 0;
  if (reducedMotion()) return animate(200, (k) => !t.destroyed && (t.alpha = k));
  t.scale.set(base * 0.92);
  return animate(ms, (k) => {
    if (t.destroyed) return;
    t.alpha = Math.min(1, k * 2.2);
    t.scale.set(base * (0.92 + 0.08 * softBack(k)));
  });
}

/** Panel out: 180 ms, fade and 0.97, ease-in. */
export function leaveMotion(t: Container, ms = 180) {
  const base = t.scale.x;
  const a0 = t.alpha;
  return animate(ms, (k) => {
    if (t.destroyed) return;
    t.alpha = a0 * (1 - k);
    if (!reducedMotion()) t.scale.set(base * (1 - 0.03 * k));
  }, ease.inCubic);
}

/** Children pop in one after another (tabs, cards). */
export function staggerIn(items: Container[], step = 35, ms = 220) {
  if (reducedMotion()) return;
  items.forEach((it, i) => {
    const s = it.scale.x;
    it.alpha = 0;
    it.scale.set(s * 0.94);
    void animate(ms + i * step, (k) => {
      if (it.destroyed) return;
      const q = Math.max(0, (k * (ms + i * step) - i * step) / ms);
      it.alpha = Math.min(1, q * 1.6);
      it.scale.set(s * (0.94 + 0.06 * softBack(Math.min(1, q))));
    });
  });
}

// ---- Painting pieces ----------------------------------------------------------------------------

/** Brass art-deco fan in a corner, with a little moth on it. `sx`, `sy` point into the panel. */
function cornerOrnament(c: Ctx, x: number, y: number, sx: number, sy: number, size: number, accent: number) {
  c.save();
  c.translate(x, y);
  c.scale(sx, sy);
  // Stepped deco fan.
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(size, 0);
  c.arc(0, 0, size, 0, Math.PI / 2);
  c.closePath();
  fillInk(c, brass(c, 0, 0, size, size), 1.6);
  c.save();
  c.clip();
  c.strokeStyle = 'rgba(90,52,12,0.55)';
  c.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * size, Math.sin(a) * size);
    c.stroke();
  }
  c.beginPath();
  c.arc(0, 0, size * 0.62, 0, Math.PI / 2);
  c.stroke();
  c.restore();
  // Velvet inlay and the moth.
  c.beginPath();
  c.moveTo(0, 0);
  c.arc(0, 0, size * 0.56, 0, Math.PI / 2);
  c.closePath();
  const vg = c.createRadialGradient(size * 0.15, size * 0.15, 0, 0, 0, size * 0.56);
  vg.addColorStop(0, rgb(light(accent, 0.05)));
  vg.addColorStop(1, rgb(dark(accent, 0.55)));
  fillInk(c, vg, 1.2);
  c.restore();
  // The moth stays upright: draw outside the mirrored transform.
  const mx = x + sx * size * 0.27;
  const my = y + sy * size * 0.27;
  drawMoth(c, mx + 1, my + 1.5, size * 0.42, 'rgba(10,4,16,0.6)', 'rgba(10,4,16,0.7)');
  const mg = c.createLinearGradient(mx - size * 0.2, my - size * 0.2, mx + size * 0.2, my + size * 0.2);
  mg.addColorStop(0, '#fff4c2');
  mg.addColorStop(0.5, '#e6b85a');
  mg.addColorStop(1, '#9a6a22');
  drawMoth(c, mx, my, size * 0.42, mg, '#6a4210', 'rgba(255,240,200,0.8)');
}

/** Brass screw head. */
export function screw(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  fillInk(c, brass(c, x - r, y - r, x + r, y + r, 0.1), 1);
  c.beginPath();
  c.moveTo(x - r * 0.6, y - r * 0.25);
  c.lineTo(x + r * 0.6, y + r * 0.25);
  c.strokeStyle = 'rgba(70,40,10,0.8)';
  c.lineWidth = Math.max(1, r * 0.3);
  c.stroke();
}

export interface PanelLook {
  /** Velvet colour (default deep plum-wine). */
  velvet?: number;
  /** Colour of the corner inlays. */
  accent?: number;
}

/** The velvet panel with its brass frame, 2 px gloss edge and moth corners. Size W×H plus a margin for the shadow. */
export const PANEL_PAD = 24;
export function panelTexture(W: number, H: number, look: PanelLook = {}) {
  const vel = look.velvet ?? 0x3a1428;
  const acc = look.accent ?? 0x6b1a2e;
  return cached(`panel-${W}x${H}-${vel}-${acc}`, () => {
    const res = Math.min(2, 2600 / Math.max(W, H));
    return paint(W + PANEL_PAD * 2, H + PANEL_PAD * 2, (c) => {
      c.translate(PANEL_PAD, PANEL_PAD);
      const R = 30;
      const F = 15;
      // Soft shadow underneath.
      for (let i = 0; i < 8; i++) {
        rrect(c, -i * 1.5, 8 + i * 0.6 - i * 1.5, W + i * 3, H + i * 3, R + i * 2);
        c.fillStyle = `rgba(6,2,8,${0.12 - i * 0.012})`;
        c.fill();
      }
      // Brass frame.
      rrect(c, 0, 0, W, H, R);
      fillInk(c, brass(c, 0, 0, W * 0.25, H * 0.9), 3);
      // 2 px gloss edge on the upper left of the frame.
      c.save();
      rrect(c, 0, 0, W, H, R);
      c.clip();
      c.strokeStyle = 'rgba(255,248,226,0.8)';
      c.lineWidth = 2.5;
      rrect(c, 2, 2, W + 8, H + 8, R);
      c.stroke();
      c.restore();
      // Engraved groove in the frame.
      rrect(c, F * 0.45, F * 0.45, W - F * 0.9, H - F * 0.9, R - F * 0.4);
      c.strokeStyle = 'rgba(80,46,10,0.55)';
      c.lineWidth = 1.4;
      c.stroke();
      rrect(c, F * 0.45 + 1, F * 0.45 + 1.2, W - F * 0.9, H - F * 0.9, R - F * 0.4);
      c.strokeStyle = 'rgba(255,240,200,0.35)';
      c.lineWidth = 1;
      c.stroke();
      // Velvet.
      const vx = F;
      const vy = F;
      const vw = W - F * 2;
      const vh = H - F * 2;
      rrect(c, vx, vy, vw, vh, R - F * 0.6);
      const vg = c.createRadialGradient(vx + vw * 0.3, vy + vh * 0.12, 0, vx + vw * 0.45, vy + vh * 0.4, Math.max(vw, vh) * 0.95);
      vg.addColorStop(0, rgb(light(vel, 0.06)));
      vg.addColorStop(0.45, rgb(dark(vel, 0.35)));
      vg.addColorStop(1, rgb(VELVET));
      c.fillStyle = vg;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.stroke();
      c.save();
      rrect(c, vx, vy, vw, vh, R - F * 0.6);
      c.clip();
      velvetNap(c, vx, vy, vw, vh, W * 13 + H, 1, 0.05);
      // Velvet folds: very soft vertical light bands.
      for (let i = 0; i < 6; i++) {
        const x = vx + (i + 0.5) * (vw / 6);
        const g = c.createLinearGradient(x - vw / 14, 0, x + vw / 14, 0);
        g.addColorStop(0, 'rgba(255,200,220,0)');
        g.addColorStop(0.5, `rgba(255,200,220,${0.018 + (i % 2) * 0.012})`);
        g.addColorStop(1, 'rgba(255,200,220,0)');
        c.fillStyle = g;
        c.fillRect(x - vw / 14, vy, vw / 7, vh);
      }
      // Inner shadow from the frame.
      c.strokeStyle = 'rgba(6,2,8,0.55)';
      c.lineWidth = 14;
      rrect(c, vx, vy + 3, vw, vh, R - F * 0.6);
      c.stroke();
      c.restore();
      // Inner deco hairline.
      rrect(c, vx + 9, vy + 9, vw - 18, vh - 18, R - F * 0.6 - 6);
      c.strokeStyle = 'rgba(224,178,90,0.3)';
      c.lineWidth = 1.2;
      c.stroke();
      // Moth corner ornaments.
      const s = Math.min(58, Math.min(W, H) * 0.09);
      cornerOrnament(c, vx + 2, vy + 2, 1, 1, s, acc);
      cornerOrnament(c, vx + vw - 2, vy + 2, -1, 1, s, acc);
      cornerOrnament(c, vx + 2, vy + vh - 2, 1, -1, s, acc);
      cornerOrnament(c, vx + vw - 2, vy + vh - 2, -1, -1, s, acc);
    }, res);
  });
}

/** A brass name plaque with engraved dark text, the panel's title. */
export function plaque(text: string, opts: { size?: number; minW?: number; color?: number } = {}) {
  const c = new Container();
  const size = opts.size ?? 30;
  const t = new Text({
    text,
    style: {
      fontFamily: FONT_DISPLAY,
      fontSize: size,
      fill: opts.color ?? 0x2a1406,
      letterSpacing: Math.round(size * 0.12),
      dropShadow: { color: 0xfff4d0, alpha: 0.55, blur: 0, distance: 1.4, angle: Math.PI / 2 },
    },
  });
  t.anchor.set(0.5);
  const w = Math.max(opts.minW ?? 0, Math.round(t.width + size * 2.6));
  const h = Math.round(size * 1.9);
  const bg = new Sprite(
    cached(`plaque-${w}x${h}`, () =>
      paint(w + 20, h + 20, (cx) => {
        cx.translate(10, 8);
        // Shadow.
        rrect(cx, 2, 5, w - 4, h, h * 0.3);
        cx.fillStyle = 'rgba(6,2,8,0.45)';
        cx.fill();
        // Deco plaque: chamfered ends.
        const ch = h * 0.32;
        const shape = (inset: number) => {
          cx.beginPath();
          cx.moveTo(ch + inset, inset);
          cx.lineTo(w - ch - inset, inset);
          cx.lineTo(w - inset, ch + inset * 0.4);
          cx.lineTo(w - inset, h - ch - inset * 0.4);
          cx.lineTo(w - ch - inset, h - inset);
          cx.lineTo(ch + inset, h - inset);
          cx.lineTo(inset, h - ch - inset * 0.4);
          cx.lineTo(inset, ch + inset * 0.4);
          cx.closePath();
        };
        shape(0);
        fillInk(cx, brass(cx, 0, 0, w * 0.3, h * 1.6), 2.4);
        cx.save();
        shape(0);
        cx.clip();
        cx.strokeStyle = 'rgba(255,248,226,0.85)';
        cx.lineWidth = 2;
        cx.translate(1.5, 1.5);
        shape(0);
        cx.stroke();
        cx.restore();
        shape(5);
        cx.strokeStyle = 'rgba(80,46,10,0.6)';
        cx.lineWidth = 1.2;
        cx.stroke();
        // Brushed lines.
        cx.save();
        shape(5);
        cx.clip();
        for (let y = 7; y < h - 5; y += 3) {
          cx.strokeStyle = `rgba(255,240,200,${0.05 + (y % 7) * 0.008})`;
          cx.beginPath();
          cx.moveTo(0, y);
          cx.lineTo(w, y);
          cx.stroke();
        }
        cx.restore();
        screw(cx, ch * 0.75, h / 2, 3.2);
        screw(cx, w - ch * 0.75, h / 2, 3.2);
      }, 2),
    ),
  );
  bg.anchor.set(0.5, (h / 2 + 8) / (h + 20));
  bg.x = 0;
  c.addChild(bg, t);
  t.y = 1;
  (c as Container & { plateW: number }).plateW = w;
  return c;
}

/** The 48 px brass knob with a cross, top right of every panel. */
export function closeKnob(onClose: () => void, size = 52) {
  const c = new Container();
  const r = size / 2;
  const tex = (hov: boolean) =>
    cached(`close-${size}-${hov}`, () =>
      paint(size + 16, size + 16, (cx) => {
        const o = 8 + r;
        if (hov) glowAt(cx, o, o, r + 8, r + 8, 0xffcf7a, 0.45);
        cx.beginPath();
        cx.arc(o + 1, o + 3, r - 1, 0, Math.PI * 2);
        cx.fillStyle = 'rgba(6,2,8,0.5)';
        cx.fill();
        cx.beginPath();
        cx.arc(o, o, r - 1, 0, Math.PI * 2);
        fillInk(cx, brass(cx, o - r, o - r, o + r * 0.6, o + r, hov ? 0.2 : 0), 2);
        cx.beginPath();
        cx.arc(o, o, r - 6, 0, Math.PI * 2);
        const g = cx.createRadialGradient(o - r * 0.3, o - r * 0.35, 0, o, o, r);
        g.addColorStop(0, '#4a2034');
        g.addColorStop(1, '#170910');
        fillInk(cx, g, 1.2);
        cx.save();
        cx.clip();
        cx.strokeStyle = 'rgba(6,2,8,0.6)';
        cx.lineWidth = 4;
        cx.beginPath();
        cx.arc(o, o + 2, r - 6, 0, Math.PI * 2);
        cx.stroke();
        cx.restore();
        const k = r * 0.32;
        cx.lineCap = 'round';
        cx.strokeStyle = INK;
        cx.lineWidth = 6;
        cx.beginPath();
        cx.moveTo(o - k, o - k);
        cx.lineTo(o + k, o + k);
        cx.moveTo(o + k, o - k);
        cx.lineTo(o - k, o + k);
        cx.stroke();
        cx.strokeStyle = hov ? '#fff6e0' : '#f2d896';
        cx.lineWidth = 3;
        cx.stroke();
      }, 3),
    );
  const s = new Sprite(tex(false));
  s.anchor.set(0.5);
  c.addChild(s);
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.hitArea = new Rectangle(-Math.max(26, r + 4), -Math.max(26, r + 4), Math.max(52, size + 8), Math.max(52, size + 8));
  c.on('pointerover', () => (s.texture = tex(true)));
  c.on('pointerout', () => {
    s.texture = tex(false);
    c.scale.set(1);
  });
  c.on('pointerdown', () => c.scale.set(0.92));
  c.on('pointerup', () => c.scale.set(1));
  c.on('pointerupoutside', () => c.scale.set(1));
  c.on('pointertap', () => {
    sfx.click();
    onClose();
  });
  return c;
}

/** A small brass plate (price tag, owned tag). `tone` 'brass' | 'velvet' | 'green'. */
export function plateTexture(w: number, h: number, tone: 'brass' | 'dim' | 'green' = 'brass') {
  return cached(`plate-${w}x${h}-${tone}`, () =>
    paint(w + 8, h + 10, (c) => {
      c.translate(4, 3);
      rrect(c, 1, 3, w - 2, h, h * 0.28);
      c.fillStyle = 'rgba(6,2,8,0.5)';
      c.fill();
      rrect(c, 0, 0, w, h, h * 0.28);
      if (tone === 'green') {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#5e9a6a');
        g.addColorStop(0.5, '#2f6a44');
        g.addColorStop(1, '#173a26');
        fillInk(c, g, 1.6);
      } else fillInk(c, brass(c, 0, 0, w * 0.4, h * 1.8, 0, tone === 'dim'), 1.6);
      c.save();
      rrect(c, 0, 0, w, h, h * 0.28);
      c.clip();
      c.strokeStyle = 'rgba(255,248,226,0.7)';
      c.lineWidth = 1.6;
      rrect(c, 1.2, 1.2, w + 4, h + 4, h * 0.28);
      c.stroke();
      c.restore();
      rrect(c, 3.5, 3.5, w - 7, h - 7, h * 0.2);
      c.strokeStyle = tone === 'green' ? 'rgba(200,255,210,0.3)' : 'rgba(80,46,10,0.45)';
      c.lineWidth = 1;
      c.stroke();
      if (w > h * 2.6) {
        screw(c, h * 0.42, h / 2, Math.max(2, h * 0.09));
        screw(c, w - h * 0.42, h / 2, Math.max(2, h * 0.09));
      }
    }, 3),
  );
}

/**
 * A display-case compartment: a dark wood-and-brass box with a velvet cushion, a spotlight
 * from above and glass reflections. `lit` adds a warm glow (selected / owned).
 */
export function caseTexture(w: number, h: number, velvet = 0x5a1630, lit = false) {
  return cached(`case-${w}x${h}-${velvet}-${lit}`, () =>
    paint(w + 12, h + 14, (c) => {
      c.translate(6, 4);
      const r = 16;
      rrect(c, 2, 5, w - 4, h, r);
      c.fillStyle = 'rgba(6,2,8,0.55)';
      c.fill();
      // Brass bezel.
      rrect(c, 0, 0, w, h, r);
      fillInk(c, brass(c, 0, 0, w * 0.3, h * 1.2, lit ? 0.18 : 0), 2);
      c.save();
      rrect(c, 0, 0, w, h, r);
      c.clip();
      c.strokeStyle = 'rgba(255,248,226,0.75)';
      c.lineWidth = 2;
      rrect(c, 1.5, 1.5, w + 4, h + 4, r);
      c.stroke();
      c.restore();
      // Back wall of the compartment (dark lacquered wood).
      const b = 6;
      rrect(c, b, b, w - b * 2, h - b * 2, r - 4);
      const wg = c.createLinearGradient(0, b, 0, h - b);
      wg.addColorStop(0, '#2a1218');
      wg.addColorStop(1, '#12070c');
      fillInk(c, wg, 1.2);
      c.save();
      rrect(c, b, b, w - b * 2, h - b * 2, r - 4);
      c.clip();
      // Spotlight cone from the top.
      glowAt(c, w / 2, b, w * 0.5, h * 0.75, lit ? 0xffd890 : 0xffe6b8, lit ? 0.4 : 0.22);
      // Velvet cushion in the lower part.
      const cy = h * 0.6;
      c.beginPath();
      c.moveTo(b, cy + 8);
      c.quadraticCurveTo(w / 2, cy - 10, w - b, cy + 8);
      c.lineTo(w - b, h);
      c.lineTo(b, h);
      c.closePath();
      const vg = c.createLinearGradient(0, cy - 6, 0, h);
      vg.addColorStop(0, rgb(light(velvet, 0.18)));
      vg.addColorStop(0.35, rgb(velvet));
      vg.addColorStop(1, rgb(dark(velvet, 0.6)));
      c.fillStyle = vg;
      c.fill();
      c.strokeStyle = 'rgba(10,4,16,0.6)';
      c.lineWidth = 1.5;
      c.stroke();
      velvetNap(c, b, cy - 8, w - b * 2, h - cy, w + h, 1.6, 0.06);
      // Contact shadow where the object sits.
      glowAt(c, w / 2, cy + 2, w * 0.26, 8, 0x0a0410, 0.45);
      // Inner shadow below the bezel.
      c.strokeStyle = 'rgba(6,2,8,0.65)';
      c.lineWidth = 10;
      rrect(c, b, b + 3, w - b * 2, h - b * 2, r - 4);
      c.stroke();
      // Glass: two diagonal reflections.
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.beginPath();
      c.moveTo(w * 0.12, b);
      c.lineTo(w * 0.32, b);
      c.lineTo(w * 0.08, h * 0.7);
      c.lineTo(b, h * 0.7);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.035)';
      c.beginPath();
      c.moveTo(w * 0.38, b);
      c.lineTo(w * 0.44, b);
      c.lineTo(w * 0.2, h * 0.7);
      c.lineTo(w * 0.14, h * 0.7);
      c.closePath();
      c.fill();
      c.restore();
    }, 2),
  );
}

/** Body text in the menus (calm sans, cream on velvet by default). */
export function bodyText(t: string, size: number, color = CREAM, opts: { bold?: boolean; wrap?: number; align?: 'left' | 'center' | 'right' } = {}) {
  return new Text({
    text: t,
    style: {
      fontFamily: FONT_BODY,
      fontSize: size,
      fontWeight: opts.bold ? '700' : '500',
      fill: color,
      wordWrap: !!opts.wrap,
      wordWrapWidth: opts.wrap ?? 0,
      align: opts.align ?? (opts.wrap ? 'center' : 'left'),
      lineHeight: Math.round(size * 1.22),
      letterSpacing: 0.3,
      fontVariant: 'normal',
      dropShadow: luma(color) > 0.45 ? { color: 0x0a0410, alpha: 0.7, blur: 2, distance: 1.5, angle: Math.PI / 2 } : false,
    },
  });
}

export { COLORS };

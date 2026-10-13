// Shared presentation pieces for the slot machine and Funkenfall: painted brass plaques,
// the light wave for medium wins and the skippable stage moment for big ones.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { FONT_BODY, FONT_DISPLAY, glowTexture } from '../../core/fx';
import { animate, ease, tween, wait } from '../../core/tween';
import { formatChips } from '../../core/state';
import { INK, dark, fillInk, glowAt, gold, light, paint, rgb, rim, rrect, type Ctx } from '../../world/painted/brush';

export function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Art-deco brass plaque with a velvet inset; (w, h) is the plaque, the texture has a margin of 10. */
export function plaqueTexture(w: number, h: number, velvet = 0x141c40) {
  return cached(`plaque-${w}-${h}-${velvet}`, () =>
    paint(w + 20, h + 20, (c) => {
      c.translate(10, 10);
      // Soft drop shadow.
      glowAt(c, w / 2, h / 2 + 8, w * 0.55, h * 0.7, 0x05020a, 0.55);
      const r = h * 0.32;
      // Stepped deco ends.
      c.beginPath();
      c.moveTo(r, 0);
      c.lineTo(w - r, 0);
      c.lineTo(w, h / 2);
      c.lineTo(w - r, h);
      c.lineTo(r, h);
      c.lineTo(0, h / 2);
      c.closePath();
      fillInk(c, gold(c, 0, 0, w * 0.4, h * 1.4), 3);
      rim(c, 0.7, 1.6);
      const ix = 7;
      c.beginPath();
      c.moveTo(r + 2, ix);
      c.lineTo(w - r - 2, ix);
      c.lineTo(w - ix - 2, h / 2);
      c.lineTo(w - r - 2, h - ix);
      c.lineTo(r + 2, h - ix);
      c.lineTo(ix + 2, h / 2);
      c.closePath();
      const g = c.createLinearGradient(0, ix, 0, h - ix);
      g.addColorStop(0, rgb(light(velvet, 0.12)));
      g.addColorStop(0.5, rgb(velvet));
      g.addColorStop(1, rgb(dark(velvet, 0.45)));
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.stroke();
      // Rivets.
      for (const x of [r * 0.75, w - r * 0.75]) {
        c.beginPath();
        c.arc(x, h / 2, 3, 0, Math.PI * 2);
        fillInk(c, '#fff1c4', 1.2);
      }
    }, 2),
  );
}

/** Soft sunburst (white, tint it, blend add). */
export function raysTexture() {
  return cached('rays', () =>
    paint(400, 400, (c) => {
      c.translate(200, 200);
      for (let i = 0; i < 18; i++) {
        c.rotate((Math.PI * 2) / 18);
        const g = c.createLinearGradient(0, 0, 0, 200);
        g.addColorStop(0, 'rgba(255,255,255,0.7)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(-4, 0);
        c.lineTo(-22, 200);
        c.lineTo(22, 200);
        c.lineTo(4, 0);
        c.closePath();
        c.fill();
      }
    }, 1),
  );
}

/** A soft band of light that sweeps down over an area (medium wins). */
export function lightWave(parent: Container, x: number, y: number, w: number, h: number, color: number) {
  if (reducedMotion()) return Promise.resolve();
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.width = w * 1.5;
  s.height = h * 0.5;
  s.tint = color;
  s.blendMode = 'add';
  s.alpha = 0;
  parent.addChild(s);
  return animate(
    700,
    (k) => {
      if (s.destroyed) return;
      s.position.set(x + w / 2, y + h * (-0.2 + 1.4 * k));
      s.alpha = Math.sin(k * Math.PI) * 0.75;
    },
    ease.linear,
  ).then(() => s.destroy());
}

export interface StageOptions {
  /** Area (in parent coordinates) the moment plays over. */
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  /** Small line under the amount, e.g. "×144 Einsatz". */
  sub?: string;
  amount: number;
  accent: number;
  durationMs?: number;
  /** Plays the rolling counter tick sound. */
  onTick?: () => void;
}

let stageRunning = false;

/**
 * The big-win moment: the area dims, light rays turn behind a brass plaque with a title,
 * the amount rolls up. Tapping skips from 0.5 s on. Only one runs at a time.
 */
export async function winStage(parent: Container, o: StageOptions) {
  if (stageRunning) return;
  stageRunning = true;
  const calm = reducedMotion();
  const dur = o.durationMs ?? 2200;
  const root = new Container();
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const veil = new Graphics().roundRect(o.x, o.y, o.w, o.h, 22).fill({ color: 0x05081a, alpha: 0.72 });
  veil.eventMode = 'static';
  veil.cursor = 'pointer';
  const rays = new Sprite(raysTexture());
  rays.anchor.set(0.5);
  rays.position.set(cx, cy);
  rays.tint = o.accent;
  rays.blendMode = 'add';
  rays.width = rays.height = Math.min(o.w, o.h) * 1.3;
  const halo = new Sprite(glowTexture());
  halo.anchor.set(0.5);
  halo.position.set(cx, cy);
  halo.width = o.w * 1.1;
  halo.height = o.h * 0.8;
  halo.tint = o.accent;
  halo.blendMode = 'add';
  halo.alpha = 0.5;

  const pw = Math.min(o.w - 20, 440);
  const plate = new Container();
  plate.position.set(cx, cy);
  const pl = new Sprite(plaqueTexture(pw, o.sub ? 190 : 170));
  pl.anchor.set(0.5);
  const title = new Text({
    text: o.title,
    style: { fontFamily: FONT_DISPLAY, fontSize: 40, fill: o.accent, letterSpacing: 3, stroke: { color: 0x14080f, width: 6 } },
  });
  title.anchor.set(0.5);
  title.y = o.sub ? -50 : -42;
  if (title.width > pw - 70) title.scale.set((pw - 70) / title.width);
  const amount = new Text({
    text: '0',
    style: { fontFamily: FONT_DISPLAY, fontSize: 56, fill: 0xfff6e6, stroke: { color: 0x14080f, width: 8 }, fontVariant: 'normal' },
  });
  amount.anchor.set(0.5);
  amount.y = o.sub ? 8 : 22;
  plate.addChild(pl, title, amount);
  if (o.sub) {
    const sub = new Text({ text: o.sub, style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: 0xe6d6b4, letterSpacing: 1 } });
    sub.anchor.set(0.5);
    sub.y = 54;
    plate.addChild(sub);
  }
  const hint = new Text({ text: 'Tippen zum Weiter', style: { fontFamily: FONT_BODY, fontSize: 20, fontWeight: '600', fill: 0xd9c6a0 } });
  hint.anchor.set(0.5);
  hint.position.set(cx, cy + 118);
  hint.alpha = 0;
  root.addChild(veil, halo, rays, plate, hint);
  parent.addChild(root);

  let skipped = false;
  let canSkip = false;
  veil.on('pointertap', () => {
    if (canSkip) skipped = true;
  });
  root.alpha = 0;
  plate.scale.set(0.92);
  void tween(root, { alpha: 1 }, 200);
  await tween(plate.scale, { x: 1, y: 1 }, 280, ease.outBack);
  const fit = () => {
    const max = pw - 60;
    amount.scale.set(amount.width / amount.scale.x > max ? max / (amount.width / amount.scale.x) : 1);
  };
  let t = 0;
  let last = -1;
  const countMs = calm ? 0 : Math.min(1400, dur - 500);
  await new Promise<void>((resolve) => {
    void animate(dur, (k) => {
      if (root.destroyed) return resolve();
      t = k * dur;
      if (t > 500 && !canSkip) {
        canSkip = true;
        void tween(hint, { alpha: 1 }, 200);
      }
      rays.rotation = calm ? 0 : t / 2400;
      const p = countMs <= 0 ? 1 : Math.min(1, t / countMs);
      const v = Math.round(o.amount * (1 - Math.pow(1 - p, 3)));
      if (v !== last) {
        last = v;
        amount.text = formatChips(v);
        fit();
        if (p < 1) o.onTick?.();
      }
      if (skipped || k >= 1) resolve();
    }, ease.linear).then(() => resolve());
  });
  if (!root.destroyed) {
    amount.text = formatChips(o.amount);
    fit();
    if (skipped) await wait(120);
    await tween(root, { alpha: 0 }, 180, ease.inCubic);
    if (!root.destroyed) root.destroy({ children: true });
  }
  stageRunning = false;
}

/** Engraved brass light bulb (for chasing marquee lights); tint the glow sprite separately. */
export function bulbTexture() {
  return cached('bulb', () =>
    paint(20, 20, (c: Ctx) => {
      c.beginPath();
      c.arc(10, 10, 7, 0, Math.PI * 2);
      const g = c.createRadialGradient(8, 8, 1, 10, 10, 8);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#fff1c4');
      g.addColorStop(1, '#d8a050');
      fillInk(c, g, 2);
      c.beginPath();
      c.arc(7.5, 7.5, 2, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fill();
    }, 3),
  );
}

export { rrect };

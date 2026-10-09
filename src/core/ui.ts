// Small Pixi UI helpers shared by all games: painted brass-and-velvet buttons and labels.
// The button faces are painted once with Canvas 2D (like the world props) and cached per
// size, colour and state, so a screen full of buttons costs a handful of textures.

import { Container, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { COLORS, FONT_BODY, FONT_DISPLAY, reducedMotion } from './fx';
import { animate, ease } from './tween';
import { sfx } from './audio';
import { focusable } from './focus';
import { INK, dark, fillInk, glowAt, light, mix, paint, rgb, rrect, seeded, type Ctx } from '../world/painted/brush';

export interface ButtonOptions {
  label: string;
  width: number;
  height: number;
  color?: number;
  textColor?: number;
  fontSize?: number;
  display?: boolean;
  onClick: () => void;
  /** Start locked: a padlock on the face; the reason is told when it is tapped. */
  locked?: string;
  /** Small icon left of the label (a coin, a stone ...), about `iconWidth` wide (default 22). */
  icon?: Container;
  iconWidth?: number;
  /** What screen readers say, for icon and symbol buttons ('–', '×' ...). Default: the label. */
  ariaLabel?: string | ((text: string) => string);
}

export interface Button extends Container {
  setEnabled(on: boolean): void;
  setLabel(text: string): void;
  /** Crisp gold ring for the chosen option in a group (drawn as vectors, so it stays sharp). */
  setSelected(on: boolean): void;
  /** Locked: padlock on the face, tap says why (via `onLocked`). Null unlocks. */
  setLocked(reason: string | null): void;
  /** Called with the lock reason when a locked button is tapped. */
  onLocked?: (reason: string) => void;
}

/** 0..1 perceived brightness of a colour. */
export function luma(c: number) {
  return (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;
}

/** Back-ease with a gentle overshoot (about 3 % of the distance), for presses and panels. */
export const softBack = (t: number) => {
  const c1 = 0.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// ---- Painted faces ------------------------------------------------------------------------------

type FaceState = 'normal' | 'hover' | 'disabled';
const PAD = 14;
const faceCache = new Map<string, Texture>();

/** Brass gradient lit from the upper left; `k` brightens it (hover). */
export function brass(c: Ctx, x0: number, y0: number, x1: number, y1: number, k = 0, dull = false) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  const stops: [number, number][] = [
    [0, 0xfff4c2],
    [0.22, 0xf0c868],
    [0.55, 0xb07a2a],
    [0.8, 0xe6b85a],
    [1, 0x7a4e18],
  ];
  for (const [p, col] of stops) {
    let v = k > 0 ? light(col, k) : col;
    if (dull) v = mix(v, 0x5a5058, 0.72);
    g.addColorStop(p, rgb(v));
  }
  return g;
}

/** Inner shadow along the top edge of the current path (the face sits below the frame). */
function insetTop(c: Ctx, a: number, wdt: number) {
  c.save();
  c.clip();
  c.strokeStyle = `rgba(10,4,16,${a})`;
  c.lineWidth = wdt * 2;
  c.translate(0, wdt * 0.7);
  c.stroke();
  c.restore();
}

/** Fine velvet nap: thousands of tiny light and dark specks inside the current clip. */
export function velvetNap(c: Ctx, x: number, y: number, w: number, h: number, seed: number, density = 1, alpha = 0.06) {
  const r = seeded(seed);
  const n = Math.min(26000, Math.round(((w * h) / 70) * density));
  for (let i = 0; i < n; i++) {
    const px = x + r() * w;
    const py = y + r() * h;
    c.fillStyle = r() < 0.5 ? `rgba(255,220,235,${alpha * (0.4 + r())})` : `rgba(0,0,0,${alpha * 1.6 * (0.4 + r())})`;
    c.fillRect(px, py, 1 + r() * 1.2, 1 + r() * 2.2);
  }
}

/** Little brass diamond stud. */
function stud(c: Ctx, x: number, y: number, s: number, dull: boolean) {
  c.beginPath();
  c.moveTo(x, y - s);
  c.lineTo(x + s * 0.8, y);
  c.lineTo(x, y + s);
  c.lineTo(x - s * 0.8, y);
  c.closePath();
  fillInk(c, brass(c, x - s, y - s, x + s, y + s, 0.15, dull), 1);
}

function faceTexture(w: number, h: number, color: number, st: FaceState): Texture {
  const key = `${w}x${h}-${color}-${st}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const res = h <= 70 ? 3 : 2.5;
  const tex = paint(
    w + PAD * 2,
    h + PAD * 2,
    (c) => {
      c.translate(PAD, PAD);
      const dis = st === 'disabled';
      const hov = st === 'hover';
      const r = Math.min(h * 0.34, 22);
      const bw = Math.max(3, Math.min(6, h * 0.1));
      const face = dis ? mix(color, 0x3e3640, 0.7) : hov ? light(color, 0.08) : color;
      const lum = luma(face);
      // Warm halo when hovered (baked, no live filter).
      if (hov) glowAt(c, w / 2, h / 2, w / 2 + PAD, h / 2 + PAD * 0.9, 0xffcf7a, 0.42);
      // Soft drop shadow.
      for (let i = 0; i < 4; i++) {
        rrect(c, -i + 1, 3 + i * 0.8, w + i * 2 - 2, h, r + i);
        c.fillStyle = `rgba(10,4,16,${0.16 - i * 0.03})`;
        c.fill();
      }
      // Brass frame.
      rrect(c, 0, 0, w, h, r);
      fillInk(c, brass(c, 0, 0, w * 0.35, h * 1.4, hov ? 0.22 : 0, dis), 2);
      if (!dis) {
        // The 2 px gloss edge at the upper left.
        c.save();
        rrect(c, 0, 0, w, h, r);
        c.clip();
        c.strokeStyle = `rgba(255,248,226,${hov ? 0.95 : 0.7})`;
        c.lineWidth = 2;
        rrect(c, 1.5, 1.5, w + 4, h + 4, r);
        c.stroke();
        c.restore();
      }
      // Face (velvet or enamel in the button colour).
      const fx = bw;
      const fy = bw;
      const fw = w - bw * 2;
      const fh = h - bw * 2;
      const fr = Math.max(2, r - bw * 0.8);
      rrect(c, fx, fy, fw, fh, fr);
      const g = c.createLinearGradient(0, fy, 0, fy + fh);
      g.addColorStop(0, rgb(light(face, lum < 0.35 ? 0.16 : 0.3)));
      g.addColorStop(0.5, rgb(face));
      g.addColorStop(1, rgb(dark(face, 0.32)));
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 1.2;
      c.stroke();
      c.save();
      rrect(c, fx, fy, fw, fh, fr);
      c.clip();
      if (lum < 0.35) velvetNap(c, fx, fy, fw, fh, (w * 31 + h * 7 + color) >>> 0, 1.4, 0.05);
      // Light pooling at the upper left (the room's lamps are up there).
      glowAt(c, fx + fw * 0.28, fy + fh * 0.1, fw * 0.55, fh * 0.9, 0xfff4dc, dis ? 0.04 : lum < 0.35 ? 0.1 : 0.16);
      c.restore();
      rrect(c, fx, fy, fw, fh, fr);
      insetTop(c, dis ? 0.25 : 0.4, 2);
      // Gloss band on the upper half.
      if (!dis) {
        c.save();
        rrect(c, fx, fy, fw, fh, fr);
        c.clip();
        const sg = c.createLinearGradient(0, fy, 0, fy + fh * 0.5);
        sg.addColorStop(0, `rgba(255,250,235,${lum < 0.35 ? 0.1 : 0.26})`);
        sg.addColorStop(1, 'rgba(255,250,235,0)');
        c.fillStyle = sg;
        rrect(c, fx + 4, fy + 2, fw - 8, fh * 0.46, fr * 0.8);
        c.fill();
        c.restore();
      }
      // Art-deco hairline inside velvet faces.
      if (lum < 0.35 && h >= 40 && !dis) {
        rrect(c, fx + 4, fy + 4, fw - 8, fh - 8, Math.max(2, fr - 4));
        c.strokeStyle = 'rgba(240,200,104,0.32)';
        c.lineWidth = 1;
        c.stroke();
      }
      // Studs at the ends of wide buttons.
      if (w >= h * 2.6 && h >= 38) {
        stud(c, bw * 0.5 + 0.5, h / 2, Math.max(3, bw * 0.9), dis);
        stud(c, w - bw * 0.5 - 0.5, h / 2, Math.max(3, bw * 0.9), dis);
      }
    },
    res,
  );
  faceCache.set(key, tex);
  return tex;
}

let lockTex: Texture | null = null;
/** A small brass padlock, 24×28. */
export function lockTexture() {
  return (lockTex ??= paint(26, 30, (c) => {
    c.beginPath();
    c.arc(13, 12, 6.5, Math.PI, 0);
    c.lineTo(19.5, 15);
    c.moveTo(6.5, 15);
    c.lineTo(6.5, 12);
    c.strokeStyle = INK;
    c.lineWidth = 5;
    c.stroke();
    c.strokeStyle = '#c9cbd2';
    c.lineWidth = 2.4;
    c.stroke();
    rrect(c, 3, 13, 20, 15, 3);
    fillInk(c, brass(c, 3, 13, 18, 30), 1.6);
    c.beginPath();
    c.arc(13, 19.5, 2.2, 0, Math.PI * 2);
    c.fillStyle = 'rgba(40,20,10,0.9)';
    c.fill();
    c.fillRect(12.2, 20, 1.6, 4.5);
  }, 3));
}

// ---- Button -------------------------------------------------------------------------------------

export function button(o: ButtonOptions): Button {
  const c = new Container() as Button;
  const color = o.color ?? COLORS.brass;
  const w = Math.round(o.width);
  const h = Math.round(o.height);
  const bg = new Sprite(faceTexture(w, h, color, 'normal'));
  bg.anchor.set(0.5);
  const lum = luma(color);
  const ink = o.textColor ?? (lum > 0.45 ? COLORS.ink : 0xfff1c4);
  const darkText = luma(ink) < 0.5;
  const txt = new Text({
    text: o.label,
    style: {
      fontFamily: o.display === false ? FONT_BODY : FONT_DISPLAY,
      fontSize: o.fontSize ?? Math.round(h * 0.4),
      fontWeight: o.display === false ? '700' : '400',
      fill: ink,
      letterSpacing: o.display === false ? 0.5 : 1.5,
      // Engraved into brass (light lip below) or embossed on velvet (dark shadow below).
      dropShadow: darkText
        ? { color: 0xfff4d0, alpha: 0.45, blur: 0, distance: 1.2, angle: Math.PI / 2 }
        : { color: 0x0a0410, alpha: 0.8, blur: 1, distance: 1.6, angle: Math.PI / 2 },
    },
  });
  txt.anchor.set(0.5);
  txt.y = 0.5;
  const iw = o.icon ? (o.iconWidth ?? 22) + 6 : 0;
  const fitText = () => {
    txt.scale.set(1);
    const lead = lockIc.visible ? 26 : o.icon ? iw : 0;
    const room = w - Math.max(18, h * 0.5) - lead;
    if (txt.width > room) txt.scale.set(room / txt.width);
    txt.x = lead / 2;
    lockIc.x = txt.x - txt.width / 2 - 15;
    if (o.icon) {
      o.icon.visible = !lockIc.visible;
      o.icon.x = txt.x - txt.width / 2 - iw / 2;
    }
  };
  const lockIc = new Sprite(lockTexture());
  lockIc.anchor.set(0.5);
  lockIc.scale.set(Math.min(1, h / 48));
  lockIc.visible = false;

  const ring = new Graphics();
  const rw = w + 10;
  const rh = h + 10;
  const rr = Math.min(h * 0.34, 22) + 5;
  ring.roundRect(-rw / 2 - 3, -rh / 2 - 3, rw + 6, rh + 6, rr + 3).stroke({ color: COLORS.lamp, width: 6, alpha: 0.22 });
  ring.roundRect(-rw / 2, -rh / 2, rw, rh, rr).stroke({ color: COLORS.lamp, width: 3 });
  ring.visible = false;
  c.addChild(ring, bg, lockIc, txt);
  if (o.icon) c.addChild(o.icon);
  fitText();

  // Touch target: at least 48 px tall and wide, even for small visual buttons.
  const hw = Math.max(48, w) / 2;
  const hh = Math.max(48, h) / 2;
  c.hitArea = new Rectangle(-hw, -hh, hw * 2, hh * 2);
  c.eventMode = 'static';
  c.cursor = 'pointer';

  let enabled = true;
  let locked: string | null = o.locked ?? null;
  let hover = false;
  let down = false;
  const face = () => {
    const st: FaceState = !enabled || locked ? 'disabled' : hover ? 'hover' : 'normal';
    bg.texture = faceTexture(w, h, color, st);
    txt.alpha = !enabled ? 0.5 : locked ? 0.75 : 1;
  };
  // One running scale animation at a time.
  let anim = 0;
  const scaleTo = (to: number, ms: number, ez: (t: number) => number) => {
    const id = ++anim;
    const from = c.scale.x;
    if (reducedMotion()) {
      c.scale.set(to);
      return;
    }
    void animate(ms, (k) => {
      if (id !== anim || c.destroyed) return;
      c.scale.set(from + (to - from) * k);
    }, ez);
  };

  c.on('pointerover', () => {
    hover = true;
    face();
  });
  c.on('pointerout', () => {
    hover = false;
    face();
    if (down) {
      down = false;
      scaleTo(1, 120, softBack);
    }
  });
  c.on('pointerdown', () => {
    if (!enabled) return;
    down = true;
    scaleTo(0.94, 80, ease.outCubic);
  });
  const release = () => {
    if (!down) return;
    down = false;
    scaleTo(1, 120, ease.outBack);
  };
  c.on('pointerup', release);
  c.on('pointerupoutside', release);
  const tap = () => {
    if (!enabled) return;
    if (locked) {
      sfx.tick();
      c.onLocked?.(locked);
      // A small "no" wiggle.
      const x0 = c.x;
      void animate(240, (k) => !c.destroyed && (c.x = x0 + Math.sin(k * Math.PI * 4) * 4 * (1 - k)));
      return;
    }
    sfx.click();
    o.onClick();
  };
  c.on('pointertap', tap);
  // Keyboard focus and the screen-reader twin (src/core/focus.ts).
  const a11y = focusable(c, {
    label: () => (typeof o.ariaLabel === 'function' ? o.ariaLabel(txt.text) : (o.ariaLabel ?? txt.text)),
    rect: { w, h },
    radius: Math.min(h * 0.34, 22),
    locked: () => locked,
    enabled: () => enabled,
    activate: () => {
      if (enabled && !locked) {
        // The same little press as a tap.
        scaleTo(0.94, 70, ease.outCubic);
        setTimeout(() => !c.destroyed && scaleTo(1, 120, ease.outBack), 80);
      }
      tap();
    },
  });
  c.setEnabled = (on: boolean) => {
    enabled = on;
    c.cursor = on ? 'pointer' : 'default';
    face();
    a11y.refresh();
  };
  c.setLabel = (t: string) => {
    txt.text = t;
    fitText();
    a11y.refresh();
  };
  c.setSelected = (on: boolean) => {
    ring.visible = on;
    a11y.setPressed(on);
  };
  c.setLocked = (reason: string | null) => {
    locked = reason;
    lockIc.visible = !!reason;
    fitText();
    face();
    a11y.refresh();
  };
  if (locked) c.setLocked(locked);
  return c;
}

export function label(text: string, size: number, color = COLORS.white, display = false) {
  const t = new Text({
    text,
    style: {
      fontFamily: display ? FONT_DISPLAY : FONT_BODY,
      fontSize: size,
      fontWeight: display ? '400' : '600',
      fill: color,
      letterSpacing: display ? 1.5 : 0.5,
      // A soft dark lip keeps light text readable over painted, busy backgrounds.
      dropShadow: luma(color) > 0.45 ? { color: 0x0a0410, alpha: 0.65, blur: 2, distance: 1.5, angle: Math.PI / 2 } : false,
    },
  });
  return t;
}

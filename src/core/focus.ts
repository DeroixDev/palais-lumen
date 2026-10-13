// Keyboard focus and screen-reader access for the painted canvas UI.
//
// Every canvas button (and the few custom tappables that call `focusable`) gets a real but
// invisible <button> in #a11y, laid over it. Those DOM buttons carry the focus: Tab, Shift+Tab,
// screen readers and the browser's own focus order all work on them. The canvas only draws a
// baked brass focus ring around the button whose twin has keyboard focus (like :focus-visible).
// Only the topmost layer is mirrored: when a panel or a game is open, the room below is not.
// The mirror is rebuilt when buttons come and go (checked a few times a second), never per frame.

import { Container, Sprite, Bounds, Point, type Application, type Texture } from 'pixi.js';
import { announce, reducedMotion } from './fx';
import { getGame } from './registry';
import { formatChips, type GameState } from './state';
import { INK, glowAt, paint, rgb, rrect } from '../world/painted/brush';

import { CURRENCY_PLURAL } from './brand';
export interface FocusOptions {
  /** What a screen reader says; a function is read again on `refresh()`. */
  label: string | (() => string);
  /** Runs on Enter/Space. Default: the target's own `pointertap` handlers. */
  activate?: () => void;
  /** Ring size in the target's local space, centred on (0,0) when x/y are left out. Default: local bounds. */
  rect?: { x?: number; y?: number; w: number; h: number };
  radius?: number;
  /** A lock reason (the button is announced as locked, Enter tells why). */
  locked?: () => string | null;
  enabled?: () => boolean;
}

export interface FocusHandle {
  /** Re-read label, lock and enabled state into the mirror. */
  refresh(): void;
  /** The chosen option in a group (aria-pressed). */
  setPressed(on: boolean): void;
}

interface Entry {
  t: Container;
  o: FocusOptions;
  el: HTMLButtonElement;
  active: boolean;
  rank: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

const entries: Entry[] = [];
const order: Entry[] = [];
const byEl = new WeakMap<Element, Entry>();
let root: HTMLDivElement | null = null;
let stage: Container | null = null;
let dirty = true;
let resort = true;
let pollMs = 0;
let polls = 0;
/** Keyboard modality: the ring shows only while this is on (off on any pointer use). */
let kb = false;
/** Last keyboard activation, so focus can follow into a panel the key opened. */
let lastAct = -1e9;
let focused: Entry | null = null;
/** The games' layer (focus never jumps in there, Space spins) and the panel layers (focus follows into them). */
let gamesLayer: Container | null = null;
let panelLayers: Container[] = [];

// ---- Focus ring ---------------------------------------------------------------------------------

const RING_PAD = 22;
const ringCache = new Map<string, Texture>();
const ring = new Sprite();
ring.anchor.set(0.5);
ring.visible = false;
ring.eventMode = 'none';
const ringC = new Point();
const tmpP = new Point();
const tmpB = new Bounds();
let ringT = 0;

/** A warm brass outline with a soft lamp glow, baked once per size. */
function ringTexture(w: number, h: number, r: number) {
  const key = `${w}x${h}r${r}`;
  const hit = ringCache.get(key);
  if (hit) return hit;
  const tex = paint(
    w + RING_PAD * 2,
    h + RING_PAD * 2,
    (c) => {
      c.translate(RING_PAD, RING_PAD);
      const o = 8;
      const ring = (d: number) => rrect(c, -o - d, -o - d, w + (o + d) * 2, h + (o + d) * 2, r + o + d);
      // Lamp glow around the outline, soft on both sides.
      for (let i = 0; i < 7; i++) {
        ring(i * 1.5 - 2);
        c.strokeStyle = rgb(0xffc35a, 0.55 - i * 0.075);
        c.lineWidth = 4;
        c.stroke();
      }
      // Dark lip, then a bright brass band so it reads on brass and on velvet faces alike.
      ring(0);
      c.strokeStyle = INK;
      c.lineWidth = 8;
      c.stroke();
      const g = c.createLinearGradient(-o, -o, w * 0.5, h + o);
      g.addColorStop(0, '#fff4c8');
      g.addColorStop(0.25, '#ffd25a');
      g.addColorStop(0.6, '#e8a830');
      g.addColorStop(1, '#ffe48a');
      c.strokeStyle = g;
      c.lineWidth = 5;
      c.stroke();
      ring(-1.2);
      c.strokeStyle = 'rgba(255,248,220,0.6)';
      c.lineWidth = 1.2;
      c.stroke();
      // A glint at the upper left, where the room's lamps are.
      glowAt(c, Math.min(w * 0.2, 40), -o, Math.max(18, Math.min(w * 0.25, 60)), 9, 0xffffff, 0.7);
    },
    2,
  );
  ringCache.set(key, tex);
  return tex;
}

function showRing(e: Entry) {
  const r = e.o.rect;
  let w: number;
  let h: number;
  if (r) {
    w = r.w;
    h = r.h;
    ringC.set((r.x ?? -r.w / 2) + r.w / 2, (r.y ?? -r.h / 2) + r.h / 2);
  } else {
    const b = e.t.getLocalBounds();
    w = b.width;
    h = b.height;
    ringC.set(b.x + w / 2, b.y + h / 2);
  }
  w = Math.round(w);
  h = Math.round(h);
  const rad = Math.round(e.o.radius ?? Math.min(h * 0.34, 22));
  ring.texture = ringTexture(w, h, rad);
}

function updateRing(dt: number) {
  const e = focused;
  const on = !!e && kb && e.active && !e.t.destroyed;
  ring.visible = on;
  if (!on) return;
  const m = e.t.worldTransform;
  e.t.toGlobal(ringC, tmpP, true);
  ring.position.copyFrom(tmpP);
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  ring.scale.set(sx, sy);
  ringT += dt;
  ring.alpha = reducedMotion() ? 1 : 0.9 + Math.sin(ringT * 0.004) * 0.1;
}

// ---- Mirror -------------------------------------------------------------------------------------

/** "INS FOYER" → "Ins foyer": screen readers spell out all-caps words. */
function speakable(s: string | null | undefined) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length > 3 && t === t.toUpperCase() && /[A-ZÄÖÜ]/.test(t)) return t.charAt(0) + t.slice(1).toLowerCase();
  return t;
}

function refresh(e: Entry) {
  // A label function may read a Text that was destroyed a frame ago; treat that as empty.
  let raw: string | null | undefined;
  try {
    raw = typeof e.o.label === 'function' ? e.o.label() : e.o.label;
  } catch {
    raw = '';
  }
  const lock = e.o.locked?.() ?? null;
  const text = speakable(raw) + (lock ? ` (gesperrt: ${lock})` : '');
  if (text !== e.text) {
    e.text = text;
    e.el.textContent = text;
  }
  const off = !!lock || (e.o.enabled ? !e.o.enabled() : false);
  if ((e.el.getAttribute('aria-disabled') === 'true') !== off) e.el.setAttribute('aria-disabled', off ? 'true' : 'false');
}

function activate(e: Entry) {
  if (e.t.destroyed) return;
  if (e.o.activate) e.o.activate();
  else e.t.emit('pointertap', stubEvent as never);
}
const stubEvent = { stopPropagation() {}, preventDefault() {}, global: new Point(), type: 'pointertap' };

/** Register a canvas tappable for keyboard focus and screen readers. Unregisters itself on destroy. */
export function focusable(t: Container, o: FocusOptions): FocusHandle {
  const el = document.createElement('button');
  el.type = 'button';
  const e: Entry = { t, o, el, active: false, rank: -1, x: 0, y: 0, w: 0, h: 0, text: '' };
  byEl.set(el, e);
  el.addEventListener('focus', () => {
    focused = e;
    // Lock and enabled states change quietly; bring the whole set up to date for the reader.
    for (let i = 0; i < order.length; i++) refresh(order[i]);
    refresh(e);
    showRing(e);
  });
  el.addEventListener('blur', () => {
    if (focused === e) focused = null;
  });
  // Screen readers click without keys; keyboard activation is handled on keydown below.
  el.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (performance.now() - lastAct > 400) activate(e);
  });
  refresh(e);
  entries.push(e);
  dirty = true;
  t.once('destroyed', () => {
    const i = entries.indexOf(e);
    if (i >= 0) entries.splice(i, 1);
    if (e.el.parentNode) e.el.remove();
    if (focused === e) focused = null;
    dirty = true;
  });
  return { refresh: () => refresh(e), setPressed: (on) => el.setAttribute('aria-pressed', on ? 'true' : 'false') };
}

/** Inside a visible container marked modal, only its own tappables are focusable (a paytable over the reels). */
export function markModal(c: Container) {
  (c as Container & { a11yModal?: boolean }).a11yModal = true;
}

/** -1 when hidden, detached or not interactive; else layer index × 2 (+1 inside a modal). */
function rankOf(t: Container) {
  if (t.destroyed || t.eventMode === 'none' || t.eventMode === 'passive' || !t.visible) return -1;
  let n: Container = t;
  let modal = 0;
  for (;;) {
    const p = n.parent;
    if (!p) return -1;
    if (n !== t && (!n.visible || n.alpha < 0.05 || !n.renderable || n.eventMode === 'none')) return -1;
    if (!p.interactiveChildren) return -1;
    if ((n as Container & { a11yModal?: boolean }).a11yModal) modal = 1;
    if (p === stage) return p.getChildIndex(n) * 2 + modal;
    n = p;
  }
}

function readingOrder(a: Entry, b: Entry) {
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;
  if (Math.abs(ay - by) < Math.min(a.h, b.h) * 0.5) return a.x - b.x;
  return ay - by;
}

function poll() {
  if (!root || !stage) return;
  let top = -1;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    e.rank = rankOf(e.t);
    if (e.rank > top) top = e.rank;
  }
  let changed = dirty;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const on = top >= 0 && e.rank === top;
    if (on !== e.active) {
      e.active = on;
      changed = true;
    }
    if (!on) continue;
    // Lay the twin over its canvas button (helps touch exploration and magnifiers).
    e.t.getBounds(false, tmpB);
    const x = Math.round(tmpB.x);
    const y = Math.round(tmpB.y);
    const w = Math.round(tmpB.width);
    const h = Math.round(tmpB.height);
    if (x !== e.x || y !== e.y || w !== e.w || h !== e.h) {
      if (Math.abs(x - e.x) + Math.abs(y - e.y) > 2) resort = true;
      e.x = x;
      e.y = y;
      e.w = w;
      e.h = h;
      const s = e.el.style;
      s.left = `${x}px`;
      s.top = `${y}px`;
      s.width = `${w}px`;
      s.height = `${h}px`;
    }
  }
  dirty = false;
  // Labels follow the game (a bet on a field, the chosen chip): the focused one at once, the rest about once a second.
  if (focused && focused.active) refresh(focused);
  if ((++polls & 3) === 0) for (let i = 0; i < order.length; i++) refresh(order[i]);
  if (!changed && !resort) return;
  resort = false;
  order.length = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.active) continue;
    if (changed) refresh(e);
    order.push(e);
  }
  order.sort(readingOrder);
  const ae = document.activeElement;
  const had = ae ? byEl.get(ae) : undefined;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.active && e.el.parentNode) e.el.remove();
  }
  const kids = root.children;
  for (let i = 0; i < order.length; i++) {
    const el = order[i].el;
    if (kids[i] !== el) root.insertBefore(el, kids[i] ?? null);
  }
  // Moving a focused element drops its focus; put it back.
  if (had && had.active && document.activeElement !== had.el) had.el.focus({ preventScroll: true });
  // A panel opened while the keyboard is in use, or a key just opened something: focus follows
  // into it (like a dialog). Games are left alone, so Space keeps spinning there.
  const now = document.activeElement;
  if ((!now || now === document.body) && order.length) {
    const layer = stage.children[top >> 1];
    const recent = performance.now() - lastAct < 2500;
    if (layer !== gamesLayer && (recent || (kb && panelLayers.includes(layer)))) {
      kb = true;
      order[0].el.focus({ preventScroll: true });
    }
  }
}

/** Arrow keys: the nearest active button in that direction. False when there is none. */
function moveSpatial(from: Entry, dx: number, dy: number) {
  const fx = from.x + from.w / 2;
  const fy = from.y + from.h / 2;
  let best: Entry | null = null;
  let bestD = Infinity;
  for (let i = 0; i < order.length; i++) {
    const e = order[i];
    if (e === from) continue;
    const vx = e.x + e.w / 2 - fx;
    const vy = e.y + e.h / 2 - fy;
    const along = vx * dx + vy * dy;
    if (along <= 4) continue;
    const across = Math.abs(vx * dy - vy * dx);
    const d = along + across * 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  best?.el.focus({ preventScroll: true });
  return !!best;
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Tab') {
    kb = true;
    if (document.body.classList.contains('modal-open')) wrapModal(ev);
    return;
  }
  const ae = document.activeElement;
  const cur = ae ? byEl.get(ae) : undefined;
  const isAct = ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Space';
  if (!cur) {
    // A DOM button pressed by key (HUD, dialog) or a key talk in the room: what it opens gets the focus.
    if (isAct && ae instanceof HTMLButtonElement) {
      kb = true;
      lastAct = performance.now();
    } else if ((ev.code === 'Enter' || ev.code === 'KeyE') && (!ae || ae === document.body)) lastAct = performance.now();
    return;
  }
  if (isAct) {
    // The focused button wins over the games' Space shortcut.
    ev.preventDefault();
    ev.stopImmediatePropagation();
    kb = true;
    if (!ev.repeat) {
      lastAct = performance.now();
      activate(cur);
    }
    return;
  }
  const dir = ARROWS[ev.code];
  if (!dir) return;
  if (moveSpatial(cur, dir[0], dir[1])) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    kb = true;
  } else {
    // Nothing that way: hand the arrows back to the room (walking) and the piano.
    cur.el.blur();
  }
}

/** Tab and Shift+Tab go round inside the open DOM dialog. */
function wrapModal(ev: KeyboardEvent) {
  const list = document.querySelectorAll<HTMLElement>('#modal button:not([disabled]), #modal input, #modal select, #modal [tabindex]:not([tabindex="-1"])');
  if (!list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  const ae = document.activeElement;
  const inside = !!ae && !!ae.closest('#modal');
  if (ev.shiftKey ? !inside || ae === first : !inside || ae === last) {
    ev.preventDefault();
    (ev.shiftKey ? last : first).focus({ preventScroll: true });
  }
}

function onPointer() {
  kb = false;
  const ae = document.activeElement;
  if (ae && byEl.has(ae)) (ae as HTMLElement).blur();
}

/** While the DOM dialog is open everything behind it is inert, so Tab stays inside it. */
function trapModal() {
  const ids = ['stage', 'a11y', 'hud', 'title'];
  let back: HTMLElement | null = null;
  let open = false;
  new MutationObserver(() => {
    const now = document.body.classList.contains('modal-open');
    if (now === open) return;
    open = now;
    if (now) back = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.inert = now;
    }
    if (!now && back && back.isConnected && (!document.activeElement || document.activeElement === document.body)) back.focus({ preventScroll: true });
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

/** Say each finished round out loud for screen readers. */
function announceRounds(state: GameState) {
  state.onRound((r) => {
    let name = r.game;
    try {
      name = getGame(r.game).name;
    } catch {
      /* unknown game id */
    }
    const t = r.tags;
    const pocket = t.includes('zero') ? 'Null. ' : t.includes('red') ? 'Rot. ' : t.includes('black') ? 'Schwarz. ' : '';
    const crash = t.includes('bust') ? 'Abgestürzt. ' : '';
    const res = r.win > 0 ? `Gewinn ${formatChips(r.win)} ${CURRENCY_PLURAL}${r.stake > 0 ? `, ${(r.win / r.stake).toLocaleString('de-DE', { maximumFractionDigits: 2 })}-fach` : ''}.` : 'Kein Gewinn.';
    announce(`${name}: ${pocket}${crash}${res} Kontostand ${formatChips(state.balance)} ${CURRENCY_PLURAL}.`);
  }, 'view');
}

/** Wire up once: the ring sits just below `below` (the fade), the mirror right after the canvas. */
export function initFocus(app: Application, layers: { below: Container; games: Container; panels: Container[] }, state: GameState) {
  stage = app.stage;
  gamesLayer = layers.games;
  panelLayers = layers.panels;
  const below = layers.below;
  app.stage.addChildAt(ring, app.stage.getChildIndex(below));
  const css = document.createElement('style');
  css.textContent =
    '#a11y{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:1}' +
    '#a11y button{position:absolute;margin:0;padding:0;min-height:0;opacity:0;pointer-events:none;transform:none;transition:none;box-shadow:none;background:none;font-size:1px;color:transparent;overflow:hidden}';
  document.head.appendChild(css);
  root = document.createElement('div');
  root.id = 'a11y';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Spielsteuerung');
  const host = document.getElementById('stage');
  host?.after(root);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onPointer, true);
  trapModal();
  announceRounds(state);
  app.ticker.add((t) => {
    pollMs += t.deltaMS;
    if (dirty ? pollMs > 60 : pollMs > 220) {
      pollMs = 0;
      poll();
    }
    updateRing(t.deltaMS);
  });
}

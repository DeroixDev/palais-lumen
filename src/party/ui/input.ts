// The local controller for minigames: keyboard (WASD/arrows, Leertaste, Shift) and the touch
// layout of the running minigame (stick + buttons). Presses are counted, so an edge is never
// lost, neither in a fast local simulation nor on the way to the host.

import type { MgInput, TouchLayout } from '../minigames/types';
import { $ } from '../util';

/** What a controller sends: axes, held buttons and press counters. */
export interface Pad { x: number; y: number; a: boolean; b: boolean; ca: number; cb: number; cl: number; cr: number }
export const NO_PAD: Pad = { x: 0, y: 0, a: false, b: false, ca: 0, cb: 0, cl: 0, cr: 0 };

const keys = new Set<string>();
const pad: Pad = { ...NO_PAD };
let joy: [number, number] | null = null;
let touchA = false, touchB = false;
let enabled = false;

const A_KEYS = ['Space', 'ArrowUp', 'KeyW'];
const B_KEYS = ['ShiftLeft', 'ShiftRight', 'KeyX'];
const L_KEYS = ['ArrowLeft', 'KeyA'];
const R_KEYS = ['ArrowRight', 'KeyD'];

export function initInput() {
  addEventListener('keydown', (e) => {
    if (!enabled || e.target instanceof HTMLInputElement) return;
    keys.add(e.code);
    if (!e.repeat) {
      if (A_KEYS.includes(e.code)) pad.ca++;
      if (B_KEYS.includes(e.code)) pad.cb++;
      if (L_KEYS.includes(e.code)) pad.cl++;
      if (R_KEYS.includes(e.code)) pad.cr++;
    }
    if (e.code === 'Space' || e.code.startsWith('Arrow')) {
      if (!(e.target instanceof HTMLButtonElement) || document.body.classList.contains('mg-live')) e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); });
  addEventListener('blur', () => { keys.clear(); joy = null; touchA = touchB = false; });

  const jEl = $('#joy'), knob = $('#joyKnob');
  let id: number | null = null;
  const set = (e: PointerEvent) => {
    const r = jEl.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    joy = [x, y];
    knob.style.transform = `translate(${(x * 40).toFixed(1)}px, ${(y * 40).toFixed(1)}px)`;
  };
  jEl.addEventListener('pointerdown', (e) => { id = e.pointerId; try { jEl.setPointerCapture(id); } catch { /* synthetic */ } set(e); });
  jEl.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  const end = (e: PointerEvent) => { if (e.pointerId !== id) return; id = null; joy = null; knob.style.transform = ''; };
  jEl.addEventListener('pointerup', end);
  jEl.addEventListener('pointercancel', end);
}

/** Puts the touch buttons of a minigame on screen. */
export function setTouch(layout: TouchLayout | null) {
  document.body.classList.toggle('ctl-joy', !!layout?.joy);
  const box = $('#tbtns');
  box.innerHTML = '';
  if (!layout) return;
  for (const b of layout.buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tbtn' + (b.small ? ' sm' : '') + (b.key === 'b' ? ' r' : '');
    el.textContent = b.label;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      el.classList.add('on');
      if (b.key === 'a') { pad.ca++; touchA = true; } else if (b.key === 'b') { pad.cb++; touchB = true; } else if (b.key === 'l') pad.cl++; else pad.cr++;
    };
    const up = () => { el.classList.remove('on'); if (b.key === 'a') touchA = false; if (b.key === 'b') touchB = false; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    box.appendChild(el);
  }
}

export function enableInput(on: boolean) {
  enabled = on;
  if (!on) { keys.clear(); joy = null; touchA = touchB = false; }
}

/** The current pad (shared object: copy it if you keep it). */
export function readPad(): Pad {
  const k = keys;
  let x = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
  let y = (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0);
  if (joy) { x = joy[0]; y = joy[1]; }
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  pad.x = x;
  pad.y = y;
  pad.a = touchA || A_KEYS.some((c) => k.has(c));
  pad.b = touchB || B_KEYS.some((c) => k.has(c));
  return pad;
}

/** Turns pads into simulation inputs: an edge is reported once per counter step. */
export class EdgeTracker {
  private last: Pad[] = [];
  reset(n: number) { this.last = Array.from({ length: n }, () => ({ ...NO_PAD, ca: -1 })); }
  /** First call for a player only records the counters. */
  input(i: number, p: Pad, out: MgInput): MgInput {
    const L = this.last[i] ?? (this.last[i] = { ...NO_PAD, ca: -1 });
    const first = L.ca < 0;
    out.x = p.x; out.y = p.y; out.a = p.a; out.b = p.b;
    out.aP = !first && p.ca > L.ca;
    out.bP = !first && p.cb > L.cb;
    out.lP = !first && p.cl > L.cl;
    out.rP = !first && p.cr > L.cr;
    L.ca = p.ca; L.cb = p.cb; L.cl = p.cl; L.cr = p.cr;
    return out;
  }
}

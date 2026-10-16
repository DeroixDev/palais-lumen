// The frame every board scene shares: one fixed full-screen root (created on first use, emptied
// and hidden when no scene shows, so nothing costs a frame then), timing that follows ?fast,
// reduced motion and the "Schneller" switch, transform/opacity-only WAAPI helpers, the card
// picker (arrows, Enter, Escape, digits, touch, gamepad) and the spectator cursor that mirrors
// somebody else choosing.

import type { BoardDef } from '../../boards/types';
import type { GameState } from '../../engine/state';
import { sfx } from '../../sfx';
import type { Seat } from '../../types';
import { SPEED, esc, reduced, sleep } from '../../util';
import { charSVG, coinSVG } from '../avatars';

/** What a scene needs from the presenter. */
export interface Host {
  seats: Seat[];
  me: number;
  st: GameState;
  hurry: boolean;
  board: BoardDef;
  name(p: number): string;
}

// ---------------- speed ----------------
let fast = false;
try { fast = localStorage.getItem('party.sceneFast') === '1'; } catch { /* private mode */ }
export const isFast = () => fast;
export function setFast(on: boolean) {
  fast = on;
  try { localStorage.setItem('party.sceneFast', on ? '1' : '0'); } catch { /* private mode */ }
}
/** Set while a scene must finish at once (a friend's show is behind, a minigame starts). */
export const flags = { rush: false };
/** Length of a beat in ms: test speed-up, "Schneller" and reduced motion. */
export function T(ms: number) {
  if (flags.rush) return 0;
  const k = SPEED * (fast ? 0.35 : 1);
  return reduced ? Math.min(ms * k, 140) : ms * k;
}
export const pause = (ms: number) => { const t = T(ms); return t > 0 ? sleep(t) : Promise.resolve(); };

/** A WAAPI animation (transform/opacity only), resolved when done; never throws. */
export function anim(el: Element | null, kf: Keyframe[], ms: number, o: KeyframeAnimationOptions = {}): Promise<void> {
  if (!el) return Promise.resolve();
  const d = T(ms);
  try {
    const a = (el as HTMLElement).animate(kf, { duration: Math.max(1, d), easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'forwards', ...o, delay: o.delay ? T(o.delay as number) : 0 });
    return a.finished.then(() => undefined, () => undefined);
  } catch { return Promise.resolve(); }
}

// ---------------- root ----------------
let root: HTMLElement | null = null;
export function sceneRoot(): HTMLElement {
  if (!root) {
    root = document.createElement('div');
    root.className = 'scn';
    root.id = 'scene';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    document.body.appendChild(root);
  }
  return root;
}

// ---------------- small builders ----------------
export const h = (tag: string, cls: string, html = '') => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
export function figHTML(s: Seat, cls = '') { return `<div class="sf ${cls}" style="--pc:${s.color}">${charSVG(s)}<span class="sf-sh"></span></div>`; }
export function chipHTML(h: Host, p: number) {
  const s = h.seats[p], P = h.st.players[p];
  return `<div class="s-chip" style="--pc:${s.color}" data-chip="${p}"><span class="s-ava">${charSVG(s, true)}</span><b>${esc(s.name)}</b><span class="s-val"><i class="s-star">★</i><em data-stars>${P.stars}</em></span><span class="s-val">${coinSVG}<em data-coins>${P.coins}</em></span></div>`;
}
export function refreshChips(box: HTMLElement, h: Host) {
  box.querySelectorAll<HTMLElement>('[data-chip]').forEach((c) => {
    const P = h.st.players[Number(c.dataset.chip)];
    if (!P) return;
    const cs = c.querySelector('[data-coins]'), ss = c.querySelector('[data-stars]');
    if (cs && cs.textContent !== String(P.coins)) { cs.textContent = String(P.coins); void anim(cs.parentElement, [{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], 380); }
    if (ss && ss.textContent !== String(P.stars)) { ss.textContent = String(P.stars); void anim(ss.parentElement, [{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], 420); }
  });
}

/** Centre of an element relative to the scene root. */
export function at(el: Element, rel: Element) {
  const a = el.getBoundingClientRect(), b = rel.getBoundingClientRect();
  return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
}

/** Flies small things (coins, an item, a star) from one element to another along an arc. */
export async function fly(layer: HTMLElement, html: string, from: Element, to: Element, o: { n?: number; size?: number; arc?: number; ms?: number; gap?: number; cls?: string } = {}) {
  const n = o.n ?? 1, size = o.size ?? 26, arc = o.arc ?? 80, ms = o.ms ?? 620, gap = o.gap ?? 70;
  const A = at(from, layer), B = at(to, layer);
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    const e = h('i', `fly ${o.cls ?? ''}`, html);
    e.style.width = e.style.height = `${size}px`;
    e.style.left = `${A.x - size / 2}px`;
    e.style.top = `${A.y - size / 2}px`;
    layer.appendChild(e);
    const jx = (Math.random() - 0.5) * 24, dx = B.x - A.x, dy = B.y - A.y;
    jobs.push(anim(e, [
      { transform: 'translate(0,0) scale(.4)', opacity: 0 },
      { transform: `translate(${dx * 0.5 + jx}px, ${dy * 0.5 - arc}px) scale(1.15)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.7)`, opacity: 1, offset: 0.92 },
      { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0 },
    ], ms, { delay: i * gap, easing: 'linear' }).then(() => e.remove()));
  }
  await Promise.all(jobs);
}

/** A floating "+3" over an element. */
export function pop(layer: HTMLElement, near: Element, text: string, col = 'var(--yellow)') {
  const p = at(near, layer);
  const e = h('span', 'pop', esc(text));
  e.style.left = `${p.x}px`;
  e.style.top = `${p.y}px`;
  e.style.setProperty('--fc', col);
  layer.appendChild(e);
  void anim(e, [{ transform: 'translate(-50%,0) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-30px) scale(1.15)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-56px) scale(1)', opacity: 1, offset: 0.8 }, { transform: 'translate(-50%,-70px) scale(1)', opacity: 0 }], 1300, { easing: 'ease-out' }).then(() => e.remove());
}

// ---------------- the picker ----------------
export interface Pick<T> { el: HTMLButtonElement; value: T; ok: boolean }
export interface PickOpts<T> {
  /** Escape / B button / the leave button. */
  back?: T;
  onFocus?(i: number): void;
  /** Initially focused index. */
  start?: number;
  /** Touch/click on an unfocused card only focuses it (a second tap or a confirm button picks). */
  tapFocus?: boolean;
  /** Gives the caller the finish (with a value) and choose (an index) functions. */
  bind?(finish: (v: T) => void, choose: (i: number) => void): void;
}

let activeKill: (() => void) | null = null;
/** Ends a running picker without an answer (the ask was taken away). */
export function killPick() { activeKill?.(); activeKill = null; }

export function pick<T>(items: Pick<T>[], o: PickOpts<T> = {}): Promise<T> {
  killPick();
  return new Promise<T>((res) => {
    let cur = -1, done = false;
    const okIdx = () => items.map((it, i) => (it.ok ? i : -1)).filter((i) => i >= 0);
    const focus = (i: number) => {
      if (i < 0 || i >= items.length) return;
      cur = i;
      items.forEach((it, k) => it.el.classList.toggle('hl', k === i));
      items[i].el.focus({ preventScroll: true });
      o.onFocus?.(i);
    };
    const step = (d: number) => {
      const n = items.length;
      if (!n) return;
      let i = cur < 0 ? (d > 0 ? -1 : n) : cur;
      for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (items[i].el.offsetParent !== null) break; }
      sfx.wheel();
      focus(i);
    };
    const finish = (v: T) => {
      if (done) return;
      done = true;
      cleanup();
      sfx.pop();
      res(v);
    };
    const choose = (i: number) => { const it = items[i]; if (it && it.ok) finish(it.value); else if (it) { sfx.bonk(); void anim(it.el, [{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], 260, { fill: 'none' }); } };
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const c = e.code;
      if (c === 'ArrowRight' || c === 'ArrowDown' || c === 'KeyD' || c === 'KeyS') { e.preventDefault(); step(1); }
      else if (c === 'ArrowLeft' || c === 'ArrowUp' || c === 'KeyA' || c === 'KeyW') { e.preventDefault(); step(-1); }
      else if (c === 'Enter' || c === 'Space' || c === 'NumpadEnter') { e.preventDefault(); if (document.activeElement instanceof HTMLButtonElement && !items.some((it) => it.el === document.activeElement)) (document.activeElement as HTMLButtonElement).click(); else choose(cur); }
      else if (c === 'Escape' || c === 'Backspace') { if ('back' in o) { e.preventDefault(); finish(o.back as T); } }
      else if (/^(Digit|Numpad)[1-9]$/.test(c)) { const i = Number(c.slice(-1)) - 1; if (items[i]) { e.preventDefault(); focus(i); choose(i); } }
      e.stopPropagation();
    };
    items.forEach((it, i) => {
      it.el.disabled = false;
      it.el.setAttribute('aria-disabled', String(!it.ok));
      it.el.onclick = () => { if (cur !== i) { focus(i); if (o.tapFocus) return; } choose(i); };
      it.el.onpointerenter = (e) => { if (!done && cur !== i && e.pointerType === 'mouse') focus(i); };
    });
    // gamepad: polled only while choosing
    let gpLast = { l: false, r: false, a: false, b: false };
    const gpT = 'getGamepads' in navigator ? window.setInterval(() => {
      const gp = [...navigator.getGamepads()].find((g) => g);
      if (!gp) return;
      const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
      const now = {
        l: ax < -0.5 || ay < -0.5 || !!gp.buttons[14]?.pressed || !!gp.buttons[12]?.pressed,
        r: ax > 0.5 || ay > 0.5 || !!gp.buttons[15]?.pressed || !!gp.buttons[13]?.pressed,
        a: !!gp.buttons[0]?.pressed, b: !!gp.buttons[1]?.pressed,
      };
      if (now.l && !gpLast.l) step(-1);
      if (now.r && !gpLast.r) step(1);
      if (now.a && !gpLast.a) choose(cur);
      if (now.b && !gpLast.b && 'back' in o) finish(o.back as T);
      gpLast = now;
    }, 70) : 0;
    addEventListener('keydown', key, true);
    const cleanup = () => {
      removeEventListener('keydown', key, true);
      clearInterval(gpT);
      items.forEach((it) => { it.el.onclick = null; it.el.onpointerenter = null; it.el.disabled = true; });
      if (activeKill === kill) activeKill = null;
    };
    const kill = () => { if (!done) { done = true; cleanup(); } };
    activeKill = kill;
    o.bind?.(finish, (i) => choose(i < 0 ? cur : i));
    const ok = okIdx();
    focus(o.start !== undefined && items[o.start] ? o.start : ok[0] ?? 0);
  });
}

/** Somebody else is choosing: a highlight wanders over the cards until the result is known. */
export function ghost(els: HTMLElement[], onFocus?: (i: number) => void) {
  let i = -1, t = 0;
  const go = () => {
    if (!els.length) return;
    let n = Math.floor(Math.random() * els.length);
    if (els.length > 1 && n === i) n = (n + 1) % els.length;
    i = n;
    els.forEach((e, k) => e.classList.toggle('hl', k === i));
    onFocus?.(i);
    t = window.setTimeout(go, Math.max(160, T(520)));
  };
  t = window.setTimeout(go, Math.max(60, T(260)));
  return {
    stop(final?: number) {
      clearTimeout(t);
      if (final !== undefined && final >= 0) { els.forEach((e, k) => e.classList.toggle('hl', k === final)); onFocus?.(final); }
    },
  };
}

/** The "Schneller" toggle shown while watching. */
export function fastBtn() {
  const b = h('button', 'scn-fast', '<span>Schneller</span><svg viewBox="0 0 24 24"><path d="M3 5l8 7-8 7zM12 5l8 7-8 7z"/></svg>');
  (b as HTMLButtonElement).type = 'button';
  b.setAttribute('aria-pressed', String(isFast()));
  b.onclick = () => { setFast(!isFast()); b.setAttribute('aria-pressed', String(isFast())); sfx.pop(); };
  return b;
}

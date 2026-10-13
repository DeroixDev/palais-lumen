// The house-tech tablet on the wall of every room: a code pad first, and behind the right code
// the house controls (the panel from ./debug.ts) on the same screen. Nothing it changes shows
// anywhere else: its notes stay on its own screen. The unlock lasts until the tablet is closed.

import { net } from '../net/session';
import type { GameState } from '../core/state';
import { sfx } from '../core/audio';
import { checkPin } from '../core/tabletPin';
import { debugPanel, type DebugActions } from './debug';

/** Title of the tablet dialog (the screen's status bar). */
export const TABLET_TITLE = 'Haustechnik';

export interface TabletHost {
  /** Shows `body` in the tablet frame (a second call swaps the screen). */
  show(body: HTMLElement): void;
  close(): void;
  isOpen(): boolean;
}

const MAX_DIGITS = 8;

/** Opens the tablet on its code pad. */
export function openTablet(state: GameState, host: TabletHost, actions: Omit<DebugActions, 'toast' | 'close'>) {
  // In a friend's group the house belongs to the host: the panel stays dark here.
  if (net.isGuest) {
    const lock = document.createElement('div');
    lock.className = 'tab-pin tab-locked';
    lock.innerHTML =
      '<div class="tab-lock" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15.5" r="1.4"/></svg></div>' +
      '<p class="tab-ask">Gesperrt</p><p class="tab-why">Die Haustechnik bedient heute der Gastgeber.</p>';
    host.show(lock);
    return;
  }
  const pad = document.createElement('div');
  pad.className = 'tab-pin';
  pad.tabIndex = -1;
  pad.setAttribute('role', 'group');
  pad.setAttribute('aria-label', 'Code eingeben');
  pad.innerHTML =
    '<div class="tab-lock" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15.5" r="1.4"/></svg></div>' +
    '<p class="tab-ask">Code eingeben</p><div class="tab-dots" aria-hidden="true"></div><div class="tab-keys"></div>';
  const dots = pad.querySelector('.tab-dots') as HTMLElement;
  const keys = pad.querySelector('.tab-keys') as HTMLElement;
  let code = '';
  let busy = false;

  const draw = () => {
    dots.innerHTML = '';
    const n = Math.max(4, code.length);
    for (let i = 0; i < n; i++) {
      const d = document.createElement('i');
      if (i < code.length) d.className = 'on';
      dots.appendChild(d);
    }
    pad.setAttribute('aria-label', code.length ? `Code eingeben, ${code.length} ${code.length === 1 ? 'Ziffer' : 'Ziffern'}` : 'Code eingeben');
  };
  const press = (k: string) => {
    if (busy) return;
    if (k === 'del') code = code.slice(0, -1);
    else if (k === 'ok') return submit();
    else if (code.length < MAX_DIGITS) code += k;
    sfx.tick();
    draw();
  };
  const submit = () => {
    if (busy || !code) return;
    if (checkPin(code)) {
      sfx.click();
      unlock();
      return;
    }
    // Wrong: shake, clear, nothing else.
    busy = true;
    pad.classList.remove('shake');
    void pad.offsetWidth;
    pad.classList.add('shake');
    navigator.vibrate?.(60);
    window.setTimeout(() => {
      code = '';
      busy = false;
      pad.classList.remove('shake');
      draw();
    }, 420);
  };

  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.k = k;
    if (k === 'del') {
      b.className = 'fn';
      b.setAttribute('aria-label', 'Löschen');
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h10.5v12H9l-5.5-6z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/></svg>';
    } else if (k === 'ok') {
      b.className = 'fn ok';
      b.setAttribute('aria-label', 'Bestätigen');
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    } else b.textContent = k;
    b.addEventListener('click', () => press(k));
    keys.appendChild(b);
  }

  const onKey = (e: KeyboardEvent) => {
    if (!pad.isConnected) return void window.removeEventListener('keydown', onKey, true);
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
    const k = m ? m[1] : e.code === 'Backspace' ? 'del' : e.code === 'Enter' || e.code === 'NumpadEnter' ? 'ok' : null;
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    press(k);
  };
  window.addEventListener('keydown', onKey, true);

  const unlock = () => {
    window.removeEventListener('keydown', onKey, true);
    const screen = document.createElement('div');
    screen.className = 'tab-screen';
    const note = document.createElement('p');
    note.className = 'tab-note';
    note.setAttribute('role', 'status');
    let noteTimer = 0;
    const panel = debugPanel(state, {
      ...actions,
      // Notes stay on the tablet: no toast, no banner, nothing on the floor.
      toast: (t) => {
        note.textContent = t;
        note.classList.add('on');
        clearTimeout(noteTimer);
        noteTimer = window.setTimeout(() => note.classList.remove('on'), 3200);
      },
      close: () => host.close(),
    });
    screen.append(panel, note);
    host.show(screen);
  };

  draw();
  host.show(pad);
  pad.focus({ preventScroll: true });
}

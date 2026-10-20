// Menu navigation with arrow keys and a controller: the focus moves to the nearest control in
// that direction (spatial), A / Enter presses it, B / Escape goes back (the [data-back] control
// of the screen). Works on the title, the lobby, the settings and the end-of-evening screen.
// While a pointer is used the focus rings stay quiet (body.kbnav is only set by keys / pads).

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** The part of the page the menu keys work in (null: the game has the keys). */
function scope(): HTMLElement | null {
  const set = document.querySelector<HTMLElement>('#ovSet.open');
  if (set) return set;
  const pod = document.querySelector<HTMLElement>('#ovPod.open');
  if (pod) return pod;
  if (!document.body.classList.contains('in-menu')) return null;
  return document.querySelector<HTMLElement>('.mscr:not([hidden])');
}

function visible(e: HTMLElement) {
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
}

function kb() { document.body.classList.add('kbnav'); }

/** Moves the focus to the nearest control in a direction (dx, dy one of -1, 0, 1). */
export function moveFocus(dx: number, dy: number) {
  const root = scope();
  if (!root) return false;
  const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
  if (!all.length) return false;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !root.contains(cur) || cur === document.body) { all[0].focus(); kb(); return true; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null, bestD = Infinity;
  for (const e of all) {
    if (e === cur) continue;
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    // must lie in that direction (edges, not centres, so a wide button next to small ones works)
    const along = dx ? (dx > 0 ? r.left - a.right + a.width * 0.5 : a.left - r.right + a.width * 0.5) : (dy > 0 ? r.top - a.bottom + a.height * 0.5 : a.top - r.bottom + a.height * 0.5);
    if (along <= 0) continue;
    const across = dx ? Math.max(0, Math.max(r.top, a.top) - Math.min(r.bottom, a.bottom)) + Math.abs(y - ay) * 0.3 : Math.max(0, Math.max(r.left, a.left) - Math.min(r.right, a.right)) + Math.abs(x - ax) * 0.3;
    const d = along + across * 2.2;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) return false;
  best.focus();
  best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  kb();
  return true;
}

function back() {
  const root = scope();
  const b = root?.querySelector<HTMLElement>('[data-back]');
  if (b && visible(b)) { b.click(); return true; }
  return false;
}

export function initMenuNav() {
  addEventListener('pointerdown', () => document.body.classList.remove('kbnav'), { passive: true });
  addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { kb(); return; }
    const root = scope();
    if (!root) return;
    const t = e.target as HTMLElement;
    const typing = t instanceof HTMLInputElement && (t.type === 'text' || t.type === 'range');
    const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = dir[e.key];
    if (d) {
      // in a text field left/right move the caret; on a slider they change the value
      if (typing && d[0] !== 0) return;
      if (moveFocus(d[0], d[1])) e.preventDefault();
    } else if (e.key === 'Escape' && !document.querySelector('#ovSet.open')) {
      if (back()) e.preventDefault();
    }
  });

  // controller: polled only while one is connected and a menu is on screen
  let raf = 0, held = '', next = 0, aWas = true, bWas = true;
  const poll = (now: number) => {
    raf = requestAnimationFrame(poll);
    const pads = navigator.getGamepads?.() ?? [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp || !scope() || document.hidden) { held = ''; return; }
    const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0, B = (i: number) => !!gp.buttons[i]?.pressed;
    const dir = B(14) || ax < -0.55 ? 'l' : B(15) || ax > 0.55 ? 'r' : B(12) || ay < -0.55 ? 'u' : B(13) || ay > 0.55 ? 'd' : '';
    if (dir && (dir !== held || now > next)) {
      next = now + (dir !== held ? 380 : 150);
      held = dir;
      moveFocus(dir === 'l' ? -1 : dir === 'r' ? 1 : 0, dir === 'u' ? -1 : dir === 'd' ? 1 : 0);
    } else if (!dir) held = '';
    const a = B(0), b = B(1);
    if (a && !aWas) {
      const f = document.activeElement as HTMLElement | null;
      if (f && scope()?.contains(f)) { kb(); f.click(); } else moveFocus(0, 1);
    }
    if (b && !bWas) { kb(); if (document.querySelector('#ovSet.open')) document.querySelector<HTMLElement>('#setClose')?.click(); else back(); }
    aWas = a; bWas = b;
  };
  addEventListener('gamepadconnected', () => { if (!raf) raf = requestAnimationFrame(poll); });
  addEventListener('gamepaddisconnected', () => { if (![...(navigator.getGamepads?.() ?? [])].some((p) => p?.connected)) { cancelAnimationFrame(raf); raf = 0; } });
}

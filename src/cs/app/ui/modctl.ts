// Building blocks of the house menu: one row per value with its control, its default and a reset
// arrow. Rows know how to redraw themselves, so a change anywhere refreshes every row.

import * as M from '../lib/mods';
import { esc } from '../lib/util';

export interface Bind<T> { get(): T; set(v: T): void; def: T }
export interface Row { el: HTMLElement; refresh(): void; show?(): void }

/** Every live row of the open menu. */
export const rows = new Set<Row>();
export const refreshAll = () => rows.forEach((r) => r.refresh());

export function modBind<T extends M.Val>(k: string): Bind<T> {
  return { get: () => M.get(k) as T, set: (v) => M.set(k, v), def: M.def(k) as T };
}

const de = (v: number, digits = 4) => v.toLocaleString('de-DE', { maximumFractionDigits: digits });
const same = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b);

interface RowOpts { help?: string; keys?: string }
function shell(label: string, o: RowOpts, defText: string | null): { el: HTMLElement; ctl: HTMLElement; setChanged(c: boolean): void } {
  const el = document.createElement('div');
  el.className = 'mm-row';
  el.dataset.k = `${label} ${o.help ?? ''} ${o.keys ?? ''}`.toLowerCase();
  el.innerHTML = `<div class="mm-lab"><span>${esc(label)}</span>${o.help ? `<small>${esc(o.help)}</small>` : ''}</div><div class="mm-ctl"></div>${defText === null ? '' : `<div class="mm-def"><small>Std <b>${esc(defText)}</b></small><button type="button" class="mm-rst" aria-label="Auf Standard zurücksetzen" title="Auf Standard zurücksetzen">↺</button></div>`}`;
  return {
    el,
    ctl: el.querySelector('.mm-ctl') as HTMLElement,
    setChanged(c) { el.classList.toggle('changed', c); const b = el.querySelector('.mm-rst') as HTMLButtonElement | null; if (b) b.disabled = !c; },
  };
}
function track(r: Row): Row { rows.add(r); r.refresh(); return r; }

export interface SliderOpts extends RowOpts {
  min: number; max: number; step: number;
  fmt?: (v: number) => string;
  /** Shown when the value is null ("Auto", "Normal"). */
  nullText?: string;
  /** Slider position while null. */
  nullAt?: number;
}
/** Range plus exact number field. */
export function slider(label: string, b: Bind<number | null>, o: SliderOpts): Row {
  const f = o.fmt ?? ((v: number) => de(v));
  const s = shell(label, o, b.def === null ? o.nullText ?? 'Auto' : f(b.def));
  s.ctl.innerHTML = `<div class="mm-sl"><input type="range" min="${o.min}" max="${o.max}" step="${o.step}" aria-label="${esc(label)}"><input class="mm-num" type="number" min="${o.min}" max="${o.max}" step="${o.step}" ${o.nullText ? `placeholder="${esc(o.nullText)}"` : ''} aria-label="${esc(label)} genau"><output class="mm-out mono"></output></div>`;
  const rg = s.ctl.querySelector('input[type=range]') as HTMLInputElement;
  const nm = s.ctl.querySelector('.mm-num') as HTMLInputElement;
  const out = s.ctl.querySelector('.mm-out') as HTMLElement;
  const draw = () => {
    const v = b.get();
    rg.value = String(v ?? o.nullAt ?? o.min);
    if (document.activeElement !== nm) nm.value = v === null ? '' : String(+v.toFixed(6));
    out.textContent = v === null ? o.nullText ?? 'Auto' : f(v);
    s.setChanged(!same(v, b.def));
  };
  rg.addEventListener('input', () => { b.set(Number(rg.value)); refreshAll(); });
  nm.addEventListener('change', () => {
    const t = nm.value.trim().replace(',', '.');
    if (t === '' && b.def === null) b.set(null);
    else if (t !== '' && isFinite(Number(t))) b.set(Number(t));
    refreshAll();
  });
  s.el.querySelector('.mm-rst')?.addEventListener('click', () => { b.set(b.def); refreshAll(); });
  return track({ el: s.el, refresh: draw });
}

/** Number field; empty = null when the default is null. */
export function numField(label: string, b: Bind<number | null>, o: RowOpts & { min?: number; max?: number; step?: number; unit?: string; nullText?: string; fmt?: (v: number) => string }): Row {
  const f = o.fmt ?? ((v: number) => de(v));
  const s = shell(label, o, b.def === null ? o.nullText ?? 'Auto' : f(b.def));
  s.ctl.innerHTML = `<label class="mm-nf"><input class="inp mm-in" type="number" ${o.min !== undefined ? `min="${o.min}"` : ''} ${o.max !== undefined ? `max="${o.max}"` : ''} step="${o.step ?? 'any'}" placeholder="${esc(o.nullText ?? '')}" aria-label="${esc(label)}">${o.unit ? `<span>${esc(o.unit)}</span>` : ''}</label>`;
  const nm = s.ctl.querySelector('input') as HTMLInputElement;
  const draw = () => {
    const v = b.get();
    if (document.activeElement !== nm) nm.value = v === null ? '' : String(+v.toFixed(6));
    s.setChanged(!same(v, b.def));
  };
  nm.addEventListener('change', () => {
    const t = nm.value.trim().replace(',', '.');
    let v: number | null = t === '' ? null : Number(t);
    if (v !== null && !isFinite(v)) return;
    if (v !== null && o.min !== undefined) v = Math.max(o.min, v);
    if (v !== null && o.max !== undefined) v = Math.min(o.max, v);
    if (v === null && b.def !== null) v = b.def;
    b.set(v);
    refreshAll();
  });
  nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') nm.blur(); });
  s.el.querySelector('.mm-rst')?.addEventListener('click', () => { b.set(b.def); refreshAll(); });
  return track({ el: s.el, refresh: draw });
}

export function toggle(label: string, b: Bind<boolean>, o: RowOpts = {}): Row {
  const s = shell(label, o, b.def ? 'An' : 'Aus');
  s.ctl.innerHTML = `<label class="mm-sw"><input type="checkbox" aria-label="${esc(label)}"><i></i><span></span></label>`;
  const cb = s.ctl.querySelector('input') as HTMLInputElement;
  const draw = () => { const v = !!b.get(); cb.checked = v; (s.ctl.querySelector('span') as HTMLElement).textContent = v ? 'An' : 'Aus'; s.setChanged(v !== b.def); };
  cb.addEventListener('change', () => { b.set(cb.checked); refreshAll(); });
  s.el.querySelector('.mm-rst')?.addEventListener('click', () => { b.set(b.def); refreshAll(); });
  return track({ el: s.el, refresh: draw });
}

export function select(label: string, b: Bind<string>, options: [string, string][], o: RowOpts = {}): Row {
  const s = shell(label, o, options.find(([v]) => v === b.def)?.[1] ?? b.def);
  s.ctl.innerHTML = `<select class="sel mm-sel" aria-label="${esc(label)}">${options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>`;
  const sel = s.ctl.querySelector('select') as HTMLSelectElement;
  const draw = () => { sel.value = b.get(); s.setChanged(b.get() !== b.def); };
  sel.addEventListener('change', () => { b.set(sel.value); refreshAll(); });
  s.el.querySelector('.mm-rst')?.addEventListener('click', () => { b.set(b.def); refreshAll(); });
  return track({ el: s.el, refresh: draw });
}

export function textField(label: string, b: Bind<string>, o: RowOpts & { max?: number } = {}): Row {
  const s = shell(label, o, b.def || '–');
  s.ctl.innerHTML = `<input class="inp mm-in wide" type="text" maxlength="${o.max ?? 40}" aria-label="${esc(label)}">`;
  const t = s.ctl.querySelector('input') as HTMLInputElement;
  const draw = () => { if (document.activeElement !== t) t.value = b.get(); s.setChanged(b.get() !== b.def); };
  t.addEventListener('change', () => { b.set(t.value); refreshAll(); });
  s.el.querySelector('.mm-rst')?.addEventListener('click', () => { b.set(b.def); refreshAll(); });
  return track({ el: s.el, refresh: draw });
}

/** Buttons without a stored value. A button whose label ends in '!' asks once more before it acts. */
export function actions(label: string, buttons: [string, () => void, string?][], o: RowOpts & { info?: () => string } = {}): Row {
  const s = shell(label, o, null);
  s.el.classList.add('act');
  s.ctl.innerHTML = `${o.info ? '<span class="mm-info mono"></span>' : ''}<div class="mm-btns">${buttons.map(([t, , cls], i) => `<button type="button" class="btn sm ${cls ?? 'ghost'}" data-i="${i}">${esc(t.replace(/!$/, ''))}</button>`).join('')}</div>`;
  s.ctl.querySelectorAll<HTMLButtonElement>('.mm-btns .btn').forEach((btn) => {
    const [t, fn] = buttons[Number(btn.dataset.i)];
    let armed = 0;
    btn.addEventListener('click', () => {
      if (t.endsWith('!') && !armed) {
        btn.textContent = 'Sicher?';
        btn.classList.add('armed');
        armed = window.setTimeout(() => { armed = 0; btn.textContent = t.replace(/!$/, ''); btn.classList.remove('armed'); }, 2500);
        return;
      }
      clearTimeout(armed); armed = 0;
      btn.textContent = t.replace(/!$/, ''); btn.classList.remove('armed');
      fn();
      refreshAll();
    });
  });
  const info = s.ctl.querySelector('.mm-info') as HTMLElement | null;
  return track({ el: s.el, refresh: () => { if (info && o.info) info.textContent = o.info(); } });
}

/** A free-form block (pickers, lists) that still takes part in search. */
export function block(label: string, build: (host: HTMLElement) => (() => void) | void, o: RowOpts = {}): Row {
  const el = document.createElement('div');
  el.className = 'mm-row mm-block';
  el.dataset.k = `${label} ${o.help ?? ''} ${o.keys ?? ''}`.toLowerCase();
  el.innerHTML = `<div class="mm-lab"><span>${esc(label)}</span>${o.help ? `<small>${esc(o.help)}</small>` : ''}</div><div class="mm-body"></div>`;
  const host = el.querySelector('.mm-body') as HTMLElement;
  let built = false;
  let redraw: (() => void) | void;
  const r: Row = {
    el,
    refresh: () => { if (built && redraw) redraw(); },
    show: () => { if (!built) { built = true; redraw = build(host); } },
  };
  rows.add(r);
  return r;
}

export function group(title: string, rowsIn: (Row | null | undefined | false)[], note?: string): HTMLElement {
  const g = document.createElement('section');
  g.className = 'mm-group';
  g.innerHTML = `<h3>${esc(title)}</h3>${note ? `<p class="mm-note">${esc(note)}</p>` : ''}`;
  for (const r of rowsIn) if (r) g.appendChild(r.el);
  return g;
}

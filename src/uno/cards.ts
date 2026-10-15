// Our own card design: colour body with a slash pattern, a dark slanted slab in the middle with
// the big number or symbol, small indices in two corners. All symbols are drawn here.

import type { Card, Color } from './engine';

export const CARD_COLORS: Record<Color, string> = { r: '#ff2e4d', y: '#ffcf1a', g: '#18c96a', b: '#2f7dff' };

/** One sprite with every symbol, put into the page once. */
export const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
<defs>
  <symbol id="u-skip" viewBox="0 0 100 100"><circle cx="50" cy="50" r="33" fill="none" stroke="currentColor" stroke-width="15"/><path d="M27 73 73 27" stroke="currentColor" stroke-width="15" stroke-linecap="square"/></symbol>
  <symbol id="u-rev" viewBox="0 0 100 100"><path d="M14 40h50V22l26 26-26 0z" fill="currentColor"/><path d="M86 60H36v18L10 52h26z" fill="currentColor"/></symbol>
  <symbol id="u-wild" viewBox="0 0 100 100"><path d="M22 14h34l-8 34H14z" fill="#ff2e4d"/><path d="M60 14h30l-8 34H52z" fill="#2f7dff"/><path d="M13 52h33l-8 34H5z" fill="#ffcf1a"/><path d="M50 52h34l-8 34H42z" fill="#18c96a"/></symbol>
  <symbol id="u-chips" viewBox="0 0 100 24"><path d="M8 2h18l-4 20H4z" fill="#ff2e4d"/><path d="M32 2h18l-4 20H28z" fill="#2f7dff"/><path d="M56 2h18l-4 20H52z" fill="#ffcf1a"/><path d="M80 2h18l-4 20H76z" fill="#18c96a"/></symbol>
  <symbol id="u-glint" viewBox="0 0 40 40"><path d="M20 0l4 16 16 4-16 4-4 16-4-16L0 20l16-4z" fill="currentColor"/></symbol>
</defs></svg>`;

const sym = (id: string) => `<svg class="sym" aria-hidden="true"><use href="#u-${id}"/></svg>`;

function face(c: Card): { big: string; corner: string } {
  switch (c.k) {
    case 'num': {
      const t = c.n === 6 || c.n === 9 ? `<u>${c.n}</u>` : String(c.n);
      return { big: `<b>${t}</b>`, corner: t };
    }
    case 'skip': return { big: sym('skip'), corner: sym('skip') };
    case 'rev': return { big: sym('rev'), corner: sym('rev') };
    case 'd2': return { big: `<b class="plus">+2</b>`, corner: '+2' };
    case 'wild': return { big: sym('wild'), corner: sym('wild') };
    case 'd4': return { big: `<b class="plus">+4</b>${sym('chips').replace('class="sym"', 'class="chips"')}`, corner: '+4' };
  }
}

/** Inner HTML of a card face (the element itself is made by the caller). */
export function cardInner(c: Card) {
  const f = face(c);
  return `<i class="cx tl">${f.corner}</i><i class="slab">${f.big}</i><i class="cx br">${f.corner}</i>`;
}

export const cardClass = (c: Card) => `card f-${c.c} k-${c.k}`;

export function cardEl(c: Card, tag = 'div'): HTMLElement {
  const el = document.createElement(tag);
  el.className = cardClass(c);
  el.innerHTML = cardInner(c);
  return el;
}

export const BACK_INNER = `<i class="bk"><b>Unser</b><b>Uno</b>${'<svg class="bk-glint" aria-hidden="true"><use href="#u-glint"/></svg>'}</i>`;

export function backEl(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card back';
  el.innerHTML = BACK_INNER;
  return el;
}

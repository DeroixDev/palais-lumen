// 2D versions of the figures for the HUD (same cast as in 3D), plus star and coin icons.

import type { Feat } from '../types';

const VOID = '#0b0614';
export interface Look { color: string; acc: string; feat: Feat }

const FEAT: Record<Feat, (c: string, a: string) => string> = {
  cap: (_c, a) => `<path d="M12 30 C12 12 52 12 52 30 Z" fill="${a}" stroke="${VOID}" stroke-width="3.5" stroke-linejoin="round"/><path d="M44 27 h16 a3 3 0 0 1 0 6 h-18 z" fill="${a}" stroke="${VOID}" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="15" r="3" fill="#fff"/>`,
  ears: (c, a) => `<g stroke="${VOID}" stroke-width="3.5"><ellipse cx="21" cy="12" rx="6" ry="13" fill="${c}" transform="rotate(-14 21 12)"/><ellipse cx="43" cy="12" rx="6" ry="13" fill="${c}" transform="rotate(14 43 12)"/></g><ellipse cx="21" cy="13" rx="2.6" ry="8" fill="${a}" transform="rotate(-14 21 13)"/><ellipse cx="43" cy="13" rx="2.6" ry="8" fill="${a}" transform="rotate(14 43 13)"/>`,
  ant: (_c, a) => `<path d="M32 18 L38 3" stroke="${VOID}" stroke-width="3.5" stroke-linecap="round"/><circle cx="38" cy="3" r="5" fill="${a}" stroke="${VOID}" stroke-width="3"/>`,
  horns: (_c, a) => `<g fill="${a}" stroke="${VOID}" stroke-width="3" stroke-linejoin="round"><path d="M17 24 L13 6 L27 19 Z"/><path d="M47 24 L51 6 L37 19 Z"/></g>`,
};

export function charSVG(p: Look, head = false) {
  const c = p.color, a = p.acc, front = p.feat === 'cap';
  return `<svg viewBox="${head ? '0 0 64 62' : '-2 -4 68 92'}" aria-hidden="true">${front ? '' : FEAT[p.feat](c, a)}
    <ellipse cx="21" cy="83" rx="8" ry="4.5" fill="${VOID}"/><ellipse cx="43" cy="83" rx="8" ry="4.5" fill="${VOID}"/>
    <path d="M32 16 C51 16 59 29 59 46 L59 66 C59 78 49 82 32 82 C15 82 5 78 5 66 L5 46 C5 29 13 16 32 16Z" fill="${c}" stroke="${VOID}" stroke-width="3.5"/>
    <path d="M14 34 C16 26 21 22 28 20" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".7"/>${front ? FEAT.cap(c, a) : ''}
    <g stroke="${VOID}" stroke-width="2.6"><ellipse cx="23" cy="42" rx="7" ry="8.5" fill="#fff"/><ellipse cx="41" cy="42" rx="7" ry="8.5" fill="#fff"/></g>
    <circle cx="24.5" cy="43.5" r="3.8" fill="${VOID}"/><circle cx="42.5" cy="43.5" r="3.8" fill="${VOID}"/><circle cx="26" cy="41.8" r="1.3" fill="#fff"/><circle cx="44" cy="41.8" r="1.3" fill="#fff"/>
    <ellipse cx="14" cy="53" rx="4.5" ry="2.8" fill="#ff6fb1" opacity=".75"/><ellipse cx="50" cy="53" rx="4.5" ry="2.8" fill="#ff6fb1" opacity=".75"/>
    <path d="M27 54 Q32 59 37 54" stroke="${VOID}" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>`;
}
export const starSVG = (fill = '#ffe14a') => `<svg viewBox="-2 -2 54 52" aria-hidden="true"><path d="M25 1 L31.5 16.5 L48 17.6 L35.3 28.3 L39.3 44.6 L25 35.6 L10.7 44.6 L14.7 28.3 L2 17.6 L18.5 16.5 Z" fill="${fill}" stroke="${VOID}" stroke-width="3.5" stroke-linejoin="round"/><circle cx="20.5" cy="25" r="2.4" fill="${VOID}"/><circle cx="29.5" cy="25" r="2.4" fill="${VOID}"/></svg>`;
export const coinSVG = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#ffe14a" stroke="${VOID}" stroke-width="2"/><circle cx="10" cy="10" r="5" fill="none" stroke="#e0a800" stroke-width="2"/></svg>`;
export const backSVG = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7M8 12h13"/></svg>';
export const gearSVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>';
export const titleHTML = '<h1 class="ttitle"><span class="tt1">Unser</span><span class="tt2">Party</span><span class="tt3">Spiel</span></h1>';

// Settings kept apart from the save (own key). Only a hash of the code is stored.
// The luck value now lives in mods.ts; an old stored multiplier moves over once.

import * as M from './mods';

const KEY = 'csgambler.panel';

interface PanelData { h: string; luck: number }

function digest(code: string): string {
  // Two FNV-1a passes with different salts, enough for a friends-only lock.
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  const s = `csg~${code}~lock`;
  for (let r = 0; r < 64; r++) {
    for (let i = 0; i < s.length; i++) {
      a ^= s.charCodeAt(i) + r; a = Math.imul(a, 16777619);
      b ^= s.charCodeAt(s.length - 1 - i) ^ a; b = Math.imul(b, 2246822507);
    }
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

function read(): PanelData {
  try {
    const t = localStorage.getItem(KEY);
    if (t) {
      const d = JSON.parse(t) as Partial<PanelData>;
      return { h: typeof d.h === 'string' ? d.h : digest('1337'), luck: typeof d.luck === 'number' ? d.luck : 1 };
    }
  } catch { /* ignore */ }
  return { h: digest('1337'), luck: 1 };
}
let data = read();
function write() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ } }
if (data.luck !== 1) { if (!M.isSet('luck.you')) setLuck(data.luck); data.luck = 1; write(); }

export const checkCode = (code: string) => digest(code) === data.h;
export function setCode(code: string) { data.h = digest(code); write(); }
/** Your multiplier on gold/covert case odds. 1 = fair. */
export const luck = () => M.luckMult('you');
/** Sets your luck from a multiplier (0.125..8 maps to -100..100). */
export function setLuck(v: number) { M.set('luck.you', Math.round(Math.max(-100, Math.min(100, (100 * Math.log(Math.max(1e-3, v))) / Math.log(8))))); }
export function reloadPanel() { data = read(); }

// Dev pages (the fountain) open only after the right code in this browser session.
const DEV_KEY = 'csgambler.dev';
let devOn = false;
export function devUnlocked(): boolean {
  if (devOn) return true;
  try { return sessionStorage.getItem(DEV_KEY) === '1'; } catch { return false; }
}
export function unlockDev() { devOn = true; try { sessionStorage.setItem(DEV_KEY, '1'); } catch { /* blocked: memory only */ } }

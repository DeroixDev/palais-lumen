// Settings kept apart from the save (own key). Only a hash of the code is stored.

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

export const checkCode = (code: string) => digest(code) === data.h;
export function setCode(code: string) { data.h = digest(code); write(); }
/** Multiplier on gold/covert odds and upgrade chances. 1 = fair. */
export const luck = () => data.luck;
export function setLuck(v: number) { data.luck = Math.max(0.2, Math.min(8, v)); write(); }
export function reloadPanel() { data = read(); }

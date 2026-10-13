// The house-tech tablet's code. Kept next to the other device settings in localStorage
// (sound, music, motion), so it holds for every save on this device. Only a hash is stored,
// never the digits; no entry means the factory code.

const KEY = 'nachtfalter.panel';
const FACTORY = '1337';

/** FNV-1a over a salted string, as 8 hex digits. Not security, just not in plain sight. */
function hash(pin: string) {
  let h = 0x811c9dc5;
  const s = `lumen-panel:${pin}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function stored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** 4 to 8 digits. */
export const validPin = (pin: string) => /^\d{4,8}$/.test(pin);

/** Is `pin` the tablet's code? */
export function checkPin(pin: string) {
  return hash(pin) === (stored() ?? hash(FACTORY));
}

/** Sets a new code (4 to 8 digits). False if it isn't one or storage is blocked. */
export function setPin(pin: string) {
  if (!validPin(pin)) return false;
  try {
    if (pin === FACTORY) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, hash(pin));
    return true;
  } catch {
    return false;
  }
}


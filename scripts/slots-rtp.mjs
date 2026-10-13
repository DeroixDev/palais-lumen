// Counts the exact payout ratio of the slot machine over all 6^9 grids and checks it
// against the RTP constant shown in the game. Run: node scripts/slots-rtp.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/games/slots/slots.ts', import.meta.url), 'utf8');
const obj = (name) => JSON.parse(src.match(new RegExp(`${name}: Record<SymbolId, number> = (\\{[^}]*\\})`))[1].replace(/(\w+):/g, '"$1":'));
const S = ['firefly', 'candle', 'lantern', 'key', 'moon', 'moth'];
const WEIGHTS = obj('WEIGHTS');
const PAY = obj('PAY');
const COMBO = JSON.parse(src.match(/COMBO = (\[[^\]]*\])/)[1]);
const RTP = Number(src.match(/RTP = ([\d.]+)/)[1]);
const FEATHER_RTP = Number(src.match(/FEATHER_RTP = ([\d.]+)/)[1]);

const total = S.reduce((s, k) => s + WEIGHTS[k], 0);
const P = S.map((k) => WEIGHTS[k] / total);
const pay = S.map((k) => PAY[k]);
// Cell index = column * 3 + row, same lines as LINES in slots.ts.
const LINES = [[0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 4, 8], [2, 4, 6]];
const MOTH = 5;
const lineSym = new Int8Array(216);
for (let i = 0; i < 216; i++) {
  const plain = [(i / 36) | 0, ((i / 6) | 0) % 6, i % 6].filter((x) => x !== MOTH);
  lineSym[i] = plain.length === 0 ? MOTH : plain.every((x) => x === plain[0]) ? plain[0] : -1;
}
let rtp = 0;
// Glücksfeder (odds item): a spin without any line gets its middle cell (index 4) drawn once more.
let feather = 0;
const lineWin = (g) => {
  let n = 0;
  let sum = 0;
  for (const [a, b, c] of LINES) {
    const s = lineSym[g[a] * 36 + g[b] * 6 + g[c]];
    if (s >= 0) {
      n++;
      sum += pay[s];
    }
  }
  return n ? sum * COMBO[n] : 0;
};
const g = new Int8Array(9);
for (let i = 0; i < 6 ** 9; i++) {
  let x = i;
  let p = 1;
  for (let k = 0; k < 9; k++) {
    g[k] = x % 6;
    x = (x / 6) | 0;
    p *= P[g[k]];
  }
  let n = 0;
  let sum = 0;
  for (const [a, b, c] of LINES) {
    const s = lineSym[g[a] * 36 + g[b] * 6 + g[c]];
    if (s >= 0) {
      n++;
      sum += pay[s];
    }
  }
  if (n) {
    rtp += p * sum * COMBO[n];
    feather += p * sum * COMBO[n];
  } else {
    const keep = g[4];
    let e = 0;
    for (let v = 0; v < 6; v++) {
      g[4] = v;
      e += P[v] * lineWin(g);
    }
    g[4] = keep;
    feather += p * e;
  }
}
console.log(`exact RTP ${rtp.toFixed(7)}, shown ${RTP}`);
if (Math.abs(rtp - RTP) > 5e-7) {
  console.error('RTP constant in slots.ts is out of date');
  process.exit(1);
}
console.log(`Glücksfeder: exact RTP ${feather.toFixed(7)}, shown ${FEATHER_RTP}`);
if (Math.abs(feather - FEATHER_RTP) > 5e-7) {
  console.error('FEATHER_RTP constant in slots.ts is out of date');
  process.exit(1);
}

// Mottenfall: enumerates all 2^12 equally likely coin paths through the game's own rules
// (src/games/plinko/rules.ts), without and with the Mottenflügel (wingPath), and checks the
// payout share against returnToPlayer() and wingRtp(). Run: node scripts/rtp-plinko.mjs
import { loadTs } from './_load-ts.mjs';

const P = await loadTs('src/games/plinko/rules.ts');
const pct = (x) => (x * 100).toFixed(4) + ' %';
let ok = true;
for (const risk of ['low', 'mid', 'high']) {
  let base = 0;
  let wing = 0;
  const n = 2 ** P.ROWS;
  for (let m = 0; m < n; m++) {
    const path = Array.from({ length: P.ROWS }, (_, r) => (m >> r) & 1);
    const cup = (p) => p.reduce((s, d) => s + d, 0);
    base += P.TABLE[risk][cup(path)] / n;
    wing += P.TABLE[risk][cup(P.wingPath(path))] / n;
  }
  const okBase = Math.abs(base - P.returnToPlayer(risk)) < 1e-12;
  const okWing = Math.abs(wing - P.wingRtp(risk)) < 1e-12;
  ok &&= okBase && okWing;
  console.log(`${P.RISK_LABEL[risk].padEnd(6)} ohne Item ${pct(base)} ${okBase ? '✓' : '✗'} · mit Mottenflügel ${pct(wing)} ${okWing ? '✓' : '✗'}`);
}
console.log(ok ? 'OK' : 'FEHLER');
process.exit(ok ? 0 : 1);

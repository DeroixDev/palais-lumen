// Straßenwürfel: exact return of the line and field bets from src/games/craps/rules.ts, then
// 2,000,000 simulated rounds of the game's own playRound(). Run: node scripts/rtp-craps.mjs
import { build } from 'esbuild';

const out = await build({ entryPoints: [new URL('../src/games/craps/rules.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm' });
const R = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));

// Exact, written out once more by hand as a cross-check: P(win) per point = ways / (ways + 6).
const W = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
const nat = (W[7] + W[11]) / 36;
let pointWin = 0;
for (const p of [4, 5, 6, 8, 9, 10]) pointWin += (W[p] / 36) * (W[p] / (W[p] + 6));
const line = nat * 2 + pointWin * 1.9;
const field = ((W[3] + W[4] + W[9] + W[10] + W[11]) * 2 + (W[2] + W[12]) * 3) / 36;
const pct = (x) => (x * 100).toFixed(3) + ' %';
console.log(`Linie exakt: ${pct(line)} (rules.ts: ${pct(R.LINE_RTP)})`);
console.log(`Feld exakt:  ${pct(field)} (rules.ts: ${pct(R.FIELD_RTP)})`);

const N = 2_000_000;
let staked = 0;
let paid = 0;
let fStaked = 0;
let fPaid = 0;
for (let i = 0; i < N; i++) {
  // Odd stake 15: the 9:10 point pay (28,5) is rounded by chance in the game's own pointPays().
  staked += 15;
  paid += R.playRound(15, 0);
  fStaked += 1;
  fPaid += R.playRound(0, 1);
}
console.log(`Simuliert (${N.toLocaleString('de-DE')} Runden je Wette, Linie mit Einsatz 15): Linie ${pct(paid / staked)}, Feld ${pct(fPaid / fStaked)}`);
const ok = Math.abs(line - R.LINE_RTP) < 1e-12 && Math.abs(field - R.FIELD_RTP) < 1e-12 && line >= 0.93 && line <= 0.97 && field >= 0.93 && field <= 0.97;
console.log(ok ? 'OK: beide Wetten zwischen 93 % und 97 %.' : 'FEHLER');
process.exit(ok ? 0 : 1);

// Drei Laternen: exact return 2.85 / 3, then 2,000,000 simulated picks with the game's own
// mothUnder() from src/games/shells/rules.ts. Run: node scripts/rtp-shells.mjs
import { build } from 'esbuild';

const out = await build({ entryPoints: [new URL('../src/games/shells/rules.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm' });
const R = await import('data:text/javascript,' + encodeURIComponent(out.outputFiles[0].text));

const pct = (x) => (x * 100).toFixed(3) + ' %';
const N = 2_000_000;
// Real payout function with an odd stake (15: 42,5 Falter are paid as 42 or 43 by chance).
const STAKE = 15;
let paid = 0;
for (let i = 0; i < N; i++) {
  const pick = i % 3;
  if (R.mothUnder(pick) === pick) paid += R.hitPays(STAKE) / STAKE;
}
const exact = R.PAY / 3;
console.log(`Exakt: ${pct(exact)} (rules.ts RTP ${pct(R.RTP)}) · simuliert (Einsatz 15): ${pct(paid / N)}`);
const ok = Math.abs(exact - R.RTP) < 1e-12 && exact >= 0.93 && exact <= 0.97;
console.log(ok ? 'OK: zwischen 93 % und 97 %.' : 'FEHLER');

// Leuchtkäfer (odds item): exact 2.85 × 2/5 away from the firefly, 2.85 × 1/5 on it; then the
// game's own flyRound() simulated (picking a lantern without the firefly, and the firefly's own).
let away = 0, onFly = 0, pos = [0, 0, 0];
for (let i = 0; i < N; i++) {
  const { fly, moth } = R.flyRound();
  const pick = (fly + 1 + (i % 2)) % 3;
  if (moth === pick) away += R.hitPays(STAKE) / STAKE;
  if (moth === fly) onFly += R.hitPays(STAKE) / STAKE;
  pos[moth]++;
}
const okFly = Math.abs(R.FLY_RTP - (R.PAY * 2) / 5) < 1e-12 && Math.abs(R.FLY_SELF_RTP - R.PAY / 5) < 1e-12 && Math.abs(away / N - R.FLY_RTP) < 0.01 && Math.abs(onFly / N - R.FLY_SELF_RTP) < 0.01;
console.log(`Leuchtkäfer: ohne Käfer-Laterne exakt ${pct(R.FLY_RTP)}, simuliert ${pct(away / N)} · Käfer-Laterne exakt ${pct(R.FLY_SELF_RTP)}, simuliert ${pct(onFly / N)} · Motte je Platz ${pos.map((x) => pct(x / N)).join(' / ')}`);
console.log(okFly ? 'OK: Leuchtkäfer' : 'FEHLER Leuchtkäfer');
process.exit(ok && okFly ? 0 : 1);

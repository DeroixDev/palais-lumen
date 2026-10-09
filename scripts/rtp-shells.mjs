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
process.exit(ok ? 0 : 1);

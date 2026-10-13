// Zielscheibe: exact return of each throwing style from its ring table, plus 2,000,000
// simulated throws through the game's own drawHit/multFor (src/games/target/rules.ts).
// Run: node scripts/rtp-target.mjs
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const ts = readFileSync(new URL('../src/games/target/rules.ts', import.meta.url), 'utf8');
const R = await import('data:text/javascript,' + encodeURIComponent(transformSync(ts, { loader: 'ts', format: 'esm' }).code));

let ok = true;
for (const st of R.STYLE_ORDER) {
  const { label, rings } = R.STYLES[st];
  const rtp = R.returnToPlayer(st);
  if (Math.abs(rtp - 0.95) > 1e-9) ok = false;
  const radii = R.ringRadii(st);
  console.log(`${label}: ${rings.map((r, i) => `×${r.mult} ${(r.p * 100).toFixed(1)} % (r=${radii[i].toFixed(3)})`).join(' | ')} | daneben ${(R.missChance(st) * 100).toFixed(1)} %  → exact ${(rtp * 100).toFixed(4)} %`);
  const N = 2_000_000 / 3;
  let paid = 0;
  for (let i = 0; i < N; i++) paid += R.multFor(st, R.drawHit(st));
  console.log(`   simulated ${Math.round(N).toLocaleString('en')} throws: ${((paid / N) * 100).toFixed(2)} %`);
}
console.log(ok ? 'OK: every style returns exactly 95 %' : 'FAIL');

// Eulenauge (odds item): the bull takes 0.15 ÷ (bull multiplier) of the miss chance → exactly
// 110 % in every style; then throws through eyeDrawHit (-2 = a bull only the eye made).
let okEye = true;
for (const st of R.STYLE_ORDER) {
  const rings = R.STYLES[st].rings;
  const extra = 0.15 / rings[0].mult;
  const exact = rings.reduce((s, r, i) => s + (r.p + (i === 0 ? extra : 0)) * r.mult, 0);
  const N = 2_000_000 / 3;
  let paid = 0, eye = 0;
  for (let i = 0; i < N; i++) {
    const h = R.eyeDrawHit(st);
    if (h === -2) eye++;
    paid += R.multFor(st, h === -2 ? 0 : h);
  }
  okEye &&= Math.abs(exact - R.EYE_RTP) < 1e-9 && Math.abs(R.eyeReturn(st) - R.EYE_RTP) < 1e-9 && R.missChance(st) >= extra && Math.abs(paid / N - exact) < 0.02;
  console.log(`Eulenauge ${R.STYLES[st].label}: Mitte ${(rings[0].p * 100).toFixed(2)} → ${((rings[0].p + extra) * 100).toFixed(2)} % · exact ${(exact * 100).toFixed(4)} % · simulated ${((paid / N) * 100).toFixed(2)} % (eye bulls ${((eye / N) * 100).toFixed(2)} %)`);
}
console.log(okEye ? 'OK: Eulenauge 110 % in every style' : 'FAIL: Eulenauge');
process.exit(ok && okEye ? 0 : 1);

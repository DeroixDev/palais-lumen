// Mondflug with the Mondschirm item: the exact payout share for a cash-out target c ≥ 1,10×
// is 0.96 + P(wind point < 1,10) = 0.96 + 1 − 0.96 / 1.10; checked against the constants in
// src/games/crash/rules.ts and with 4,000,000 simulated flights of the game's own
// drawWindPoint() for several targets (with and without the item). Run: node scripts/rtp-crash.mjs
import { loadTs } from './_load-ts.mjs';

const C = await loadTs('src/games/crash/rules.ts');
const pct = (x) => (x * 100).toFixed(3) + ' %';
let ok = Math.abs(C.SHIELD_RTP - (C.RTP + 1 - C.RTP / C.SHIELD_BELOW)) < 1e-12;
// Exact chance that the gust comes below 1,10×: drawWindPoint() < 1.10 ⇔ rand < 1 − 0.96/1.10.
const edge = 1 - C.RTP / C.SHIELD_BELOW;
ok &&= C.drawWindPoint(edge - 1e-9) < C.SHIELD_BELOW && C.drawWindPoint(edge + 1e-9) >= C.SHIELD_BELOW;
console.log(`Mondschirm fängt ${pct(C.SHIELD_CHANCE)} der Flüge (Windstoß unter ${C.SHIELD_BELOW}×) · exakt mit Schirm ${pct(C.SHIELD_RTP)}`);
const N = 4_000_000;
for (const c of [1.1, 1.5, 2, 5, 10]) {
  let plain = 0;
  let shield = 0;
  for (let i = 0; i < N; i++) {
    const w = C.drawWindPoint();
    const won = w > c ? c : 0;
    plain += won;
    shield += won || (C.shielded(w) ? 1 : 0);
  }
  // The item adds exactly SHIELD_CHANCE to whatever the target returns without it.
  console.log(`Einsammeln bei ${String(c).padEnd(4)}× · ohne Item ${pct(plain / N)} · mit Mondschirm ${pct(shield / N)} · Zuwachs ${pct((shield - plain) / N)}`);
  if (Math.abs((shield - plain) / N - C.SHIELD_CHANCE) > 0.002) ok = false;
}
console.log(ok ? 'OK' : 'FEHLER');
process.exit(ok ? 0 : 1);

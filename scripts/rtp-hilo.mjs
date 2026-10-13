// Checks the "Kartenleiter" (src/games/hilo/rules.ts) with the game's own rules code:
// 1. exact: the first call returns 95 % for every start card and every call;
// 2. exact (dynamic programming over card × rung): whole rounds return 95 % for several ways
//    of playing (random calls, always the likelier side, always the long shot) and every
//    cash-out rung 1–12 — the ladder pays fairly after the first rung, so stopping never matters;
// 3. 2,000,000 simulated rounds (likelier side, random cash-out, with the 10,000× cap).
// Run: node scripts/rtp-hilo.mjs [rounds]
import { loadTs } from './_load-ts.mjs';

const { RTP, RUNGS, MAX_MULT, chance, wins, nextMult } = await loadTs('src/games/hilo/rules.ts');
const N = Number(process.argv[2] ?? 2_000_000);
const CALLS = ['higher', 'lower', 'same'];
const possible = (r) => CALLS.filter((c) => chance(r, c) > 0);
let ok = true;

// 1. First call, exact.
let worst = 1, best = 0;
for (let r = 1; r <= 13; r++)
  for (const call of possible(r)) {
    const ev = chance(r, call) * nextMult(1, 0, r, call);
    worst = Math.min(worst, ev);
    best = Math.max(best, ev);
  }
console.log(`1) Erste Sprosse exakt: ${(worst * 100).toFixed(6)} % … ${(best * 100).toFixed(6)} %`);
ok &&= Math.abs(worst - RTP) < 1e-12 && Math.abs(best - RTP) < 1e-12;

// 2. Whole rounds, exact. A policy gives each call a weight for (card, rung).
const policies = {
  'zufällige Tipps': (r) => Object.fromEntries(possible(r).map((c, _, a) => [c, 1 / a.length])),
  'immer die wahrscheinlichere Seite': (r) => ({ [chance(r, 'higher') >= chance(r, 'lower') ? 'higher' : 'lower']: 1 }),
  'immer die unwahrscheinlichere Seite': (r) => ({ [chance(r, 'higher') > 0 && (chance(r, 'higher') < chance(r, 'lower') || chance(r, 'lower') === 0) ? 'higher' : 'lower']: 1 }),
  'immer Gleich': () => ({ same: 1 }),
};
for (const [name, pol] of Object.entries(policies)) {
  let lo = Infinity, hi = -Infinity;
  for (let stopAt = 1; stopAt <= RUNGS; stopAt++) {
    // V(card, rung) = expected final multiplier per unit of the current multiplier.
    const memo = new Map();
    const V = (r, rung) => {
      if (rung >= stopAt) return 1;
      const key = r * 100 + rung;
      if (memo.has(key)) return memo.get(key);
      let v = 0;
      for (const [call, w] of Object.entries(pol(r, rung))) {
        const f = nextMult(1, rung, r, call);
        for (let n = 1; n <= 13; n++) if (wins(r, n, call)) v += (w / 13) * f * V(n, rung + 1);
      }
      memo.set(key, v);
      return v;
    };
    let rtp = 0;
    for (let r = 1; r <= 13; r++) rtp += V(r, 0) / 13;
    lo = Math.min(lo, rtp);
    hi = Math.max(hi, rtp);
  }
  console.log(`2) ${name}, Auszahlen nach 1–${RUNGS} Sprossen, exakt: ${(lo * 100).toFixed(6)} % … ${(hi * 100).toFixed(6)} %`);
  ok &&= Math.abs(lo - RTP) < 1e-9 && Math.abs(hi - RTP) < 1e-9;
}

// 3. Simulation with the cap: the likelier side, random cash-out rung (long shots are covered exactly in 2).
const draw = () => 1 + Math.floor(Math.random() * 13);
let back = 0, sq = 0;
for (let i = 0; i < N; i++) {
  const stopAt = 1 + Math.floor(Math.random() * RUNGS);
  let card = draw(), mult = 1, rung = 0, paid = 0;
  for (;;) {
    if (rung >= stopAt) { paid = mult; break; }
    const call = chance(card, 'higher') >= chance(card, 'lower') ? 'higher' : 'lower';
    const next = draw();
    if (!wins(card, next, call)) break;
    mult = nextMult(mult, rung, card, call);
    rung++;
    card = next;
    if (rung >= RUNGS || mult >= MAX_MULT) { paid = mult; break; }
  }
  back += paid;
  sq += paid * paid;
}
const mean = back / N;
const se = Math.sqrt((sq / N - mean * mean) / N);
console.log(`3) ${N} Runden simuliert (mit ${MAX_MULT}×-Deckel): RTP ${(mean * 100).toFixed(2)} % ± ${(se * 196).toFixed(2)} % (95 %-Intervall)`);
ok &&= Math.abs(mean - RTP) < Math.max(0.01, 3 * se);
console.log(ok ? 'OK: 95 % bei jeder Spielweise' : 'FAIL');
if (!ok) process.exitCode = 1;

// 4. Mondspiegel (odds item): the mirror rules out two ranks before the first call. Exact: every
// next card × every pair of other ranks (the real conditional), best call per start card and
// mirror; later rungs stay fair (part 2), so the round returns the first call's return.
// Then simulated with mirrorRanks/mirrorNext and the best call.
{
  const H = await loadTs('src/games/hilo/rules.ts');
  let exact = 0, n = 0;
  for (let r = 1; r <= 13; r++) {
    // Joint over (next, pair not containing next): P(next) = 1/13, pair uniform of C(12,2).
    const byPair = new Map();
    for (let nx = 2; nx <= 14; nx++)
      for (let a = 2; a <= 14; a++)
        for (let b = a + 1; b <= 14; b++) {
          if (a === nx || b === nx) continue;
          const k = `${a},${b}`;
          if (!byPair.has(k)) byPair.set(k, { w: 0, next: [] });
          const e = byPair.get(k);
          e.w += 1 / 13 / 66;
          e.next.push(nx);
        }
    for (const [k, e] of byPair) {
      const hidden = k.split(',').map(Number);
      let best = 0;
      for (const c of CALLS) {
        const p = chance(r, c);
        if (p <= 0) continue;
        const w = e.next.filter((nx) => wins(r, H.cardRank(nx), c)).length / e.next.length;
        best = Math.max(best, (w * RTP) / p);
        if (Math.abs(w - H.mirrorChance(r, c, hidden)) > 1e-12) ok = false;
      }
      exact += (e.w * best) / 13;
      n++;
    }
  }
  const M = 2_000_000;
  let back = 0;
  for (let i = 0; i < M; i++) {
    const r = 1 + Math.floor(Math.random() * 13);
    const hidden = H.mirrorRanks();
    const call = H.mirrorBest(r, hidden);
    const nx = H.cardRank(H.mirrorNext(hidden));
    if (wins(r, nx, call)) back += nextMult(1, 0, r, call);
  }
  const okM = Math.abs(exact - H.MIRROR_BEST_RTP) < 1e-9 && exact >= 1 && exact <= 1.25;
  console.log(`4) Mondspiegel, beste erste Wahl: exakt ${(exact * 100).toFixed(4)} % (rules.ts ${(H.MIRROR_BEST_RTP * 100).toFixed(4)} %) · simuliert ${((back / M) * 100).toFixed(2)} %`);
  console.log(okM && ok ? 'OK: Mondspiegel' : 'FAIL: Mondspiegel');
  if (!okM || !ok) process.exitCode = 1;
}

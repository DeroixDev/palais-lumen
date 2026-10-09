// Loss share L = E[max(0, 1 − payout/stake)] of every game, for the honest payout share with
// economy items (src/core/lossShare.ts). Computed from the games' own rules code: exact sums
// where the game allows it, a seeded simulation for blackjack. Then it checks the table in
// src/core/lossShare.ts and the item formulas against a direct simulation of the item rules.
// Run: node scripts/rtp-items.mjs
import { readFileSync } from 'node:fs';
import { loadTs } from './_load-ts.mjs';

const T = await loadTs('src/core/lossShare.ts');
const out = {};
const add = (game, rtp, L, how) => (out[game] = { rtp, L, how });
const lossOf = (x) => Math.max(0, 1 - x);

// Slots: all 6^9 grids, same counting as scripts/slots-rtp.mjs.
{
  const src = readFileSync(new URL('../src/games/slots/slots.ts', import.meta.url), 'utf8');
  const obj = (name) => JSON.parse(src.match(new RegExp(`${name}: Record<SymbolId, number> = (\\{[^}]*\\})`))[1].replace(/(\w+):/g, '"$1":'));
  const WEIGHTS = obj('WEIGHTS');
  const PAY = obj('PAY');
  const COMBO = JSON.parse(src.match(/COMBO = (\[[^\]]*\])/)[1]);
  const S = ['firefly', 'candle', 'lantern', 'key', 'moon', 'moth'];
  const total = S.reduce((s, k) => s + WEIGHTS[k], 0);
  const P = S.map((k) => WEIGHTS[k] / total);
  const pay = S.map((k) => PAY[k]);
  const LINES = [[0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 4, 8], [2, 4, 6]];
  const lineSym = new Int8Array(216);
  for (let i = 0; i < 216; i++) {
    const plain = [(i / 36) | 0, ((i / 6) | 0) % 6, i % 6].filter((x) => x !== 5);
    lineSym[i] = plain.length === 0 ? 5 : plain.every((x) => x === plain[0]) ? plain[0] : -1;
  }
  let rtp = 0, L = 0;
  const g = new Int8Array(9);
  for (let i = 0; i < 6 ** 9; i++) {
    let x = i, p = 1;
    for (let k = 0; k < 9; k++) {
      g[k] = x % 6;
      x = (x / 6) | 0;
      p *= P[g[k]];
    }
    let n = 0, sum = 0;
    for (const [a, b, c] of LINES) {
      const s = lineSym[g[a] * 36 + g[b] * 6 + g[c]];
      if (s >= 0) { n++; sum += pay[s]; }
    }
    const X = n ? sum * COMBO[n] : 0;
    rtp += p * X;
    L += p * lossOf(X);
  }
  add('slots', rtp, L);
}

{
  const R = await loadTs('src/games/shells/rules.ts');
  add('shells', R.PAY / 3, 2 / 3);
}
add('roulette', 36 / 37, 19 / 37); // red: 18 of 37 pockets pay 2×, the rest (zero too) lose
{
  const R = await loadTs('src/games/plinko/rules.ts');
  const binom = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
  let L = 0;
  R.TABLE.mid.forEach((m, k) => (L += (binom(R.ROWS, k) / 2 ** R.ROWS) * lossOf(m)));
  add('plinko', R.returnToPlayer('mid'), L);
}
add('crash', 0.96, 1 - 0.96 / 2); // P(flight reaches 2×) = 0,96 / 2
{
  const B = await loadTs('src/games/bingo/rules.ts');
  const mode = B.MODES[3];
  const { byLines, full } = B.outcomeChances(mode);
  let L = full * lossOf(mode.fullPay);
  byLines.forEach((p, n) => (L += p * lossOf(B.bingoMultiplier(mode, n, false))));
  add('bingo', B.returnToPlayer(mode), L);
}
{
  const { RULES, playRound } = await loadTs('src/games/blackjack/rules.ts');
  const { Shoe } = await loadTs('src/games/cards/cards.ts');
  let s = 0x2545f491;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shoe = new Shoe(RULES.decks, 0.25, rand);
  let staked = 0, back = 0, lost = 0;
  for (let i = 0; i < 3_000_000; i++) {
    shoe.checkCut();
    const r = playRound(() => shoe.draw(), RULES);
    staked += r.staked;
    back += r.back;
    lost += Math.max(0, r.staked - r.back);
  }
  // The game reports the whole round (doubles and splits included) as one stake.
  add('blackjack', back / staked, lost / staked, 'sim');
}
{
  const R = await loadTs('src/games/baccarat/rules.ts');
  add('baccarat', R.RTP.banker, R.ODDS.player); // banker bet: a tie is a push
}
{
  const R = await loadTs('src/games/hilo/rules.ts');
  let win = 0;
  for (let rank = 1; rank <= 13; rank++) win += Math.max(R.chance(rank, 'higher'), R.chance(rank, 'lower')) / 13;
  add('hilo', R.RTP, 1 - win);
}
{
  const R = await loadTs('src/games/craps/rules.ts');
  const W = R.WAYS;
  let win = (W[7] + W[11]) / 36;
  for (const p of R.POINTS) win += (W[p] / 36) * (W[p] / (W[p] + 6));
  add('craps', R.LINE_RTP, 1 - win);
}
{
  const R = await loadTs('src/games/wheel/rules.ts');
  let rtp = 0, L = 0;
  for (const s of R.WHEEL) {
    if (s === 'bonus') for (const b of R.BONUS_WHEEL) {
      const X = b === 'x2' ? R.BONUS_PAY.x2 + 1 : 0;
      rtp += X / R.SEGMENTS / R.BONUS_WHEEL.length;
      L += lossOf(X) / R.SEGMENTS / R.BONUS_WHEEL.length;
    }
    else {
      const X = s === 'x2' ? R.PAY.x2 + 1 : 0;
      rtp += X / R.SEGMENTS;
      L += lossOf(X) / R.SEGMENTS;
    }
  }
  add('wheel', rtp, L);
}
{
  const K = await loadTs('src/games/keno/rules.ts');
  let L = 0;
  for (let k = 0; k <= 5; k++) L += K.hitChance(5, k) * lossOf(K.kenoMultiplier(5, k));
  add('keno', K.returnToPlayer(5), L);
}
{
  const S = await loadTs('src/games/scratch/rules.ts');
  const d = S.DESIGNS[0];
  let L = 1 - d.weight.reduce((a, b) => a + b, 0) / S.TICKETS;
  d.mult.forEach((m, i) => (L += (d.weight[i] / S.TICKETS) * lossOf(m)));
  add('scratch', S.returnToPlayer(d), L);
}
{
  const R = await loadTs('src/games/derby/rules.ts');
  // Any duck with equal chance, win or place with equal chance; odds are never below 1,05.
  let hit = 0, rtp = 0, n = 0;
  for (const form of R.FORMS) {
    const card = R.makeCard(form);
    for (let i = 0; i < form.length; i++) {
      hit += card.p[i] + card.top2[i];
      rtp += R.betRtp(card, i, 'win') + R.betRtp(card, i, 'place');
      n += 2;
    }
  }
  add('derby', rtp / n, 1 - hit / n);
}
{
  const R = await loadTs('src/games/ice/rules.ts');
  const p = Math.pow(1 - R.LEVELS.mid.q, 2);
  add('ice', R.RTP, 1 - p);
}
{
  const R = await loadTs('src/games/target/rules.ts');
  let L = R.missChance('normal');
  for (const r of R.STYLES.normal.rings) L += r.p * lossOf(r.mult);
  add('target', R.returnToPlayer('normal'), L);
}
add('coin', 0.95, 0.5);
{
  const R = await loadTs('src/games/mines/rules.ts');
  add('mines', R.MINES_RTP, 1 - R.surviveChance(3, 3));
}
{
  const R = await loadTs('src/games/tower/rules.ts');
  add('tower', R.TOWER_RTP, 1 - Math.pow(R.safeChance('mid'), 2));
}
// Video poker with optimal holds: L is the chance of ending with no paying hand ("none" in
// the hand table of scripts/rtp-poker.mjs; every paying hand returns at least the stake).
add('poker', 0.961472, 0.5450323);
{
  const R = await loadTs('src/games/queen/rules.ts');
  add('queen', R.QUEEN_RTP, 1 - R.hitChance(R.ATTACKS[0]));
}

let ok = true;
const pct = (x) => (x * 100).toFixed(5).padStart(10) + ' %';
console.log('game         RTP           L            table L      ');
for (const [game, v] of Object.entries(out)) {
  const t = T.LOSS_SHARE[game];
  const tol = v.how === 'sim' ? 0.002 : 5e-7;
  const good = t && Math.abs(t.L - v.L) <= tol && Math.abs(t.rtp - v.rtp) <= Math.max(tol, 5e-7);
  if (!good) ok = false;
  console.log(`${game.padEnd(10)} ${pct(v.rtp)} ${pct(v.L)} ${t ? pct(t.L) : '   missing'}  ${good ? '' : '<-- MISMATCH'}`);
}
for (const g of Object.keys(T.LOSS_SHARE)) if (!out[g]) { ok = false; console.log(`${g}: in the table but not computed`); }

// The item formulas, checked against a direct simulation of the item rules on a toy game
// with partial returns (X = 0, 0,5, 1, 3 with chances 0,4 / 0,2 / 0,2 / 0,2 → RTP 0,9, L 0,5).
{
  const outcomes = [[0, 0.4], [0.5, 0.2], [1, 0.2], [3, 0.2]];
  const rtp = outcomes.reduce((s, [x, p]) => s + x * p, 0);
  const L = outcomes.reduce((s, [x, p]) => s + lossOf(x) * p, 0);
  const cases = [
    ['Versicherung 25 %', (x) => x + 0.25 * lossOf(x), rtp + 0.25 * L],
    ['Drink +50 % Gewinn', (x) => x + 0.5 * Math.max(0, x - 1), rtp + 0.5 * (rtp - 1 + L)],
    ['Heilige Motte', (x) => Math.max(1, x), rtp + L],
    ['Goldjeton', (x) => x + 1, rtp + 1],
  ];
  for (const [name, f, formula] of cases) {
    const direct = outcomes.reduce((s, [x, p]) => s + f(x) * p, 0);
    const good = Math.abs(direct - formula) < 1e-12;
    ok &&= good;
    console.log(`${name.padEnd(20)} direkt ${pct(direct)} · Formel ${pct(formula)} ${good ? 'OK' : 'FEHLER'}`);
  }
}
console.log(ok ? 'OK: every loss share matches src/core/lossShare.ts' : 'FAIL');
process.exit(ok ? 0 : 1);

// Checks the day goal, stakes and season reset. Run: npx esbuild scripts/money-check.ts --bundle --platform=node --outfile=/tmp/mc.cjs && node /tmp/mc.cjs
import { GameState, newSave, quotaFor, stakeUnitFor, roundNice, BOSS_DAY } from '../src/core/state';
import * as mb from '../src/core/miniboss';
import * as ev from '../src/core/events';
import { installPerks } from '../src/core/perks';
import { migrate } from '../src/core/save';
import * as it from '../src/core/itemsCore';
import { LOSS_SHARE } from '../src/core/lossShare';
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };
const s = new GameState(newSave());
ok(s.balance === 1000 && s.data.evening.startBalance === 1000, 'day 1 starts with 1000');
ok(s.data.evening.quota === 250 && s.goalBalance === 1250, 'day 1 goal 1250');
ok(s.stakes([10, 20, 50, 100, 250]).join() === '10,20,50,100,250', 'day 1 stakes unchanged');
s.placeBet(100); s.payout(349); // 1249
ok(!s.goalReached && s.goalMissing === 1, '1249 is one short');
s.placeBet(10); s.payout(11); // 1250
ok(s.goalReached && s.goalMissing === 0, '1250 reaches the goal exactly');
// Alex's example: day 2 entered with 3000.
s.placeBet(10); s.payout(1760); // 3000
const r = s.endEvening();
ok(r.passed && r.medal === 'diamond', `day 1 passed, medal ${r.medal} (profit ${r.profit})`);
ok(s.data.evening.number === 2 && s.data.evening.startBalance === 3000, 'day 2 starts with 3000');
ok(s.stakeUnit === 30, `stake unit ${s.stakeUnit}`);
console.log('day 2 slot ladders', s.stakes([10, 20, 50, 100]), s.stakes([50, 100, 250, 500]), 'quota', s.data.evening.quota, 'goal', s.goalBalance);
// Miss by one: season ends, back to 1000.
s.placeBet(1); 
const missing = s.goalMissing; s.payout(missing - 1 + 1 - 1); // one short
const r2 = s.endEvening();
ok(!r2.passed && s.balance === 1000 && s.data.evening.number === 1 && s.data.evening.startBalance === 1000, 'one Falter short ends season, back to 1000 on day 1');
// Curve if every day ends exactly at the goal.
let b = 1000; const rows: string[] = [];
for (let d = 1; d <= BOSS_DAY; d++) { const q = quotaFor(d, b); rows.push(`T${d}: start ${b} unit ${stakeUnitFor(b)} ziel +${q}`); b += q; }
console.log(rows.join('\n'));

// Glückspfennig: the first loss of a day is refunded once, and a reload mid-day must not refund it again.
{
  const g = new GameState(newSave());
  installPerks(g, () => {});
  g.data.perks = ['pfennig'];
  const lose = (st: GameState, stake: number) => { st.placeBet(stake); st.report({ game: 'test', stake, win: 0, rtp: 0.97, tags: [] }); };
  lose(g, 100);
  ok(g.balance === 950, `first loss refunded by half (${g.balance})`);
  lose(g, 100);
  ok(g.balance === 850, 'second loss not refunded');
  // Reload: a fresh state from the saved JSON, perks installed again.
  const r = new GameState(migrate(JSON.parse(JSON.stringify(g.data)))!);
  installPerks(r, () => {});
  lose(r, 100);
  ok(r.balance === 750, `no second refund after a reload (${r.balance})`);
  r.data.evening = { number: 2, startBalance: r.balance, quota: 0 };
  r.beginDay();
  const before = r.balance;
  lose(r, 100);
  ok(r.balance === before - 50, 'refunded again on the next day');
}

// Goal charms bought mid-day lower today's goal at once, and a goal never rises mid-day.
{
  const g = new GameState(newSave());
  g.data.moonstones = 100;
  const q0 = g.data.evening.quota;
  g.buyCharm('rabatt');
  ok(g.data.evening.quota < q0, `Rabattmarke lowers today's goal (${q0} -> ${g.data.evening.quota})`);
  const q1 = g.data.evening.quota;
  g.quotaFactors.push(() => 2);
  ok(!g.lowerQuota() && g.data.evening.quota === q1, 'a higher factor mid-day does not raise the goal');
}

// Economy items (src/core/itemsCore.ts): money paid around a round, stones for wins and the surplus.
{
  let dice = 0.99; // > every chance: reels miss, rounding never adds the extra Falter
  it.setItemRandom(() => dice);
  const g = new GameState(newSave());
  it.installItems(g);
  const round = (stake: number, win: number, game = 'roulette', rtp = 36 / 37) => {
    g.placeBet(stake);
    if (win) g.payout(win);
    g.report({ game, stake, win, rtp, tags: [] });
  };
  const use = (id: string) => {
    g.data.bag[id] = (g.data.bag[id] ?? 0) + 1;
    return it.useBagItem(g, id);
  };
  // Versicherung: a quarter of every loss comes back, all day.
  use('versicherung');
  let b0 = g.balance;
  round(100, 0);
  ok(g.balance === b0 - 85, `Versicherung: loss of 100 costs 85 (${b0 - g.balance})`);
  ok(g.data.history[g.data.history.length - 1] === g.balance, 'day curve ends at the balance after the refund');
  const shown = it.itemRtp(g, 'roulette', 36 / 37)!;
  ok(Math.abs(shown.rtp - (36 / 37 + it.ITEM_K.versicherung * LOSS_SHARE.roulette.L)) < 1e-12 && shown.approx, `Versicherung on roulette: ${it.itemRtpLabel(shown)}`);
  // Mondschein-Drink: +50 % profit for 5 rounds (stacks with nothing else on a win).
  use('drink');
  b0 = g.balance;
  round(100, 200);
  ok(g.balance === b0 + 150, `Drink: red win of 100 pays 150 (${g.balance - b0})`);
  for (let i = 0; i < 4; i++) round(10, 0);
  ok(!g.data.active.some((a) => a.id === 'drink'), 'Drink used up after 5 rounds');
  // Goldjeton: the stake of the next round is on the house (up to 10 stake units).
  use('goldjeton');
  b0 = g.balance;
  round(50, 0);
  ok(g.balance === b0, `Goldjeton: a lost stake of 50 comes back, no insurance on it (${g.balance - b0})`);
  ok(!g.data.active.some((a) => a.id === 'goldjeton'), 'Goldjeton used up after one round');
  // Heilige Motte: no loss (Versicherung is then not needed).
  use('statue');
  b0 = g.balance;
  round(100, 0);
  ok(g.balance === b0, `Heilige Motte: no loss (${g.balance - b0})`);
  const st = it.itemRtp(g, 'slots', LOSS_SHARE.slots.rtp)!;
  ok(Math.abs(st.rtp - (LOSS_SHARE.slots.rtp + LOSS_SHARE.slots.L)) < 1e-12 && !st.approx, `Heilige Motte on slots: ${it.itemRtpLabel(st)} (exact)`);
  g.data.active = g.data.active.filter((a) => a.id !== 'statue');
  // Engelsrolle: offered after a loss; a hit refunds the net loss (after the insurance).
  g.data.bag.engel = 1;
  b0 = g.balance;
  round(100, 0); // -75 with the insurance
  ok(it.pendingOffer()?.kind === 'loss' && it.pendingOffer()!.amount === 85, `Engel offered for a net loss of ${it.pendingOffer()?.amount}`);
  dice = 0.1;
  const e = it.useBagItem(g, 'engel');
  ok(e.hit === true && g.balance === b0, `Engel hit: loss refunded (${g.balance - b0})`);
  // Teufelsrolle: lose (dice high) takes the profit back, win (dice low) triples it.
  g.data.bag.teufel = 2;
  dice = 0.99;
  b0 = g.balance;
  round(100, 300);
  const rounds = g.data.stats.rounds;
  it.useBagItem(g, 'teufel');
  ok(g.balance === b0, `Teufel lost: profit gone (${g.balance - b0})`);
  ok(g.data.stats.rounds === rounds, 'Teufel is not counted as a game round');
  round(100, 300);
  dice = 0.1;
  it.useBagItem(g, 'teufel');
  ok(g.balance === b0 + 600, `Teufel won: profit 200 tripled to 600 (${g.balance - b0})`);
  // Zeitmaschine: the last losing round of the day is undone, even after other rounds.
  dice = 0.99;
  round(200, 0); // -170 with the insurance
  round(10, 20);
  b0 = g.balance;
  g.data.bag.zeitmaschine = 1;
  it.useBagItem(g, 'zeitmaschine');
  ok(g.balance === b0 + 170, `Zeitmaschine: last loss of 170 undone (${g.balance - b0})`);
  // Money flow: wagered - paid back equals the money lost, items included.
  const s0 = g.data.stats;
  ok(1000 - s0.wagered + s0.won === g.balance, `stats match the balance (${1000 - s0.wagered + s0.won} vs ${g.balance})`);
  // Stones for won rounds: 2× → 1, 10× → 3, 50× → 10; small ones capped per day.
  const m0 = g.data.moonstones;
  round(10, 20);
  round(10, 100, 'slots', 0.95);
  round(10, 500, 'slots', 0.95);
  ok(g.data.moonstones - m0 === 14, `round stones 1 + 3 + 10 (${g.data.moonstones - m0})`);
  const m1 = g.data.moonstones;
  for (let i = 0; i < 40; i++) round(10, 20);
  ok(g.data.counters['it:smallStones'] === it.SMALL_STONE_CAP, `small-win stones capped at ${it.SMALL_STONE_CAP} a day (${g.data.moonstones - m1} more)`);
  // Surplus at the settlement: 1 per 10 % of the goal above it, at most 20.
  ok(it.surplusStones(250, 250) === 0 && it.surplusStones(500, 250) === 10 && it.surplusStones(5000, 250) === 20 && it.surplusStones(200, 250) === 0, 'surplus stones 0 / 10 / 20 / missed 0');
  g.data.balance = g.goalBalance + g.data.evening.quota; // 200 % of the goal: gold
  const stones = g.data.moonstones;
  const res = g.endEvening();
  ok(res.medal === 'gold' && it.lastSettlement()?.surplus === 10 && res.moonstones === 3 + 10, `settlement: gold 3 + surplus 10 = ${res.moonstones}`);
  ok(g.data.moonstones - stones === res.moonstones, 'settlement stones paid once');
  ok(!g.data.active.some((a) => a.left === -1), 'day items end with the day');
  // Dietrich: the ladder of its game moves up; other games keep theirs.
  it.setCurrentGame('slots');
  const before = g.stakes([10, 20, 50, 100]);
  use('dietrich');
  const after = g.stakes([10, 20, 50, 100]);
  ok(after.length === before.length && after[0] === before[1] && after[after.length - 1] === before[before.length - 1] * 2, `Dietrich ladder ${before} -> ${after}`);
  it.setCurrentGame('roulette');
  ok(g.stakes([10, 20, 50, 100]).join() === before.join(), 'Dietrich only at its game');
  it.setCurrentGame(null);
  // Long run: Versicherung on a fair-ish coin game pays what itemRtp says.
  {
    const h = new GameState(newSave());
    it.installItems(h);
    it.setItemRandom(Math.random);
    h.data.balance = 1e9;
    h.data.bag.versicherung = 1;
    it.useBagItem(h, 'versicherung');
    const N = 200000;
    let staked = 0;
    const start = h.balance;
    for (let i = 0; i < N; i++) {
      h.placeBet(100);
      const win = Math.random() < 0.5 ? 190 : 0; // 95 %, L = 0.5
      if (win) h.payout(win);
      h.report({ game: 'coin', stake: 100, win, rtp: 0.95, tags: [] });
      staked += 100;
    }
    const got = (h.balance - start + staked) / staked;
    ok(Math.abs(got - (0.95 + it.ITEM_K.versicherung * 0.5)) < 0.006, `simulated coin with Versicherung ${(got * 100).toFixed(2)} % (formula ${((0.95 + it.ITEM_K.versicherung * 0.5) * 100).toFixed(2)} %)`);
  }
}

// ---- Mini bosses (src/core/miniboss.ts): economy only, rewards once per win -------------------
{
  const m = new GameState(newSave());
  mb.installMiniboss(m);
  ev.installEvents(m, () => undefined);
  const jump = (day: number) => {
    m.data.evening = { number: day, startBalance: m.data.balance, quota: 0 };
    m.beginDay();
  };
  jump(2);
  m.data.event = ''; // a rolled event may change stakes; check without it
  ok(!mb.minibossFor(m.data) && m.stakeUnit === 10, 'day 2: no mini boss, normal stakes');
  jump(3);
  ok(mb.minibossFor(m.data)?.id === 'samtgraefin' && m.data.event === '', 'day 3: Samtgräfin, no event');
  ok(m.stakeUnit === 20 && m.data.evening.quota === roundNice(quotaFor(3, 1000) * 1.1), `day 3: stakes x2 (${m.stakeUnit}), goal +10 % (${m.data.evening.quota})`);
  const stones = m.data.moonstones;
  m.data.balance = m.goalBalance;
  const r = m.endEvening();
  ok(r.passed && m.data.minibosses.includes('samtgraefin') && m.data.minibosses.includes('s1:samtgraefin'), 'beating day 3 records the Samtgräfin');
  ok(m.data.trophies.filter((t) => t.kind === 'mb1').length === 1 && m.data.moonstones - stones === r.moonstones && r.moonstones >= 1 + 3, `reward: ${r.moonstones} Mondsteine and one trophy`);
  m.data.event = '';
  ok(m.data.evening.number === 4 && m.stakeUnit === stakeUnitFor(m.data.balance), 'day 4: rule gone');
  // Beaten again (debug jump back): Mondsteine again, no second trophy.
  jump(3);
  m.data.balance = m.goalBalance;
  m.endEvening();
  ok(m.data.trophies.filter((t) => t.kind === 'mb1').length === 1, 'second win: no second trophy');
  jump(9);
  const d = m.data;
  for (let i = 0; i < mb.CLOCK_ROUNDS - 1; i++) m.report({ game: 'coin', stake: 10, win: 0, rtp: 0.95, tags: [] });
  ok(!ev.isClosed(d, 'coin') && mb.roundsLeft(d) === 1, 'Uhrmacher: one round left');
  m.report({ game: 'coin', stake: 10, win: 0, rtp: 0.95, tags: [] });
  ok(ev.isClosed(d, 'coin') && ev.isClosed(d, 'slots'), 'Uhrmacher: clock stopped, games closed');
  jump(12);
  const units: number[] = [];
  for (let i = 0; i < 12; i++) {
    units.push(m.stakeUnit);
    m.report({ game: 'coin', stake: 10, win: 0, rtp: 0.95, tags: [] });
  }
  const u = stakeUnitFor(m.data.evening.startBalance);
  ok(units.join() === [1, 1, 1, 2, 2, 2, 1, 1, 1, 3, 3, 3].map((k) => stakeUnitFor(m.data.evening.startBalance * k)).join() && units[0] === u, `DJ beat: ${units.join(',')}`);
  m.data.balance = 0;
  const lost = m.endEvening();
  ok(!lost.passed && !m.data.minibosses.includes('falterbeat') && m.data.evening.number === 1, 'losing to the DJ is a missed day');
}

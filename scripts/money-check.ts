// Checks the day goal, stakes and season reset. Run: npx esbuild scripts/money-check.ts --bundle --platform=node --outfile=/tmp/mc.cjs && node /tmp/mc.cjs
import { GameState, newSave, quotaFor, stakeUnitFor, BOSS_DAY } from '../src/core/state';
import { installPerks } from '../src/core/perks';
import { migrate } from '../src/core/save';
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

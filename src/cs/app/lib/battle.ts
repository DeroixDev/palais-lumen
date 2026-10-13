// Case battles: the data model and the rules. Plain serializable objects, so a later network layer
// can carry a Battle between friends (the host rolls, the guests only replay the rounds).

import type { ItemInstance } from '../../contract';
import { CASES } from './assets';
import { casePrice, itemValue, rollCase } from './economy';
import { randomBots, type Player } from './bots';
import { getCase, level } from './career';
import * as M from './mods';
import { save } from './state';
import { uid } from './util';

export type BattleMode = '1v1' | '1v1v1' | '1v1v1v1' | '2v2';
export const MODES: { id: BattleMode; label: string; seats: number; teams: number[] }[] = [
  { id: '1v1', label: '1 gegen 1', seats: 2, teams: [0, 1] },
  { id: '1v1v1', label: '1 gegen 1 gegen 1', seats: 3, teams: [0, 1, 2] },
  { id: '1v1v1v1', label: 'Jeder gegen jeden (4)', seats: 4, teams: [0, 1, 2, 3] },
  { id: '2v2', label: '2 gegen 2', seats: 4, teams: [0, 0, 1, 1] },
];
export const modeOf = (m: BattleMode) => MODES.find((x) => x.id === m)!;

export interface BattleSeat extends Player { team: number }
export interface BattlePull { seat: number; item: ItemInstance; value: number }
export interface Battle {
  id: string;
  mode: BattleMode;
  cases: string[];               // one case id per round
  seats: (BattleSeat | null)[];  // null = open seat
  host: string;                  // player id who created it
  createdAt: number;
  status: 'waiting' | 'running' | 'done';
  rounds: BattlePull[][];        // filled by the host when the battle runs
  winnerTeam?: number;
  /** What each player of the winning team takes (item uids by seat). */
  payout?: Record<number, string[]>;
}

export const YOU_ID = 'you';
export const battleCost = (b: Pick<Battle, 'cases'>) => b.cases.reduce((a, id) => a + (getCase(id) ? casePrice(getCase(id)!) : 0), 0);

const store = new Map<string, Battle>();
export const getBattle = (id: string) => store.get(id);
export const putBattle = (b: Battle) => { store.set(b.id, b); return b; };

export function youSeat(team: number): BattleSeat {
  return { id: YOU_ID, name: save.name, kind: 'you', avatar: save.avatar, team };
}

export function newBattle(mode: BattleMode, cases: string[], host: Player | null): Battle {
  const m = modeOf(mode);
  const seats: (BattleSeat | null)[] = Array.from({ length: m.seats }, () => null);
  if (host) seats[0] = { ...host, team: m.teams[0] };
  return { id: uid(), mode, cases, seats, host: host?.id ?? '', createdAt: Date.now(), status: 'waiting', rounds: [] };
}

/** Fills empty seats with bots. */
export function fillBots(b: Battle) {
  const m = modeOf(b.mode);
  const taken = b.seats.filter(Boolean).map((s) => s!.id);
  const bots = randomBots(b.seats.filter((s) => !s).length, taken);
  b.seats = b.seats.map((s, i) => s ?? { ...bots.shift()!, team: m.teams[i] });
}
export function seatYou(b: Battle, seat: number): boolean {
  if (b.seats[seat] || b.seats.some((s) => s?.id === YOU_ID)) return false;
  b.seats[seat] = youSeat(modeOf(b.mode).teams[seat]);
  return true;
}

/** Host side: rolls every round for every seat. */
export function rollBattle(b: Battle) {
  b.rounds = b.cases.map((cid) => {
    const c = getCase(cid)!;
    return b.seats.map((s, seat) => {
      const who = s?.kind === 'you' ? 'you' : s?.name ?? '-';
      const item = rollCase(c, M.luckMult(who), `Battle: ${c.name}`, who);
      return { seat, item, value: itemValue(item) };
    });
  });
  M.rigBattle(b.rounds, modeOf(b.mode).teams, b.seats.findIndex((s) => s?.kind === 'you'));
  const totals = teamTotals(b);
  const best = Math.max(...totals.values());
  const leaders = M.rigLeaders([...totals.entries()].filter(([, v]) => v === best).map(([t]) => t), modeOf(b.mode).teams[b.seats.findIndex((s) => s?.kind === 'you')]);
  b.winnerTeam = leaders[Math.floor(Math.random() * leaders.length)];
  // The winning team shares all items: biggest first to whoever holds less so far.
  const m = modeOf(b.mode);
  const winners = b.seats.map((_, i) => i).filter((i) => m.teams[i] === b.winnerTeam);
  const all = b.rounds.flat().sort((x, y) => y.value - x.value);
  const sums = new Map(winners.map((w) => [w, 0]));
  const payout: Record<number, string[]> = {};
  winners.forEach((w) => (payout[w] = []));
  for (const p of all) {
    const to = winners.reduce((a, w) => (sums.get(w)! < sums.get(a)! ? w : a), winners[0]);
    payout[to].push(p.item.uid);
    sums.set(to, sums.get(to)! + p.value);
  }
  b.payout = payout;
}

export function seatTotals(b: Battle, upto = b.rounds.length): number[] {
  const t = b.seats.map(() => 0);
  b.rounds.slice(0, upto).forEach((r) => r.forEach((p) => (t[p.seat] += p.value)));
  return t;
}
export function teamTotals(b: Battle, upto = b.rounds.length): Map<number, number> {
  const m = modeOf(b.mode);
  const st = seatTotals(b, upto);
  const out = new Map<number, number>();
  st.forEach((v, i) => out.set(m.teams[i], (out.get(m.teams[i]) ?? 0) + v));
  return out;
}

// ---------- the lobby of open bot battles ----------

let lobby: Battle[] = [];
export function lobbyBattles(): Battle[] {
  lobby = lobby.filter((b) => b.status === 'waiting' && Date.now() - b.createdAt < 5 * 60_000 && !b.seats.some((s) => s?.kind === 'you'));
  while (lobby.length < 6) lobby.push(botLobby());
  return lobby;
}
export function refreshLobby() {
  if (lobby.length && Math.random() < 0.5) lobby.splice(Math.floor(Math.random() * lobby.length), 1);
  lobbyBattles();
}
function botLobby(): Battle {
  const lvl = level();
  const open = CASES.filter((c) => c.level <= lvl + 5).sort((a, b) => casePrice(a) - casePrice(b));
  const pool = open.slice(0, Math.max(3, Math.ceil(open.length * 0.7)));
  const mode = MODES[Math.floor(Math.random() * MODES.length)].id;
  const rounds = 1 + Math.floor(Math.random() * 4);
  const cases = Array.from({ length: rounds }, () => pool[Math.floor(Math.pow(Math.random(), 1.4) * pool.length)].id);
  const [host] = randomBots(1);
  const b = newBattle(mode, cases, host);
  // Some seats already taken by other bots.
  const m = modeOf(mode);
  const extra = randomBots(m.seats, [host.id]);
  for (let i = 1; i < m.seats - 1; i++) if (Math.random() < 0.5) b.seats[i] = { ...extra[i], team: m.teams[i] };
  b.createdAt = Date.now() - Math.floor(Math.random() * 60_000);
  return putBattle(b);
}

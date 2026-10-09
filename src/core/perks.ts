// Glücksbringer-Kette: after every passed day the player drafts one of three perks for the
// rest of the season (gone when it ends). Perks only touch the economy around the games
// (start money, goals, bonus Falter and Mondsteine), never the odds of a game.

import { BOSS_DAY, MOONSTONES_FOR, stakeUnitFor, type GameState, type Medal, type RoundReport, type SaveData } from './state';

export type Rarity = 'common' | 'rare' | 'legendary';

export interface Perk {
  id: string;
  name: string;
  /** Exactly what it does, one line. */
  desc: string;
  rarity: Rarity;
  /** How often it can be owned (1 = no stacking). */
  max: number;
  /** Colour of its medallion. */
  color: number;
}

export const PERKS: Perk[] = [
  { id: 'polster', name: 'Polster', desc: 'Zu Beginn jedes Tages +10 Mindesteinsätze Startgeld.', rarity: 'common', max: 3, color: 0x2f7a52 },
  { id: 'sparstrumpf', name: 'Sparstrumpf', desc: 'Zu Beginn jedes Tages +3 % Zinsen, höchstens 20 Mindesteinsätze.', rarity: 'common', max: 3, color: 0x7a2a4a },
  { id: 'leichtfuss', name: 'Leichter Schritt', desc: 'Tagesziele −8 %.', rarity: 'common', max: 3, color: 0x3a5aa0 },
  { id: 'mondfaenger', name: 'Mondfänger', desc: '+1 Mondstein für jeden Gewinn ab 10× Einsatz.', rarity: 'common', max: 3, color: 0x2a6a8a },
  { id: 'pfennig', name: 'Glückspfennig', desc: 'Der erste Verlust des Tages wird zu 50 % erstattet.', rarity: 'common', max: 1, color: 0x9a6a22 },
  { id: 'wechselgeld', name: 'Wechselgeld', desc: 'Jeder Gewinn ab 5× Einsatz bringt +1 Mindesteinsatz extra.', rarity: 'common', max: 3, color: 0x6a5a2a },
  { id: 'nachtschicht', name: 'Nachtschicht', desc: '+1 Mondstein, sobald du an einem Tag 30 Runden gespielt hast.', rarity: 'common', max: 2, color: 0x2a2a6a },
  { id: 'trostpreis', name: 'Trostpreis', desc: 'Jeder 5. Verlust des Tages zahlt 3 Mindesteinsätze.', rarity: 'common', max: 2, color: 0x8a3a3a },
  { id: 'sammler', name: 'Sammler', desc: 'Stempel zählen doppelt.', rarity: 'rare', max: 1, color: 0x5a2a7a },
  { id: 'kronjuwel', name: 'Kronjuwel', desc: 'Boss-Ziel −15 %.', rarity: 'rare', max: 1, color: 0x8a1a3a },
  { id: 'glanz', name: 'Medaillenglanz', desc: '+1 Mondstein für jede Tagesmedaille ab Silber.', rarity: 'rare', max: 2, color: 0x7a7a8a },
  { id: 'straehne', name: 'Glückssträhne', desc: 'Nach 3 Gewinnen in Folge +5 Mindesteinsätze.', rarity: 'rare', max: 2, color: 0xa0522a },
  { id: 'goldfaden', name: 'Goldener Faden', desc: 'Tagesziele −15 %.', rarity: 'legendary', max: 1, color: 0xb08a2a },
  { id: 'mondsichel', name: 'Mondsichel', desc: 'Mondsteine für Tagesmedaillen doppelt.', rarity: 'legendary', max: 1, color: 0x3a6ab0 },
  { id: 'erbstueck', name: 'Erbstück', desc: 'Zu Beginn jedes Tages +10 % Zinsen, höchstens 50 Mindesteinsätze.', rarity: 'legendary', max: 1, color: 0x6a1a5a },
];

export const RARITY_LABEL: Record<Rarity, string> = { common: 'Gewöhnlich', rare: 'Selten', legendary: 'Legendär' };
const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, legendary: 10 };

export const perkById = (id: string) => PERKS.find((p) => p.id === id);

/** How many of a perk the player holds this season. */
export function perkCount(data: SaveData, id: string) {
  let n = 0;
  for (const p of data.perks) if (p === id) n++;
  return n;
}

/**
 * Multiplier other systems read: perkFactor(data, 'stamps') is 2 with "Sammler".
 * Kept as one place so the stamp card doesn't need to know perk ids.
 */
export function perkFactor(data: SaveData, what: 'stamps') {
  if (what === 'stamps') return perkCount(data, 'sammler') ? 2 : 1;
  return 1;
}

/** Draws `n` different perk ids, weighted by rarity, leaving out perks already at their maximum. */
export function rollDraft(data: SaveData, n = 3, rnd = Math.random): string[] {
  const pool = PERKS.filter((p) => perkCount(data, p.id) < p.max);
  const out: string[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, p) => s + RARITY_WEIGHT[p.rarity], 0);
    let r = rnd() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= RARITY_WEIGHT[pool[i].rarity];
      if (r < 0) break;
    }
    out.push(pool[i].id);
    pool.splice(i, 1);
  }
  return out;
}

/** Start money from these perks for a day that starts with the current balance. */
function startBonus(d: SaveData, ids: readonly string[]) {
  const n = (id: string) => ids.filter((x) => x === id).length;
  const u = stakeUnitFor(d.balance);
  let bonus = 10 * u * n('polster');
  const spar = n('sparstrumpf');
  if (spar) bonus += Math.min(20 * u * spar, Math.floor(d.balance * 0.03 * spar));
  if (n('erbstueck')) bonus += Math.min(50 * u, Math.floor(d.balance * 0.1));
  return bonus;
}

/**
 * Adds a drafted perk. The draft comes after the next day has been set up, so the new perk's
 * start money and goal change apply to that day right away (nothing has been played yet).
 * Returns the start money it paid.
 */
export function takePerk(state: GameState, id: string) {
  const d = state.data;
  d.perks.push(id);
  d.draft = null;
  const fresh = d.history.length <= 1;
  let bonus = 0;
  if (fresh) {
    bonus = startBonus(d, [id]);
    d.balance += bonus;
    d.evening.startBalance += bonus;
    d.history = [d.balance];
  }
  d.evening.quota = state.quotaToday(d.evening.number, d.evening.startBalance);
  state.emit();
  return bonus;
}

/** Things perks did that the player should hear about (shown as toasts). */
export type PerkNote = (text: string) => void;

/** Registers every perk effect on the game state. Call once at start-up. */
export function installPerks(state: GameState, note: PerkNote) {
  const has = (id: string) => perkCount(state.data, id);
  const unit = () => stakeUnitFor(state.data.evening.startBalance);
  /** Today's tallies, kept in the save so a reload mid-day can't pay a once-per-day perk twice. */
  type Tally = { losses: number; streak: number; refunded: boolean; shift: boolean };
  const fresh = (): Tally => ({ losses: 0, streak: 0, refunded: false, shift: false });
  const tally = (): Tally => {
    const c = state.data.counters;
    return { losses: c.pkLosses ?? 0, streak: c.pkStreak ?? 0, refunded: !!c.pkRefunded, shift: !!c.pkShift };
  };
  const store = (t: Tally) => {
    const c = state.data.counters;
    c.pkLosses = t.losses;
    c.pkStreak = t.streak;
    c.pkRefunded = t.refunded ? 1 : 0;
    c.pkShift = t.shift ? 1 : 0;
  };

  // Goals.
  state.quotaFactors.push((d) => {
    let k = Math.pow(0.92, perkCount(d, 'leichtfuss'));
    if (perkCount(d, 'goldfaden')) k *= 0.85;
    if (d.evening.number >= BOSS_DAY && perkCount(d, 'kronjuwel')) k *= 0.85;
    return k;
  });

  // Start money: added to the day's start, so it never counts towards the goal.
  state.onDayStart((d) => {
    store(fresh());
    const bonus = startBonus(d, d.perks);
    if (bonus > 0) {
      d.balance += bonus;
      d.evening.startBalance += bonus;
      note(`Glücksbringer-Kette: +${bonus.toLocaleString('de-DE')} Falter zum Start von Tag ${d.evening.number}.`);
    }
  });

  // Per-round effects. Paid like a small win, outside the game: the game's odds stay the same.
  const pay = (n: number, why: string) => {
    if (n <= 0) return;
    state.payout(n);
    note(`${why}: +${n.toLocaleString('de-DE')} Falter`);
  };
  state.onRound((r: RoundReport) => {
    const d = state.data;
    if (!d.perks.length || r.stake <= 0) return;
    const day = tally();
    const lost = r.win < r.stake;
    if (lost) {
      day.losses++;
      day.streak = 0;
      if (has('pfennig') && !day.refunded) {
        day.refunded = true;
        pay(Math.floor((r.stake - r.win) / 2), 'Glückspfennig');
      }
      const t = has('trostpreis');
      if (t && day.losses % 5 === 0) pay(3 * unit() * t, 'Trostpreis');
    } else if (r.win > r.stake) {
      day.streak++;
      const s = has('straehne');
      if (s && day.streak % 3 === 0) pay(5 * unit() * s, 'Glückssträhne');
      const w = has('wechselgeld');
      if (w && r.win >= r.stake * 5) pay(unit() * w, 'Wechselgeld');
      const m = has('mondfaenger');
      if (m && r.win >= r.stake * 10) {
        d.moonstones += m;
        note(`Mondfänger: +${m} Mondstein${m === 1 ? '' : 'e'}`);
      }
    }
    const ns = has('nachtschicht');
    if (ns && !day.shift && d.history.length - 1 >= 30) {
      day.shift = true;
      d.moonstones += ns;
      note(`Nachtschicht: +${ns} Mondstein${ns === 1 ? '' : 'e'}`);
    }
    store(day);
  });

  // Mondsteine at the end of the day.
  state.moonstoneBonus.push((d, medal: Medal) => {
    if (medal === 'none') return 0;
    let extra = 0;
    if (medal !== 'bronze') extra += perkCount(d, 'glanz');
    if (perkCount(d, 'mondsichel')) extra += MOONSTONES_FOR[medal];
    return extra;
  });
}

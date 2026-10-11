// Mini bosses: the last day of every floor (days 3, 6, 9, 12) a boss of that floor waits on it
// and brings one rule for the whole day. Rules only touch the economy and the flow (stake size,
// which games are open, how many rounds) — never the odds. The day's goal is the normal goal
// (times the boss's small factor); reaching it and settling the day beats the boss: Mondsteine,
// a trophy for the vitrine the first time, and a record in `data.minibosses`. Missing it is a
// normal missed day.
//
// Per-day state lives in counters (reset at day start): 'mb:n' rounds played today, 'mb:seed'
// the gardener's order, 'mb:intro' intro shown, 'mb:beat' victory staged. 'mb:won' carries the
// settled win (boss number) to the UI after the recap, 'mb:first' marks it as the first time.

import { allGames, floorRooms } from './registry';
import { BOSS_DAY, DAYS_PER_FLOOR, floorForDay, type GameState, type Medal, type SaveData, type TrophyKind } from './state';
import { dailyRandom } from './daily';

import { DJ_NAME } from './brand';
export type MiniBossId = 'samtgraefin' | 'gaertner' | 'uhrmacher' | 'falterbeat';

export interface MiniBoss {
  id: MiniBossId;
  /** 1..4: floor and trophy number. */
  n: 1 | 2 | 3 | 4;
  name: string;
  /** Short epithet under the name. */
  title: string;
  /** Headline of the rule and the one exact line of what changes today. */
  ruleName: string;
  rule: string;
  /** Accent colour (plaque, bar, aura). */
  color: number;
  /** Factor on today's goal. */
  quota: number;
  /** Mondsteine for beating the boss (on top of the medal's). */
  reward: number;
  intro: string;
  win: string;
  taunts: string[];
  ouch: string[];
}

/** Gärtner: rounds between two cuts. Uhrmacher: rounds in the day. DJ: rounds per beat and the beat's stake factors. */
export const GARDEN_EVERY = 6;
export const CLOCK_ROUNDS = 40;
export const BEAT_EVERY = 3;
export const BEAT = [1, 2, 1, 3] as const;
/** Gräfin: factor on every stake. */
export const VELVET_STAKE = 2;

export const MINIBOSSES: MiniBoss[] = [
  {
    id: 'samtgraefin',
    n: 1,
    name: 'Die Samtgräfin',
    title: 'Herrin des Kerzensaals',
    ruleName: 'Etikette',
    rule: `Mindesteinsatz an allen Spielen ×${VELVET_STAKE}. Tagesziel +10 %.`,
    color: 0xd8355a,
    quota: 1.1,
    reward: 3,
    intro: 'Kleine Einsätze? In meinem Saal? Wie gewöhnlich. Heute setzt man doppelt, mein Lieber.',
    win: 'Nun gut … Sie haben Stil. Für heute.',
    taunts: ['Wie unelegant.', 'Ein Fleck auf dem Samt!', 'Haltung, bitte!', 'Tz, tz, tz.'],
    ouch: ['Mein Fächer!', 'Unerhört!', 'Das ziemt sich nicht!'],
  },
  {
    id: 'gaertner',
    n: 2,
    name: 'Der Gärtner der Nacht',
    title: 'Hüter des Mondgartens',
    ruleName: 'Rückschnitt',
    rule: `Die Hälfte der Spiele ist zu. Alle ${GARDEN_EVERY} Runden schneidet er andere zurück.`,
    color: 0x5fd08a,
    quota: 1,
    reward: 4,
    intro: 'Pssst. Was zu wild wächst, wird geschnitten. Die Hälfte der Tische ruht heute.',
    win: 'Du wächst schneller, als ich schneiden kann.',
    taunts: ['Schnipp, schnapp.', 'Unkraut vergeht nicht …', 'Alles hat seine Zeit.', 'Der Mond sieht alles.'],
    ouch: ['Meine Mondblumen!', 'Autsch, ein Dorn!', 'Das wuchert ja!'],
  },
  {
    id: 'uhrmacher',
    n: 3,
    name: 'Der Uhrmacher',
    title: 'Meister der Zahnräder',
    ruleName: 'Aufgezogen',
    rule: `Nur ${CLOCK_ROUNDS} Runden, dann bleibt die Uhr stehen und alle Spiele schließen.`,
    color: 0xf0b44a,
    quota: 1,
    reward: 5,
    intro: `Tick, tack. Ich habe die Uhr aufgezogen: ${CLOCK_ROUNDS} Runden. Keine einzige mehr.`,
    win: 'Präzise … auf die Sekunde. Respekt.',
    taunts: ['Tick, tack.', 'Die Zeit läuft.', 'Jede Runde zählt.', 'Zahnrad um Zahnrad …'],
    ouch: ['Mein Pendel!', 'Das bringt mich aus dem Takt!', 'Eine Feder ist gesprungen!'],
  },
  {
    id: 'falterbeat',
    n: 4,
    name: DJ_NAME,
    title: 'König der Tanzfläche',
    ruleName: 'Im Takt',
    rule: `Alle ${BEAT_EVERY} Runden ein neuer Takt: Einsätze ×1 → ×2 → ×1 → ×3. Tagesziel +10 %.`,
    color: 0xff4fd8,
    quota: 1.1,
    reward: 6,
    intro: 'Yo! Heute setzt du im Takt. Und wenn der Drop kommt … verdreifacht!',
    win: 'Krasser Groove. Die Platte gehört dir.',
    taunts: ['Bleib im Takt!', 'Drop incoming!', 'Bässe hoch!', 'Wumm, wumm, wumm.'],
    ouch: ['Kratzer auf der Platte!', 'Wer hat den Bass geklaut?', 'Nicht mein Track!'],
  },
];

const K = { n: 'mb:n', seed: 'mb:seed', intro: 'mb:intro', beat: 'mb:beat', won: 'mb:won', first: 'mb:first' };
export const MB_KEYS = K;

/** True for the last day of floors 1–4. */
export function isMinibossDay(day: number) {
  return day > 0 && day < BOSS_DAY && day % DAYS_PER_FLOOR === 0;
}

/** Today's mini boss, or null. */
export function minibossFor(d: SaveData): MiniBoss | null {
  const day = d.evening.number;
  if (!isMinibossDay(day)) return null;
  return MINIBOSSES[floorForDay(day) - 1] ?? null;
}

export const minibossById = (id: string) => MINIBOSSES.find((b) => b.id === id) ?? null;

/** Rounds played today (on a mini boss day). */
export const roundsToday = (d: SaveData) => Math.max(0, d.counters[K.n] ?? 0);

/** Uhrmacher: rounds left today. */
export function roundsLeft(d: SaveData) {
  return Math.max(0, CLOCK_ROUNDS - roundsToday(d));
}

/** DJ: index into BEAT and rounds until the next beat. */
export function beatIndex(d: SaveData) {
  return Math.floor(roundsToday(d) / BEAT_EVERY) % BEAT.length;
}
export function roundsToBeat(d: SaveData) {
  return BEAT_EVERY - (roundsToday(d) % BEAT_EVERY);
}

/** Factor on the stake unit today. */
export function minibossStake(d: SaveData) {
  const b = minibossFor(d);
  if (b?.id === 'samtgraefin') return VELVET_STAKE;
  if (b?.id === 'falterbeat') return BEAT[beatIndex(d)];
  return 1;
}

/** Games on today's floor (sorted, so the gardener's order is stable). */
function floorGames(d: SaveData) {
  const set = new Set(floorRooms(floorForDay(d.evening.number)).flatMap((r) => r.stations.map((s) => s.game)));
  return [...set].sort();
}

/** Small seeded shuffle (the gardener's order for the day). */
function order(list: string[], seed: number) {
  let a = seed >>> 0 || 1;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Gärtner: rounds until the next cut. */
export function roundsToCut(d: SaveData) {
  return GARDEN_EVERY - (roundsToday(d) % GARDEN_EVERY);
}

/** Games the gardener has cut back right now (half of the floor's, moving on every few rounds). */
export function gardenClosed(d: SaveData): string[] {
  const games = floorGames(d);
  const k = Math.floor(games.length / 2);
  if (k <= 0) return [];
  const list = order(games, d.counters[K.seed] ?? d.season.number * 97 + d.evening.number);
  const step = Math.floor(roundsToday(d) / GARDEN_EVERY);
  const out: string[] = [];
  for (let i = 0; i < k; i++) out.push(list[(step * k + i) % list.length]);
  return out.sort();
}

/** The Uhrmacher's clock has run down: every game is closed for the rest of the day. */
export const clockStopped = (d: SaveData) => minibossFor(d)?.id === 'uhrmacher' && roundsLeft(d) <= 0;

/** Games closed by today's mini boss. */
export function minibossClosed(d: SaveData): string[] {
  const b = minibossFor(d);
  if (!b) return [];
  if (b.id === 'gaertner') return gardenClosed(d);
  if (b.id === 'uhrmacher' && roundsLeft(d) <= 0) return allGames().map((g) => g.id);
  return [];
}

/** True if today's mini boss keeps this game closed right now. */
export function minibossBlocks(d: SaveData, game: string) {
  return clockStopped(d) || (minibossFor(d)?.id === 'gaertner' && gardenClosed(d).includes(game));
}

/** Why a game is closed by the mini boss (for the "geschlossen" toast), or null. */
export function minibossClosedReason(d: SaveData, game: string) {
  const b = minibossFor(d);
  if (!b || !minibossBlocks(d, game)) return null;
  return b.id === 'uhrmacher' ? 'die Uhr des Uhrmachers ist abgelaufen' : `${b.name} hat es zurückgeschnitten`;
}

/** Status line of the rule right now (HUD plate). */
export function ruleStatus(d: SaveData) {
  const b = minibossFor(d);
  if (!b) return '';
  switch (b.id) {
    case 'samtgraefin':
      return `Einsätze ×${VELVET_STAKE}`;
    case 'gaertner':
      return `${gardenClosed(d).length} Spiele zu · Schnitt in ${roundsToCut(d)}`;
    case 'uhrmacher':
      return roundsLeft(d) > 0 ? `Noch ${roundsLeft(d)} von ${CLOCK_ROUNDS} Runden` : 'Die Uhr steht';
    case 'falterbeat':
      return `Takt ×${BEAT[beatIndex(d)]} · Wechsel in ${roundsToBeat(d)}`;
  }
}

/** Trophy kind of a boss ('mb1'..'mb4'). */
export const trophyKind = (b: MiniBoss) => `mb${b.n}` as TrophyKind;

/** Has this boss ever been beaten / this season? */
export const beatenEver = (d: SaveData, id: string) => d.minibosses.includes(id);
export const beatenThisSeason = (d: SaveData, id: string) => d.minibosses.includes(`s${d.season.number}:${id}`);

/** Hooks the mini bosses into the state: per-day reset, goal and stake factors, round count, the reward. */
export function installMiniboss(state: GameState) {
  state.onDayStart((d) => {
    for (const k of [K.n, K.seed, K.intro, K.beat]) delete d.counters[k];
    if (minibossFor(d)?.id === 'gaertner') d.counters[K.seed] = 1 + Math.floor(dailyRandom(d, 'miniboss')() * 1e6);
  });
  state.quotaFactors.push((d) => minibossFor(d)?.quota ?? 1);
  state.stakeFactors.push(minibossStake);
  state.onRound(() => {
    const d = state.data;
    if (minibossFor(d)) d.counters[K.n] = roundsToday(d) + 1;
  });
  // Runs inside endEvening, while the evening is still the boss day: a passed day beats the boss.
  state.moonstoneBonus.push((d, medal: Medal) => {
    const b = minibossFor(d);
    if (!b || medal === 'none') return 0;
    const first = !beatenEver(d, b.id);
    if (first) {
      d.minibosses.push(b.id);
      state.addTrophy(trophyKind(b), medal, `${b.name} besiegt`);
    }
    if (!beatenThisSeason(d, b.id)) d.minibosses.push(`s${d.season.number}:${b.id}`);
    d.counters[K.won] = b.n;
    d.counters[K.first] = first ? 1 : 0;
    d.counters['mb:reward'] = b.reward;
    return b.reward;
  });
}

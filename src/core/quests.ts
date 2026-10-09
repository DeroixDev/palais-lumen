// Guest tasks ("Gäste-Aufträge"): at the start of each day 2–3 guests on today's floor have
// a small wish. Talk to them to accept it; finished rounds count towards it by their report
// tags. Rewards are small: 1–3 Mondsteine, sometimes a stamp. Never touches the odds.

import { floorRooms } from './registry';
import { floorForDay, type GameState, type Quest, type RoundReport, type SaveData } from './state';
import { isClosed, onEventSwitch } from './events';
import { addStamps, floorOfDay } from './stamps';

interface Template {
  /** RoundReport tag that counts (see the tag list in RoundReport). */
  tag: string;
  /** Game the tag belongs to; the template is only used where that game stands and is open. */
  game: string;
  need: number;
  text: string;
  stones: number;
  stamps?: number;
}

const TEMPLATES: Template[] = [
  { tag: 'red', game: 'roulette', need: 3, text: 'Triff dreimal Rot am Roulette.', stones: 1 },
  { tag: 'black', game: 'roulette', need: 3, text: 'Triff dreimal Schwarz am Roulette.', stones: 1 },
  { tag: 'zero', game: 'roulette', need: 1, text: 'Triff einmal die Null.', stones: 3 },
  { tag: 'straight', game: 'roulette', need: 1, text: 'Triff eine einzelne Zahl am Roulette.', stones: 2 },
  { tag: 'roulette', game: 'roulette', need: 8, text: 'Spiel 8 Runden Roulette.', stones: 1, stamps: 1 },
  { tag: 'slots', game: 'slots', need: 15, text: 'Dreh 15-mal an den Automaten.', stones: 1, stamps: 1 },
  { tag: 'lines2', game: 'slots', need: 2, text: 'Lande zweimal 2 Linien gleichzeitig.', stones: 2 },
  { tag: 'lines3', game: 'slots', need: 1, text: 'Lande 3 Linien gleichzeitig.', stones: 2 },
  { tag: 'moth', game: 'slots', need: 3, text: 'Lass dreimal die Motte auf die Walzen.', stones: 1 },
  { tag: 'plinko', game: 'plinko', need: 10, text: 'Spiel 10 Runden Mottenfall.', stones: 1, stamps: 1 },
  { tag: 'edge', game: 'plinko', need: 2, text: 'Triff zweimal ein Randfach im Mottenfall.', stones: 2 },
  { tag: 'crash', game: 'crash', need: 8, text: 'Flieg 8 Runden Mondflug.', stones: 1, stamps: 1 },
  { tag: 'cashout', game: 'crash', need: 5, text: 'Steig fünfmal vor dem Windstoß aus.', stones: 1 },
  { tag: 'cashout2', game: 'crash', need: 3, text: 'Steig dreimal bei 2× oder höher aus.', stones: 1 },
  { tag: 'cashout5', game: 'crash', need: 1, text: 'Steig bei 5× oder höher aus.', stones: 2 },
  { tag: 'blackjack', game: 'blackjack', need: 6, text: 'Spiel 6 Hände Nachtfalter 21.', stones: 1, stamps: 1 },
  { tag: 'bj', game: 'blackjack', need: 1, text: 'Zieh einen Blackjack.', stones: 2 },
  { tag: 'natural', game: 'baccarat', need: 2, text: 'Erlebe zweimal eine Natürliche im Baccarat.', stones: 1 },
  { tag: 'baccarat', game: 'baccarat', need: 6, text: 'Spiel 6 Coups Kristall-Baccarat.', stones: 1, stamps: 1 },
  { tag: 'rung5', game: 'hilo', need: 1, text: 'Steig auf der Kartenleiter 5 Sprossen hoch.', stones: 2 },
  { tag: 'point', game: 'craps', need: 2, text: 'Würfle zweimal deinen Punkt.', stones: 2 },
  { tag: 'craps', game: 'craps', need: 6, text: 'Spiel 6 Runden Straßenwürfel.', stones: 1, stamps: 1 },
  { tag: 'bonus', game: 'wheel', need: 1, text: 'Lande auf dem Bonusfeld am Großen Rad.', stones: 2 },
  { tag: 'shells', game: 'shells', need: 2, text: 'Finde zweimal die Motte unter den Laternen.', stones: 1 },
  { tag: 'mines5', game: 'mines', need: 1, text: 'Finde 5 Diamanten in einer Runde.', stones: 2 },
  { tag: 'tower5', game: 'tower', need: 1, text: 'Kletter 5 Etagen im Drachenturm.', stones: 2 },
  { tag: 'streak3', game: 'coin', need: 1, text: 'Rate dreimal in Folge die Mondmünze richtig.', stones: 2 },
  { tag: 'derby', game: 'derby', need: 4, text: 'Wette auf 4 Entenrennen.', stones: 1, stamps: 1 },
  { tag: 'ice5', game: 'ice', need: 1, text: 'Bring den Pinguin über 5 Schollen.', stones: 2 },
  { tag: 'target', game: 'target', need: 8, text: 'Wirf 8 Pfeile auf die Zielscheibe.', stones: 1, stamps: 1 },
  { tag: 'keno5', game: 'keno', need: 1, text: 'Triff 5 Sterne in einer Ziehung.', stones: 3 },
  { tag: 'line', game: 'bingo', need: 2, text: 'Schaff zweimal eine Bingo-Linie.', stones: 1 },
  { tag: 'scratch', game: 'scratch', need: 5, text: 'Rubbel 5 Lose frei.', stones: 1, stamps: 1 },
  { tag: 'pair', game: 'poker', need: 3, text: 'Gewinn dreimal mit Buben-Paar oder zwei Paaren im Falter-Poker.', stones: 1 },
  { tag: 'win10', game: '', need: 1, text: 'Gewinne einmal das 10-Fache deines Einsatzes.', stones: 2 },
];

/** Guests who give tasks, with how they say it. */
export const GIVERS = ['Gräfin Odette', 'Herr Baptiste', 'Madame Lune', 'Kapitän Moll', 'Tante Ilse', 'Doktor Falk', 'Fräulein Mia', 'Baron Kuno', 'Signora Rosa', 'Herr Jasper'];

export type QuestNews = { quest: Quest; kind: 'accepted' | 'progress' | 'done' };
const listeners = new Set<(n: QuestNews) => void>();

export function onQuest(fn: (n: QuestNews) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const tell = (quest: Quest, kind: QuestNews['kind']) => listeners.forEach((l) => l({ quest, kind }));

const shuffle = <T,>(a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Two or three tasks for today's floor, each for a different game where possible. */
export function makeQuests(d: SaveData): Quest[] {
  const day = d.evening.number;
  const games = new Set(floorRooms(floorForDay(day)).flatMap((r) => r.stations.map((s) => s.game)).filter((g) => !isClosed(d, g)));
  const pool = shuffle(TEMPLATES.filter((t) => !t.game || games.has(t.game)));
  const count = Math.random() < 0.5 ? 2 : 3;
  const picked: Template[] = [];
  for (const t of pool) {
    if (picked.length >= count) break;
    if (picked.some((p) => p.game === t.game)) continue;
    picked.push(t);
  }
  for (const t of pool) if (picked.length < count && !picked.includes(t)) picked.push(t);
  const givers = shuffle([...GIVERS]);
  return picked.map((t, i) => ({
    id: `${day}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    giver: givers[i],
    text: t.text,
    tag: t.tag,
    need: t.need,
    have: 0,
    reward: t.stamps ? { moonstones: t.stones, stamps: t.stamps } : { moonstones: t.stones },
    done: false,
    accepted: false,
  }));
}

/** "2 Mondsteine + 1 Stempel" */
export function rewardText(q: Quest) {
  const parts: string[] = [];
  const s = q.reward.moonstones ?? 0;
  if (s) parts.push(`${s} Mondstein${s === 1 ? '' : 'e'}`);
  if (q.reward.stamps) parts.push(`${q.reward.stamps} Stempel`);
  return parts.join(' + ');
}

function finish(state: GameState, q: Quest) {
  q.done = true;
  q.have = q.need;
  state.data.moonstones += q.reward.moonstones ?? 0;
  tell(q, 'done');
  // Quest id starts with its day.
  if (q.reward.stamps) addStamps(state, floorOfDay(Number(q.id.split('-')[0]) || state.data.evening.number), q.reward.stamps, `Auftrag von ${q.giver}`);
}

export function installQuests(state: GameState) {
  state.onDayStart((d) => {
    d.quests = makeQuests(d);
  });
  // Another event can close other games: today's tasks are handed out again.
  onEventSwitch(() => {
    state.data.quests = makeQuests(state.data);
  });
  state.onRound((r: RoundReport) => {
    for (const q of state.data.quests) {
      if (!q.accepted || q.done || !r.tags.includes(q.tag)) continue;
      q.have++;
      if (q.have >= q.need) finish(state, q);
      else tell(q, 'progress');
    }
  });
}

export function acceptQuest(state: GameState, id: string) {
  const q = state.data.quests.find((x) => x.id === id);
  if (!q || q.accepted) return;
  q.accepted = true;
  tell(q, 'accepted');
  state.emit();
}

/** Debug: accepts and finishes every open task. */
export function completeAllQuests(state: GameState) {
  let n = 0;
  for (const q of state.data.quests) {
    if (q.done) continue;
    q.accepted = true;
    finish(state, q);
    n++;
  }
  state.emit();
  return n;
}

/** Debug: new tasks for today. */
export function rerollQuests(state: GameState) {
  state.data.quests = makeQuests(state.data);
  state.emit();
}

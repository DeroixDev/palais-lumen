// Achievements: small goals across the whole game. Each one shows its progress and pays
// out Mondsteine once. They are checked whenever the game state changes.

import type { SaveData } from './state';

import { BOSS_NAME, CURRENCY, CURRENCY_PLURAL, DOME, FLOOR_NAMES } from './brand';
export type AchievementIcon = 'spin' | 'medal' | 'floor' | 'crown' | 'star' | 'coin' | 'bag' | 'heart' | 'note' | 'fountain' | 'moth' | 'camera';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: AchievementIcon;
  /** Mondsteine paid once when it unlocks. */
  reward: number;
  /** Current value and the target. */
  progress(d: SaveData): [number, number];
}

const n = (d: SaveData, key: string) => d.counters[key] ?? 0;
const games = ['slots', 'roulette', 'plinko', 'crash'];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'firstSpin', name: 'Erste Runde', desc: 'Spiel deine erste Runde.', icon: 'spin', reward: 1, progress: (d) => [d.stats.rounds, 1] },
  { id: 'regular', name: 'Stammgast', desc: 'Spiel 100 Runden.', icon: 'spin', reward: 3, progress: (d) => [d.stats.rounds, 100] },
  { id: 'veteran', name: 'Inventar', desc: 'Spiel 1.000 Runden.', icon: 'spin', reward: 8, progress: (d) => [d.stats.rounds, 1000] },
  { id: 'allGames', name: 'Allrounder', desc: 'Spiel jedes Spiel mindestens einmal.', icon: 'star', reward: 3, progress: (d) => [games.filter((g) => n(d, `game:${g}`) > 0).length, games.length] },
  { id: 'bronze', name: 'Bronze', desc: 'Schaff ein Tagesziel.', icon: 'medal', reward: 1, progress: (d) => [d.medals.bronze + d.medals.silver + d.medals.gold + d.medals.diamond, 1] },
  { id: 'silver', name: 'Silber', desc: 'Hol eine Silbermedaille (150 % vom Ziel).', icon: 'medal', reward: 2, progress: (d) => [d.medals.silver + d.medals.gold + d.medals.diamond, 1] },
  { id: 'gold', name: 'Gold', desc: 'Hol eine Goldmedaille (200 % vom Ziel).', icon: 'medal', reward: 3, progress: (d) => [d.medals.gold + d.medals.diamond, 1] },
  { id: 'diamond', name: 'Diamant', desc: 'Hol eine Diamantmedaille (300 % vom Ziel).', icon: 'medal', reward: 5, progress: (d) => [d.medals.diamond, 1] },
  { id: 'floor2', name: `Im ${FLOOR_NAMES.f2}`, desc: 'Erreiche Etage 2.', icon: 'floor', reward: 2, progress: (d) => [Math.min(d.records.bestEvening + 1, 4), 4] },
  { id: 'floor3', name: `Im ${FLOOR_NAMES.f3}`, desc: 'Erreiche Etage 3.', icon: 'floor', reward: 3, progress: (d) => [Math.min(d.records.bestEvening + 1, 7), 7] },
  { id: 'floor4', name: `Im ${FLOOR_NAMES.f4}`, desc: 'Erreiche Etage 4.', icon: 'floor', reward: 4, progress: (d) => [Math.min(d.records.bestEvening + 1, 10), 10] },
  { id: 'floor5', name: `Unter der ${DOME}`, desc: 'Erreiche den Boss-Tag.', icon: 'floor', reward: 5, progress: (d) => [Math.min(d.records.bestEvening + 1, 13), 13] },
  { id: 'queen', name: 'Schlüssel zum Haus', desc: `Besiege ${BOSS_NAME}, die Herrin der Lampen.`, icon: 'crown', reward: 10, progress: (d) => [d.records.seasonsWon, 1] },
  { id: 'queen3', name: 'Dreifach gekrönt', desc: 'Gewinne drei Saisons.', icon: 'crown', reward: 15, progress: (d) => [d.records.seasonsWon, 3] },
  { id: 'win10', name: 'Zehnfach', desc: 'Gewinn in einer Runde das 10-Fache deines Einsatzes.', icon: 'coin', reward: 2, progress: (d) => [n(d, 'win10'), 1] },
  { id: 'win50', name: 'Jackpot', desc: 'Gewinn in einer Runde das 50-Fache deines Einsatzes.', icon: 'coin', reward: 5, progress: (d) => [n(d, 'win50'), 1] },
  { id: 'bigWin', name: 'Großer Fang', desc: `Gewinn 5.000 ${CURRENCY_PLURAL} in einer Runde.`, icon: 'coin', reward: 4, progress: (d) => [Math.min(d.stats.biggestWin, 5000), 5000] },
  { id: 'rich', name: 'Volle Taschen', desc: `Hab 10.000 ${CURRENCY_PLURAL} auf einmal.`, icon: 'bag', reward: 4, progress: (d) => [Math.min(d.records.bestBalance, 10000), 10000] },
  { id: 'richer', name: `${CURRENCY}-Millionär`, desc: `Hab 100.000 ${CURRENCY_PLURAL} auf einmal.`, icon: 'bag', reward: 10, progress: (d) => [Math.min(d.records.bestBalance, 100000), 100000] },
  { id: 'again', name: 'Wieder aufgestanden', desc: 'Starte eine zweite Saison.', icon: 'heart', reward: 1, progress: (d) => [d.records.seasonsPlayed, 1] },
  { id: 'collector', name: 'Sammler', desc: 'Kauf 5 Sachen im Andenkenladen.', icon: 'bag', reward: 3, progress: (d) => [d.owned.length, 5] },
  { id: 'charm', name: 'Abergläubisch', desc: 'Kauf einen Glücksbringer.', icon: 'star', reward: 1, progress: (d) => [n(d, 'charms'), 1] },
  { id: 'fashion', name: 'Neuer Look', desc: 'Zieh dich in der Umkleide um.', icon: 'heart', reward: 1, progress: (d) => [n(d, 'outfit'), 1] },
  { id: 'wishes', name: 'Wünsch dir was', desc: `Wirf 10 ${CURRENCY_PLURAL} in den Wunschbrunnen.`, icon: 'fountain', reward: 2, progress: (d) => [n(d, 'wish'), 10] },
  { id: 'piano', name: 'Barpianist', desc: 'Spiel 30 Töne auf einem Klavier.', icon: 'note', reward: 1, progress: (d) => [n(d, 'piano'), 30] },
  { id: 'jukebox', name: 'Plattenwechsel', desc: 'Leg an der Jukebox eine andere Platte auf.', icon: 'note', reward: 1, progress: (d) => [n(d, 'jukebox'), 1] },
  { id: 'curious', name: 'Neugierig', desc: 'Probier 6 verschiedene Dinge im Casino aus.', icon: 'moth', reward: 3, progress: (d) => [Object.keys(d.counters).filter((k) => k.startsWith('prop:')).length, 6] },
  { id: 'snapshot', name: 'Schnappschuss', desc: 'Mach ein Foto im Fotomodus.', icon: 'camera', reward: 1, progress: (d) => [n(d, 'photo'), 1] },
  { id: 'album', name: 'Fotoalbum', desc: 'Mach 10 Fotos im Fotomodus.', icon: 'camera', reward: 3, progress: (d) => [n(d, 'photo'), 10] },
  { id: 'companion', name: 'Treuer Begleiter', desc: 'Hol dir ein kleines Licht als Begleiter.', icon: 'moth', reward: 2, progress: (d) => [d.owned.filter((o) => o.startsWith('pet-')).length, 1] },
];

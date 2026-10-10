// Moth album: after a won round a moth may flutter across the screen; catch it and it is
// pressed into the album. Bigger wins bring rarer moths, some only live on one floor, in a
// side room, at one game, on an event night or on a mini boss day. A full page pays
// Mondsteine once, the whole album a trophy. Catching never touches Falter or any odds.

import { ACHIEVEMENTS } from './achievements';
import { getGame, getRoom } from './registry';
import { BOSS_DAY, type GameState, type RoundReport, type SaveData } from './state';
import { eventById } from './events';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Where a moth can be met. */
export type MothWhere =
  | { kind: 'floor'; floor: number }
  | { kind: 'room'; room: string }
  | { kind: 'game'; game: string }
  | { kind: 'event'; event: string }
  | { kind: 'miniboss' }
  | { kind: 'anywhere' };

/** Wing outline families (src/world/painted/mothArt.ts). */
export type WingShape = 'classic' | 'round' | 'hawk' | 'tailed' | 'swallow' | 'broad';
/** Pattern painted on the wings. */
export type WingPattern = 'eyes' | 'bands' | 'veins' | 'dots' | 'tiger' | 'marble' | 'gears' | 'stars' | 'neon' | 'crown' | 'cards' | 'flame' | 'drops' | 'zigzag';

export interface MothArt {
  shape: WingShape;
  pattern: WingPattern;
  /** Forewing base and tip colours, hindwing colour, pattern colour, body colour. */
  fore: number;
  tip: number;
  hind: number;
  mark: number;
  body: number;
  /** Feathered antennae (moths) or thin ones. */
  feathered?: boolean;
  /** Soft light around it (rare ones). */
  glow?: number;
}

export interface MothSpecies {
  id: string;
  name: string;
  /** One short line for the album page. */
  line: string;
  rarity: Rarity;
  page: string;
  where: MothWhere;
  art: MothArt;
}

export interface AlbumPage {
  id: string;
  title: string;
  /** Leather tab colour. */
  color: number;
  /** Mondsteine for completing it (once). */
  stones: number;
}

export const RARITY_NAME: Record<Rarity, string> = { common: 'Häufig', rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };
export const RARITY_COLOR: Record<Rarity, number> = { common: 0x9a8a6a, rare: 0x3f86c8, epic: 0x9a4ad0, legendary: 0xe0a830 };
/** Smallest win multiple that can bring a moth of this rarity. */
export const RARITY_MIN_MULT: Record<Rarity, number> = { common: 1, rare: 4, epic: 10, legendary: 30 };
const RARITY_WEIGHT: Record<Rarity, number> = { common: 10, rare: 5, epic: 3, legendary: 2 };

export const ALBUM_PAGES: AlbumPage[] = [
  { id: 'p1', title: 'Kerzensaal', color: 0x7a1d34, stones: 4 },
  { id: 'p2', title: 'Mondgarten', color: 0x1f5a44, stones: 5 },
  { id: 'p3', title: 'Uhrwerk', color: 0x7a5420, stones: 6 },
  { id: 'p4', title: 'Club Nachtfalter', color: 0x26407a, stones: 7 },
  { id: 'p5', title: 'Thron & Mini-Bosse', color: 0x4a2a6a, stones: 8 },
  { id: 'p6', title: 'Besondere Nächte', color: 0x1d4a5a, stones: 8 },
];

const fl = (floor: number): MothWhere => ({ kind: 'floor', floor });
const rm = (room: string): MothWhere => ({ kind: 'room', room });
const gm = (game: string): MothWhere => ({ kind: 'game', game });
const ev = (event: string): MothWhere => ({ kind: 'event', event });

export const MOTHS: MothSpecies[] = [
  // ---- Kerzensaal (floor 1) ----
  { id: 'kerzenmotte', name: 'Kerzenmotte', line: 'Tanzt um jede Flamme und versengt sich nie.', rarity: 'common', page: 'p1', where: fl(1), art: { shape: 'classic', pattern: 'flame', fore: 0xc89a5a, tip: 0x7a4a22, hind: 0xe8c47a, mark: 0xff9a3a, body: 0x5a3a1a, feathered: true } },
  { id: 'samtfluegel', name: 'Samtflügel', line: 'Weich wie der Vorhang, hinter dem sie schläft.', rarity: 'common', page: 'p1', where: fl(1), art: { shape: 'round', pattern: 'veins', fore: 0x8a2a3e, tip: 0x4a0e1e, hind: 0xb8485a, mark: 0x2a0810, body: 0x3a1018, feathered: true } },
  { id: 'dochtfalter', name: 'Dochtfalter', line: 'Riecht nach ausgeblasener Kerze und Bienenwachs.', rarity: 'common', page: 'p1', where: fl(1), art: { shape: 'classic', pattern: 'bands', fore: 0xd8cbb0, tip: 0x8a7a5a, hind: 0xeee2c8, mark: 0x3a2a1a, body: 0x4a3a2a } },
  { id: 'rotrock', name: 'Roulette-Rotrock', line: 'Setzt immer auf Rot. Meistens zu Recht, sagt sie.', rarity: 'rare', page: 'p1', where: gm('roulette'), art: { shape: 'swallow', pattern: 'dots', fore: 0xc8243a, tip: 0x1b1b22, hind: 0xe84a5a, mark: 0x1b1b22, body: 0x1b1b22 } },
  { id: 'hinterzimmer', name: 'Hinterzimmer-Schwärmer', line: 'Flüstert Zahlen, die niemand hören soll.', rarity: 'rare', page: 'p1', where: rm('f1b'), art: { shape: 'hawk', pattern: 'bands', fore: 0x4a3a30, tip: 0x1a1210, hind: 0xd8a040, mark: 0xe0b25a, body: 0x2a1e18 } },
  { id: 'wachsgold', name: 'Goldene Wachsmotte', line: 'Ein Tropfen Kerzenwachs, der fliegen gelernt hat.', rarity: 'epic', page: 'p1', where: fl(1), art: { shape: 'broad', pattern: 'drops', fore: 0xf0c860, tip: 0xb07a20, hind: 0xffe49a, mark: 0xfff6d0, body: 0x8a5a14, feathered: true, glow: 0xffd070 } },
  // ---- Mondgarten (floor 2) ----
  { id: 'tauperle', name: 'Tauperlchen', line: 'Trägt jeden Morgen eine Perle Tau nach Hause.', rarity: 'common', page: 'p2', where: fl(2), art: { shape: 'round', pattern: 'drops', fore: 0x9ac8b8, tip: 0x4a8a7a, hind: 0xc8e8da, mark: 0xeafff8, body: 0x2a4a40 } },
  { id: 'mondblatt', name: 'Mondblattspanner', line: 'Sieht aus wie ein Blatt, bis das Blatt wegfliegt.', rarity: 'common', page: 'p2', where: fl(2), art: { shape: 'swallow', pattern: 'veins', fore: 0x6a9a4a, tip: 0x3a5a22, hind: 0x8ab85a, mark: 0x2a4014, body: 0x3a4a22 } },
  { id: 'nachtkerze', name: 'Nachtkerzen-Schwärmer', line: 'Wohnt im Gewächshaus und gießt heimlich die Blüten.', rarity: 'rare', page: 'p2', where: rm('f2b'), art: { shape: 'hawk', pattern: 'bands', fore: 0x6a8a3a, tip: 0x2a4a1a, hind: 0xf090b0, mark: 0xf8d0e0, body: 0x4a6a2a } },
  { id: 'radschlaeger', name: 'Radschläger', line: 'Dreht sich so lange, bis das Rad stehen bleibt.', rarity: 'rare', page: 'p2', where: gm('wheel'), art: { shape: 'round', pattern: 'eyes', fore: 0x3a6ad0, tip: 0x1a2a6a, hind: 0x7aa8f0, mark: 0xffd25a, body: 0x1a2040 } },
  { id: 'mondspiegel', name: 'Silberner Mondspiegel', line: 'In ihren Flügeln spiegelt sich der volle Mond.', rarity: 'epic', page: 'p2', where: fl(2), art: { shape: 'broad', pattern: 'eyes', fore: 0xc8d4e0, tip: 0x7a8aa0, hind: 0xe8eef4, mark: 0xffffff, body: 0x4a5060, feathered: true, glow: 0xcfe6ff } },
  { id: 'brautschleier', name: 'Lunas Brautschleier', line: 'Die Gärtner sagen, sie blüht nur alle hundert Nächte.', rarity: 'legendary', page: 'p2', where: fl(2), art: { shape: 'tailed', pattern: 'eyes', fore: 0xa8e8b8, tip: 0x5aa86a, hind: 0xc8f4d0, mark: 0xffe08a, body: 0xf4f0e0, feathered: true, glow: 0xb8ffd0 } },
  // ---- Uhrwerk (floor 3) ----
  { id: 'zahnradeule', name: 'Zahnradeule', line: 'Tickt leise, wenn sie sich ausruht.', rarity: 'common', page: 'p3', where: fl(3), art: { shape: 'classic', pattern: 'gears', fore: 0x8a6a3a, tip: 0x4a3418, hind: 0xb8925a, mark: 0xe0b25a, body: 0x3a2a14, feathered: true } },
  { id: 'messing', name: 'Messingspanner', line: 'Glänzt nur, wenn jemand sie poliert.', rarity: 'common', page: 'p3', where: fl(3), art: { shape: 'swallow', pattern: 'bands', fore: 0xd8a84a, tip: 0x8a5a14, hind: 0xe8c878, mark: 0x6a4210, body: 0x5a3a10 } },
  { id: 'pendel', name: 'Pendelfalter', line: 'Fliegt nur hin und her, nie geradeaus.', rarity: 'rare', page: 'p3', where: rm('f3b'), art: { shape: 'tailed', pattern: 'zigzag', fore: 0x5a4a6a, tip: 0x2a1e3a, hind: 0x8a7a9a, mark: 0xe0b25a, body: 0x2a2030 } },
  { id: 'teichlaeufer', name: 'Teichläufer', line: 'Wettet immer auf die langsamste Ente.', rarity: 'rare', page: 'p3', where: gm('derby'), art: { shape: 'hawk', pattern: 'dots', fore: 0x3a7a8a, tip: 0x1a3a44, hind: 0xf0a040, mark: 0xfff0c0, body: 0x1a3a40 } },
  { id: 'drachenturm', name: 'Drachenturm-Spinner', line: 'Hat jede Stufe des Turms gezählt. Zweimal.', rarity: 'epic', page: 'p3', where: gm('tower'), art: { shape: 'broad', pattern: 'tiger', fore: 0xd85a2a, tip: 0x6a1a0a, hind: 0xffb040, mark: 0x2a0a04, body: 0x3a1408, glow: 0xff9040 } },
  { id: 'unruh', name: 'Ewige Unruh', line: 'Ihr Herz schlägt im Takt der großen Turmuhr.', rarity: 'legendary', page: 'p3', where: fl(3), art: { shape: 'broad', pattern: 'gears', fore: 0xf0d080, tip: 0xa0701a, hind: 0xfff0b8, mark: 0x7a4a10, body: 0x5a3a10, feathered: true, glow: 0xffe090 } },
  // ---- Club Nachtfalter (floor 4) ----
  { id: 'neonbaer', name: 'Neonbär', line: 'Leuchtet im Schwarzlicht wie ein Plakat.', rarity: 'common', page: 'p4', where: fl(4), art: { shape: 'classic', pattern: 'tiger', fore: 0xf0ece0, tip: 0xc8c0b0, hind: 0xff4a9a, mark: 0x1b1b22, body: 0x1b1b22, feathered: true } },
  { id: 'glanzmotte', name: 'Discokugel-Glanzmotte', line: 'Wirft tausend kleine Lichter auf die Tanzfläche.', rarity: 'common', page: 'p4', where: fl(4), art: { shape: 'round', pattern: 'stars', fore: 0x8a9ab0, tip: 0x4a5468, hind: 0xc0cce0, mark: 0xffffff, body: 0x2a3040 } },
  { id: 'bass', name: 'Bass-Schwärmer', line: 'Spürt den Beat schon zwei Etagen tiefer.', rarity: 'rare', page: 'p4', where: rm('f4t'), art: { shape: 'hawk', pattern: 'neon', fore: 0x1a1a2a, tip: 0x0a0a14, hind: 0x2a2a4a, mark: 0x5fe3ff, body: 0x0a0a14 } },
  { id: 'goldkette', name: 'Goldkettchen', line: 'Trägt mehr Schmuck als der DJ.', rarity: 'rare', page: 'p4', where: rm('f4h'), art: { shape: 'swallow', pattern: 'dots', fore: 0x2a1a3a, tip: 0x120a1a, hind: 0x6a2a8a, mark: 0xffd25a, body: 0x120a1a } },
  { id: 'kartenzaehler', name: 'Kartenzähler', line: 'Merkt sich jede Karte. Sagt aber nichts.', rarity: 'epic', page: 'p4', where: gm('blackjack'), art: { shape: 'broad', pattern: 'cards', fore: 0x1f5a44, tip: 0x0b2a20, hind: 0x2f7a5a, mark: 0xfff6e6, body: 0x0b2a20, glow: 0x7bd4a0 } },
  { id: 'lichtorgel', name: 'Lichtorgel-Atlas', line: 'Die größte Motte des Clubs, und die eitelste.', rarity: 'legendary', page: 'p4', where: fl(4), art: { shape: 'broad', pattern: 'neon', fore: 0xff5fa2, tip: 0x6a1a8a, hind: 0x5fe3ff, mark: 0xfff6ff, body: 0x2a0a3a, feathered: true, glow: 0xff8ad0 } },
  // ---- Thron & Mini-Bosse (floor 5, mini boss days) ----
  { id: 'thronwache', name: 'Thronwächter', line: 'Steht stramm vor dem Thron, auch im Schlaf.', rarity: 'common', page: 'p5', where: fl(5), art: { shape: 'classic', pattern: 'bands', fore: 0x5a2a6a, tip: 0x2a0e3a, hind: 0x8a4a9a, mark: 0xe0b25a, body: 0x1a0a22, feathered: true } },
  { id: 'kronentraeger', name: 'Kronenträger', line: 'Trägt die Schleppe der Königin. Ganz allein.', rarity: 'rare', page: 'p5', where: fl(5), art: { shape: 'swallow', pattern: 'crown', fore: 0x7a3a8a, tip: 0x3a1048, hind: 0xb07ac0, mark: 0xffd25a, body: 0x2a0a30 } },
  { id: 'uhrmacher', name: 'Liebling des Uhrmachers', line: 'Kommt nur, wenn ein Mini-Boss am Ende der Etage wartet.', rarity: 'rare', page: 'p5', where: { kind: 'miniboss' }, art: { shape: 'tailed', pattern: 'gears', fore: 0x4a5a6a, tip: 0x1a2430, hind: 0x7a8a9a, mark: 0xe0b25a, body: 0x1a2430 } },
  { id: 'schatten', name: 'Schatten der Königin', line: 'Wo sie fliegt, wird es einen Moment lang still.', rarity: 'epic', page: 'p5', where: { kind: 'miniboss' }, art: { shape: 'broad', pattern: 'marble', fore: 0x2a1a30, tip: 0x0a040e, hind: 0x4a2a50, mark: 0x9a6ab0, body: 0x0a040e, feathered: true, glow: 0x9a6ad0 } },
  { id: 'purpurmantel', name: 'Purpurmantel', line: 'Hat das Duell der Königin schon oft gesehen.', rarity: 'epic', page: 'p5', where: gm('queen'), art: { shape: 'tailed', pattern: 'eyes', fore: 0x8a1a5a, tip: 0x3a0828, hind: 0xc04a8a, mark: 0xffd25a, body: 0x2a0418, glow: 0xff70b0 } },
  { id: 'prinzessin', name: 'Kleine Königin', line: 'Eines Tages wird sie den Thron erben.', rarity: 'legendary', page: 'p5', where: fl(5), art: { shape: 'broad', pattern: 'crown', fore: 0xe8d0f0, tip: 0x8a5aa8, hind: 0xfff0ff, mark: 0xffc840, body: 0x5a2a6a, feathered: true, glow: 0xf0c0ff } },
  // ---- Besondere Nächte (events, anywhere) ----
  { id: 'groschen', name: 'Groschenmotte', line: 'Sammelt jede kleine Münze, die jemand fallen lässt.', rarity: 'common', page: 'p6', where: ev('groschen'), art: { shape: 'round', pattern: 'dots', fore: 0xa87a3a, tip: 0x5a3a14, hind: 0xd0a860, mark: 0xffe49a, body: 0x4a2a10 } },
  { id: 'kerzenschein', name: 'Kerzenschein-Eule', line: 'Liebt den Stromausfall. Endlich sieht man die Kerzen.', rarity: 'rare', page: 'p6', where: ev('stromausfall'), art: { shape: 'broad', pattern: 'eyes', fore: 0x6a4a2a, tip: 0x2a1a0a, hind: 0x9a7a4a, mark: 0xffb040, body: 0x2a1a0a, feathered: true } },
  { id: 'schwarmfuehrerin', name: 'Schwarmführerin', line: 'Führt den großen Mottenschwarm durchs Haus.', rarity: 'rare', page: 'p6', where: ev('mottenschwarm'), art: { shape: 'swallow', pattern: 'zigzag', fore: 0xe0d8c0, tip: 0x8a7a5a, hind: 0xf4ecd8, mark: 0x5a3a2a, body: 0x3a2a1a } },
  { id: 'galaschleppe', name: 'Galaschleppe', line: 'Kommt nur zum Galaabend, und nie ohne Schleppe.', rarity: 'epic', page: 'p6', where: ev('gala'), art: { shape: 'tailed', pattern: 'stars', fore: 0x1a1a3a, tip: 0x0a0a1a, hind: 0x2a2a5a, mark: 0xe0b25a, body: 0x0a0a1a, glow: 0xffe0a0 } },
  { id: 'nullpunkt', name: 'Nullpunkt-Motte', line: 'Landet nur in der Null-Nacht, genau auf der Null.', rarity: 'epic', page: 'p6', where: ev('nullnacht'), art: { shape: 'round', pattern: 'eyes', fore: 0x1d8a5c, tip: 0x0b3a26, hind: 0x3aaa7a, mark: 0xfff6e6, body: 0x0b3a26, glow: 0x7bffb0 } },
  { id: 'sternenstaub', name: 'Sternenstaub-Komet', line: 'Ein Wunsch mit Flügeln. Wer ihn fängt, darf staunen.', rarity: 'legendary', page: 'p6', where: { kind: 'anywhere' }, art: { shape: 'tailed', pattern: 'stars', fore: 0x2a3a8a, tip: 0x0a1040, hind: 0x5a7ad0, mark: 0xfff6c0, body: 0x0a1040, feathered: true, glow: 0xa0c0ff } },
];

export const mothById = (id: string) => MOTHS.find((m) => m.id === id);
export const mothsOnPage = (page: string) => MOTHS.filter((m) => m.page === page);
export const caught = (d: SaveData, id: string) => (d.album?.[id] ?? 0) > 0;
export const caughtCount = (d: SaveData) => MOTHS.filter((m) => caught(d, m.id)).length;
export const pageDone = (d: SaveData, page: string) => mothsOnPage(page).every((m) => caught(d, m.id));
const pageKey = (page: string) => `albumPage:${page}`;
export const pageRewarded = (d: SaveData, page: string) => (d.counters[pageKey(page)] ?? 0) > 0;
export const albumDone = (d: SaveData) => caughtCount(d) === MOTHS.length;

/** Day 3, 6, 9, 12: the last day on a floor, when its mini boss waits. */
export const isMiniBossDay = (day: number) => day < BOSS_DAY && day % 3 === 0;

const gameName = (id: string) => {
  try {
    return getGame(id).name;
  } catch {
    return id;
  }
};
const roomName = (id: string) => {
  try {
    return getRoom(id).name;
  } catch {
    return id;
  }
};
const FLOOR_NAME = ['Foyer', 'Kerzensaal', 'Mondgarten', 'Uhrwerk', 'Club Nachtfalter', 'Gang der Mottenkönigin'];

/** "Etage 2 · Mondgarten" etc.: where to look for a moth. */
export function whereText(w: MothWhere) {
  switch (w.kind) {
    case 'floor':
      return `Etage ${w.floor} · ${FLOOR_NAME[w.floor] ?? ''}`;
    case 'room':
      return `Nebenraum: ${roomName(w.room)}`;
    case 'game':
      return `Am Spiel „${gameName(w.game)}“`;
    case 'event':
      return `Ereignis: ${eventById(w.event)?.name ?? w.event}`;
    case 'miniboss':
      return 'An Mini-Boss-Tagen (Tag 3, 6, 9, 12)';
    default:
      return 'Überall im Haus';
  }
}

/** Hint for a missing moth: where, and how big the win has to be. */
export function hintText(m: MothSpecies) {
  const k = RARITY_MIN_MULT[m.rarity];
  return k > 1 ? `${whereText(m.where)} · ab ${k}-fachem Gewinn` : `${whereText(m.where)} · bei Gewinnen`;
}

/** Where the player is when a round ends. */
export interface Spot {
  room: string;
  floor: number;
  parent: string;
  game: string;
  event: string;
  day: number;
}

export function spotOf(d: SaveData, game: string): Spot {
  let floor = 0;
  let parent = d.roomId;
  try {
    const r = getRoom(d.roomId);
    floor = r.floor;
    parent = r.parent ?? r.id;
  } catch {
    /* unknown room */
  }
  return { room: d.roomId, floor, parent, game, event: d.event, day: d.evening.number };
}

function fits(m: MothSpecies, s: Spot) {
  const w = m.where;
  switch (w.kind) {
    case 'floor':
      return s.floor === w.floor;
    case 'room':
      return s.room === w.room;
    case 'game':
      return s.game === w.game;
    case 'event':
      return s.event === w.event;
    case 'miniboss':
      return isMiniBossDay(s.day) && s.floor > 0;
    default:
      return true;
  }
}

/** Chance that a moth shows up after a round won at this multiple of the stake. */
export function mothChance(mult: number) {
  if (!(mult > 1)) return 0;
  if (mult < 2) return 0.06;
  if (mult < 4) return 0.1;
  if (mult < 10) return 0.18;
  if (mult < 30) return 0.35;
  if (mult < 50) return 0.55;
  return 0.8;
}

/** Picks a moth for a win of `mult` at this spot (rarer tiers need bigger wins); null if none fits. */
export function pickMoth(d: SaveData, mult: number, s: Spot, rnd = Math.random): MothSpecies | null {
  const pool = MOTHS.filter((m) => mult >= RARITY_MIN_MULT[m.rarity] && fits(m, s));
  if (!pool.length) return null;
  // Missing ones come a bit more often, so the album keeps growing.
  const wt = (m: MothSpecies) => RARITY_WEIGHT[m.rarity] * (caught(d, m.id) ? 1 : 2.5);
  let t = rnd() * pool.reduce((a, m) => a + wt(m), 0);
  for (const m of pool) if ((t -= wt(m)) <= 0) return m;
  return pool[pool.length - 1];
}

// ---- Catching -------------------------------------------------------------------------------------

export interface CatchNews {
  moth: MothSpecies;
  fresh: boolean;
  /** Pages completed by this catch (rewards paid). */
  pages: AlbumPage[];
  stones: number;
  /** The whole album is complete now (trophy handed out). */
  complete: boolean;
}

/** Puts a caught moth into the album, pays page rewards once and the trophy for the whole album. */
export function catchMoth(state: GameState, id: string): CatchNews | null {
  const d = state.data;
  const m = mothById(id);
  if (!m) return null;
  if (!d.album) d.album = {};
  const fresh = !caught(d, id);
  d.album[id] = (d.album[id] ?? 0) + 1;
  d.counters.mothsCaught = (d.counters.mothsCaught ?? 0) + 1;
  const news = settleRewards(state);
  state.emit();
  return { moth: m, fresh, ...news };
}

/** Pays any page reward not paid yet, and the trophy for a full album. */
export function settleRewards(state: GameState) {
  const d = state.data;
  const pages: AlbumPage[] = [];
  let stones = 0;
  for (const p of ALBUM_PAGES) {
    if (pageRewarded(d, p.id) || !pageDone(d, p.id)) continue;
    d.counters[pageKey(p.id)] = 1;
    d.moonstones += p.stones;
    stones += p.stones;
    pages.push(p);
  }
  let complete = false;
  if (albumDone(d) && !d.counters.albumTrophy) {
    d.counters.albumTrophy = 1;
    state.addTrophy('crystal', 'diamond', 'Motten-Album komplett');
    complete = true;
  }
  return { pages, stones, complete };
}

/** Debug: one of every moth. */
export function fillAlbum(state: GameState) {
  const d = state.data;
  for (const m of MOTHS) d.album[m.id] = Math.max(1, d.album[m.id] ?? 0);
  return settleRewards(state);
}

// ---- Rounds ---------------------------------------------------------------------------------------

/** A moth is about to fly (main wiring shows it). */
type FlightListener = (m: MothSpecies, mult: number) => void;
const listeners: FlightListener[] = [];
export function onMothFlight(fn: FlightListener) {
  listeners.push(fn);
}

/** Shortest gap between two moths, so they stay a little surprise. */
const COOLDOWN_MS = 15000;
let lastFlight = -1e9;
let installed = false;

/** Listens to finished rounds and rolls for a moth. `busy` is true while one is in the air. */
export function installAlbum(state: GameState, busy: () => boolean) {
  if (installed) return;
  installed = true;
  state.onRound((r: RoundReport) => {
    if (!(r.stake > 0) || !(r.win > r.stake) || busy()) return;
    const mult = r.win / r.stake;
    const now = performance.now();
    // Huge wins skip the wait; a moth after a 50× win is part of the moment.
    if (now - lastFlight < COOLDOWN_MS && mult < 30) return;
    if (Math.random() >= mothChance(mult)) return;
    const m = pickMoth(state.data, mult, spotOf(state.data, r.game));
    if (!m) return;
    lastFlight = now;
    for (const l of listeners) l(m, mult);
  });
}

/** Debug: a moth now, as if after a huge win where you stand (any moth if none fits). */
export function debugFlight(state: GameState, game = '') {
  const s = spotOf(state.data, game);
  const m = pickMoth(state.data, 100, s) ?? MOTHS[Math.floor(Math.random() * MOTHS.length)];
  lastFlight = performance.now();
  for (const l of listeners) l(m, 100);
  return m;
}

// Achievements for the album (shown with the others at the wall in the foyer).
ACHIEVEMENTS.push(
  { id: 'mothFirst', name: 'Mottenfänger', desc: 'Fang deine erste Motte fürs Album.', icon: 'moth', reward: 1, progress: (d) => [Math.min(1, caughtCount(d)), 1] },
  { id: 'mothPage', name: 'Volle Seite', desc: 'Füll eine ganze Seite im Motten-Album.', icon: 'moth', reward: 3, progress: (d) => [ALBUM_PAGES.some((p) => pageDone(d, p.id)) ? 1 : 0, 1] },
  { id: 'mothAll', name: 'Mottenkundler', desc: 'Füll das ganze Motten-Album.', icon: 'crown', reward: 10, progress: (d) => [caughtCount(d), MOTHS.length] },
);

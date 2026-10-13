// Das Lampenbuch: after a won round a little light may drift across the screen; catch it and
// it goes into the book. Bigger wins bring rarer lamps, some only burn on one floor, in a side
// room, at one game, on an event night or on a mini boss day. A full page pays Mondsteine
// once, the whole book a trophy. Catching never touches Lumen or any odds.
// Until save version 8 this was the moth album; ALBUM_RENAME (albumRename.ts) maps each old
// entry to the lamp that took its place, same page, rarity and place.

import { ACHIEVEMENTS } from './achievements';
import { getGame, getRoom } from './registry';
import { BOSS_DAY, type GameState, type RoundReport, type SaveData } from './state';
import { eventById } from './events';

import { ALBUM_ENTRY, ALBUM_NAME, BOSS_GEN, DOME, FLOOR_NAMES } from './brand';
export { ALBUM_RENAME } from './albumRename';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Where a lamp can be met. */
export type LampWhere =
  | { kind: 'floor'; floor: number }
  | { kind: 'room'; room: string }
  | { kind: 'game'; game: string }
  | { kind: 'event'; event: string }
  | { kind: 'miniboss' }
  | { kind: 'anywhere' };

/** Base bodies of the lamp kit (src/world/painted/lampArt.ts); `form` picks a variant. */
export type LampBody = 'candle' | 'candelabra' | 'oil' | 'chimney' | 'lantern' | 'paper' | 'torch' | 'jar' | 'bulb' | 'globe' | 'tube' | 'lens' | 'shard' | 'pole' | 'chandelier' | 'star';
/** Pattern on the wax, glass or paper (some bodies use it for what burns inside). */
export type LampPattern = 'plain' | 'drips' | 'cells' | 'bands' | 'dots' | 'stars' | 'zigzag' | 'mesh' | 'gears' | 'rings' | 'rays' | 'crescent' | 'coins' | 'zero' | 'facets' | 'filament' | 'arc' | 'neon';

export interface LampArt {
  body: LampBody;
  /** Variant of the body, e.g. lantern 'street' | 'storm' | 'davy' | 'bike'. */
  form?: string;
  pattern: LampPattern;
  /** Frame or holder, glass (or wax, paper, clay), the light itself, the pattern. */
  metal: number;
  glass: number;
  flame: number;
  mark: number;
  /** Soft light around it (rare ones). */
  glow?: number;
  /** Candle count for candelabras. */
  n?: number;
  /** Candle height, 1 = tall. */
  size?: number;
}

export interface LampSpecies {
  id: string;
  name: string;
  /** One sentence of real lamp history for the book page. */
  line: string;
  rarity: Rarity;
  page: string;
  where: LampWhere;
  art: LampArt;
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
/** Smallest win multiple that can bring a lamp of this rarity. */
export const RARITY_MIN_MULT: Record<Rarity, number> = { common: 1, rare: 4, epic: 10, legendary: 30 };
const RARITY_WEIGHT: Record<Rarity, number> = { common: 10, rare: 5, epic: 3, legendary: 2 };

export const ALBUM_PAGES: AlbumPage[] = [
  { id: 'p1', title: FLOOR_NAMES.f1, color: 0x7a1d34, stones: 4 },
  { id: 'p2', title: FLOOR_NAMES.f2, color: 0x1f5a44, stones: 5 },
  { id: 'p3', title: FLOOR_NAMES.f3, color: 0x7a5420, stones: 6 },
  { id: 'p4', title: FLOOR_NAMES.f4, color: 0x26407a, stones: 7 },
  { id: 'p5', title: `${DOME} & Mini-Bosse`, color: 0x26305a, stones: 8 },
  { id: 'p6', title: 'Besondere Nächte', color: 0x1d4a5a, stones: 8 },
];

const fl = (floor: number): LampWhere => ({ kind: 'floor', floor });
const rm = (room: string): LampWhere => ({ kind: 'room', room });
const gm = (game: string): LampWhere => ({ kind: 'game', game });
const ev = (event: string): LampWhere => ({ kind: 'event', event });

/** The 36 lamps, page by page, in the same slots as the moths they replaced. */
export const LAMPS: LampSpecies[] = [
  // ---- Page 1: candle and oil (floor 1) ----
  { id: 'talglicht', name: 'Talglicht', line: 'Talglichter aus Rinderfett rußten und rochen streng; ihr Docht musste ständig mit der Lichtputzschere gekürzt werden.', rarity: 'common', page: 'p1', where: fl(1), art: { body: 'candle', size: 0.55, pattern: 'drips', metal: 0x8a8c94, glass: 0xeee2c0, flame: 0xffa84a, mark: 0xfff6e0 } },
  { id: 'bienenwachs', name: 'Bienenwachskerze', line: 'Bienenwachs brennt heller und sauberer als Talg und war darum lange Kirchen und reichen Häusern vorbehalten.', rarity: 'common', page: 'p1', where: fl(1), art: { body: 'candle', size: 1.15, pattern: 'cells', metal: 0xc89a4a, glass: 0xe8b04a, flame: 0xffc45a, mark: 0x9a6410 } },
  { id: 'oellaempchen', name: 'Öllämpchen', line: 'Schon in der Antike brannten kleine Tonlämpchen mit Olivenöl und einem Docht aus Leinen.', rarity: 'common', page: 'p1', where: fl(1), art: { body: 'oil', pattern: 'dots', metal: 0x8a4424, glass: 0xc0683a, flame: 0xffa040, mark: 0xf4d8a8 } },
  { id: 'kandelaber', name: 'Kandelaber', line: 'Der Name kommt vom lateinischen „candela“, Kerze: Ein Kandelaber trägt mehrere Kerzen auf verzweigten Armen.', rarity: 'rare', page: 'p1', where: gm('roulette'), art: { body: 'candelabra', n: 3, pattern: 'bands', metal: 0xb8bcc8, glass: 0xc8243a, flame: 0xffb84a, mark: 0x5a5e6a } },
  { id: 'argand', name: 'Argand-Lampe', line: 'Aimé Argand erfand um 1780 den hohlen Runddocht mit Glaszylinder, der die Flamme auch von innen mit Luft versorgt und viel heller brennen lässt.', rarity: 'rare', page: 'p1', where: rm('f1b'), art: { body: 'chimney', form: 'argand', pattern: 'bands', metal: 0xd8a848, glass: 0xdfe8e8, flame: 0xffd070, mark: 0x7a5418 } },
  { id: 'kerzenleuchter', name: 'Goldener Kerzenleuchter', line: 'Prunkleuchter wurden früher feuervergoldet, mit Gold in Quecksilber, dessen Dämpfe viele Vergolder krank machten.', rarity: 'epic', page: 'p1', where: fl(1), art: { body: 'candelabra', n: 5, pattern: 'rays', metal: 0xf0c860, glass: 0xfff2d8, flame: 0xffc050, mark: 0xfff0b0, glow: 0xffd070 } },
  // ---- Page 2: moon and garden (floor 2) ----
  { id: 'gluehwuermchen', name: 'Glühwürmchenglas', line: 'Glühwürmchen leuchten kalt: In ihrem Hinterleib bringt das Enzym Luciferase den Stoff Luciferin mit Sauerstoff zum Leuchten.', rarity: 'common', page: 'p2', where: fl(2), art: { body: 'jar', pattern: 'dots', metal: 0x6a8a5a, glass: 0x9ad0b8, flame: 0xd8ff6a, mark: 0xeaff9a } },
  { id: 'papierlaterne', name: 'Papierlaterne', line: 'Papierlaternen stammen aus China, wo zum Laternenfest am Ende der Neujahrszeit unzählige von ihnen leuchten.', rarity: 'common', page: 'p2', where: fl(2), art: { body: 'paper', pattern: 'plain', metal: 0x2a2226, glass: 0xd8483a, flame: 0xffc060, mark: 0xf0c040 } },
  { id: 'gartenfackel', name: 'Gartenfackel', line: 'Eine klassische Fackel ist ein Holzstab, dessen umwickelter Kopf mit Pech, Harz oder Wachs getränkt wurde.', rarity: 'rare', page: 'p2', where: rm('f2b'), art: { body: 'torch', pattern: 'bands', metal: 0x8a5a30, glass: 0x5a4430, flame: 0xff9a3a, mark: 0x3a2412 } },
  { id: 'radlaterne', name: 'Laterne am Rad', line: 'Fahrradlampen brannten zuerst mit Kerzen oder Öl, dann mit Karbidgas, bevor ein Dynamo am Rad den Strom lieferte.', rarity: 'rare', page: 'p2', where: gm('wheel'), art: { body: 'lantern', form: 'bike', pattern: 'rays', metal: 0x3a6ad0, glass: 0xfff0c0, flame: 0xffd25a, mark: 0xffffff } },
  { id: 'mondglas', name: 'Mondglas', line: 'Mondglas wurde als Glasblase zu einer flachen Scheibe geschleudert; in der Mitte blieb der dicke Butzen zurück.', rarity: 'epic', page: 'p2', where: fl(2), art: { body: 'lens', form: 'disc', pattern: 'rings', metal: 0x9aa4b4, glass: 0xc8d8ec, flame: 0xe8f4ff, mark: 0xffffff, glow: 0xcfe6ff } },
  { id: 'lunalampion', name: 'Lunas Lampion', line: 'Das Wort Lampion kam über das Französische aus dem italienischen „lampione“, einer großen Laterne.', rarity: 'legendary', page: 'p2', where: fl(2), art: { body: 'paper', form: 'long', pattern: 'crescent', metal: 0xd8b048, glass: 0x9ae0b0, flame: 0xfff0b0, mark: 0xfff4c0, glow: 0xb8ffd0 } },
  // ---- Page 3: gas and works (floor 3) ----
  { id: 'gaslaterne', name: 'Gaslaterne', line: 'Schon 1807 leuchteten in der Londoner Pall Mall die ersten Gaslaternen an einer Straße.', rarity: 'common', page: 'p3', where: fl(3), art: { body: 'lantern', form: 'street', pattern: 'plain', metal: 0x2f4a3a, glass: 0xfff0c8, flame: 0xffe6a0, mark: 0x1a2a20 } },
  { id: 'petroleum', name: 'Petroleumlampe', line: 'Ab den 1850er-Jahren wurde Petroleum aus Erdöl gewonnen und machte helles Lampenlicht zum ersten Mal für fast alle bezahlbar.', rarity: 'common', page: 'p3', where: fl(3), art: { body: 'chimney', form: 'petroleum', pattern: 'bands', metal: 0xc89a4a, glass: 0x7ab89a, flame: 0xffb860, mark: 0xd8f0e0 } },
  { id: 'gluehstrumpf', name: 'Glühstrumpf', line: 'Carl Auer von Welsbach erfand 1885 den Glühstrumpf, ein Gewebe aus Metalloxiden, das in der Gasflamme hell weiß glüht.', rarity: 'rare', page: 'p3', where: rm('f3b'), art: { body: 'globe', form: 'clear', pattern: 'mesh', metal: 0x8a6a3a, glass: 0xe8eee8, flame: 0xf4ffe0, mark: 0xb8b090 } },
  { id: 'davy', name: 'Davy-Grubenlampe', line: 'Humphry Davy umgab 1815 die Flamme mit feinem Drahtgewebe, das die Hitze ableitet, sodass Grubengas draußen nicht explodiert.', rarity: 'rare', page: 'p3', where: gm('derby'), art: { body: 'lantern', form: 'davy', pattern: 'mesh', metal: 0xd8a84a, glass: 0xe8e8e0, flame: 0xffc060, mark: 0xe8d8a8 } },
  { id: 'bogenlampe', name: 'Bogenlampe', line: 'In der Bogenlampe springt ein greller Lichtbogen zwischen zwei Kohlestiften über; ab 1878 erhellte sie die Boulevards von Paris.', rarity: 'epic', page: 'p3', where: gm('tower'), art: { body: 'globe', form: 'clear', pattern: 'arc', metal: 0x4a4a56, glass: 0xdce8ff, flame: 0xf0f8ff, mark: 0x2a2a30, glow: 0xc8dcff } },
  { id: 'unruhlampe', name: 'Ewige Unruh-Lampe', line: 'In einer Feuerwache im kalifornischen Livermore brennt seit 1901 eine Glühbirne, fast ohne Pause.', rarity: 'legendary', page: 'p3', where: fl(3), art: { body: 'bulb', pattern: 'gears', metal: 0xd8b048, glass: 0xfff0b8, flame: 0xffc860, mark: 0xa0701a, glow: 0xffe090 } },
  // ---- Page 4: current and neon (floor 4) ----
  { id: 'edison', name: 'Edison-Birne', line: 'Edisons Glühbirnen bekamen ab 1880 Fäden aus verkohltem Bambus, die über tausend Stunden hielten.', rarity: 'common', page: 'p4', where: fl(4), art: { body: 'bulb', pattern: 'filament', metal: 0xb89048, glass: 0xffe0a0, flame: 0xffa040, mark: 0xff8a30 } },
  { id: 'neonroehre', name: 'Neonröhre', line: 'Georges Claude zeigte 1910 in Paris die erste Neonröhre; reines Neon leuchtet rotorange, die anderen Farben kommen von anderen Gasen.', rarity: 'common', page: 'p4', where: fl(4), art: { body: 'tube', form: 'bent', pattern: 'zigzag', metal: 0x24202a, glass: 0xff5fa2, flame: 0xffe0f0, mark: 0xff5fa2 } },
  { id: 'spiegelkugel', name: 'Spiegelkugel', line: 'Spiegelkugeln drehten sich schon in den 1920er-Jahren über Tanzsälen, lange bevor die Disco sie berühmt machte.', rarity: 'rare', page: 'p4', where: rm('f4t'), art: { body: 'globe', pattern: 'facets', metal: 0x8a9ab0, glass: 0xb8c4d8, flame: 0xffffff, mark: 0xffffff } },
  { id: 'schwarzlicht', name: 'Schwarzlicht', line: 'Schwarzlicht ist fast unsichtbares UV-Licht; weiße Hemden und Leuchtfarben glühen darin, weil sie es in sichtbares Licht umwandeln.', rarity: 'rare', page: 'p4', where: rm('f4h'), art: { body: 'tube', form: 'bar', pattern: 'dots', metal: 0x1a1622, glass: 0x9a5aff, flame: 0xd8b0ff, mark: 0x7affd0 } },
  { id: 'stroboskop', name: 'Stroboskop', line: 'Mit Stroboskop-Blitzen machte Harold Edgerton in den 1930er-Jahren fallende Milchtropfen und fliegende Kugeln sichtbar.', rarity: 'epic', page: 'p4', where: gm('blackjack'), art: { body: 'lens', form: 'strobe', pattern: 'rays', metal: 0x2a2a34, glass: 0xe8f0ff, flame: 0xf0f6ff, mark: 0xcfe0ff, glow: 0xe0ecff } },
  { id: 'lichtorgel', name: 'Die große Lichtorgel', line: 'Eine Lichtorgel teilt die Musik in Bässe, Mitten und Höhen und lässt für jeden Bereich eine eigene Farbe aufleuchten.', rarity: 'legendary', page: 'p4', where: fl(4), art: { body: 'tube', form: 'organ', pattern: 'neon', metal: 0x3a1a4a, glass: 0xff4a6a, flame: 0x5fe3ff, mark: 0x8aff6a, glow: 0xff8ad0 } },
  // ---- Page 5: the dome and the mini bosses (floor 5, mini boss days) ----
  { id: 'fresnel', name: 'Leuchtturmlinse', line: 'Augustin Fresnel ersetzte 1822 die dicke Glaslinse durch Ringstufen; so wurde das Leuchtturmlicht leichter und reichte weiter aufs Meer.', rarity: 'common', page: 'p5', where: fl(5), art: { body: 'lens', form: 'fresnel', pattern: 'rings', metal: 0xc89a4a, glass: 0xc8dcf4, flame: 0xfff6d8, mark: 0xffffff } },
  { id: 'signallampe', name: 'Signallampe', line: 'Mit der Signallampe morsen Schiffe Lichtzeichen: Klappen vor dem Glas öffnen und schließen sich wie eine Jalousie.', rarity: 'rare', page: 'p5', where: fl(5), art: { body: 'lens', form: 'signal', pattern: 'bands', metal: 0x4a5a6a, glass: 0xfff0c0, flame: 0xffe08a, mark: 0x2a3440 } },
  { id: 'kristall', name: 'Kronleuchter-Kristall', line: 'Bleikristall bricht das Licht stärker als gewöhnliches Glas, darum funkeln die Prismen eines Kronleuchters in Regenbogenfarben.', rarity: 'rare', page: 'p5', where: { kind: 'miniboss' }, art: { body: 'shard', form: 'prism', pattern: 'plain', metal: 0xe0b25a, glass: 0xdce8ff, flame: 0xffffff, mark: 0xbcd0ff } },
  { id: 'mondsplitter', name: 'Splitter der Mondlampe', line: 'Der Mond leuchtet nicht selbst: Er wirft nur gut ein Zehntel des Sonnenlichts zurück, etwa so viel wie alter Asphalt.', rarity: 'epic', page: 'p5', where: { kind: 'miniboss' }, art: { body: 'shard', form: 'jagged', pattern: 'crescent', metal: 0x8a9ab8, glass: 0xbcd0ff, flame: 0xf0f6ff, mark: 0xffffff, glow: 0x9ab4ff } },
  { id: 'lampenstange', name: `${BOSS_GEN} Lampenstange`, line: 'Laternenanzünder trugen eine lange Stange mit Haken und kleiner Flamme, um jede Gaslaterne zu öffnen und zu entzünden.', rarity: 'epic', page: 'p5', where: gm('queen'), art: { body: 'pole', pattern: 'bands', metal: 0x26305a, glass: 0x26305a, flame: 0xffd27a, mark: 0xe0b25a, glow: 0xffc870 } },
  { id: 'mondlampe', name: 'Die kleine Mondlampe', line: 'Selene ist in der griechischen Sage die Göttin des Mondes; der Chemiker Berzelius benannte 1817 das Element Selen nach ihr.', rarity: 'legendary', page: 'p5', where: fl(5), art: { body: 'globe', form: 'stand', pattern: 'crescent', metal: 0xd8b048, glass: 0xdfe6f4, flame: 0xfff6e0, mark: 0xd8a830, glow: 0xd8e6ff } },
  // ---- Page 6: special nights (events, anywhere) ----
  { id: 'groschenlampe', name: 'Groschenlämpchen', line: 'Um 1900 gab es Gasuhren mit Münzeinwurf: Wer einen Groschen einwarf, bekam Gas für ein paar Stunden Licht.', rarity: 'common', page: 'p6', where: ev('groschen'), art: { body: 'jar', form: 'candle', pattern: 'coins', metal: 0xa87a3a, glass: 0xe8d0a0, flame: 0xffb040, mark: 0xffd870 } },
  { id: 'sturmlaterne', name: 'Sturmlaterne', line: 'Bei der Sturmlaterne strömt die Luft durch hohle Seitenrohre zur Flamme, darum geht sie auch bei starkem Wind nicht aus.', rarity: 'rare', page: 'p6', where: ev('stromausfall'), art: { body: 'lantern', form: 'storm', pattern: 'plain', metal: 0xc0302a, glass: 0xfff0d0, flame: 0xffb040, mark: 0x6a1a14 } },
  { id: 'lichterfest', name: 'Lichterfest-Lampion', line: 'Zu Diwali, dem indischen Lichterfest, stellen Familien kleine Öllämpchen aus Ton auf, die Diyas heißen.', rarity: 'rare', page: 'p6', where: ev('mottenschwarm'), art: { body: 'paper', pattern: 'zigzag', metal: 0xd8a030, glass: 0xff9a30, flame: 0xffd070, mark: 0xc8243a } },
  { id: 'galaluester', name: 'Galalüster', line: 'Lange brannten die Lüster im Theater die ganze Vorstellung über; erst Richard Wagner ließ 1876 in Bayreuth den Saal verdunkeln.', rarity: 'epic', page: 'p6', where: ev('gala'), art: { body: 'chandelier', pattern: 'plain', metal: 0xe0b25a, glass: 0xfff2d8, flame: 0xffc860, mark: 0xffffff, glow: 0xffe0a0 } },
  { id: 'nulllicht', name: 'Nulllicht', line: 'Ein Lichtteilchen, das Photon, hat keine Ruhemasse: Auf der Waage zeigt es genau null.', rarity: 'epic', page: 'p6', where: ev('nullnacht'), art: { body: 'globe', form: 'clear', pattern: 'zero', metal: 0x0b3a26, glass: 0x3aaa7a, flame: 0x7bffb0, mark: 0xeafff0, glow: 0x7bffb0 } },
  { id: 'sternschnuppe', name: 'Sternschnuppe', line: 'Die meisten Sternschnuppen sind nur sandkorngroße Staubteilchen, die in rund hundert Kilometern Höhe verglühen.', rarity: 'legendary', page: 'p6', where: { kind: 'anywhere' }, art: { body: 'star', pattern: 'stars', metal: 0x2a3a8a, glass: 0xfff6c0, flame: 0xffd870, mark: 0xa0c0ff, glow: 0xa0c0ff } },
];

/** Older name of LAMPS, kept for the debug panel. */
export const MOTHS = LAMPS;

export const lampById = (id: string) => LAMPS.find((m) => m.id === id);
export const lampsOnPage = (page: string) => LAMPS.filter((m) => m.page === page);
export const caught = (d: SaveData, id: string) => (d.album?.[id] ?? 0) > 0;
export const caughtCount = (d: SaveData) => LAMPS.filter((m) => caught(d, m.id)).length;
export const pageDone = (d: SaveData, page: string) => lampsOnPage(page).every((m) => caught(d, m.id));
const pageKey = (page: string) => `albumPage:${page}`;
export const pageRewarded = (d: SaveData, page: string) => (d.counters[pageKey(page)] ?? 0) > 0;
export const albumDone = (d: SaveData) => caughtCount(d) === LAMPS.length;

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
const FLOOR_NAME = ['Foyer', FLOOR_NAMES.f1, FLOOR_NAMES.f2, FLOOR_NAMES.f3, FLOOR_NAMES.f4, FLOOR_NAMES.f5];

/** "Etage 2 · Mondgarten" etc.: where to look for a lamp. */
export function whereText(w: LampWhere) {
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

/** Hint for a missing lamp: where, and how big the win has to be. */
export function hintText(m: LampSpecies) {
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

function fits(m: LampSpecies, s: Spot) {
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

/** Chance that a lamp shows up after a round won at this multiple of the stake. */
export function lampChance(mult: number) {
  if (!(mult > 1)) return 0;
  if (mult < 2) return 0.06;
  if (mult < 4) return 0.1;
  if (mult < 10) return 0.18;
  if (mult < 30) return 0.35;
  if (mult < 50) return 0.55;
  return 0.8;
}

/** Picks a lamp for a win of `mult` at this spot (rarer tiers need bigger wins); null if none fits. */
export function pickLamp(d: SaveData, mult: number, s: Spot, rnd = Math.random): LampSpecies | null {
  const pool = LAMPS.filter((m) => mult >= RARITY_MIN_MULT[m.rarity] && fits(m, s));
  if (!pool.length) return null;
  // Missing ones come a bit more often, so the album keeps growing.
  const wt = (m: LampSpecies) => RARITY_WEIGHT[m.rarity] * (caught(d, m.id) ? 1 : 2.5);
  let t = rnd() * pool.reduce((a, m) => a + wt(m), 0);
  for (const m of pool) if ((t -= wt(m)) <= 0) return m;
  return pool[pool.length - 1];
}

// ---- Catching -------------------------------------------------------------------------------------

export interface CatchNews {
  lamp: LampSpecies;
  fresh: boolean;
  /** Pages completed by this catch (rewards paid). */
  pages: AlbumPage[];
  stones: number;
  /** The whole album is complete now (trophy handed out). */
  complete: boolean;
}

/** Puts a caught lamp into the book, pays page rewards once and the trophy for the whole album. */
export function catchLamp(state: GameState, id: string): CatchNews | null {
  const d = state.data;
  const m = lampById(id);
  if (!m) return null;
  if (!d.album) d.album = {};
  const fresh = !caught(d, id);
  d.album[id] = (d.album[id] ?? 0) + 1;
  // Counter key from the moth days, kept so old saves keep their tally.
  d.counters.mothsCaught = (d.counters.mothsCaught ?? 0) + 1;
  const news = settleRewards(state);
  state.emit();
  return { lamp: m, fresh, ...news };
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
    state.addTrophy('crystal', 'diamond', `${ALBUM_NAME} komplett`);
    complete = true;
  }
  return { pages, stones, complete };
}

/** Debug: one of every lamp. */
export function fillAlbum(state: GameState) {
  const d = state.data;
  for (const m of LAMPS) d.album[m.id] = Math.max(1, d.album[m.id] ?? 0);
  return settleRewards(state);
}

// ---- Rounds ---------------------------------------------------------------------------------------

/** A lamp is about to drift across the screen (main wiring shows it). */
type FlightListener = (m: LampSpecies, mult: number) => void;
const listeners: FlightListener[] = [];
export function onLampFlight(fn: FlightListener) {
  listeners.push(fn);
}

/** Shortest gap between two lamps, so they stay a little surprise. */
const COOLDOWN_MS = 15000;
let lastFlight = -1e9;
let installed = false;

/** Listens to finished rounds and rolls for a lamp. `busy` is true while one is in the air. */
export function installAlbum(state: GameState, busy: () => boolean) {
  if (installed) return;
  installed = true;
  state.onRound((r: RoundReport) => {
    if (!(r.stake > 0) || !(r.win > r.stake) || busy()) return;
    const mult = r.win / r.stake;
    const now = performance.now();
    // Huge wins skip the wait; a lamp after a 50× win is part of the moment.
    if (now - lastFlight < COOLDOWN_MS && mult < 30) return;
    if (Math.random() >= lampChance(mult)) return;
    const m = pickLamp(state.data, mult, spotOf(state.data, r.game));
    if (!m) return;
    lastFlight = now;
    for (const l of listeners) l(m, mult);
  });
}

/** Debug: a lamp now, as if after a huge win where you stand (any lamp if none fits). */
export function debugFlight(state: GameState, game = '') {
  const s = spotOf(state.data, game);
  const m = pickLamp(state.data, 100, s) ?? LAMPS[Math.floor(Math.random() * LAMPS.length)];
  lastFlight = performance.now();
  for (const l of listeners) l(m, 100);
  return m;
}

// Achievements for the book (shown with the others at the wall in the foyer). The IDs and
// the 'moth' icon key are from the moth days; saves store the IDs, the icon now shows a bulb.
ACHIEVEMENTS.push(
  { id: 'mothFirst', name: 'Erstes Licht', desc: `Fang deine erste ${ALBUM_ENTRY} fürs Album.`, icon: 'moth', reward: 1, progress: (d) => [Math.min(1, caughtCount(d)), 1] },
  { id: 'mothPage', name: 'Volle Seite', desc: `Füll eine ganze Seite im ${ALBUM_NAME}.`, icon: 'moth', reward: 3, progress: (d) => [ALBUM_PAGES.some((p) => pageDone(d, p.id)) ? 1 : 0, 1] },
  { id: 'mothAll', name: 'Lampenkundler', desc: `Füll das ganze ${ALBUM_NAME}.`, icon: 'crown', reward: 10, progress: (d) => [caughtCount(d), LAMPS.length] },
);

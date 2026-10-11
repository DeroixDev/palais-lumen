// Extension points. A new game or room is one file plus one register call
// (see src/games/index.ts and src/rooms/index.ts).

import type { Container, Renderer } from 'pixi.js';
import type { GameState } from './state';
import type { Particles } from './fx';
import type { Sfx } from './audio';

export interface GameContext {
  state: GameState;
  sfx: Sfx;
  /** Screen-space particles drawn above the game. */
  particles: Particles;
  renderer: Renderer;
  /** Options from the room placement, e.g. { theme: 'diamond', minBet: 50 }. */
  options: Record<string, unknown>;
  /** Shakes the whole game view. */
  shake(strength?: number): void;
  toast(text: string): void;
  /**
   * Plays the shared win celebration for a payout of `multiplier` × stake at a screen point.
   * `orbit` lets the moth swarm circle something, e.g. the roulette wheel.
   */
  celebrate(multiplier: number, x: number, y: number, orbit?: { x: number; y: number; r: number }): void;
  /** Called by the game when the player wants to leave. */
  exit(): void;
}

export interface GameInstance {
  view: Container;
  /** Lays the game out for the current screen size. */
  resize(width: number, height: number): void;
  update(dtMs: number): void;
  /** True while a round is running; the player can't leave until it's done. */
  busy(): boolean;
  destroy(): void;
}

export interface GameDefinition {
  id: string;
  name: string;
  /** Share of all bets the house keeps on average, shown to the player for transparency. */
  houseEdge: number;
  /** Footprint of the machine/table in the top-down room, in world pixels. */
  footprint: { w: number; h: number };
  /**
   * Which room spots it fits: a 'cabinet' (machine, at most 76×64) stands in a bank of
   * machines, a 'table' (at most 150×84) on a table spot. The daily rotation uses this.
   */
  size: 'cabinet' | 'table';
  /** One line for the elevator panel / day card: what the game is about. */
  blurb?: string;
  /** The Selene's own duel: never drawn by the daily rotation, not in the program or tasks. */
  boss?: boolean;
  /** Draws the machine/table as seen from above. Origin is the top-left of the footprint. */
  drawStation(options: Record<string, unknown>): Container;
  create(ctx: GameContext): GameInstance;
}

/** Look of a floor: decides how carpet and walls are painted. */
export type RoomStyle = 'foyer' | 'velvet' | 'garden' | 'clockwork' | 'crystal' | 'throne' | 'club' | 'techno' | 'hiphop';

export interface RoomTheme {
  style: RoomStyle;
  carpet: number;
  carpetPattern: number;
  carpetAccent: number;
  wall: number;
  wallTrim: number;
  neon: number;
  light: number;
  /** Rug colour. */
  accent?: number;
  /** Upholstery of sofas, armchairs and stools. */
  sofa?: number;
  barLabel?: string;
  crystal?: number;
  /** Curtains and banners. */
  curtain?: number;
  /** Leave out the style's own floor centrepiece (the garden's path loop); the room lays its own paths. */
  bare?: boolean;
}

export interface StationPlacement {
  game: string;
  /** Stays put: the daily rotation leaves this game on this spot (special machines in side rooms). */
  pinned?: boolean;
  x: number;
  y: number;
  label?: string;
  options?: Record<string, unknown>;
}

/**
 * Furniture and ornaments. Floor objects use (x, y) as their centre; wall pieces
 * (painting, sconce, curtain, window, mirror, wallClock, ivy, banner, relief, gauge) hang on
 * the back wall at x. `w`/`h` size things that come in different sizes; `r` is a rotation in
 * quarter turns for pieces that stand along a side wall.
 */
export type DecorKind =
  // floor, walk-over
  | 'rug' | 'gearInlay' | 'mosaic'
  // furniture and objects
  | 'plant' | 'palm' | 'tree' | 'hedge' | 'flowerbed' | 'pillar' | 'glassPillar' | 'sofa' | 'armchair' | 'bench'
  | 'table' | 'piano' | 'bar' | 'cabinet' | 'bookshelf' | 'floorLamp' | 'statue' | 'fountain' | 'moonPool'
  | 'lanternPost' | 'boiler' | 'pipes' | 'workbench' | 'clockTower' | 'crystal' | 'iceSwan' | 'champagne'
  | 'brazier' | 'throne' | 'rope' | 'trophyShelf'
  // floor plans: Kerzensaal nave, Mondgarten pond and paths, Uhrwerk belt and catwalks
  | 'runner' | 'dais' | 'pond' | 'path' | 'pavilion' | 'conveyor' | 'catwalk' | 'grate'
  // foyer
  | 'shopCounter' | 'reception' | 'wardrobe' | 'clothesRack' | 'jukebox' | 'entrance' | 'achievementWall' | 'plaque'
  | 'moonWindow' | 'floorBoard' | 'keyBoard'
  // club floor (src/world/painted/propsClub.ts)
  | 'djStage' | 'danceFloor' | 'speakerStack' | 'clubBar' | 'vipBooth' | 'lightDesk' | 'railing' | 'ledPillar'
  | 'fogMachine' | 'turntables' | 'boombox' | 'sneakerShelf' | 'chainDisplay'
  | 'neonArt' | 'laser' | 'strobe' | 'hoop' | 'discoBall'
  // above everything
  | 'chandelier'
  // back wall
  | 'painting' | 'sconce' | 'curtain' | 'window' | 'mirror' | 'wallClock' | 'ivy' | 'banner' | 'relief' | 'gauge'
  // the history of light (src/world/painted/propsLight.ts): Kerzensaal, Laternenwerk, the Kuppel
  | 'candelabrum' | 'gasLantern' | 'mantleShelf' | 'domeFloor' | 'gasPipe' | 'eraLamp' | 'domeVault';

export interface DecorPlacement {
  kind: DecorKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
}

/**
 * A doorway to another room on the same floor. (x, y) is where the player steps through,
 * in this room's world pixels; `side` says which wall it is in. Walking into it (or tapping
 * it) moves the player to the door in `to` whose `to` points back here.
 */
export interface DoorDef {
  x: number;
  y: number;
  to: string;
  side: 'back' | 'left' | 'right' | 'front';
  /** Sign over the door, e.g. "Hinterzimmer". */
  label?: string;
}

export interface RoomDefinition {
  id: string;
  /** Side room: id of the floor's main room. Side rooms have no elevator (elevatorX is ignored). */
  parent?: string;
  /** Doorways to the other rooms of this floor. */
  doors?: DoorDef[];
  /** Boss corridor: one mandatory try per machine, gates between them (src/world/bossRun.ts). */
  corridor?: boolean;
  name: string;
  /** Floor number: 0 is the foyer, 1–5 the casino floors. The elevator goes between them. */
  floor: number;
  /** x position of the elevator in the back wall. */
  elevatorX: number;
  /** Short theme line shown on the elevator panel. */
  tagline: string;
  /** Neon sign on the back wall. */
  sign: string;
  width: number;
  height: number;
  theme: RoomTheme;
  spawn: { x: number; y: number };
  stations: StationPlacement[];
  decor: DecorPlacement[];
  /**
   * x of the house-tech tablet on the back wall (src/world/painted/tablet.ts). Left out, the room
   * picks the freest stretch of wall itself.
   */
  tabletX?: number;
}

const games = new Map<string, GameDefinition>();
const rooms = new Map<string, RoomDefinition>();

export function registerGame(def: GameDefinition) {
  games.set(def.id, def);
}

export function registerRoom(def: RoomDefinition) {
  rooms.set(def.id, def);
}

export function getGame(id: string) {
  const g = games.get(id);
  if (!g) throw new Error(`Unbekanntes Spiel: ${id}`);
  return g;
}

/** Decides which games stand where today (see src/core/rotation.ts). Identity until set. */
let resolveStations: (def: RoomDefinition) => StationPlacement[] = (def) => def.stations;
const resolved = new Map<RoomDefinition, { key: string; def: RoomDefinition }>();
let resolverKey: () => string = () => '';

export function setStationResolver(fn: (def: RoomDefinition) => StationPlacement[], key: () => string) {
  resolveStations = fn;
  resolverKey = key;
  resolved.clear();
}

/** The room as it stands today: same walls and decor, today's games on its spots. */
function today(def: RoomDefinition): RoomDefinition {
  const key = resolverKey();
  const hit = resolved.get(def);
  if (hit && hit.key === key) return hit.def;
  const d = { ...def, stations: resolveStations(def) };
  resolved.set(def, { key, def: d });
  return d;
}

export function allGames() {
  return [...games.values()];
}

export function getRoom(id: string) {
  return today(rooms.get(id) ?? rooms.get('f1')!);
}

export function allRooms() {
  return [...rooms.values()].map(today);
}

/** The main room of a floor (the one with the elevator). */
export function mainRoomOf(floor: number) {
  return allRooms().find((r) => r.floor === floor && !r.parent);
}

/** Every room of a floor, main room first. */
export function floorRooms(floor: number) {
  return allRooms()
    .filter((r) => r.floor === floor)
    .sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0));
}

/** The room as written in its file, before the daily rotation. */
export function baseRoom(id: string) {
  return rooms.get(id) ?? rooms.get('f1')!;
}

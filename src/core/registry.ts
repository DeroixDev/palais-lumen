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
  /** Draws the machine/table as seen from above. Origin is the top-left of the footprint. */
  drawStation(options: Record<string, unknown>): Container;
  create(ctx: GameContext): GameInstance;
}

/** Look of a floor: decides how carpet and walls are painted. */
export type RoomStyle = 'foyer' | 'velvet' | 'garden' | 'clockwork' | 'crystal' | 'throne';

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
}

export interface StationPlacement {
  game: string;
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
  // foyer
  | 'shopCounter' | 'reception' | 'wardrobe' | 'clothesRack' | 'jukebox' | 'entrance' | 'achievementWall' | 'plaque'
  // above everything
  | 'chandelier'
  // back wall
  | 'painting' | 'sconce' | 'curtain' | 'window' | 'mirror' | 'wallClock' | 'ivy' | 'banner' | 'relief' | 'gauge';

export interface DecorPlacement {
  kind: DecorKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
}

export interface RoomDefinition {
  id: string;
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

export function getRoom(id: string) {
  return rooms.get(id) ?? rooms.get('f1')!;
}

export function allRooms() {
  return [...rooms.values()];
}

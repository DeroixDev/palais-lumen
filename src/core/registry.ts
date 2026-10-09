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

export interface RoomTheme {
  carpet: number;
  carpetPattern: number;
  carpetAccent: number;
  wall: number;
  wallTrim: number;
  neon: number;
  light: number;
}

export interface StationPlacement {
  game: string;
  x: number;
  y: number;
  label?: string;
  options?: Record<string, unknown>;
}

export interface DoorPlacement {
  to: string;
  /** x position on the top wall (doors sit in the back wall). */
  x: number;
  label: string;
}

export type DecorKind = 'plant' | 'pillar' | 'trophyShelf' | 'bar' | 'sofa' | 'rope';

export interface DecorPlacement {
  kind: DecorKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface RoomDefinition {
  id: string;
  name: string;
  /** Neon sign on the back wall. */
  sign: string;
  width: number;
  height: number;
  theme: RoomTheme;
  /** Play money needed to open this room for the first time. */
  unlockCost?: number;
  spawn: { x: number; y: number };
  stations: StationPlacement[];
  doors: DoorPlacement[];
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
  return rooms.get(id) ?? rooms.get('lobby')!;
}

export function allRooms() {
  return [...rooms.values()];
}

// What a board is. A board is a module that exports one BoardDef: its spaces and paths (data),
// a few rule hooks (gimmick per round, its own field, events, Brettfest), and a view factory
// that decorates the 3D island. See ./README.md.

import type { BoardKit, BoardDecor } from '../view3d/boardview';
import type { Answer, Ask, GameState, GameEvent } from '../engine/state';

/** Space types. P Plus, M Minus, E Ereignis, L Glück, S Laden, D Duell, B Kumpel, T Bande,
 *  R Rivale, X Brett-Feld (the board's own field), G Start (counts as Plus). The star sits on top. */
export type SpaceType = 'P' | 'M' | 'E' | 'L' | 'S' | 'D' | 'B' | 'T' | 'R' | 'X' | 'G';

export interface BNode {
  id: number;
  x: number;
  z: number;
  type: SpaceType;
  /** Following spaces; more than one = a junction (Weiche). */
  next: number[];
  /** Named waypoints (START, J1 …); junctions and merges are always named. */
  name?: string;
  /** Path piece this space belongs to. */
  seg?: string;
  /** At a junction: name and length of each way, keyed by the first space of that way. */
  routes?: Record<number, { name: string; len: number; seg: string }>;
}

export interface BEdge { a: number; b: number; seg: string; /** board specific mark, e.g. 'draw' for a drawbridge */ flag?: string }

export interface BoardGraph { nodes: BNode[]; edges: BEdge[]; start: number }

/** What the engine lends to a board's rule hooks. */
export interface BoardApi {
  st: GameState;
  /** The board's own serialisable state (bridge up, plaza turned …). */
  bs: Record<string, unknown>;
  emit(ev: GameEvent): Promise<void>;
  toast(text: string, color?: string): Promise<void>;
  rng(): number;
  addCoins(p: number, d: number, text?: string): Promise<void>;
  moveStar(): Promise<void>;
  /** Asks a seat (this browser, a bot or a friend), like the engine's own questions. */
  ask(p: number, a: Ask): Promise<Answer>;
}

export interface BoardEvent {
  text: string;
  /** Not in Profi rules (luck that swaps places or stars). */
  luck?: boolean;
  run(api: BoardApi, p: number): Promise<void>;
}

export interface BoardInfoLine { color: string; title: string; text: string }

export interface BoardDef {
  id: string;
  name: string;
  /** One line for the lobby. */
  blurb: string;
  graph: BoardGraph;
  /** Space types with a board-specific name for the legend (e.g. X → 'Drehbühne'). */
  xName: string;
  initState(): Record<string, unknown>;
  /** Why the step a → b is closed right now (null = open). */
  blocked(bs: Record<string, unknown>, a: number, b: number): string | null;
  /** Main gimmick, called at every round start (after round 1). */
  roundStart(api: BoardApi, round: number): Promise<void>;
  /** The board's own field (type X). */
  onSpace(api: BoardApi, p: number): Promise<void>;
  /** Brettfest every 5 rounds. */
  fest(api: BoardApi): Promise<void>;
  /** Extra Ereignis events of this board. */
  events: BoardEvent[];
  /** Sidebar lines about the gimmick state. */
  info(bs: Record<string, unknown>, round: number, rounds: number): BoardInfoLine[];
  /** "am Hafenweg" etc. for a space. */
  where(node: BNode): string;
  /** Plus fields give double coins (e.g. Neonnacht). */
  plusFactor(bs: Record<string, unknown>): number;
  /** Builds the decoration (landmarks, gimmick meshes) into the board scene. */
  decor(kit: BoardKit): BoardDecor;
}

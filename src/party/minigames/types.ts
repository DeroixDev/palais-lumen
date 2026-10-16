// The minigame interface. One minigame = one file exporting a MinigameDef. The framework
// (./flow.ts) runs the intro card, practice, ready check, countdown, play, results and coins,
// solo and online alike: the host runs `init`/`step`/`bot`/`result`, guests only run `view`
// on interpolated snapshots of the state. Rules for writing one: ./README.md.

import type { BotLevel, Feat, MgType } from '../types';
import type { THREE } from '../view3d/kit';

/** One participant as the minigame sees it (index = position in `setup.players`). */
export interface MgPlayer {
  seat: number;
  name: string;
  color: string;
  acc: string;
  feat: Feat;
  /** Team number: in 1v3 the single player is team 0, in 2v2 teams 0 and 1, in FFA everybody has their own. */
  team: number;
  /** Bot level, or null for a person (who may be on another screen). */
  bot: BotLevel | null;
}

export interface MgSetup {
  players: MgPlayer[];
  /** demo = behind the intro card (all bots), practice = no score, play = counts. */
  mode: 'demo' | 'practice' | 'play';
  seed: number;
  type: MgType;
}

/** Controller state of one player for one simulation step. */
export interface MgInput {
  /** Stick / WASD / arrows, -1..1 (y: up is -1). */
  x: number;
  y: number;
  /** Buttons held. A = Leertaste / ↑ / big touch button; B = Shift / second touch button. */
  a: boolean;
  b: boolean;
  /** Pressed since the last step (edges never get lost, also online). */
  aP: boolean;
  bP: boolean;
  /** Left / right taps (← / → or A / D), for games with two-key rhythm or toggles. */
  lP: boolean;
  rP: boolean;
}
export const NO_INPUT: MgInput = { x: 0, y: 0, a: false, b: false, aP: false, bP: false, lP: false, rP: false };

/** A one-shot effect the simulation reports (sound, floating text): the view plays it. */
export interface MgFx { k: string; x?: number; y?: number; z?: number; p?: number; v?: number; text?: string; col?: string }

export interface MgCtx {
  setup: MgSetup;
  /** Seeded random numbers (host side). */
  rng(): number;
  /** Seconds since "Los!". */
  time: number;
  fx(e: MgFx): void;
}

export interface MgRow {
  /** Index into setup.players. */
  i: number;
  win: boolean;
  coins: number;
  note: string;
  /** For sorting the result list (higher first). */
  score: number;
}
export interface MgResult { rows: MgRow[]; title: string }

export interface TouchButton { key: 'a' | 'b' | 'l' | 'r'; label: string; small?: boolean }
export interface TouchLayout { joy: boolean; buttons: TouchButton[] }

export interface MgCard {
  /** One sentence: what to do. */
  sub: string;
  rules(setup: MgSetup): string[];
  /** Controls for the given player (by index), keyboard and touch; `me` may be -1 (spectator). */
  controls(setup: MgSetup, me: number): { keys: string; touch: string };
  touch(setup: MgSetup, me: number): TouchLayout;
  /** Optional energy bar for this player (label, e.g. "Turbo"); the view fills #turboFill. */
  meter?(setup: MgSetup, me: number): string | null;
}

export interface MgView<S> {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  /** Draw the state. `me` is the local player index (-1 = watching). Called every frame. */
  frame(s: S, dt: number, t: number, me: number): void;
  /** Play effects reported by the simulation. */
  fx(e: MgFx, me: number): void;
  /** Winners jump, the others slump. */
  celebrate(win: boolean[] | null): void;
  /** Optional HUD values per player (score chips). */
  dispose?(): void;
}

export interface MinigameDef<S = unknown> {
  id: string;
  name: string;
  type: MgType;
  /** Münz-Minispiel: everybody keeps what they collect. */
  coin?: boolean;
  /** Length of a round (seconds). Practice is 20 s at most. */
  seconds: number;
  /** Players it supports (default 2..4; 1v3 also runs as 1 vs 2 or 1 vs 1). */
  players?: [number, number];
  /** Fit for Profi rules (no pure luck). */
  pro: boolean;
  /** "Online gut" or "mit Vorhersage". */
  online: 'gut' | 'ok';
  card: MgCard;
  /** Fresh state (plain JSON-able object: it is sent to friends ~20 times a second). */
  init(ctx: MgCtx): S;
  /** Advance the simulation (host only). */
  step(s: S, dt: number, inputs: MgInput[], ctx: MgCtx): void;
  /** Bot controller for player i. */
  bot(s: S, i: number, ctx: MgCtx): MgInput;
  /** Over before the time is up? */
  over?(s: S, ctx: MgCtx): boolean;
  result(s: S, ctx: MgCtx): MgResult;
  /** Live score chip per player (short text) and whether they are out. */
  score(s: S, i: number): { v: string; out?: boolean };
  view(setup: MgSetup): MgView<S>;
}

/** Standard coins: winners +10 (Münz-Minispiele add what was collected). */
export const WIN_COINS = 10;

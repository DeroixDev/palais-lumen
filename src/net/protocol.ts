// Messages between the host and the friends at the table. Everything is plain JSON.
//
// The host's game is the authority: it owns the save and the shared account. A friend's game
// plays its rounds itself, but every change to money and progress goes to the host as an Op;
// the host applies it, and its state broadcast (with the last Op it has applied for each
// friend) brings every client back to the same account.

import type { EveningResult, PlayerProfile, RoundReport, SaveData } from '../core/state';

/** Bump when the messages change; host and friends must speak the same version. */
export const PROTOCOL = 1;

/** Up to four at the table: the host and three friends (the four seats at the reception). */
export const MAX_PLAYERS = 4;

/** Where a player is and what they do: room, feet position, visibility, the game they play. */
export interface Pose {
  r: string;
  x: number;
  y: number;
  /** Alpha of the figure (fades in the elevator and at the door). */
  a: number;
  /** Game id while at a machine, else null. */
  at: string | null;
}

/** One change a friend's game asks the host to make. */
export type Op =
  | { k: 'bet'; a: number }
  | { k: 'pay'; a: number }
  | { k: 'report'; r: RoundReport; room: string }
  | { k: 'ctr'; key: string; by: number }
  | { k: 'wish' }
  | { k: 'buyItem'; id: string }
  | { k: 'buyCharm'; id: string }
  | { k: 'profile'; p: PlayerProfile }
  | { k: 'lamp'; id: string; n: number }
  | { k: 'quest'; id: string }
  /** A machine or the boss duel finished the day (the host settles it). */
  | { k: 'endDay' };

/** A player's share of the day, for the recap ("Wer hat den Abend gerettet?"). */
export interface TeamLine {
  id: string;
  name: string;
  color: number;
  rounds: number;
  /** Won minus staked today. */
  net: number;
}

export type ToHost =
  | { t: 'hello'; v: number; id: string; profile: PlayerProfile }
  | { t: 'op'; s: number; op: Op }
  | { t: 'pose'; p: Pose }
  | { t: 'emote'; e: string }
  | { t: 'ready'; n: number }
  | { t: 'bye' };

export type ToGuest =
  | { t: 'welcome'; you: string; data: SaveData; online: string[]; poses: Record<string, Pose> }
  | { t: 'reject'; reason: 'full' | 'version' }
  | { t: 'state'; data: SaveData; ack: Record<string, number> }
  | { t: 'online'; ids: string[] }
  | { t: 'pose'; id: string; p: Pose }
  | { t: 'emote'; id: string; e: string }
  | { t: 'toast'; text: string; cls?: string }
  | { t: 'feed'; id: string; game: string; win: number; mult: number }
  | { t: 'deny'; s: number }
  /** The host ends the day: finish your round and step out of the game. */
  | { t: 'dayEnd'; n: number }
  | { t: 'recap'; result: EveningResult; team: TeamLine[] }
  | { t: 'close'; reason: 'host' };

/** Quick reactions: shown as a bubble over the figure (or as a toast where it can't be seen). */
export const EMOTES = ['👏', '😮', '🎉', '🍀'] as const;

/** Short preset lines (no free text). */
export const LINES = ['Glückwunsch!', 'Noch eine Runde?', 'Komm mal rüber!', 'Ich fahr hoch.', 'Gleich Feierabend?', 'Das war knapp!'] as const;

export const isEmote = (e: string) => (EMOTES as readonly string[]).includes(e) || (LINES as readonly string[]).includes(e);

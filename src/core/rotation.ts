// Daily rotation: every day each floor puts a different mix of games on its spots, in a
// different order. The room files only say where machines and tables can stand; which game
// stands there is drawn here from all registered games, seeded by season + day, so a reload
// shows the same casino and the next day a new one.

import { allGames, getGame, setStationResolver, type GameDefinition, type RoomDefinition, type StationPlacement } from './registry';
import type { GameState } from './state';

/** Small seeded generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shuffle<T>(list: T[], rand: () => number) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  options: Record<string, unknown>;
}

/** Spots of a room, grouped: a bank of machines side by side is one group, every table its own. */
function groupsOf(def: RoomDefinition): { size: 'cabinet' | 'table'; spots: Spot[] }[] {
  const spots = def.stations.map((st) => {
    const g = getGame(st.game);
    return { size: g.size, spot: { x: st.x, y: st.y, w: g.footprint.w, h: g.footprint.h, options: st.options ?? {} } };
  });
  const groups: { size: 'cabinet' | 'table'; spots: Spot[] }[] = [];
  const cabinets = spots.filter((s) => s.size === 'cabinet').map((s) => s.spot);
  cabinets.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const c of cabinets) {
    const last = groups[groups.length - 1];
    const prev = last?.spots[last.spots.length - 1];
    if (last && last.size === 'cabinet' && prev && Math.abs(prev.y - c.y) < 12 && c.x - prev.x <= 100) last.spots.push(c);
    else groups.push({ size: 'cabinet', spots: [c] });
  }
  for (const s of spots) if (s.size === 'table') groups.push({ size: 'table', spots: [s.spot] });
  return groups;
}

const SLOT_THEMES = ['classic', 'diamond', 'gold'];

/** Today's games for a room, placed on its spots. */
export function todaysStations(def: RoomDefinition, season: number, day: number, salt: number): StationPlacement[] {
  if (!def.stations.length) return def.stations;
  const rand = rng(hash(`${season}:${day}:${salt}:${def.id}`));
  const pools: Record<'cabinet' | 'table', GameDefinition[]> = {
    cabinet: shuffle(allGames().filter((g) => g.size === 'cabinet'), rand),
    table: shuffle(allGames().filter((g) => g.size === 'table'), rand),
  };
  const next: Record<'cabinet' | 'table', number> = { cabinet: 0, table: 0 };
  const out: StationPlacement[] = [];
  for (const group of shuffle(groupsOf(def), rand)) {
    const pool = pools[group.size];
    if (!pool.length) continue;
    // Distinct games until the pool runs out, then round again.
    const game = pool[next[group.size]++ % pool.length];
    const options: Record<string, unknown> = game.id === 'slots' ? { theme: SLOT_THEMES[Math.floor(rand() * SLOT_THEMES.length)] } : {};
    for (const s of group.spots) {
      out.push({
        game: game.id,
        // Centre a smaller machine on the spot, standing on the same floor line.
        x: Math.round(s.x + (s.w - game.footprint.w) / 2),
        y: Math.round(s.y + s.h - game.footprint.h),
        label: game.name,
        options,
      });
    }
  }
  return out;
}

/** Hooks the rotation into the room registry. Rooms follow the current season and day. */
export function installRotation(state: GameState) {
  const d = () => state.data;
  setStationResolver(
    (def) => todaysStations(def, d().season.number, d().evening.number, d().counters.rotSalt ?? 0),
    () => `${d().season.number}:${d().evening.number}:${d().counters.rotSalt ?? 0}`,
  );
}

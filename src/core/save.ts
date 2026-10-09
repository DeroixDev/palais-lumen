// Save slots on the host. In the browser they live in localStorage; a desktop build
// can swap `storage` for real files without touching the rest of the game.

import { SAVE_VERSION, newSave, type SaveData } from './state';

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const MANUAL_SLOTS: SlotId[] = ['slot1', 'slot2', 'slot3'];

const PREFIX = 'nachtfalter.save.';

export interface SlotInfo {
  id: SlotId;
  data: SaveData | null;
}

interface Storage {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

const storage: Storage = {
  read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage blocked or full: the game keeps running, the save just isn't kept */
    }
  },
};

/** Fills in fields that older saves don't have yet. */
export function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<SaveData>;
  if (typeof d.balance !== 'number' || !Number.isFinite(d.balance)) return null;
  const base = newSave();
  const merged: SaveData = {
    ...base,
    ...d,
    evening: { ...base.evening, ...d.evening },
    stats: { ...base.stats, ...d.stats },
    medals: { ...base.medals, ...d.medals },
    position: { ...base.position, ...d.position },
    players: { ...base.players, ...d.players },
    unlockedRooms: Array.isArray(d.unlockedRooms) ? d.unlockedRooms : base.unlockedRooms,
    trophies: Array.isArray(d.trophies) ? d.trophies : [],
    version: SAVE_VERSION,
  };
  merged.balance = Math.max(0, Math.floor(merged.balance));
  return merged;
}

function parse(json: string | null): SaveData | null {
  if (!json) return null;
  try {
    return migrate(JSON.parse(json));
  } catch {
    return null;
  }
}

export function readSlot(id: SlotId): SaveData | null {
  // Fall back to the backup if the main entry is damaged.
  return parse(storage.read(PREFIX + id)) ?? parse(storage.read(PREFIX + id + '.bak'));
}

export function writeSlot(id: SlotId, data: SaveData) {
  data.savedAt = Date.now();
  const prev = storage.read(PREFIX + id);
  if (prev) storage.write(PREFIX + id + '.bak', prev);
  storage.write(PREFIX + id, JSON.stringify(data));
}

export function listSlots(): SlotInfo[] {
  return (['auto', ...MANUAL_SLOTS] as SlotId[]).map((id) => ({ id, data: readSlot(id) }));
}

export function latestSave(): SaveData | null {
  const all = listSlots()
    .map((s) => s.data)
    .filter((d): d is SaveData => !!d);
  all.sort((a, b) => b.savedAt - a.savedAt);
  return all[0] ?? null;
}

/** A save as a copyable text code, for moving it to another browser or PC. */
export function exportCode(data: SaveData): string {
  const json = JSON.stringify(data);
  return 'NF1:' + btoa(unescape(encodeURIComponent(json)));
}

export function importCode(code: string): SaveData | null {
  const trimmed = code.trim();
  try {
    if (trimmed.startsWith('NF1:')) {
      return migrate(JSON.parse(decodeURIComponent(escape(atob(trimmed.slice(4))))));
    }
    return migrate(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

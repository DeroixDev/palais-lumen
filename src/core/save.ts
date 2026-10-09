// Save slots on the host. In the browser they live in localStorage; a desktop build
// can swap `storage` for real files without touching the rest of the game.

import { BOSS_DAY, SAVE_VERSION, newSave, quotaFor, type SaveData } from './state';

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
    season: { ...base.season, ...d.season },
    records: { ...base.records, ...d.records },
    unlockedRooms: Array.isArray(d.unlockedRooms) ? d.unlockedRooms : base.unlockedRooms,
    trophies: Array.isArray(d.trophies) ? d.trophies : [],
    owned: Array.isArray(d.owned) ? d.owned : [],
    charms: Array.isArray(d.charms) ? d.charms : [],
    achievements: { ...d.achievements },
    counters: { ...d.counters },
    moonstones: typeof d.moonstones === 'number' ? d.moonstones : 0,
    quests: Array.isArray(d.quests) ? d.quests : [],
    stamps: { ...d.stamps },
    stampRewards: Array.isArray(d.stampRewards) ? d.stampRewards : [],
    perks: Array.isArray(d.perks) ? d.perks : [],
    draft: Array.isArray(d.draft) ? d.draft : null,
    history: Array.isArray(d.history) && d.history.length ? d.history : [d.balance],
    settings: { ...base.settings, ...d.settings },
    version: SAVE_VERSION,
  };
  merged.balance = Math.max(0, Math.floor(merged.balance));
  // Version 2 introduced seasons with a goal that rises every evening.
  // Version 3: five floors instead of lobby + VIP room; the goal curve changed too.
  if ((d.version ?? 1) < 3) {
    merged.evening.number = Math.min(merged.evening.number, BOSS_DAY);
    merged.roomId = 'f1';
    merged.position = { x: -1, y: -1 };
    merged.unlockedRooms = ['f1'];
  }
  // Version 4: the foyer between days. Old saves start there.
  if ((d.version ?? 1) < 4) {
    merged.roomId = 'foyer';
    merged.position = { x: -1, y: -1 };
  }
  // Version 5: the goal grows with the money the day started with.
  if ((d.version ?? 1) < 5) merged.evening.quota = quotaFor(merged.evening.number, merged.evening.startBalance, merged.charms);
  merged.evening.startBalance = Math.max(0, Math.floor(merged.evening.startBalance));
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

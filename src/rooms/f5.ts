import type { DecorPlacement, RoomDefinition, StationPlacement } from '../core/registry';
import { CORRIDOR } from '../core/bossRun';

import { BOSS_CORRIDOR, BOSS_NAME, FLOOR_NAMES } from '../core/brand';
/**
 * Floor 5, the boss: a long, low corridor to the Kuppel. You walk right; one machine at a time
 * stands in the way and gets exactly one try, a light lock (Lichtschleuse) opens behind it, and
 * at the far end Selene waits under the moon lamp for the duel (src/core/bossRun.ts,
 * src/world/bossRun.ts). Over each machine hangs a lamp from one era of light, the journey up
 * the house once more: candle, moon lantern, gas, neon and the moon lamp itself.
 * The spots alternate machine and table; the daily rotation puts a different game on each
 * (seeded by season and day, so a reload shows the same corridor).
 */
const { width: W, height: H, machines, gates, throne } = CORRIDOR;

const stations: StationPlacement[] = machines.map((x, i) =>
  i % 2 === 0
    ? { game: 'coin', x: x - 38, y: 196 } // a machine spot (76 × 64)
    : { game: 'roulette', x: x - 75, y: 190 }, // a table spot (150 × 84)
);

const decor: DecorPlacement[] = [];
// Banners and sconces along the back wall, closer together towards the Kuppel (the hall under
// the dome keeps its wall for the vault).
for (let x = 300; x < 3860; x += x < 3300 ? 160 : 110) {
  if (machines.some((m) => Math.abs(m - x) < 90) || gates.some((g) => Math.abs(g - 75 - x) < 75) || Math.abs(x - 150) < 110) continue;
  decor.push({ kind: x % 320 < 160 ? 'banner' : 'sconce', x, y: 0, w: x > 3800 ? 50 : 40 });
}
// The lamp of its era over each machine.
machines.forEach((m, i) => decor.push({ kind: 'eraLamp', x: m, y: 0, r: i }));
// Braziers and golden light-bearer statues guard each light lock, on the back and front edge
// of the floor (clear of the lock's slanted line, from about g - 80 at the back to g + 80 at the front).
for (const g of gates) {
  decor.push({ kind: 'brazier', x: g - 130, y: 214 }, { kind: 'brazier', x: g - 60, y: 572 });
  decor.push({ kind: 'statue', x: g + 150, y: 578 });
}
// Pillars along the front edge between the machines.
for (const m of machines) decor.push({ kind: 'pillar', x: m + 150, y: 586 });
// The hall under the Kuppel: the vault with the moon lamp, a rosette in the floor beneath it.
decor.push(
  { kind: 'domeVault', x: throne.x, y: 0, w: 400 },
  { kind: 'domeFloor', x: throne.x + 10, y: 506, w: 440, h: 160 },
  { kind: 'throne', x: throne.x, y: throne.y },
  { kind: 'brazier', x: throne.x - 190, y: 470 },
  { kind: 'brazier', x: throne.x + 190, y: 470 },
  { kind: 'pillar', x: 3900, y: 226 },
  { kind: 'pillar', x: 4340, y: 226 },
  { kind: 'pillar', x: 4340, y: 586 },
  { kind: 'statue', x: 4260, y: 578 },
);

export const f5: RoomDefinition = {
  id: 'f5',
  name: BOSS_CORRIDOR,
  tagline: `Ein Gang, ein Versuch pro Automat. Unter der Kuppel wartet ${BOSS_NAME}.`,
  floor: 5,
  corridor: true,
  elevatorX: 150,
  sign: FLOOR_NAMES.f5.toLocaleUpperCase('de-DE'),
  width: W,
  height: H,
  theme: {
    style: 'throne',
    carpet: 0x0e1430,
    carpetPattern: 0x5e1628,
    carpetAccent: 0xe0b25a,
    wall: 0x0c1230,
    wallTrim: 0xe0b25a,
    neon: 0xbcd0ff,
    light: 0xffcf8a,
    accent: 0x6b1a2e,
    sofa: 0x1e2a5e,
    curtain: 0x24346e,
  },
  spawn: { x: 150, y: 260 },
  stations,
  decor,
};

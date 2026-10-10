// "Spielplan des Tages": which games stand on which floor today (src/core/rotation.ts), what
// is new compared with yesterday, and the compact strip that hangs under the day card.

import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { COLORS, FONT_BODY } from '../core/fx';
import { allRooms, baseRoom, getGame, type RoomDefinition } from '../core/registry';
import { todaysStations } from '../core/rotation';
import type { GameState } from '../core/state';
import { fillInk, paint, rrect } from '../world/painted/brush';
import { gameIcon } from './gameIcons';

/** Distinct game ids of a room, in the order its stations are listed. */
export function gamesIn(def: RoomDefinition) {
  const out: string[] = [];
  for (const st of def.stations) if (!out.includes(st.game)) out.push(st.game);
  return out;
}

/** Ids that stood on this floor yesterday (empty on day 1). */
export function gamesYesterday(state: GameState, roomId: string) {
  const d = state.data;
  if (d.evening.number <= 1) return null;
  const st = todaysStations(baseRoom(roomId), d.season.number, d.evening.number - 1, d.counters.rotSalt ?? 0);
  return new Set(st.map((s) => s.game));
}

/** Today's games on a floor, each marked new if it was not on that floor yesterday. */
export function floorPlan(state: GameState, def: RoomDefinition) {
  const y = gamesYesterday(state, def.id);
  return gamesIn(def).map((id) => ({ id, isNew: !!y && !y.has(id) }));
}

/** Floors (1–5) where a game stands today. */
export function floorsOf(id: string) {
  return allRooms()
    .filter((r) => r.floor > 0 && r.stations.some((s) => s.game === id))
    .map((r) => r.floor)
    .filter((f, i, a) => a.indexOf(f) === i)
    .sort((a, b) => a - b);
}

const texCache = new Map<string, Texture>();
function cached(key: string, make: () => Texture) {
  let t = texCache.get(key);
  if (!t) texCache.set(key, (t = make()));
  return t;
}

/** Dark velvet ribbon with a brass hairline. */
function stripTexture(w: number, h: number) {
  return cached(`sched-${w}x${h}`, () =>
    paint(w + 8, h + 10, (c) => {
      c.translate(4, 3);
      rrect(c, 1, 4, w - 2, h, 14);
      c.fillStyle = 'rgba(6,2,8,0.45)';
      c.fill();
      rrect(c, 0, 0, w, h, 14);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(48,18,40,0.95)');
      g.addColorStop(1, 'rgba(18,8,16,0.95)');
      fillInk(c, g, 1.6);
      rrect(c, 3, 3, w - 6, h - 6, 11);
      c.strokeStyle = 'rgba(224,178,90,0.55)';
      c.lineWidth = 1.2;
      c.stroke();
    }, 2),
  );
}

/** Little pink "NEU" pill ("neu heute": not on this floor yesterday). */
export function newBadge(size = 15, text = 'NEU') {
  const c = new Container();
  const t = new Text({ text, style: { fontFamily: FONT_BODY, fontWeight: '700', fontSize: size, fill: 0xfff6e6, letterSpacing: 1 } });
  t.anchor.set(0.5);
  const w = Math.round(t.width + 12);
  const h = Math.round(size + 6);
  const bg = new Sprite(
    cached(`newpill-${w}x${h}`, () =>
      paint(w + 4, h + 4, (c2) => {
        rrect(c2, 2, 2, w, h, h / 2);
        const g = c2.createLinearGradient(0, 2, 0, h + 2);
        g.addColorStop(0, '#ff7ab4');
        g.addColorStop(1, '#c8245a');
        fillInk(c2, g, 1.4);
      }, 2),
    ),
  );
  bg.anchor.set(0.5);
  c.addChild(bg, t);
  return c;
}

/**
 * The strip under the day card: today's games on this floor as small medallions with their
 * names, "NEU" on the ones that weren't here yesterday. Null on the foyer or an empty floor.
 */
export function scheduleStrip(state: GameState, def: RoomDefinition, screenW: number) {
  if (def.floor <= 0) return null;
  const plan = floorPlan(state, def);
  if (!plan.length) return null;
  const c = new Container();
  const colW = 96;
  const maxW = Math.min(620, screenW - 24);
  const perRow = Math.max(3, Math.min(plan.length, Math.floor((maxW - 24) / colW)));
  const rows = Math.ceil(plan.length / perRow);
  const w = Math.max(300, perRow * colW + 28);
  const head = new Text({ text: `SPIELPLAN HEUTE · ETAGE ${def.floor}`, style: { fontFamily: FONT_BODY, fontWeight: '700', fontSize: 19, fill: COLORS.lamp, letterSpacing: 2 } });
  head.anchor.set(0.5, 0);
  head.position.set(0, 10);
  if (head.width > w - 24) head.scale.set((w - 24) / head.width);
  const rowH = 74;
  const h = 40 + rows * rowH + 4;
  const bg = new Sprite(stripTexture(w, h));
  bg.position.set(-w / 2 - 4, -3);
  c.addChild(bg, head);
  plan.forEach((g, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, plan.length - row * perRow);
    const x = ((i % perRow) - (inRow - 1) / 2) * colW;
    const y = 40 + row * rowH;
    const ic = gameIcon(g.id, 40);
    ic.position.set(x, y + 22);
    const name = new Text({ text: getGame(g.id).name, style: { fontFamily: FONT_BODY, fontWeight: '700', fontSize: 16, fill: 0xf2e6c9 } });
    name.anchor.set(0.5, 0);
    name.position.set(x, y + 46);
    if (name.width > colW - 6) name.scale.set((colW - 6) / name.width);
    c.addChild(ic, name);
    if (g.isNew) {
      const b = newBadge(13);
      b.position.set(x + 24, y + 6);
      c.addChild(b);
    }
  });
  return c;
}

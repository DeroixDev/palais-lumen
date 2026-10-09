// The programme panel, opened at the easel in the foyer: every game of the house with its
// line, its house edge and where it stands today (src/core/rotation.ts), or that it is
// closed or not in the house today.

import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { FONT_BODY } from '../core/fx';
import { allGames, allRooms, mainRoomOf } from '../core/registry';
import { closedGames } from '../core/events';
import type { GameState } from '../core/state';
import { fillInk, paint, rrect } from '../world/painted/brush';
import { gameIcon } from './gameIcons';
import { floorOpensOnDay } from './elevator';
import { floorPlan, floorsOf, newBadge } from './schedule';
import { CREAM, MUTED } from './kit';
import { Panel } from './panel';

const pct = (x: number) => (x * 100).toFixed(1).replace('.', ',');

/** Lines for the first four games, which were written before games carried a blurb. */
const BLURB: Record<string, string> = {
  slots: 'Drei Walzen, acht Gewinnlinien und die Motte als Joker.',
  roulette: 'Die Kugel läuft: Zahl, Farbe, Dutzend oder Kolonne.',
  plinko: 'Eine leuchtende Motte fällt durch die Laternen in die Becher.',
  crash: 'Die Motte fliegt zum Mond – kassier, bevor sie abstürzt.',
};

const texCache = new Map<string, Texture>();
function rowTexture(w: number, h: number, lit: boolean) {
  const key = `${w}x${h}-${lit}`;
  let t = texCache.get(key);
  if (!t) {
    t = paint(w + 4, h + 4, (c) => {
      c.translate(2, 2);
      rrect(c, 0, 0, w, h, 14);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, lit ? 'rgba(70,30,52,0.9)' : 'rgba(30,14,24,0.8)');
      g.addColorStop(1, lit ? 'rgba(34,12,26,0.9)' : 'rgba(16,8,14,0.8)');
      fillInk(c, g, 1.4);
      rrect(c, 3, 3, w - 6, h - 6, 11);
      c.strokeStyle = lit ? 'rgba(224,178,90,0.5)' : 'rgba(224,178,90,0.18)';
      c.lineWidth = 1;
      c.stroke();
    }, 2);
    texCache.set(key, t);
  }
  return t;
}

interface Entry {
  id: string;
  name: string;
  blurb: string;
  edge: number;
  floors: number[];
  closed: boolean;
  isNew: boolean;
}

export class ProgramPanel extends Panel {
  private page = 0;

  constructor(
    private state: GameState,
    private onClose: () => void,
  ) {
    super();
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') this.onClose();
  };

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    super.destroy();
  }

  private entries(): Entry[] {
    const d = this.state.data;
    const closed = closedGames(d);
    const fresh = new Set<string>();
    for (const r of allRooms()) if (r.floor > 0) for (const g of floorPlan(this.state, r)) if (g.isNew) fresh.add(g.id);
    const list = allGames().filter((g) => !g.boss).map((g) => ({
      id: g.id,
      name: g.name,
      blurb: g.blurb ?? BLURB[g.id] ?? '',
      edge: g.houseEdge,
      floors: floorsOf(g.id),
      closed: closed.includes(g.id),
      isNew: fresh.has(g.id),
    }));
    // Today's games first, by floor, then the ones resting today.
    const key = (e: Entry) => (e.floors.length ? e.floors[0] : 99);
    return list.sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name, 'de'));
  }

  protected build() {
    const n = this.narrow;
    const all = this.entries();
    const per = n ? 7 : all.length;
    const pages = Math.max(1, Math.ceil(all.length / per));
    this.page = Math.min(this.page, pages - 1);
    const list = all.slice(this.page * per, this.page * per + per);
    const cols = n ? 1 : 2;
    const cw = n ? 372 : 440;
    const rh = n ? 84 : 76;
    const gap = 8;
    const rows = Math.ceil(list.length / cols);
    const top = n ? (pages > 1 ? 172 : 116) : 100;
    this.W = cols * cw + (cols - 1) * 16 + (n ? 32 : 72);
    this.H = top + Math.max(1, n ? per : rows) * (rh + gap) + (n ? 18 : 24);
    this.frame('PROGRAMM', 0x5fe3ff, this.onClose);
    const inHouse = all.filter((e) => e.floors.length).length;
    const intro = this.text(`Heute im Haus: ${inHouse} von ${all.length} Spielen.${n ? '\n' : ' '}Jeden Tag stellt sich das Haus neu auf.`, n ? 17 : 18, MUTED);
    intro.style.align = 'center';
    intro.anchor.set(0.5, 0);
    intro.position.set(this.W / 2, n ? 60 : 52);
    if (intro.width > this.W - 60) intro.scale.set((this.W - 60) / intro.width);
    this.panel.addChild(intro);
    if (n && pages > 1) {
      // Page tabs under the intro.
      const labels = Array.from({ length: pages }, (_, i) => `${i * per + 1}–${Math.min(all.length, (i + 1) * per)}`);
      this.tabs(labels, this.page, 126, (i) => {
        this.page = i;
        this.rebuild();
      }, pages, 104);
    }
    const x0 = (this.W - (cols * cw + (cols - 1) * 16)) / 2;
    const items: Container[] = [];
    const top5 = this.state.topFloor;
    list.forEach((e, i) => {
      const col = n ? 0 : Math.floor(i / rows);
      const row = n ? i : i % rows;
      const c = this.entry(e, cw, rh, top5);
      c.position.set(x0 + col * (cw + 16), top + row * (rh + gap));
      this.panel.addChild(c);
      items.push(c);
    });
    this.popIn(items);
  }

  private entry(e: Entry, w: number, h: number, topFloor: number) {
    const c = new Container();
    const here = e.floors.length > 0 && !e.closed;
    const bg = new Sprite(rowTexture(w, h, here));
    bg.position.set(-2, -2);
    c.addChild(bg);
    const ic = gameIcon(e.id, 48);
    ic.position.set(34, h / 2);
    if (!here) ic.alpha = 0.55;
    c.addChild(ic);
    const tx = 68;
    const edge = new Text({ text: `Hausvorteil ${pct(e.edge)} %`, style: { fontFamily: FONT_BODY, fontSize: 16, fontWeight: '600', fill: MUTED } });
    edge.anchor.set(1, 0);
    edge.position.set(w - 14, 9);
    const name = new Text({ text: e.name, style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: here ? CREAM : 0xb8a684 } });
    name.position.set(tx, 5);
    const maxName = w - 14 - edge.width - 12 - tx - (e.isNew ? 92 : 0);
    if (name.width > maxName) name.scale.set(maxName / name.width);
    c.addChild(edge, name);
    if (e.isNew) {
      const b = newBadge(13, 'NEU HEUTE');
      b.position.set(tx + name.width + 8 + b.width / 2, 19);
      c.addChild(b);
    }
    const blurb = new Text({ text: e.blurb, style: { fontFamily: FONT_BODY, fontSize: 16, fontWeight: '500', fill: 0xe6d6b4 } });
    blurb.position.set(tx, h / 2 - 9);
    if (blurb.width > w - tx - 14) blurb.scale.set((w - tx - 14) / blurb.width);
    // Where it stands today.
    let where: string;
    let col: number;
    if (!e.floors.length) {
      where = 'Heute nicht im Haus';
      col = 0x9a8a78;
    } else {
      const names = e.floors.map((f) => (mainRoomOf(f)?.name ?? `Etage ${f}`));
      const floors = e.floors.length === 1 ? `Etage ${e.floors[0]} · ${names[0]}` : `Etagen ${e.floors.join(', ')}`;
      const locked = e.floors.every((f) => f > topFloor);
      if (e.closed) {
        where = `Heute geschlossen (${floors})`;
        col = 0xff7a7a;
      } else if (locked) {
        where = `Heute: ${floors} · ab Tag ${floorOpensOnDay(Math.min(...e.floors))}`;
        col = 0xe0b25a;
      } else {
        where = `Heute: ${floors}`;
        col = 0x9ae08a;
      }
    }
    const wt = new Text({ text: where, style: { fontFamily: FONT_BODY, fontSize: 16, fontWeight: '700', fill: col } });
    wt.position.set(tx, h - 27);
    if (wt.width > w - tx - 14) wt.scale.set((w - tx - 14) / wt.width);
    c.addChild(blurb, wt);
    return c;
  }
}

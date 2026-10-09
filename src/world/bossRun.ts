// The boss corridor's own pieces in the room (floor 5): a moth-wing gate after every machine
// (a wall the player can't pass until that machine had its one try), a brass plaque at each
// machine ("Automat 2 von 5 · Ein Versuch"), a wax seal on spent machines, a light over the
// machine that is up next, a shadow that deepens towards the throne, and the Queen's challenge.
// Built by RoomScene for a room with `corridor: true`; the flow is in src/ui/bossRun.ts.

import { Container, Sprite, type Texture } from 'pixi.js';
import { glowTexture, reducedMotion } from '../core/fx';
import type { RoomDefinition, StationPlacement } from '../core/registry';
import type { GameState } from '../core/state';
import { CORRIDOR, MACHINES, corridorMachines, gateOpen, machineIndex, spentCount } from '../core/bossRun';
import { getGame } from '../core/registry';
import { animate, ease } from '../core/tween';
import { sfx } from '../core/audio';
import { ellipse, fillInk, glowAt, gold, paint, rrect, seeded, shadow } from './painted/brush';
import { mothEmblem, paintWing } from './painted/propsCrystal';
import type { Rect } from './decor';
import type { ExtraInteractable } from './roomExtras';
import { WALL_H } from './styles';

export interface CorridorHost {
  world: Container;
  entities: Container;
  lights: Container;
  fx: Container;
  interactables: { kind: string; x: number; y: number }[];
  obstacles: Rect[];
  player(): { x: number; y: number };
}

const BAR_H = 118;
const cache = new Map<string, Texture>();
const cached = (k: string, make: () => Texture) => cache.get(k) ?? (cache.set(k, make()), cache.get(k)!);

/** Iron grille along the gate line, back wall to front edge, with a purple veil behind it. */
function barsTexture(len: number) {
  return cached(`bars-${len}`, () =>
    paint(120, len + BAR_H + 20, (c) => {
      c.translate(60, BAR_H + 10);
      const top = -BAR_H;
      const bot = len;
      // A veil of purple moth light fills the gate.
      const vg = c.createLinearGradient(-34, 0, 34, 0);
      vg.addColorStop(0, 'rgba(120,50,170,0)');
      vg.addColorStop(0.3, 'rgba(150,80,210,0.32)');
      vg.addColorStop(0.5, 'rgba(210,160,255,0.42)');
      vg.addColorStop(0.7, 'rgba(150,80,210,0.32)');
      vg.addColorStop(1, 'rgba(120,50,170,0)');
      c.fillStyle = vg;
      c.fillRect(-34, top, 68, bot - top);
      const r = seeded(len);
      for (let i = 0; i < 26; i++) {
        const x = (r() - 0.5) * 44;
        const y0 = top + r() * (bot - top);
        c.beginPath();
        c.moveTo(x, y0);
        c.lineTo(x + (r() - 0.5) * 4, y0 + 30 + r() * 60);
        c.strokeStyle = `rgba(255,230,255,${0.12 + r() * 0.2})`;
        c.lineWidth = 1.2;
        c.stroke();
      }
      // Iron grille: two rails with rungs and a cross-hatch between them.
      c.save();
      c.beginPath();
      c.rect(-20, top, 40, bot - top);
      c.clip();
      for (let y = top - 40; y < bot; y += 26) {
        for (const d of [1, -1]) {
          c.beginPath();
          c.moveTo(-18, y);
          c.lineTo(18, y + d * 26);
          c.strokeStyle = '#2a2234';
          c.lineWidth = 3;
          c.stroke();
          c.strokeStyle = 'rgba(140,120,170,0.5)';
          c.lineWidth = 1;
          c.stroke();
        }
      }
      c.restore();
      for (let y = top + 8; y < bot; y += 52) {
        rrect(c, -20, y - 3, 40, 6, 2);
        fillInk(c, '#3a3044', 1.2);
      }
      for (const x of [-17, 17]) {
        const g = c.createLinearGradient(x - 4, 0, x + 4, 0);
        g.addColorStop(0, '#120c18');
        g.addColorStop(0.45, '#6a5a78');
        g.addColorStop(1, '#100a14');
        rrect(c, x - 4, top, 8, bot - top, 3);
        fillInk(c, g, 1.4);
        for (let y = top + 8; y < bot; y += 52) {
          ellipse(c, x, y, 2.6, 2.6);
          c.fillStyle = gold(c, x - 3, y - 3, x + 3, y + 3);
          c.fill();
        }
      }
      // Spikes into the floor slot at the front end.
      rrect(c, -22, bot - 4, 44, 10, 3);
      c.fillStyle = '#0a0410';
      c.fill();
    }),
  );
}

/** The wing seal on the gate: two moth wings around the Queen's crest. */
function wingTexture(side: number) {
  return cached(`gwing-${side}`, () =>
    paint(130, 200, (c) => {
      c.translate(side > 0 ? 6 : 124, 96);
      c.scale(side, 1);
      paintWing(c, false);
    }),
  );
}

function crestTexture() {
  return cached('gcrest', () =>
    paint(70, 70, (c) => {
      glowAt(c, 35, 35, 34, 34, 0xffcf7a, 0.45, 'lighter');
      c.translate(35, 35);
      mothEmblem(c, 30);
    }),
  );
}

/** Stone post with a gold cap; the gate's ends stand on these. */
function postTexture() {
  return cached('gpost', () =>
    paint(56, 130, (c) => {
      c.translate(28, 118);
      shadow(c, 0, 4, 24, 7, 0.5);
      rrect(c, -16, -100, 32, 102, 4);
      const g = c.createLinearGradient(-16, 0, 16, 0);
      g.addColorStop(0, '#1a1222');
      g.addColorStop(0.4, '#4a3a58');
      g.addColorStop(1, '#140c1a');
      fillInk(c, g, 2);
      rrect(c, -20, -112, 40, 14, 4);
      fillInk(c, gold(c, -20, -112, 20, -98), 1.6);
      ellipse(c, 0, -116, 9, 6);
      fillInk(c, gold(c, -9, -122, 9, -110), 1.4);
    }),
  );
}

/** "AUTOMAT 2 VON 5 · Ein Versuch. Wähle deinen Einsatz." on a brass easel. */
function plaqueTexture(i: number, name: string) {
  return cached(`plq-${i}-${name}`, () =>
    paint(190, 132, (c) => {
      c.translate(95, 126);
      shadow(c, 0, 0, 30, 6, 0.5);
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(s * 22, 0);
        c.lineTo(s * 8, -70);
        c.strokeStyle = '#2a1608';
        c.lineWidth = 4;
        c.stroke();
      }
      rrect(c, -90, -122, 180, 72, 8);
      fillInk(c, gold(c, -90, -122, 90, -50), 2.2);
      rrect(c, -83, -115, 166, 58, 5);
      const g = c.createLinearGradient(0, -115, 0, -57);
      g.addColorStop(0, '#3a0e3a');
      g.addColorStop(1, '#1a0620');
      c.fillStyle = g;
      c.fill();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#ffcf7a';
      c.font = '15px Bungee, Impact, sans-serif';
      c.fillText(`AUTOMAT ${i + 1} VON ${MACHINES}`, 0, -102);
      c.fillStyle = '#f2e6c9';
      c.font = '700 14px "Barlow Condensed", sans-serif';
      c.fillText(name, 0, -86);
      c.fillStyle = '#d9b8ff';
      c.font = '700 13px "Barlow Condensed", sans-serif';
      c.fillText('Ein Versuch. Wähle deinen Einsatz.', 0, -69);
    }),
  );
}

/** Red wax seal "GESPIELT" over a machine whose try is used. */
function sealTexture() {
  return cached('seal', () =>
    paint(96, 60, (c) => {
      const r = seeded(9);
      c.translate(48, 30);
      c.rotate(-0.12);
      c.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const rr = 40 + (r() - 0.5) * 6;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr * 0.55;
        if (k) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.closePath();
      const g = c.createRadialGradient(-8, -6, 2, 0, 0, 40);
      g.addColorStop(0, '#e04a5a');
      g.addColorStop(1, '#7a1020');
      fillInk(c, g, 1.8);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '700 17px "Barlow Condensed", sans-serif';
      c.fillStyle = '#ffe6d0';
      c.fillText('GESPIELT', 0, 1);
    }),
  );
}

/** Gold chevron over the machine that is up next. */
function arrowTexture() {
  return cached('arrow', () =>
    paint(60, 54, (c) => {
      glowAt(c, 30, 24, 30, 24, 0xffcf7a, 0.55, 'lighter');
      c.beginPath();
      c.moveTo(8, 8);
      c.lineTo(52, 8);
      c.lineTo(30, 46);
      c.closePath();
      fillInk(c, gold(c, 8, 8, 52, 46), 2.6);
    }),
  );
}

/** The corridor grows darker towards the throne (a thin gradient stretched over the floor). */
function shadeTexture() {
  return cached('shade', () =>
    paint(256, 4, (c) => {
      const g = c.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, 'rgba(6,0,12,0)');
      g.addColorStop(0.35, 'rgba(6,0,12,0.05)');
      g.addColorStop(0.75, 'rgba(6,0,12,0.3)');
      g.addColorStop(0.88, 'rgba(10,0,16,0.38)');
      g.addColorStop(1, 'rgba(10,0,16,0.2)');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 4);
    }, 1),
  );
}

interface Gate {
  i: number;
  x: number;
  rect: Rect;
  bars: Sprite;
  wingL: Sprite;
  wingR: Sprite;
  crest: Sprite;
  glow: Sprite;
  hints: ExtraInteractable[];
  sealY: number;
  /** Open state shown now; null before the first refresh. */
  open: boolean | null;
}

export class CorridorScene {
  private gates: Gate[] = [];
  private seals: Sprite[] = [];
  private beacon: Sprite;
  private arrow: Sprite;
  private queenSpot: ExtraInteractable;
  private time = 0;
  private dead = false;

  constructor(
    private state: GameState,
    private def: RoomDefinition,
    private host: CorridorHost,
  ) {
    const W = def.width;
    const H = def.height;
    const shade = new Sprite(shadeTexture());
    shade.position.set(0, WALL_H - 150);
    shade.width = W;
    shade.height = H - WALL_H + 150;
    shade.eventMode = 'none';
    host.world.addChildAt(shade, 1);

    const yTop = WALL_H + 8;
    const yBot = H - 26;
    const len = yBot - yTop;
    CORRIDOR.gates.forEach((gx, i) => {
      for (const [y, z] of [[yTop + 2, yTop + 2], [yBot + 8, yBot + 30]]) {
        const p = new Sprite(postTexture());
        p.anchor.set(0.5, 118 / 130);
        p.position.set(gx, y);
        p.zIndex = z;
        host.entities.addChild(p);
      }
      const bars = new Sprite(barsTexture(len));
      bars.anchor.set(0.5, (BAR_H + 10) / (len + BAR_H + 20));
      bars.position.set(gx, yTop);
      bars.zIndex = yBot + 1;
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.tint = 0xb06ad8;
      glow.blendMode = 'add';
      glow.position.set(gx, (yTop + yBot) / 2 - 60);
      glow.width = 160;
      glow.height = len;
      glow.alpha = 0.3;
      host.lights.addChild(glow);
      // The wing seal hangs halfway along the gate, high up.
      const sealY = (yTop + yBot) / 2 - 40;
      const wingL = new Sprite(wingTexture(-1));
      wingL.anchor.set(124 / 130, 96 / 200);
      wingL.position.set(gx - 4, sealY);
      wingL.scale.set(0.8);
      const wingR = new Sprite(wingTexture(1));
      wingR.anchor.set(6 / 130, 96 / 200);
      wingR.position.set(gx + 4, sealY);
      wingR.scale.set(0.8);
      const crest = new Sprite(crestTexture());
      crest.anchor.set(0.5);
      crest.position.set(gx, sealY);
      for (const s of [wingL, wingR, crest]) s.zIndex = yBot + 2;
      host.entities.addChild(bars, wingL, wingR, crest);
      const rect = { x: gx - 18, y: 0, w: 36, h: H };
      const hints: ExtraInteractable[] = [WALL_H + 70, WALL_H + 175, WALL_H + 280, WALL_H + 385].map((y) => ({ kind: 'extra', id: `gate:${i}`, x: gx - 48, y, title: 'Tor · erst den Automaten spielen' }));
      this.gates.push({ i, x: gx, rect, bars, wingL, wingR, crest, glow, hints, sealY, open: null });
    });

    // Plaques and seals at the machines.
    const machines = corridorMachines(def);
    machines.forEach((st, i) => {
      const g = getGame(st.game);
      const p = new Sprite(plaqueTexture(i, st.label ?? g.name));
      p.anchor.set(0.5, 126 / 132);
      p.position.set(st.x - 96, st.y + g.footprint.h + 6);
      p.zIndex = p.y;
      host.entities.addChild(p);
      const s = new Sprite(sealTexture());
      s.anchor.set(0.5);
      s.position.set(st.x + g.footprint.w / 2, st.y + g.footprint.h * 0.45);
      s.zIndex = st.y + g.footprint.h + 2;
      s.visible = false;
      host.entities.addChild(s);
      this.seals.push(s);
    });
    // Light over the machine that is up next.
    this.beacon = new Sprite(glowTexture());
    this.beacon.anchor.set(0.5);
    this.beacon.tint = 0xffcf7a;
    this.beacon.blendMode = 'add';
    this.beacon.width = 220;
    this.beacon.height = 260;
    host.lights.addChild(this.beacon);
    this.arrow = new Sprite(arrowTexture());
    this.arrow.anchor.set(0.5, 1);
    host.fx.addChild(this.arrow);
    const t = CORRIDOR.throne;
    this.queenSpot = { kind: 'extra', id: 'queen', x: t.x, y: t.y + 76, title: 'Die Königin herausfordern' };
    host.interactables.push(this.queenSpot);
    this.refresh();
    // A saved spot behind a closed gate or off the floor (an old save of the throne room): back to the start.
    const p = host.player() as { x: number; y: number; set?: (x: number, y: number) => void };
    const shut = this.gates.find((g) => !g.open);
    if (p.y > H - 40 || p.y < WALL_H + 20 || (shut && p.x > shut.x - 20)) {
      p.x = def.spawn.x;
      p.y = def.spawn.y;
    }
  }

  /** Puts gates, seals and the beacon in line with the save (no animation). */
  refresh() {
    for (const g of this.gates) this.setGate(g, gateOpen(this.state.data, g.i), false);
    this.placeMarks();
  }

  private placeMarks() {
    const n = spentCount(this.state.data);
    const machines = corridorMachines(this.def);
    this.seals.forEach((s, i) => (s.visible = i < n));
    // A spent machine says so in its prompt.
    for (const it of this.host.interactables as { kind: string; station?: StationPlacement; title?: string }[]) {
      if (it.kind !== 'station' || !it.station) continue;
      const k = machineIndex(this.def, it.station);
      const name = it.station.label ?? getGame(it.station.game).name;
      it.title = k >= 0 && k < n ? `${name} · Versuch gespielt` : `${name} spielen`;
    }
    const next = machines[n];
    this.beacon.visible = this.arrow.visible = !!next;
    if (next) {
      const g = getGame(next.game);
      this.beacon.position.set(next.x + g.footprint.w / 2, next.y + g.footprint.h / 2);
      this.arrow.position.set(next.x + g.footprint.w / 2, next.y - 62);
    }
  }

  private setGate(g: Gate, open: boolean, animated: boolean) {
    if (g.open === open) return;
    g.open = open;
    const obs = this.host.obstacles;
    const ia = this.host.interactables;
    if (open) {
      const k = obs.indexOf(g.rect);
      if (k >= 0) obs.splice(k, 1);
      for (const h of g.hints) {
        const j = ia.indexOf(h);
        if (j >= 0) ia.splice(j, 1);
      }
    } else {
      if (!obs.includes(g.rect)) obs.push(g.rect);
      for (const h of g.hints) if (!ia.includes(h)) ia.push(h);
    }
    if (!animated || reducedMotion()) {
      for (const s of [g.bars, g.wingL, g.wingR, g.crest]) {
        s.visible = !open;
        s.alpha = 1;
        s.rotation = 0;
      }
      g.wingL.position.set(g.x - 4, g.sealY);
      g.wingR.position.set(g.x + 4, g.sealY);
      g.crest.scale.set(1);
      g.glow.visible = !open;
      return;
    }
    // Opening: the wings part and fly off, the grille sinks into the floor, light bursts.
    sfx.creak();
    sfx.shimmer();
    setTimeout(() => !this.dead && sfx.door(), 500);
    const y0 = g.bars.y;
    const lx = g.wingL.x;
    const rx = g.wingR.x;
    const wy = g.wingL.y;
    g.glow.alpha = 0.9;
    void animate(1300, (k) => {
      if (this.dead) return;
      g.wingL.position.set(lx - 140 * k, wy - 60 * k);
      g.wingR.position.set(rx + 140 * k, wy - 60 * k);
      g.wingL.rotation = -0.6 * k;
      g.wingR.rotation = 0.6 * k;
      g.wingL.alpha = g.wingR.alpha = 1 - k;
      g.crest.alpha = 1 - k;
      g.crest.scale.set(1 + k * 0.6);
      const b = Math.max(0, (k - 0.15) / 0.85);
      g.bars.y = y0 + BAR_H * b;
      g.bars.alpha = 1 - b;
      g.glow.alpha = 0.9 * (1 - k);
    }, ease.inOutCubic).then(() => {
      if (this.dead) return;
      for (const s of [g.bars, g.wingL, g.wingR, g.crest]) s.visible = false;
      g.glow.visible = false;
      g.bars.y = y0;
    });
  }

  /** Machine `i` had its try: its seal goes on and gate `i` opens, with a show. */
  openGate(i: number) {
    const g = this.gates[i];
    if (g) this.setGate(g, true, true);
    this.placeMarks();
    const st = corridorMachines(this.def)[i];
    if (st && !reducedMotion()) {
      const s = this.seals[i];
      s.scale.set(2);
      s.alpha = 0;
      void animate(380, (k) => {
        if (this.dead) return;
        s.scale.set(2 - k);
        s.alpha = k;
      }, ease.outBack);
    }
  }

  /** The gate in front of the player is closed (x within `reach`), or -1. */
  closedGateNear(x: number, reach = 70) {
    const g = this.gates.find((q) => !q.open && Math.abs(q.x - x) < reach);
    return g ? g.i : -1;
  }

  update(dtMs: number) {
    this.time += dtMs / 1000;
    const t = this.time;
    const calm = reducedMotion();
    this.beacon.alpha = calm ? 0.4 : 0.34 + Math.sin(t * 2.4) * 0.1;
    if (this.arrow.visible) this.arrow.alpha = 0.85;
    if (!calm && this.arrow.visible) this.arrow.pivot.y = Math.abs(Math.sin(t * 3)) * 8;
    for (const g of this.gates) {
      if (g.open || calm) continue;
      const f = 0.8 * (0.86 + 0.14 * Math.abs(Math.cos(t * 1.4 + g.i)));
      g.wingL.scale.x = f;
      g.wingR.scale.x = f;
      g.glow.alpha = 0.26 + Math.sin(t * 1.8 + g.i) * 0.06;
    }
  }

  destroy() {
    this.dead = true;
  }
}
